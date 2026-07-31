use std::{
    fs,
    io::{BufRead, BufReader, Write},
    process::{ChildStdin, ChildStdout, Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use business_protocol::PROTOCOL_VERSION;
use serde_json::{Value, json};

fn request(stdin: &mut ChildStdin, stdout: &mut BufReader<ChildStdout>, value: Value) -> Value {
    writeln!(
        stdin,
        "{}",
        serde_json::to_string(&value).expect("serialize")
    )
    .expect("write");
    stdin.flush().expect("flush");
    let mut line = String::new();
    stdout.read_line(&mut line).expect("read");
    serde_json::from_str::<Value>(&line).expect("json")
}

#[test]
fn standard_json_rpc_serves_business_state_without_agent_methods() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "limeshot-business-test-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir_all(&root).expect("test root");
    let mut child = Command::new(env!("CARGO_BIN_EXE_business-server"))
        .args(["--stdio", "--data-dir"])
        .arg(root.join("data"))
        .arg("--resources-dir")
        .arg(root.join("resources"))
        .arg("--log-dir")
        .arg(root.join("logs"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("business-server");
    let mut stdin = child.stdin.take().expect("stdin");
    let mut stdout = BufReader::new(child.stdout.take().expect("stdout"));
    let initialized = request(
        &mut stdin,
        &mut stdout,
        json!({"jsonrpc":"2.0","id":"init","method":"initialize","params":{"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":PROTOCOL_VERSION,"instanceId":"test"}}),
    );
    assert_eq!(initialized["result"]["serverName"], "limeshot-business");
    writeln!(
        stdin,
        "{}",
        json!({"jsonrpc":"2.0","method":"initialized","params":{}})
    )
    .expect("notify");
    stdin.flush().expect("flush notification");
    let profiles = request(
        &mut stdin,
        &mut stdout,
        json!({"jsonrpc":"2.0","id":"profiles","method":"business-profile/list","params":{}}),
    );
    assert_eq!(
        profiles["result"]["profiles"]
            .as_array()
            .expect("profiles")
            .len(),
        5
    );
    let workspace = root.join("workspace");
    fs::create_dir_all(&workspace).expect("workspace");
    let project = request(
        &mut stdin,
        &mut stdout,
        json!({
            "jsonrpc":"2.0",
            "id":"project",
            "method":"project/create",
            "params":{
                "name":"Tool result project",
                "profileId":"general",
                "workspacePath":workspace,
                "brief":{
                    "subject":"Tool result",
                    "audience":"Test",
                    "platform":"desktop",
                    "targetDurationSeconds":1,
                    "aspectRatio":"16:9",
                    "language":"en-US",
                    "style":"",
                    "mustInclude":[],
                    "prohibited":[],
                    "deliveryFormat":"mp4"
                }
            }
        }),
    );
    let project_id = project["result"]["project"]["projectId"]
        .as_str()
        .expect("project id");
    let _binding = request(
        &mut stdin,
        &mut stdout,
        json!({
            "jsonrpc":"2.0",
            "id":"binding",
            "method":"conversation/bind",
            "params":{
                "projectId":project_id,
                "conversationId":"conversation-1",
                "codexThreadId":"thread-1",
                "expectedCodexThreadId":null
            }
        }),
    );
    let tool_failure = request(
        &mut stdin,
        &mut stdout,
        json!({
            "jsonrpc":"2.0",
            "id":"tool-failure",
            "method":"tool/call",
            "params":{
                "context":{
                    "projectId":project_id,
                    "conversationId":"conversation-1",
                    "threadId":"thread-1",
                    "turnId":"turn-1",
                    "callId":"call-1"
                },
                "tool":"plan_create",
                "arguments":{"title":""}
            }
        }),
    );
    assert!(tool_failure.get("error").is_none());
    assert_eq!(tool_failure["result"]["success"], false);
    assert!(
        tool_failure["result"]["contentItems"][0]["text"]
            .as_str()
            .expect("tool failure text")
            .contains("计划参数不符合 schema")
    );
    let agent_method = request(
        &mut stdin,
        &mut stdout,
        json!({"jsonrpc":"2.0","id":"agent","method":"thread/start","params":{}}),
    );
    assert_eq!(agent_method["error"]["code"], -32601);
    let _ = child.kill();
    let _ = child.wait();
    let _ = fs::remove_dir_all(root);
}
