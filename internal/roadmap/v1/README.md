# LimeShot v1 架构与交付路线图

状态：`current / implementation`
日期：`2026-07-28`

## 1. 文档地图

| 文档 | 唯一回答的问题 |
| --- | --- |
| [PRD.md](./PRD.md) | 用户、产品范围、业务对象和验收是什么 |
| [BUSINESS.md](./BUSINESS.md) | 五类业务的输入、阶段、门禁和产物是什么 |
| [DIAGRAMS.md](./DIAGRAMS.md) | 进程、协议、恢复和业务流程如何连接 |
| [PROTOCOL.md](./PROTOCOL.md) | Codex、Rust 与 Renderer 的协议边界是什么 |
| [PROVIDER-ARCHITECTURE.md](./PROVIDER-ARCHITECTURE.md) | Provider、成本和远端任务如何进入 Rust ToolHost |
| [RESOURCE-MIGRATION.md](./RESOURCE-MIGRATION.md) | Skills、脚本和 contracts 如何合法迁移 |
| [EXECUTION-PLAN.md](./EXECUTION-PLAN.md) | 实施顺序、写集和退出条件是什么 |

## 2. 产品与技术结论

LimeShot 是独立的 AI 内容生产 GUI 产品，固定提供全能、短剧短片、转绘视频、口播视频和电商视频五类业务入口。

技术栈固定为：

```text
Electron + React/TypeScript
  -> Electron main direct Codex client
  -> Rust Business Service over JSON-RPC 2.0
  -> managed Node / Provider / FFprobe / FFmpeg
```

Codex Desktop 和其他参考应用仅用于理解 GUI 与技术可行性，不是 LimeShot 的父产品、依赖、资源来源或运行时组成。

GUI 产品合同固定为：首次页展示五类业务 Profile；新建项目由 Electron 创建受管 workspace，随后直接进入 Codex Conversation，全程不弹系统目录选择器；项目默认主画布是消息流与 Composer，Brief、Plan、业务审批和后续任务位于按需打开的项目详情面板。不得恢复自定义创建表单、把目录导入混入新建项目，或把 Agent 缩回 Dashboard 侧栏。

## 3. 最重要的架构决策

> LimeShot 使用 Codex App Server，不实现、派生或镜像 Codex Agent Runtime。

八个月 Lime 实践已经证明，重新实现 Agent loop、Thread/Turn/Item、工具生命周期、Codex 原生工具审批、历史恢复、Skills、MCP、Multi-Agent 和 GUI 终态是一条高成本且持续漂移的路径。LimeShot 不再重复该投资。

因此：

- Electron main 直接启动并连接官方 Codex App Server。
- Codex 独占所有 Agent runtime 事实。
- Rust Business Service 不启动、不包装、不代理 Codex。
- Rust 只实现 LimeShot 产品业务、工具、任务、Provider、媒体和 Artifact。
- Codex reverse request 由 Electron 路由至 Rust ToolHost。

## 4. 唯一主链

```text
Renderer
  -> preload semantic API
  -> Electron Main
       -> Codex App Server native JSONL
       -> Rust Business Service JSON-RPC 2.0

Codex item/tool/call
  -> Electron route
  -> Rust tool/call
  -> ToolHost
  -> Node task / Provider / FFmpeg
  -> Artifact
```

总体架构、进程和时序以 [DIAGRAMS.md](./DIAGRAMS.md) 为准。

## 5. 责任边界

### 5.1 Electron Main

- 窗口、菜单、系统对话框、通知、外链和更新。
- Rust 与 Codex 两个平级子进程的生命周期。
- Codex 原生 protocol client 与 Rust business client。
- Renderer semantic IPC。
- Codex Agent events 与 Rust business events 的 UI projection。
- `item/tool/call` 到 Rust `tool/call` 的有界路由。

Electron 不保存业务数据库，不实现 Agent 状态机，不执行 provider 或 FFmpeg 业务。

### 5.2 Codex App Server

- Agent/model/tool loop。
- Thread、Turn、Item、history、compact。
- Skills、MCP、Codex 原生工具审批、sandbox、Multi-Agent。
- streaming、interrupt、resume、fork、archive 和 terminal state。

Codex 是唯一 Agent truth source。

### 5.3 Rust Business Service

- Project、BusinessProfile、Brief、Conversation binding。
- ProductionPlan、业务 ApprovalReceipt、TaskRun、Cost。
- ProviderTask、MediaJob、Artifact、Deliverable。
- ToolHost catalog、schema、scope、权限和 dispatcher。
- Provider adapter、受管 Node、FFprobe/FFmpeg。
- SQLite、workspace、lineage 和 reconcile。

Rust 只保存 `codexThreadId` 绑定，不保存完整 Codex messages/history。

## 6. 协议边界

```text
Electron <-> Codex
  native JSONL，省略 jsonrpc 字段

Electron <-> Rust
  standard JSON-RPC 2.0 / JSONL，包含 jsonrpc: 2.0

Renderer <-> Electron
  typed semantic IPC
```

两套 stdio protocol 必须使用独立 types、parser、pending map、timeout、日志和 contract test。

## 7. 数据事实源

| 数据 | 事实源 |
| --- | --- |
| Thread/Turn/Item/history/model state | Codex store |
| Project/Profile/Brief | Rust project repository |
| Project/Conversation/codexThreadId binding | Rust project repository |
| Plan/Approval/Task/Cost | Rust business repository |
| Asset/Artifact/Deliverable | workspace + Rust artifact repository |
| 当前窗口输入和临时选择 | Renderer view state |

禁止建立第二份 message history 或 Agent terminal state。恢复时由 Rust 返回 binding，Electron 调用 Codex `thread/resume|read`。

这里的 Approval 是用户对 ProductionPlan、成本、素材授权或覆盖动作的业务决定，由 Rust 固化不可变 receipt；它不是 Codex 原生工具审批，也不能由 Agent dynamic tool 自动完成。

## 8. ToolHost

Skills 描述业务意图，工具执行必须经过结构化边界：

```text
Skill -> Codex dynamic tool -> Electron route -> Rust ToolHost -> executor
```

- Dynamic tool schema 来自 Rust catalog。
- ToolCallContext 可包含 `threadId/turnId/callId/projectId`，仅用于授权和追踪。
- Rust 不根据这些 id 建立 Agent repository。
- ToolHost 校验 Project scope、workspace grant、approval、capability、timeout 和 output contract。
- 只有真实文件通过验证并登记 Artifact 后才能返回 success。

## 9. 业务与 Agent 分离

GUI 可以固定五类 Profile、表单、阶段导航和审批栏，但不创建五套 Agent runtime：

```text
Profile
  -> Brief + Skill + tool/capability policy
  -> Codex Thread
  -> approved ProductionPlan
  -> Rust TaskRun / ProviderTask / MediaJob
  -> Artifact / Deliverable
```

- Turn 结束不代表 TaskRun 完成。
- TaskRun 完成不代表 Turn 已到终态。
- 聊天文本不能替代 Plan、Approval、Task 或 Artifact。

## 10. Managed Runtime

| Resource | Owner | Source |
| --- | --- | --- |
| Rust Business Service | Electron packaged resource | LimeShot build |
| Codex | Electron resource supervisor | OpenAI official release |
| Node | Rust resource manager | approved redistributable distribution |
| FFmpeg/FFprobe | Rust resource manager | approved build with recorded license/config |

manifest 固定 version、platform/arch、source、size、SHA-256、license、executable 和兼容范围。生产路径不使用 PATH、Homebrew、npm global 或其他应用目录。

Rust Business Service 随应用启动；Codex 由 Electron 在首次 Conversation 时惰性启动并在后续 Conversation 中复用。Rust 不参与 Codex executable 解析或进程生命周期。

## 11. 安全与恢复

- 新建 Project 的受管 workspace 由 Electron 在应用数据区分配，再传给 Rust；外部目录和素材只能通过独立的系统对话框导入。
- provider 凭证只存在于 OS keychain/credential broker，不进入 Codex input。
- 付费、真人/声音上传、覆盖和导出需要独立批准。
- Codex crash 后重新 initialize 并按 binding resume/read。
- Rust crash 后重启并 task reconcile，不触碰 Codex history。
- timeout 只表示请求等待失败，不等于 Turn/Task 已取消。

## 12. 架构分类

### Current

```text
Electron direct Codex + Rust pure business service + controlled ToolHost
```

### Compat

无。

### Deprecated

无。

### Dead / Deleted / Forbidden To Restore

- 自研 Agent App Server、RuntimeCore、Thread/Turn/Item、history mirror。
- WorkflowRun Agent 外壳和自研 Agent protocol/client/schema。
- Rust Codex supervisor/proxy。
- Tauri、production mock、Renderer raw protocol。
- Agent 任意 shell、系统 runtime fallback 和参考应用资源依赖。

## 13. 验证门禁

| 边界 | 最低证据 |
| --- | --- |
| Codex client | framing、request、notification、reverse request、timeout、EOF/crash |
| Rust client/server | JSON-RPC 2.0 schema、router、unknown method、invalid params、EOF/crash |
| Binding | unique bind/read + restart resume/read |
| Tool route | Codex reverse request -> Rust ToolHost -> response fixture |
| Provider/Media | reconcile、cost、download、真实 FFprobe/FFmpeg |
| GUI | 真实 Electron、preload、双子进程和用户可见终态 |
| Package | macOS arm64 与 Windows x64 clean-machine smoke |

## 14. 完成定义

- 仓库没有第二套 Agent runtime、Agent protocol 或 message history。
- Electron 使用固定 Codex binary 完成 Thread、两个 Turn、interrupt 和 restart recovery。
- Rust business service 完成 Project、binding、tool、task 和 Artifact 真实闭环。
- 五类 Profile 均有固定 GUI、Skill、工具门禁和 capability gate。
- 短剧、转绘、口播和电商分别完成真实 provider + FFmpeg Gate B。
- 所有受管资源具有 source、license、hash、NOTICE 和跨平台验证证据。

## 15. 事实源

- Codex App Server：<https://github.com/openai/codex/blob/rust-v0.145.0/codex-rs/app-server/README.md>
- OpenAI Codex：<https://github.com/openai/codex>

外部桌面应用只作为调研 evidence，不进入 production truth。
