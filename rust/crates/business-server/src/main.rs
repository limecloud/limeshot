use std::path::PathBuf;

use business_core::{BusinessCore, BusinessError, SERVER_NAME, SERVER_VERSION};
use business_protocol::{
    APPROVAL_DECIDE, ARTIFACT_CONTRACT_LIST, ApprovalDecideParams, BRIEF_UPDATE,
    BUSINESS_PROFILE_LIST, BUSINESS_SHUTDOWN, BUSINESS_STATUS_READ, BriefUpdateParams,
    CONVERSATION_BIND, CONVERSATION_BINDING_READ, ConversationBindParams,
    ConversationBindingReadParams, DELIVERABLE_CONFIRM, DeliverableConfirmParams, INITIALIZE,
    INITIALIZED, IncomingMessage, InitializeParams, InitializeResult, JsonRpcRequest,
    JsonRpcResponse, MAX_MESSAGE_BYTES, PLAN_LIST, PLAN_READ, PROJECT_CONTEXT_READ, PROJECT_CREATE,
    PROJECT_EXECUTION_READ, PROJECT_LIST, PROJECT_READ, PROTOCOL_VERSION, PROVIDER_CAPABILITY_LIST,
    PlanListParams, PlanReadParams, ProjectContextReadParams, ProjectCreateParams,
    ProjectExecutionReadParams, ProjectListParams, ProjectReadParams, RESOURCE_LIST, SERVICE_LIST,
    SKILL_LIST, SOURCE_ASSET_IMPORT, ShutdownResult, SourceAssetImportParams, TASK_CANCEL,
    TASK_RETRY, TASK_START, TOOL_CALL, TOOL_CATALOG_LIST, TaskCancelParams, TaskRetryParams,
    TaskStartParams, ToolCallParams, error_response, parse_incoming, result_response,
};
use clap::Parser;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter},
    sync::mpsc,
};
use tracing::{error, info, warn};

#[derive(Debug, Parser)]
#[command(name = "business-server")]
struct Args {
    #[arg(long)]
    stdio: bool,
    #[arg(long)]
    data_dir: PathBuf,
    #[arg(long)]
    resources_dir: PathBuf,
    #[arg(long)]
    log_dir: PathBuf,
    #[arg(long)]
    ffprobe_bin: Option<PathBuf>,
    #[arg(long)]
    ffmpeg_bin: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConnectionState {
    AwaitingInitialize,
    AwaitingInitialized,
    Ready,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "business_server=info".into()),
        )
        .with_writer(std::io::stderr)
        .without_time()
        .init();
    let args = Args::parse();
    if !args.stdio {
        eprintln!("business-server requires --stdio");
        std::process::exit(2);
    }
    if let Err(error) = run_stdio(args).await {
        error!(%error, "business-server terminated with an error");
        std::process::exit(1);
    }
}

async fn run_stdio(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(&args.log_dir)?;
    let core = BusinessCore::open_with_media(
        &args.data_dir,
        &args.resources_dir,
        args.ffprobe_bin.clone(),
        args.ffmpeg_bin.clone(),
    )?;
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut stdout = BufWriter::new(tokio::io::stdout());
    let mut state = ConnectionState::AwaitingInitialize;
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    info!(data_dir = %args.data_dir.display(), "business-server stdio started");

    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Some(line) = line? else { break; };
                let response = if line.len() > MAX_MESSAGE_BYTES {
                    error_response(Value::Null, -32600, "Invalid Request: message exceeds maximum size", None)
                } else {
                    match parse_incoming(&line) {
                        Ok(IncomingMessage::Notification(notification)) => {
                            if notification.method == INITIALIZED && state == ConnectionState::AwaitingInitialized {
                                state = ConnectionState::Ready;
                                continue;
                            }
                            warn!(method = %notification.method, ?state, "ignored notification");
                            continue;
                        }
                        Ok(IncomingMessage::Request(request)) => route_request(&core, &args, state, &request, &shutdown_tx).await,
                        Err(error) => error_response(Value::Null, error.error_code(), error.message(), None),
                    }
                };
                let initialized = response.error.is_none() && response.id != Value::Null;
                let line = serde_json::to_string(&response)?;
                stdout.write_all(line.as_bytes()).await?;
                stdout.write_all(b"\n").await?;
                stdout.flush().await?;
                if initialized && state == ConnectionState::AwaitingInitialize { state = ConnectionState::AwaitingInitialized; }
                if shutdown_rx.try_recv().is_ok() { break; }
            }
            _ = shutdown_rx.recv() => break,
        }
    }
    info!("business-server stdio stopped");
    Ok(())
}

async fn route_request(
    core: &BusinessCore,
    args: &Args,
    state: ConnectionState,
    request: &JsonRpcRequest,
    shutdown_tx: &mpsc::Sender<()>,
) -> JsonRpcResponse {
    if request.method != INITIALIZE && state != ConnectionState::Ready {
        return error_response(
            request.id.clone(),
            -32001,
            "Not initialized",
            Some(json!({ "domainCode": "NOT_INITIALIZED", "retryable": false })),
        );
    }
    match request.method.as_str() {
        INITIALIZE => initialize(args, state, request),
        BUSINESS_STATUS_READ => result_response(request.id.clone(), &core.status()),
        BUSINESS_PROFILE_LIST => result_response(request.id.clone(), &core.profiles()),
        SKILL_LIST => result_response(request.id.clone(), &core.skills()),
        TOOL_CATALOG_LIST => result_response(request.id.clone(), &core.tool_catalog()),
        ARTIFACT_CONTRACT_LIST => result_response(request.id.clone(), &core.artifact_contracts()),
        PROVIDER_CAPABILITY_LIST => result_response(request.id.clone(), &core.capabilities()),
        SERVICE_LIST => result_response(request.id.clone(), &core.services()),
        RESOURCE_LIST => result_response(request.id.clone(), &core.managed_resources()),
        PROJECT_CREATE => domain(request, |params: ProjectCreateParams| {
            core.create_project(params)
        }),
        PROJECT_LIST => domain(request, |params: ProjectListParams| {
            core.list_projects(params)
        }),
        PROJECT_READ => domain(request, |params: ProjectReadParams| {
            core.read_project(params)
        }),
        PROJECT_CONTEXT_READ => domain(request, |params: ProjectContextReadParams| {
            core.read_project_context(params)
        }),
        BRIEF_UPDATE => domain(request, |params: BriefUpdateParams| {
            core.update_brief(params)
        }),
        CONVERSATION_BIND => domain(request, |params: ConversationBindParams| {
            core.bind_conversation(params)
        }),
        CONVERSATION_BINDING_READ => domain(request, |params: ConversationBindingReadParams| {
            core.read_conversation_binding(params)
        }),
        PLAN_LIST => domain(request, |params: PlanListParams| core.list_plans(params)),
        PLAN_READ => domain(request, |params: PlanReadParams| core.read_plan(params)),
        APPROVAL_DECIDE => domain(request, |params: ApprovalDecideParams| {
            core.decide_plan(params)
        }),
        SOURCE_ASSET_IMPORT => domain(request, |params: SourceAssetImportParams| {
            core.import_source_asset(params)
        }),
        PROJECT_EXECUTION_READ => domain(request, |params: ProjectExecutionReadParams| {
            core.read_execution(params)
        }),
        TASK_START => domain(request, |params: TaskStartParams| core.start_task(params)),
        TASK_CANCEL => domain(request, |params: TaskCancelParams| core.cancel_task(params)),
        TASK_RETRY => domain(request, |params: TaskRetryParams| core.retry_task(params)),
        DELIVERABLE_CONFIRM => domain(request, |params: DeliverableConfirmParams| {
            core.confirm_deliverable(params)
        }),
        TOOL_CALL => domain(request, |params: ToolCallParams| core.call_tool(params)),
        BUSINESS_SHUTDOWN => {
            core.shutdown_tasks();
            let _ = shutdown_tx.send(()).await;
            result_response(request.id.clone(), &ShutdownResult { accepted: true })
        }
        _ => error_response(request.id.clone(), -32601, "Method not found", None),
    }
}

fn domain<P, R>(
    request: &JsonRpcRequest,
    action: impl FnOnce(P) -> Result<R, BusinessError>,
) -> JsonRpcResponse
where
    P: DeserializeOwned,
    R: Serialize,
{
    let params = match serde_json::from_value(request.params.clone()) {
        Ok(params) => params,
        Err(_) => return error_response(request.id.clone(), -32602, "Invalid params", None),
    };
    match action(params) {
        Ok(result) => result_response(request.id.clone(), &result),
        Err(error) => error_response(
            request.id.clone(),
            -32010,
            error.message(),
            Some(json!({ "domainCode": error.code(), "retryable": false })),
        ),
    }
}

fn initialize(args: &Args, state: ConnectionState, request: &JsonRpcRequest) -> JsonRpcResponse {
    if state != ConnectionState::AwaitingInitialize {
        return error_response(request.id.clone(), -32600, "Already initialized", None);
    }
    let params: InitializeParams = match serde_json::from_value(request.params.clone()) {
        Ok(params) => params,
        Err(_) => return error_response(request.id.clone(), -32602, "Invalid params", None),
    };
    if params.protocol_version != PROTOCOL_VERSION {
        return error_response(
            request.id.clone(),
            -32002,
            "Protocol version is not supported",
            Some(
                json!({ "domainCode": "PROTOCOL_VERSION_UNSUPPORTED", "serverProtocolVersion": PROTOCOL_VERSION }),
            ),
        );
    }
    result_response(
        request.id.clone(),
        &InitializeResult {
            protocol_version: PROTOCOL_VERSION,
            server_name: SERVER_NAME.to_owned(),
            server_version: SERVER_VERSION.to_owned(),
            data_dir: args.data_dir.display().to_string(),
        },
    )
}
