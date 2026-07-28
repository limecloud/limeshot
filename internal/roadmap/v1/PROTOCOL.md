# LimeShot v1 协议边界

状态：`current / canonical`
日期：`2026-07-28`
Codex 事实源：OpenAI Codex 的 `rust-v0.141.0` tag，重点为 [`codex-rs/app-server/README.md`](https://github.com/openai/codex/blob/rust-v0.141.0/codex-rs/app-server/README.md) 与同版本 `app-server-protocol` schema。

## 1. 决策

LimeShot 同时使用两套协议，但绝不混用：

```text
Electron Main <-> Codex App Server: upstream native JSONL
Electron Main <-> Rust Business Service: LimeShot JSON-RPC 2.0 over JSONL
```

Renderer 只使用 semantic Electron IPC，不直接接触任一 wire protocol。

## 2. Codex Native Protocol

- Electron 在首次 Conversation 时惰性启动 `codex app-server --listen stdio://`，同一应用实例内复用该进程。
- UTF-8 JSONL，一行一个 object。
- 具有 JSON-RPC 2.0 request/response/notification/reverse-request 语义，但 wire 省略 `"jsonrpc":"2.0"`。
- client 类型从固定 Codex 版本的上游 schema 生成或严格摘取，不与 Rust business schema共享。
- stdout 只解析协议；stderr 进入有界脱敏 ring buffer。
- EOF、crash、非法 JSON、超大 line 和 write failure 必须使 pending request 获得失败终态。

握手：

```json
{
  "method": "initialize",
  "id": 1,
  "params": {
    "clientInfo": {
      "name": "limeshot_desktop",
      "title": "LimeShot Desktop",
      "version": "0.1.0"
    },
    "capabilities": {
      "experimentalApi": true
    }
  }
}
```

成功后发送：

```json
{ "method": "initialized", "params": {} }
```

当前实现使用：`thread/start|resume|read`、`turn/start|interrupt`、固定 Thread/Turn/Item 通知和 `item/tool/call` reverse request。`thread/list|name/set`、`turn/steer`、`skills/*` 与上游审批 reverse request 必须在固定版本类型、semantic projection 和 contract fixture 同批落地后才能启用。

## 3. Rust Business Protocol

- 标准 JSON-RPC 2.0，request/response/notification 全部包含 `"jsonrpc":"2.0"`。
- UTF-8 JSONL/stdio，一行一个 object。
- method 使用短业务领域名，不出现 Agent runtime 概念。
- schema、Rust handler 和 TypeScript client 由同一业务协议事实源生成。

示例：

```json
{
  "jsonrpc": "2.0",
  "id": "desktop-1",
  "method": "project/read",
  "params": {
    "projectId": "project-123"
  }
}
```

允许的领域：

```text
initialize / business / project / brief / conversation
business-profile / plan / approval / tool / task / skill
provider / cost / artifact / deliverable / service / resource
```

禁止的 method：

```text
thread/* / turn/* / item/* / agent/* / mcp/*
conversation/history/* / context/compact / skill/execute
```

Rust 中可以存在 `threadId/turnId/callId` 字段作为 ToolCallContext，但不能以此建立 Thread/Turn repository 或状态机。

当前 Rust business protocol 是 v4，以生成的 `schemas/business/protocol.json` 为唯一机器事实源。计划读取和用户审批分别使用 `plan/list|read`、`approval/decide`；计划创建不提供 raw `plan/create`，只能由 `plan_create` dynamic tool 经 `tool/call` 进入 ToolHost。素材、执行与交付使用 `source-asset/import`、`project/execution/read`、`task/start`、`task/cancel`、`task/retry`、`deliverable/confirm`，这些动作只能来自 GUI 明确操作，不进入 dynamic tool catalog。

`media_probe` 在 `task/start` 请求内完成并返回 Artifact；`media_transcode` 创建后台任务后立即返回 `artifact=null`，GUI 通过 `project/execution/read` 读取进度与终态。`task/cancel` 与 `task/retry` 都只接受 `projectId/taskRunId`：取消在 Project scope 校验后设置取消令牌并等待 FFmpeg kill/wait；重试只接受 `failed/canceled/interrupted`，重新执行全部业务与 runtime 校验并返回新 TaskRun，其中 `retryOfTaskRunId` 指向旧记录。协议不接受任意文件路径、codec 或 argv。

`media_transcode` 的 FFmpeg 进程成功不直接产生 Task success。Rust 必须对原子提交后的输出执行 FFprobe 和确定性 QA；通过时在同一事务登记 `media-output.v1` 与带 `QaReportSummary` 的 `qa-report.v1`，失败时删除输出并记录 `MEDIA_QA_FAILED`。`project/execution/read` 同时返回 `artifacts[]` 与 `deliverables[]`，不得从 Task、Turn 或聊天文本推导 Deliverable。

`deliverable/confirm` 只接受 `{projectId, artifactId}`。目标必须是具有同 TaskRun passing `qa-report.v1` 的 `media-output.v1`；确认前重新校验 output 和 QA Artifact 的大小与 SHA-256。成功后保留历史 Deliverable，并在事务中保证每个 Project 恰有一个 current 记录。同一 Artifact 再确认只切换 current，不复制记录。

`conversation/bind` 保存的业务键是 `(projectId, conversationId)`，`codexThreadId` 全局唯一。`expectedCodexThreadId` 是替换空 Thread binding 的 compare-and-swap 条件：首次绑定传 `null`，替换时必须精确匹配当前值。Rust 只执行原子约束，不解释 Codex Thread 状态。

## 4. Dynamic Tool Route

Codex `thread/start.dynamicTools` 由 Electron 从 Rust tool catalog 读取后生成。固定 `rust-v0.141.0` 的每个顶层业务工具必须编码为 `{ "type": "function", "name", "description", "inputSchema" }`；`initialize.params.capabilities.experimentalApi=true` 是 dynamic tools 的启用条件。

```text
item/tool/call from Codex
  -> Electron validates method and binding
  -> Rust tool/call JSON-RPC
  -> ToolHost validates input and authority
  -> executor
  -> Rust result
  -> Electron DynamicToolCallResponse
```

规则：

- 工具名与 schema 来自 Rust catalog，模型不能覆盖。
- Agent 可以调用 `plan_create`，但不能调用 `approval/decide`；ProductionPlan 只能由 GUI 中的明确用户动作批准。
- Rust 校验 Project、workspace、approval、capability、timeout 和 cancellation。
- 付费、真人/声音上传、覆盖和导出使用独立批准。
- 未知工具与不可用资源明确失败，不能回退任意 shell。
- 真实文件必须登记 Artifact 后才能返回 success。

## 5. Renderer Semantic IPC

preload 当前只暴露 `foundation`、`project`、`agent`、`plan`、`approval`、`sourceAsset`、`execution`、`task` 和 `deliverable` 产品语义 API。Electron main 根据 domain 路由到 Codex 或 Rust，Renderer 不知道后端 method 名、request id、素材绝对路径或 wire envelope。

新建 Project 的受管 workspace 由 Electron host 在应用数据区创建，不经过系统目录选择器。选择外部目录、导入、导出、外链与凭证读取仍是 host-mediated capability；必须由独立 semantic API、系统对话框、OS keychain 或显式 allowlist 产生。

## 6. Versioning

- Codex 版本固定在 runtime manifest；升级前生成上游 TS/JSON Schema并做 method/field/notification/reverse-request diff。
- Rust business protocol 独立版本；破坏性变更同步 schema、client、main gateway、fixture 和文档。
- Codex 升级不能改变 Rust business contract；业务协议变化不能修改 Codex envelope。

## 7. Error And Recovery

- Codex error 保留上游 code，仅投影脱敏 category/detail。
- Rust error 使用稳定 business code、用户文案 key 和 trace id。
- Codex timeout 不等于 Turn 取消；使用 `thread/read` 对账。
- Rust timeout 不等于 provider/media task 取消；使用 `task/read|reconcile` 对账。
- Codex crash 后重新握手并按 binding resume/read。
- 固定 Codex `0.141.0` 的空 Thread 在首条用户消息前不会 materialize。Electron 对同一进程 active 空 Thread直接复用；冷启动只有在 `thread/resume|read` 返回明确 unmaterialized 错误时，才 `thread/start` 并以旧 id 做 `conversation/bind` compare-and-swap。
- Rust crash 后重新握手并 reconcile task；不得合成或覆盖 Codex history。

## 8. Contract Tests

- 两套 wire 对 `jsonrpc` 字段的相反约束。
- 两套 parser、pending map、id 和 timeout 完全隔离。
- Codex initialize/initialized、Thread/Turn、notification、reverse request、EOF/crash。
- Rust initialize、business methods、unknown method、invalid params、events、EOF/crash。
- `item/tool/call -> Rust tool/call -> Codex response` 全链 fixture。
- IPC/preload 不暴露 raw protocol。
- 真实 Electron 双进程 Gate B，包括 GUI 一键新建受管项目且系统目录选择器调用为零、多 Project 使用同名 `main` 会话、未发言空会话冷重启恢复、媒体取消/retry、passing QA、用户确认 current Deliverable 及完整重启读回。
