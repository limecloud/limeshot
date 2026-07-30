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
| Project | `project.open`、`project.list`、`project.read`、`project.updateBrief` | `project.open` 先经 Electron 系统目录选择器；选中本地文件夹后经 Rust business client 登记 Project |
| Conversation | `agent.listConversations`、`agent.listProjectConversations`、`agent.listImportCandidates`、`agent.importConversation`、`agent.startConversation` | Codex 根 Thread 自动投影；Project Conversation 访问 Codex client + Rust binding |
| Composer | `agent.composerCatalog`、`agent.pickAttachments`、`agent.listCaptureSources`、`agent.captureSource` | Electron 校验 Composer cwd，读取 Codex Plugin/协作模式目录，并独占系统文件选择、窗口捕获、临时文件和不透明 token |
| Model | `agent.listModels`、`agent.updateThreadSettings` | Electron 校验会话 owner 后调用 Codex `model/list` 与 `thread/settings/update`；最终状态由 `thread/settings/updated` 投影 |
| Turn | `agent.startTurn`、`agent.interrupt`、`agent.subscribe` | Codex client |
| Catalog | 包含在 `foundation.read` | Rust business client |
| Plan | `plan.list`、`plan.read` | Rust business client |
| Approval | `approval.decide` | Rust business client；只允许当前 GUI 用户动作 |
| SourceAsset | `sourceAsset.import` | Electron 系统文件选择器 + Rust Project workspace import |
| Execution | `execution.read` | Rust TaskRun / MediaJob / Artifact / Deliverable projection |
| Task | `task.start`、`task.cancel`、`task.retry` | Rust structured media operation；只允许当前 GUI 用户动作 |
| Deliverable | `deliverable.confirm` | Rust QA/hash 复验与 current 切换；只允许当前 GUI 用户动作 |

Renderer 不得提交任意 Codex method、Rust JSON-RPC method、可执行文件、脚本路径、环境变量、provider request 或 FFmpeg argv。

Composer 附件与能力使用 Main 内短生命周期 token。Renderer 只接收 `id/label/kind/previewUrl`，不接收本地路径；提交 Turn 时 Main 再按 owner 与 cwd 解析：普通文件/目录聚合为 Codex Desktop 原生 `# Files mentioned by the user` 文本引用，图片与窗口截图使用 `localImage`，音频使用 `localAudio`，Plugin 使用 `mention(plugin://...)`。普通文件/目录不得伪装成 `Mention`，Plugin 也不得退化为自由文本路径。

Goal 是单次 `thread/goal/set -> turn/start`，提交后恢复默认模式；Plan mode 来自 `collaborationMode/list`，通过 `turn/start.collaborationMode` 应用并跨 Turn 保留，直到用户切换模式。Record a skill 只在 enabled `record-and-replay` Plugin 可用时显示，并复用该 Plugin 的 `defaultPrompt`，不得在 Renderer 硬编码一套 Skill runtime。

Renderer 不暴露 `project.create`。`project.open` 是从 Composer 底部 `+` 菜单选择本地项目的唯一创建入口：Renderer 只提交 `profileId/language`，Electron 打开系统目录选择器；取消选择返回 `null`，选中一个目录后由 Electron 使用目录 basename 和绝对路径构造 Rust `project/create` 参数。目录路径不得经过 preload 返回 Renderer，也不得恢复自定义项目表单。

未选择 Project 时，`agent.startConversation({ projectId: null, ... })` 创建或恢复 standalone Codex Thread，不读写 Rust Conversation binding，不加载 Project 动态工具，也不能启动媒体业务任务。选择本地 Project 后，提交首页需求才创建该 Project 下的 Conversation 和首个 Turn；仅选择文件夹不得提前创建 Codex Thread。

`agent.listConversations()` 完整分页投影同一受管 Codex home 中非 ephemeral、无 parent 的 CLI、VS Code、Exec 或 App Server 根 Thread；打开或导入本地 Project 后，`agent.listProjectConversations()` 将 `cwd` 位于 Rust `project/context/read.workspacePath` 本身或任意子目录的未绑定历史只读挂在该 Project 下，其余历史进入“最近”。相邻前缀目录不得误归组，子 Agent Thread 不进入项目一级列表。GUI 不提供独立导入弹窗，Renderer 不保存导入注册表或完整 history。`agent.listImportCandidates()` 与 `agent.importConversation({ threadId })` 仅作为 Electron Main 的校验/恢复语义接口；完整历史继续通过 `thread/read`、`thread/turns/list` 和 `thread/items/list` 从 Codex canonical store 读取。未绑定的 Codex Thread 固定只读，不能调用 `turn/start` 或继承外部宿主工具能力。

`conversation/bind` 的唯一键是 `(projectId, conversationId)`；不同 Project 可以同时使用默认 `conversationId=main`。首次绑定必须传 `expectedCodexThreadId=null`。只有 Electron 已从 Codex 收到明确的空 Thread 未持久化错误时，才可传旧 thread id 做 compare-and-swap 替换；普通 resume/read 错误不得触发覆盖。

## Codex Native Protocol

当前 Electron main 的固定 Codex allowlist：

- lifecycle：`initialize`、`initialized`；
- thread：`thread/start`、`thread/resume`、`thread/read`、`thread/list`、`thread/turns/list`、`thread/items/list`、`thread/settings/update`、`thread/goal/set`；
- model：`model/list`；
- turn：`turn/start`、`turn/interrupt`；
- Composer catalog：`collaborationMode/list`、`plugin/list`；
- skills：`skills/extraRoots/set`；
- GUI reverse request：Command、File、Permission Approval，`item/tool/requestUserInput` 与 `mcpServer/elicitation/request`；
- host reverse request：`item/tool/call`、ChatGPT token refresh、attestation、current time，以及去重兼容的 legacy exec/patch approval；
- notifications：72 类固定上游事件经 main semantic projection 转换为 `agent.subscribe` 事件。

`thread/name/set`、`turn/steer` 等其他 method 需在固定版本类型、semantic projection 与 contract fixture 同时落地后才能加入 allowlist。`agent.listModels` 只返回非隐藏模型及每个模型自己的 `supportedReasoningEfforts`；`agent.updateThreadSettings` 必须同时提交已校验的 model/effort，不能把 raw method 或任意设置字段暴露给 Renderer。Thread 初始 model/effort 来自 `thread/start` 或 `thread/resume` 响应，不能从模型目录默认项推断；当前型号允许暂时不在非隐藏目录中。设置响应只表示排队成功，UI 只能用后续 `thread/settings/updated` 更新最终选中态。`thread/list` 仅按 Electron 拥有的 standalone cwd 过滤最近会话；paginated history 只通过 `thread/turns/list` 与 `thread/items/list` 读取 canonical 上游事实。

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
