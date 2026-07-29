use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

mod execution;

pub use execution::*;

pub const PROTOCOL_VERSION: u32 = 5;
pub const MAX_MESSAGE_BYTES: usize = 16 * 1024 * 1024;

pub const INITIALIZE: &str = "initialize";
pub const INITIALIZED: &str = "initialized";
pub const BUSINESS_STATUS_READ: &str = "business/status/read";
pub const BUSINESS_SHUTDOWN: &str = "business/shutdown";
pub const BUSINESS_PROFILE_LIST: &str = "business-profile/list";
pub const SKILL_LIST: &str = "skill/list";
pub const TOOL_CATALOG_LIST: &str = "tool/catalog/list";
pub const TOOL_CALL: &str = "tool/call";
pub const ARTIFACT_CONTRACT_LIST: &str = "artifact/contract/list";
pub const PROVIDER_CAPABILITY_LIST: &str = "provider/capability/list";
pub const SERVICE_LIST: &str = "service/list";
pub const PROJECT_CREATE: &str = "project/create";
pub const PROJECT_LIST: &str = "project/list";
pub const PROJECT_READ: &str = "project/read";
pub const PROJECT_RENAME: &str = "project/rename";
pub const PROJECT_ARCHIVE: &str = "project/archive";
pub const PROJECT_CONTEXT_READ: &str = "project/context/read";
pub const BRIEF_UPDATE: &str = "brief/update";
pub const CONVERSATION_BIND: &str = "conversation/bind";
pub const CONVERSATION_BINDING_READ: &str = "conversation/binding/read";
pub const CONVERSATION_BINDING_LIST: &str = "conversation/binding/list";
pub const CONVERSATION_UNBIND: &str = "conversation/unbind";
pub const PLAN_LIST: &str = "plan/list";
pub const PLAN_READ: &str = "plan/read";
pub const APPROVAL_DECIDE: &str = "approval/decide";
pub const SOURCE_ASSET_IMPORT: &str = "source-asset/import";
pub const PROJECT_EXECUTION_READ: &str = "project/execution/read";
pub const TASK_START: &str = "task/start";
pub const TASK_CANCEL: &str = "task/cancel";
pub const TASK_RETRY: &str = "task/retry";
pub const DELIVERABLE_CONFIRM: &str = "deliverable/confirm";
pub const RESOURCE_LIST: &str = "resource/list";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub enum IncomingMessage {
    Request(JsonRpcRequest),
    Notification(JsonRpcNotification),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JsonRpcResponse {
    pub jsonrpc: &'static str,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtocolError {
    code: i64,
    message: String,
}

impl ProtocolError {
    pub fn error_code(&self) -> i64 {
        self.code
    }
    pub fn message(&self) -> &str {
        &self.message
    }
}

pub fn parse_incoming(line: &str) -> Result<IncomingMessage, ProtocolError> {
    let value: Value = serde_json::from_str(line).map_err(|_| ProtocolError {
        code: -32700,
        message: "Parse error".to_owned(),
    })?;
    let object = value.as_object().ok_or_else(|| ProtocolError {
        code: -32600,
        message: "Invalid Request".to_owned(),
    })?;
    if object.get("jsonrpc") != Some(&Value::String("2.0".to_owned()))
        || object
            .get("method")
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
    {
        return Err(ProtocolError {
            code: -32600,
            message: "Invalid Request".to_owned(),
        });
    }
    if object.contains_key("id") {
        serde_json::from_value(value)
            .map(IncomingMessage::Request)
            .map_err(|_| ProtocolError {
                code: -32600,
                message: "Invalid Request".to_owned(),
            })
    } else {
        serde_json::from_value(value)
            .map(IncomingMessage::Notification)
            .map_err(|_| ProtocolError {
                code: -32600,
                message: "Invalid Request".to_owned(),
            })
    }
}

pub fn result_response<T: Serialize>(id: Value, result: &T) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: Some(serde_json::to_value(result).expect("business result must serialize")),
        error: None,
    }
}

pub fn error_response(
    id: Value,
    code: i64,
    message: impl Into<String>,
    data: Option<Value>,
) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message: message.into(),
            data,
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub client_info: ClientInfo,
    pub protocol_version: u32,
    pub instance_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    pub protocol_version: u32,
    pub server_name: String,
    pub server_version: String,
    pub data_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BusinessStatusResult {
    pub status: String,
    pub server_pid: u32,
    pub protocol_version: u32,
    pub started_at_epoch_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShutdownResult {
    pub accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProfileExecutionState {
    Preparing,
    Available,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProfile {
    pub profile_id: String,
    pub name_key: String,
    pub description_key: String,
    pub execution_state: ProfileExecutionState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProfileListResult {
    pub profiles: Vec<BusinessProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillDescriptor {
    pub skill_id: String,
    pub profile_id: String,
    pub name_key: String,
    pub description_key: String,
    pub instruction_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillListResult {
    pub catalog_version: u32,
    pub skills: Vec<SkillDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactContractDescriptor {
    pub artifact_type: String,
    pub schema_version: u32,
    pub name_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactContractListResult {
    pub catalog_version: u32,
    pub contracts: Vec<ArtifactContractDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityAvailability {
    Available,
    Degraded,
    Unavailable,
    Deprecated,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDescriptor {
    pub capability_id: String,
    pub name_key: String,
    pub input_modalities: Vec<String>,
    pub output_modalities: Vec<String>,
    pub availability: CapabilityAvailability,
    pub reason_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityListResult {
    pub catalog_version: u32,
    pub capabilities: Vec<CapabilityDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceKind {
    Local,
    Remote,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDescriptor {
    pub service_id: String,
    pub name_key: String,
    pub kind: ServiceKind,
    pub state: ResourceState,
    pub reason_key: String,
    pub capability_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceListResult {
    pub catalog_version: u32,
    pub services: Vec<ServiceDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceState {
    Ready,
    Missing,
    Updating,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ManagedResourceKind {
    NodeRuntime,
    MediaRuntime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedResourceDescriptor {
    pub resource_id: String,
    pub kind: ManagedResourceKind,
    pub required: bool,
    pub platform_key: String,
    pub version: Option<String>,
    pub state: ResourceState,
    pub detail_code: String,
    pub executable_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedResourceListResult {
    pub manifest_version: u32,
    pub resources: Vec<ManagedResourceDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProjectState {
    Draft,
    Active,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BriefCompleteness {
    Incomplete,
    Workable,
    Conflicting,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BriefInput {
    pub subject: String,
    pub audience: String,
    pub platform: String,
    pub target_duration_seconds: Option<u32>,
    pub aspect_ratio: String,
    pub language: String,
    pub style: String,
    #[serde(default)]
    pub must_include: Vec<String>,
    #[serde(default)]
    pub prohibited: Vec<String>,
    pub delivery_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub project_id: String,
    pub name: String,
    pub profile_id: String,
    pub state: ProjectState,
    pub workspace_name: String,
    pub created_at_epoch_ms: i64,
    pub updated_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BriefRecord {
    pub brief_id: String,
    pub project_id: String,
    pub version: u32,
    pub completeness: BriefCompleteness,
    pub missing_fields: Vec<String>,
    pub conflicts: Vec<String>,
    pub content: BriefInput,
    pub created_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateParams {
    pub name: String,
    pub profile_id: String,
    pub workspace_path: String,
    pub brief: BriefInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateResult {
    pub project: ProjectSummary,
    pub brief: BriefRecord,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListParams {
    pub state: Option<ProjectState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectListResult {
    pub projects: Vec<ProjectSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectReadParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectReadResult {
    pub project: ProjectSummary,
    pub brief: BriefRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameParams {
    pub project_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRenameResult {
    pub project: ProjectSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectArchiveParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectArchiveResult {
    pub project: ProjectSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContextReadParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContextReadResult {
    pub project_id: String,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BriefUpdateParams {
    pub project_id: String,
    pub expected_version: u32,
    pub brief: BriefInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BriefUpdateResult {
    pub brief: BriefRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBinding {
    pub project_id: String,
    pub conversation_id: String,
    pub codex_thread_id: String,
    pub updated_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBindParams {
    pub project_id: String,
    pub conversation_id: String,
    pub codex_thread_id: String,
    #[serde(default)]
    pub expected_codex_thread_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBindResult {
    pub binding: ConversationBinding,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBindingReadParams {
    pub project_id: String,
    pub conversation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBindingReadResult {
    pub binding: ConversationBinding,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBindingListParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationBindingListResult {
    pub bindings: Vec<ConversationBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationUnbindParams {
    pub project_id: String,
    pub conversation_id: String,
    pub expected_codex_thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationUnbindResult {
    pub binding: ConversationBinding,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlanState {
    Draft,
    NeedsInput,
    ReadyForReview,
    Approved,
    Executing,
    Delivered,
    Failed,
    Superseded,
    Canceled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    Approve,
    RequestChanges,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanOperationInput {
    pub operation_id: String,
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub capability_id: Option<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanInput {
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub deliverables: Vec<String>,
    #[serde(default)]
    pub operations: Vec<PlanOperationInput>,
    #[serde(default)]
    pub gaps: Vec<String>,
    #[serde(default)]
    pub risks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProductionPlan {
    pub plan_id: String,
    pub project_id: String,
    pub version: u32,
    pub state: PlanState,
    pub brief_id: String,
    pub brief_version: u32,
    pub content: PlanInput,
    pub created_by: String,
    pub approved_by: Option<String>,
    pub created_at_epoch_ms: i64,
    pub approved_at_epoch_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanCreateParams {
    pub project_id: String,
    pub plan: PlanInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanCreateResult {
    pub plan: ProductionPlan,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanListParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanListResult {
    pub plans: Vec<ProductionPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanReadParams {
    pub project_id: String,
    pub plan_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanReadResult {
    pub plan: ProductionPlan,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalReceipt {
    pub approval_id: String,
    pub project_id: String,
    pub plan_id: String,
    pub plan_version: u32,
    pub decision: ApprovalDecision,
    pub actor: String,
    pub note: String,
    pub decided_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecideParams {
    pub project_id: String,
    pub plan_id: String,
    pub expected_version: u32,
    pub decision: ApprovalDecision,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDecideResult {
    pub plan: ProductionPlan,
    pub receipt: ApprovalReceipt,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolDescriptor {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolCatalogListResult {
    pub tools: Vec<ToolDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallContext {
    pub project_id: String,
    pub conversation_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub call_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallParams {
    pub context: ToolCallContext,
    pub tool: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolContentItem {
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallResult {
    pub success: bool,
    pub content_items: Vec<ToolContentItem>,
}

pub fn tool_text(success: bool, text: impl Into<String>) -> ToolCallResult {
    ToolCallResult {
        success,
        content_items: vec![ToolContentItem {
            kind: "inputText".to_owned(),
            text: text.into(),
        }],
    }
}

pub fn protocol_schema_bundle() -> Value {
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "LimeShot Business JSON-RPC 2.0",
        "protocolVersion": PROTOCOL_VERSION,
        "requiredEnvelope": ["jsonrpc", "id", "method", "params"],
        "methods": [INITIALIZE, BUSINESS_STATUS_READ, BUSINESS_SHUTDOWN, BUSINESS_PROFILE_LIST, SKILL_LIST, TOOL_CATALOG_LIST, TOOL_CALL, ARTIFACT_CONTRACT_LIST, PROVIDER_CAPABILITY_LIST, SERVICE_LIST, PROJECT_CREATE, PROJECT_LIST, PROJECT_READ, PROJECT_RENAME, PROJECT_ARCHIVE, PROJECT_CONTEXT_READ, BRIEF_UPDATE, CONVERSATION_BIND, CONVERSATION_BINDING_READ, CONVERSATION_BINDING_LIST, CONVERSATION_UNBIND, PLAN_LIST, PLAN_READ, APPROVAL_DECIDE, SOURCE_ASSET_IMPORT, PROJECT_EXECUTION_READ, TASK_START, TASK_CANCEL, TASK_RETRY, DELIVERABLE_CONFIRM, RESOURCE_LIST]
    })
}

pub fn typescript_bindings() -> &'static str {
    include_str!("typescript.template.ts")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_accepts_standard_json_rpc_envelopes() {
        assert!(matches!(
            parse_incoming(r#"{"jsonrpc":"2.0","id":1,"method":"project/list","params":{}}"#),
            Ok(IncomingMessage::Request(_))
        ));
        assert_eq!(
            parse_incoming(r#"{"id":1,"method":"project/list"}"#)
                .expect_err("jsonrpc required")
                .error_code(),
            -32600
        );
    }
}
