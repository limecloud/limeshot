# LimeShot 对话页全量投影方案

状态：`current planning source / exhaustive blueprint`
日期：`2026-07-28`

## 1. 目标

LimeShot 对话页必须完整呈现 Codex App Server 产生的消息、推理、计划、搜索、Shell、文件修改、MCP、动态业务工具、图片、多 Agent、Hook、审批和等待用户输入等状态，并让所有需要用户响应的 reverse request 可以在 GUI 内完成。

“完整呈现”不是把所有协议对象都画成同一种工具卡片，而是保证每个上游事实都有确定的投影出口：

1. 时间线消息或活动行；
2. Turn 级计划、Diff、用量或状态面板；
3. Composer 上方的阻塞交互层；
4. 对话页顶栏、状态栏或通知区；
5. 应用级通知；
6. 仅开发者可见的诊断记录。

任何已知上游类型都不得静默丢弃。未知类型必须 fail visible：保留类型名、关联 id 和脱敏后的结构摘要，同时记录协议漂移遥测，不得退化成空白。

## 2. 事实源与版本

本方案对照以下本地源码完成：

- Codex 工作树：`/Users/coso/Documents/dev/rust/codex`
- 检查提交：`4c43465133428898aa84f0bfc02c306ed65fb66a`
- 检查日期：`2026-07-28`
- 协议事实源：`codex-rs/app-server-protocol/schema/typescript/**`
- 参考渲染：`codex-rs/tui/src/history_cell/**`、`exec_cell/**`、`multi_agents.rs`、`bottom_pane/**`

LimeShot 当前生产资源固定为 Codex `0.145.0`。固定版本 experimental schema 包含 18 类 `ThreadItem`、72 类原生 `ServerNotification` 和 11 类 `ServerRequest`，本文列出的全部 notification 出口均属于当前 runtime。`thread/environment/connected|disconnected` 与 `rawResponse/completed` 已从前向兼容边界转为原生合同；后续新增 method 仍必须与资源、生成类型、main allowlist、semantic projection、contract fixture 和真实 Electron Gate B 同批升级，Renderer 不得根据参考 HEAD 猜测当前二进制能力。

18 类 Item 的判别类型以固定运行时 schema 为准。几个容易被参考工作树误导的字段边界如下：

| Item | 固定 `0.145.0` 事实 | 投影约束 |
| --- | --- | --- |
| `commandExecution` | `cwd` 为 `LegacyAppPathString`，来源由结构化 `source` 表示 | 不从参考 HEAD 猜测额外插件脚本字段 |
| `mcpToolCall` | 有结构化 `appContext`、`pluginId`，并保留 deprecated `mcpAppResourceUri` | 优先消费 `appContext`，旧字段只做兼容 |
| `webSearch` | `id/query/action/results`，其中 results 为 opaque JSON | 常见结果字段结构化显示，其他字段经有界脱敏 JSON 明细投影 |
| `imageView` | `path` 为 `LegacyAppPathString` | 绝对路径只留 main，Renderer 接收安全媒体投影 |
| `sleep`、`imageGeneration` | 均保持独立外部判别值 | 不因内部模块归属变化改写 Renderer 判别 |

后续字段只可按生成 schema 的 optional capability 处理；不能伪造空字段，也不能因为参考 HEAD 存在额外字段把固定版本 Item 判成 unknown。

## 3. 文档地图

| 文档 | 内容 |
| --- | --- |
| [ITEM-PROJECTIONS.md](./ITEM-PROJECTIONS.md) | 18 类 `ThreadItem`、用户输入模态、状态和具体渲染交互 |
| [EVENT-PROJECTIONS.md](./EVENT-PROJECTIONS.md) | 72 类原生通知、11 类 reverse request 及其全部投影出口 |
| [CODEX-DESKTOP-UI-PARITY.md](./CODEX-DESKTOP-UI-PARITY.md) | Codex Desktop 全量 UI 对齐边界、组件映射、治理分类与视觉验收 |
| [xuanlan-conversation-projection-progress.md](../../exec-plans/xuanlan-conversation-projection-progress.md) | 当前阶段、逐轮进度、验证证据、阻塞、完成度与下一刀 |
| [xuanlan-codex-desktop-ui-progress.md](../../exec-plans/xuanlan-codex-desktop-ui-progress.md) | Codex Desktop UI 对齐的唯一动态进度 tracker |
| 本文 | 页面信息架构、投影模型、生命周期、恢复、实施与验收 |

## 4. 编制时实现基线

以下内容记录 `2026-07-28` 编制路线图时的基线，用于解释实施动机，不作为动态进度事实源。当前完成项、未完成项与验证证据只以 [执行进度](../../exec-plans/xuanlan-conversation-projection-progress.md) 为准。

编制时 `src/shared/desktop.ts` 将所有 Agent item 压缩为：

```ts
type AgentItemKind = 'user' | 'assistant' | 'plan' | 'tool' | 'activity';

interface AgentItemProjection {
  id: string;
  kind: AgentItemKind;
  text: string;
  title?: string;
  status?: string;
}
```

编制时 `src/main/codex/projection.ts` 只处理：

- `userMessage` 的纯文本部分；
- `agentMessage`；
- `plan`；
- `dynamicToolCall` 与 `mcpToolCall` 的名称和状态；
- `commandExecution` 的命令文本；
- `fileChange` 的空摘要；
- `agentMessage` delta；
- `item/started|completed` 和 `turn/started|completed`。

直接后果：图片、音频、Skill/Mention、Reasoning、搜索结果、命令输出、Diff、MCP 参数与结果、审批、MCP 表单、多 Agent、Hook、终端交互、token、错误重试等事实被丢失，恢复后的完成态和直播状态也无法等价渲染。

## 5. 页面信息架构

```text
ConversationPage
├── ConversationHeader
│   ├── thread name / status / environment
│   ├── model / reasoning / permissions
│   └── token usage / goal / warning entry
├── ConversationViewport
│   └── TurnGroup[]
│       ├── UserMessageItem[]
│       ├── ActivityCluster[]
│       │   └── ItemRenderer by item.type
│       ├── AssistantMessageItem[]
│       ├── TurnPlanPanel
│       ├── TurnDiffPanel
│       └── TurnTerminalNotice
├── PendingInteractionLayer
│   ├── ApprovalPrompt
│   ├── RequestUserInput
│   ├── McpElicitation
│   └── PermissionPrompt
├── Composer
│   ├── text / image / audio / skill / mention inputs
│   ├── queued input / steer state
│   └── send / interrupt
└── ConversationStatusRegion
    ├── hook / MCP startup / retry / safety state
    └── warnings and recoverable errors
```

### 5.1 时间线分组

- 保持 Codex `Turn.items` 原始顺序，不能按 `kind` 二次排序。当前实现把 user、activity、response 分组后重新排列，会破坏“消息 -> 工具 -> 消息 -> 工具”的真实交错顺序。
- 连续且同类的低信息活动可视觉聚合，但每个 `item.id` 仍是独立更新键；展开后必须恢复原始顺序。
- Assistant Markdown 是主内容，不放进装饰性卡片。
- Tool、Search、Shell、Diff 使用紧凑活动行；运行中默认展开关键进度，完成后默认折叠长输出。
- Pending approval 或 input 必须在对应 item 附近有锚点，同时在 Composer 上方提供唯一可操作表面。

### 5.2 视觉语义

| 状态 | 语义 | 表现 |
| --- | --- | --- |
| `inProgress` | 正在执行 | 动态 spinner、现在时标题、保留最新进度 |
| `completed` | 成功完成 | check 或中性完成点、过去时标题、显示耗时 |
| `failed` | 执行失败 | error icon、错误摘要、可展开输出 |
| `declined` | 用户拒绝 | ban icon、中性“已拒绝”，不得伪装为系统错误 |
| `interrupted` | Turn 被中断 | Turn 尾部 interrupted notice，运行中 item 转为中断态 |
| awaiting input | 等待用户 | 高优先级 pending 标识，Composer 切换为交互表面 |

不要只靠颜色区分状态。所有 icon 都必须有可访问名称或 tooltip，状态文案覆盖 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`。

## 6. 投影数据模型

Renderer semantic contract 应保留上游判别联合，而不是再造 Agent runtime：

```ts
interface ConversationProjection {
  thread: ThreadProjection;
  turns: TurnProjection[];
  pendingInteractions: PendingInteractionProjection[];
  notices: NoticeProjection[];
}

interface TurnProjection {
  id: string;
  status: 'inProgress' | 'completed' | 'interrupted' | 'failed';
  itemsView: 'notLoaded' | 'summary' | 'full';
  items: ItemProjection[];
  plan?: TurnPlanProjection;
  diff?: TurnDiffProjection;
  usage?: TokenUsageProjection;
  timing: TurnTimingProjection;
  error?: ErrorProjection;
}

type ItemProjection =
  | UserMessageProjection
  | HookPromptProjection
  | AgentMessageProjection
  | ProposedPlanProjection
  | ReasoningProjection
  | CommandExecutionProjection
  | FileChangeProjection
  | McpToolCallProjection
  | DynamicToolCallProjection
  | CollabAgentToolCallProjection
  | SubAgentActivityProjection
  | WebSearchProjection
  | ImageViewProjection
  | SleepProjection
  | ImageGenerationProjection
  | ReviewBoundaryProjection
  | ContextCompactionProjection
  | UnknownItemProjection;
```

约束：

- `type + id` 是 item identity，`threadId + turnId` 是作用域。
- 类型名称保持上游短领域词，不添加 `LimeShot` 前缀。
- projection 可以增加安全的显示派生值，例如 `displayCommand`、`relativePath`、`durationLabel`，但必须保留结构化源字段。
- Renderer 只收到经过 main 校验、脱敏和 host capability 转换后的数据，不收到 raw method、request id、任意绝对路径或 provider secret。
- 路径点击、外链、图片读取、资源打开都调用 semantic host action，不由 Renderer 直接访问系统。

## 7. 生命周期归并

```text
turn/started
  -> item/started
       -> zero or more item-specific deltas/progress
       -> optional reverse request and user response
  -> item/completed
  -> turn/completed
```

归并规则：

1. `item/started` 建立类型完整的活动实体，不能只建 `{text: ''}` 占位。
2. Delta 只更新对应字段，例如 reasoning 的 `summaryIndex/contentIndex`，不能全部拼到 `text`。
3. `item/completed.item` 是该 item 的权威终态，覆盖流式草稿；`plan` 明确不能假设 completed text 等于 delta 拼接。
4. `turn/completed.turn` 是 Turn 权威终态，覆盖已知 item 与 status，但不得丢失仍有效的 UI-only 展开状态。
5. `serverRequest/resolved` 或客户端提交成功后关闭 pending interaction；超时、断线或 Turn 完成也必须终结悬挂交互。
6. 相同通知重复到达必须幂等；乱序 delta 在 item 尚未开始时进入有界 orphan buffer，item 建立后回放，Turn 终态后清理。

## 8. 恢复与对账

- Rust 只返回 `projectId/conversationId <-> codexThreadId` binding。
- Electron 调用 Codex `thread/resume|read` 获取 `Thread.turns`，不从本地 delta 重建 history。
- `itemsView=notLoaded|summary` 时 UI 明确显示历史未完整加载，并通过 Electron 的 semantic pagination action 获取完整 item；不得把缺页误判为空 Turn。
- replay 只渲染完成事实，不重放审批、打开外链、执行工具或其他副作用。
- 断线后 pending reverse request 不能由 Renderer 自行恢复；Electron 重新握手、resume/read，并以 app-server 当前 pending/Thread 状态对账。
- live 与 replay 使用同一组 `ItemRenderer`，只在交互能力上区分 `renderSource: live | replay`。

## 9. 安全与交互边界

- Codex 原生 Shell/File/Permission approval 由 Electron 直接响应上游 reverse request；其 UI receipt 只用于显示，不写入 Rust 业务 ApprovalReceipt。
- `item/tool/call` 是 LimeShot dynamic tool 的业务执行入口，Electron 路由到 Rust `tool/call`；Renderer 只观察 projected item，不能代替 ToolHost 执行。
- MCP tool 由 Codex/MCP runtime 执行；MCP elicitation 由 GUI 收集用户输入并通过 Electron 回答原 reverse request。
- `applyPatchApproval` 与 `execCommandApproval` 是 legacy reverse request，只为协议兼容处理；新流程以 v2 item scoped approval 为主。两者不能同时弹出重复审批。
- 参数、stdout/stderr、MCP result、Diff、Hook output 均需大小上限、ANSI/control character 清理和敏感字段遮蔽。
- `structuredContent`、MCP `_meta`、raw response、moderation metadata 默认不直接展示；只投影经过 allowlist 的用户可理解字段。

## 10. 性能与可用性

- 时间线虚拟化以 Turn 为第一层、长输出为第二层，不能一次把完整命令日志或大 Diff 挂入 DOM。
- 流式文本按 animation frame 或 30-50 ms 合批，不能每个 token 触发整页重排。
- Shell live preview 保留头尾并显示省略行数；完整输出按需打开 transcript drawer。
- JSON、Diff、Markdown 使用专用 parser/renderer，禁止通过字符串替换模拟结构。
- 默认自动滚动只在用户接近底部时生效；用户上滚后显示“回到最新”，不能抢夺滚动位置。
- 所有折叠面板尺寸稳定；状态变化不能造成标题行宽高抖动。

## 11. 实施顺序

### Phase A：协议与 reducer 基座

- 从固定 Codex 版本生成完整 TypeScript 类型。
- 建立 `ItemProjection` 判别联合、72 notification coverage map 和 reverse-request pending map。
- 改为保持 item 原始顺序，补 delta reducer、终态覆盖、未知类型可见降级。
- 完成 live/replay 等价的 reducer contract tests。

### Phase B：核心对话与本地活动

- User 全输入模态、Agent Markdown、Reasoning、Plan。
- CommandExecution、Search/List/Read 友好摘要、live output、exit code、duration。
- FileChange Diff、Turn diff、ImageView、ImageGeneration、Sleep。

### Phase C：工具与阻塞交互

- MCP 参数、progress、content/structuredContent/error 与资源/媒体渲染。
- Dynamic tool 参数和 text/image/audio 结果。
- Command/File/Permission approval、requestUserInput、MCP elicitation。
- reverse request resolved、断线和超时清理。

### Phase D：高级运行时投影

- Multi-Agent 调度与 Agent switcher。
- Hook、Review、ContextCompaction、Goal、Safety、Model reroute。
- Realtime、环境、账号/MCP startup 和全局通知出口。

### Phase E：版本与门禁

- 固定 managed Codex `0.145.0` manifest、release 双 SHA-256 和 experimental schema；新 Thread 使用原生 `historyMode: "paginated"`。
- 同步 codex client、main allowlist、semantic IPC、Renderer 和 contract fixtures。
- 运行真实 Electron Gate B，验证双子进程、审批、MCP、Shell、搜索、恢复和未知事件 fail visible。

## 12. 验收标准

- 18/18 `ThreadItem` 都有 renderer 或明确的不可见控制语义，其中任何一类都不会被 `undefined` 丢弃。
- 固定 `0.145.0` 的 72/72 `ServerNotification` 都有投影出口。
- 11/11 `ServerRequest` 都有处理策略；用户交互类可在 GUI 完成，host-only 类不会暴露给 Renderer。
- User 的 7 类输入内容全部可恢复显示。
- Command output、Reasoning、Plan、File patch、MCP progress 的 delta 与 completed item 对账正确。
- 关闭、拒绝、取消、失败、中断、超时、断线和 replay 均有明确终态，不留下永久 spinner 或失效按钮。
- 历史恢复与直播完成后的同一 Turn 生成语义等价 DOM。
- 用户可见文案覆盖五种 locale；键盘、读屏、缩放和 reduced-motion 可用。
- production 不存在 mock fallback，不从 PATH 或其他应用目录寻找 runtime。
