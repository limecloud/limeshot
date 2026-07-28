# LimeShot 命令边界

状态：`current / v1 implementation`

## 四条边界

```text
Renderer -> preload typed gateway -> Electron Main semantic API
Electron Main <-> Codex App Server native JSONL protocol
Electron Main <-> Rust Business Service JSON-RPC 2.0 / JSONL
Codex item/tool/call -> Electron route -> Rust tool/call -> ToolHost
```

四条边界不能合并为 Renderer raw proxy，也不能把 Codex method 重新定义成 Rust business method。

## Renderer Semantic API

Renderer 只看产品语义：

| Domain | Renderer API | Main route |
| --- | --- | --- |
| Foundation | `foundation.read` | Rust status/catalog 聚合投影 |
| Project | `project.create`、`project.open`、`project.list`、`project.read`、`project.updateBrief` | `project.open` 先经 Electron 系统目录选择器；其余调用与选中结果经 Rust business client |
| Conversation | `agent.startConversation` | Codex client + Rust binding |
| Turn | `agent.startTurn`、`agent.interrupt`、`agent.subscribe` | Codex client |
| Catalog | 包含在 `foundation.read` | Rust business client |
| Plan | `plan.list`、`plan.read` | Rust business client |
| Approval | `approval.decide` | Rust business client；只允许当前 GUI 用户动作 |
| SourceAsset | `sourceAsset.import` | Electron 系统文件选择器 + Rust 受管 workspace import |
| Execution | `execution.read` | Rust TaskRun / MediaJob / Artifact / Deliverable projection |
| Task | `task.start`、`task.cancel`、`task.retry` | Rust structured media operation；只允许当前 GUI 用户动作 |
| Deliverable | `deliverable.confirm` | Rust QA/hash 复验与 current 切换；只允许当前 GUI 用户动作 |

Renderer 不得提交任意 Codex method、Rust JSON-RPC method、可执行文件、脚本路径、环境变量、provider request 或 FFmpeg argv。

`project.create` 是“从首页需求创建受管 Project 并进入会话”的语义命令：Renderer 只提交 `profileId/language/initialSubject?`，Electron 在应用数据区分配受管 workspace，再构造 Rust `project/create` 参数。该命令不得打开系统目录选择器。

`project.open` 是侧栏“新建项目”的目录项目语义命令：Renderer 只提交 `profileId/language`，Electron 打开系统目录选择器；取消选择返回 `null`，选中一个目录后由 Electron 使用目录 basename 和绝对路径构造 Rust `project/create` 参数。目录路径不得经过 preload 返回 Renderer，也不得恢复自定义项目表单。

`conversation/bind` 的唯一键是 `(projectId, conversationId)`；不同 Project 可以同时使用默认 `conversationId=main`。首次绑定必须传 `expectedCodexThreadId=null`。只有 Electron 已从 Codex 收到明确的空 Thread 未持久化错误时，才可传旧 thread id 做 compare-and-swap 替换；普通 resume/read 错误不得触发覆盖。

## Codex Native Protocol

当前 Electron main 的固定 Codex allowlist：

- lifecycle：`initialize`、`initialized`；
- thread：`thread/start`、`thread/resume`、`thread/read`；
- turn：`turn/start`、`turn/interrupt`；
- reverse request：`item/tool/call`；
- notifications：透传为 `agent.subscribe` 的上游 Thread/Turn/Item 事件。

`thread/list`、`thread/name/set`、`turn/steer`、`skills/*` 和上游审批 reverse request 需在固定版本类型、semantic projection 与 contract fixture 同时落地后才能加入 allowlist。

Codex request id、envelope 和错误只存在于 Electron main。不得把上游协议重新生成成 Rust business protocol。

## Rust Business Protocol

当前 Rust method 只能表达已落地的产品业务：

- `initialize`、`business/status/read`、`business/shutdown`；
- `project/create|list|read|context/read`、`brief/update`、`conversation/bind|binding/read`；
- `business-profile/list`、`skill/list`、`tool/catalog/list`、`artifact/contract/list`；
- `provider/capability/list`、`service/list`、`resource/list`；
- `plan/list|read`、`approval/decide`、`tool/call`；
- `source-asset/import`、`project/execution/read`、`task/start|cancel|retry`、`deliverable/confirm`。

`plan_create` 是 Codex dynamic tool，只能经 `tool/call -> ToolHost` 创建 ProductionPlan；不得恢复无 scope 的 raw `plan/create` RPC。`approval/decide` 只从 Renderer semantic API 进入，不注册 `plan_approve` dynamic tool，Agent 不能批准自己的计划。

`task/start|cancel|retry` 与 `deliverable/confirm` 同样只从 Renderer semantic API 进入，不加入 dynamic tool catalog。Task action 不接受任意路径、codec 或 FFmpeg argv；交付确认只接受 Project 内 `media-output.v1` Artifact，并由 Rust 复验同 TaskRun passing QA 与 output/QA 文件 hash。

禁止出现 `thread/*`、`turn/*`、`item/*`、`agent/*`、`mcp/*`、`skill/execute` 或 history/compact/recovery method。Skills catalog 可以读取，Skills 执行归 Codex。

## Tool Route

```text
Codex server request { id, method: item/tool/call, params }
  -> Electron 校验上游 method 与 thread/project binding
  -> Rust request { jsonrpc: 2.0, method: tool/call, params }
  -> ToolHost schema / scope / approval / capability
  -> executor
  -> Rust result
  -> Electron 映射为 Codex DynamicToolCallResponse
```

- Tool catalog 和 input schema 以 Rust/资源目录为事实源，模型不能修改。
- `threadId/turnId/callId` 只作为调用上下文传入 Rust，不进入 Rust Agent 状态机。
- 未知工具、跨 Project、审批缺失、超时、资源缺失和输出校验失败全部 fail closed。
- tool result 只返回有界 content items 和 Artifact 引用。

## Dead / Forbidden

- 自研 Agent App Server、RuntimeCore、Thread/Turn/Item、history mirror 和 WorkflowRun Agent 外壳。
- Rust Codex proxy、Rust Codex supervisor 和 Rust Agent protocol types。
- Renderer raw Codex/Rust request、`child_process`、filesystem、provider HTTP 和 FFmpeg argv。
- Agent 任意 shell、临时脚本、直接 provider HTTP 或直接 artifact index 写入。
- 系统 PATH、Homebrew、npm global、其他应用工具目录和 production mock fallback。

## Validation

- Codex parser/request/reverse-request/timeout/EOF tests。
- Rust JSON-RPC schema/client/router contract tests。
- IPC/preload semantic allowlist contract tests。
- Tool catalog/schema/scope/approval negative tests。
- retired path and forbidden method guard。
- GUI 改动后真实 Electron Gate B。
