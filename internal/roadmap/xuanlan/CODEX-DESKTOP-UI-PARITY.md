# Codex Desktop 全量 UI 对齐规范

状态：`current design source`
日期：`2026-07-29`

## 1. 目标

LimeShot 的桌面壳、导航、首页、对话时间线、全部 Codex 投影、阻塞交互、业务检查器和响应式行为必须使用同一套 Codex Desktop 风格视觉语法。对齐对象是信息架构、密度、层级、交互反馈和状态节奏，不复制第三方品牌、图标或专有资源。

功能完整度与视觉完整度分开计算。`xuanlan-conversation-projection-progress.md` 的完成只证明协议和交互主链可用；本规范的完成必须由真实 Electron 截图和交互 Gate 证明。

## 2. 事实源

视觉事实源按优先级排列：

1. `/Applications/ChatGPT.app/Contents/Resources/app.asar` 中版本 `26.721.41059` 的 Desktop Renderer、CSS、字体声明和 surface chunk；
2. 用户提供的真实 Codex Desktop 截图和状态录屏；
3. 相同 fixture、locale 和窗口尺寸下的 Codex/LimeShot 对照截图；
4. `/Users/coso/Documents/dev/rust/codex` 中的 App Server/TUI 行为语义；
5. LimeShot 产品事实源和业务对象合同。

`/Users/coso/Documents/dev/rust/codex` 不包含 Desktop Renderer，但已安装应用的 `app.asar` 包含真实 Vite Renderer。实现可以复刻布局、令牌、密度、状态和交互语法；不得把解包目录、OpenAI 品牌资源或整段第三方实现复制进产品仓库。Computer Use 当前被平台策略禁止读取 `com.openai.codex`，所以源码映射完成度与运行态截图完成度必须分别报告。

### 2.1 用户首页截图基线

2026-07-29 用户提供了一张 `2560x1304` 的真实 Codex Desktop 项目首页截图。该截图固定以下运行态事实：

- 左侧栏约 `275px` 逻辑宽，使用独立浅灰 surface；顶部为产品行与搜索，随后是紧凑一级入口、项目树、会话行和底部账户/状态行。
- 首页不显示居中的 workspace toolbar 标题；主内容以产品标识、项目语境问题和单行四个可执行建议组成。
- 建议是可点击的 prompt starter，不是营销卡片；桌面态约为四个等宽、低 elevation、紧凑边框 surface。
- 首页 Composer 约 `576px` 宽并停靠窗口底部，由后置的 Project context strip 与前置输入 surface 两层组成。
- Composer footer 左侧为添加和访问/模式控制，右侧为模型/模式与发送；输入本身不显示独立矩形 focus ring。
- 截图只证明 project home；thread、tool、approval、inspector 等运行态仍需独立截图，不能从首页外推完成。

### 2.2 固定版本源码映射

| Codex Desktop source | 事实 | LimeShot owner |
| --- | --- | --- |
| `webview/assets/app-D4iDTyKa.css` | Electron surface、全局 token、字体、toolbar、sidebar、thread、diff | `styles.css` |
| `webview/assets/app-initial-Czet5G9g.css` | Markdown、composer utility bar、早期加载样式 | `styles.css`、`ConversationTimeline.tsx` |
| `webview/assets/app-main-BP5-48gp.js` | Desktop shell、home、thread、projection 组合 | `App.tsx`、`WorkspaceHome.tsx` |
| `thread-app-shell-chrome-DLtp8zjL.js` | Thread header/chrome | `App.tsx` |
| `thread-scroll-layout-BywaziyM.js` | Thread scroll/content column | `ConversationTimeline.tsx` |
| `local-conversation-thread-Bj5uKwgs.js` | 本地 thread 组合和状态 | `ConversationTimeline.tsx` |
| `composer-utility-bar-Bj52tH4x.js` | Composer footer/utility actions | `WorkspaceHome.tsx`、`App.tsx` |
| `composer-project-selector-D3thiXO7.js` | Project context selector | `WorkspaceHome.tsx`、`App.tsx` |
| `file-diff-*`、`diff-*` | Diff row、统计和展开 surface | `ConversationTimeline.tsx` |
| `subagent-panel-f_gsLZAq.js` | Multi-Agent secondary surface | `ConversationTimeline.tsx`、activity inspector |

固定版本的 Activity 实现还确认了三条不能退化的事实：`reasoning` 只把 `summary` 投影到可见时间线，不投影 raw `content`；completed Tool/Search/Shell/Diff 先形成单行、可截断的 activity summary，再通过 disclosure 展开详情；`commandExecution` 按上游结构化 action 拆分可读摘要，`fileChange` 使用结构化 changes snapshot，不能从 command/diff 文本重新猜测语义。

## 3. 唯一 UI 所有权

```text
Renderer semantic state
  -> AppShell
       -> NavigationRail
       -> WorkspaceHeader
       -> PrimaryWorkspace
            -> HomeWorkspace | ConversationViewport
            -> PendingInteraction
            -> Composer
       -> ContextInspector
  -> shared design tokens and primitives
```

- `AppShell` 是窗口布局和响应式的唯一 owner。
- `ConversationTimeline` 按原始 Item 顺序渲染消息、活动行和 Turn 终态。
- `PendingInteractions` 是所有 reverse request 的唯一可操作表面。
- `ContextInspector` 承载活动与项目业务事实，不复制时间线内容。
- Renderer 不增加第二套 Agent 状态、history 或工具执行逻辑。

## 4. 全量对齐矩阵

| Surface | 必须对齐的状态 |
| --- | --- |
| Window | 原生标题区、安全区、窗口拖拽区、聚焦/失焦、桌面与窄窗 |
| Navigation | 品牌、创建会话、搜索、最近、项目组、独立会话、选中、hover、项目/对话菜单、归档/删除确认、运行时状态 |
| Home | 空工作区、Profile 选择、Project 选择、新 Project、初始 Composer、加载与错误 |
| Header | 侧栏开关、会话标题、Activity、Project inspector、只读子线程 |
| User message | 文本、图片、音频、Skill、Mention、长文本与混合输入 |
| Assistant | streaming、completed、Markdown、citation、phase、空 delta |
| Reasoning | streaming、summary、raw content、耗时、完成与失败 |
| Plan | proposed plan、Turn plan、步骤状态、更新与完成 |
| Search | list/search/read、Web search、query、结果、无结果、失败 |
| Shell | command、cwd、actions、live output、terminal input、exit code、duration、失败 |
| Diff | file change、Turn diff、多个文件、增删统计、长 Diff、无内容 |
| MCP | server/tool、arguments、progress、content、structured content、resource、media、error |
| Dynamic tool | tool name、arguments、text/image/audio result、成功与失败 |
| Multi-Agent | collab call、sub-agent activity、状态、打开子线程、返回父线程、只读 |
| Media | image view、image generation、loading、失败、不安全 URL |
| Boundaries | review boundary、context compaction、sleep、hook prompt、unknown item |
| Interaction | command/file/permission approval、user input、MCP form/url、队列、提交、终态 |
| Status | thread、goal、token、hook、review、MCP startup、catalog、realtime、notice、diagnostic |
| Business | Project overview、Brief、Plan approval、Execution、Task、Artifact、Deliverable |
| Feedback | loading、empty、offline、error、retry、toast、disabled、focus、reduced motion |

## 5. 视觉语法

### 5.1 骨架

- 桌面保持左侧导航、中央主工作区和可选右侧检查器。
- Home desktop 使用约 `576px` 的项目语境内容列，四个功能建议保持单行，Composer 固定在内容区底部；窄窗允许建议改为两列。
- Thread 主内容列使用 `48rem`；Markdown 自身正文可以收窄到 `40rem`，wide block 上限为 `56rem`。工具展开不能改变 thread 列宽。
- 窄于 `900px` 时右侧检查器变为覆盖抽屉，避免检查器将对话主列压缩到不可读宽度。
- 窄于 `680px` 时侧栏默认退出布局并作为覆盖抽屉；主工作区保持单栏。
- Header、timeline 和 Composer 使用同一水平内容基线。

### 5.2 密度和层级

- Assistant 内容无卡片、无装饰背景，是时间线主内容。
- User 消息使用低对比中性表面，禁止高饱和品牌色大气泡。
- Tool/Search/Shell/Diff/MCP 使用统一紧凑活动行，状态与标题在第一层，详情在第二层。
- 活动主行必须显示结构化 query/path/action/tool 摘要；completed 不重复显示低价值“已完成”徽标，failed/declined/interrupted 保留明确状态。
- 完成态默认收起长参数和结果；运行态只展开最有价值的实时信息。
- raw reasoning 默认不得进入 DOM；JSON 参数和结构化结果在序列化前递归遮蔽 token、password、authorization、secret、apiKey、cookie、credential、privateKey 等敏感键。
- Web Search 默认只显示前三条结果并提供展开/收起；文件变更 kind 以 add/update/delete/move 语义区分，不从 diff 文本推断。
- MCP 主行优先显示 server/tool，运行态显示最新 progress；详情最多显示最后 8 条 progress，并保留 plugin/resource/duration 来源信息。
- MCP `resource_link` 与生成类型中的 `resourceLink` 必须收敛为同一 Resource Link 投影；资源名称和 URI 不得降级为不透明 JSON。
- Dynamic Tool 的 `success=false` 必须提升为 failed 主行终态；Tool text/resource text 使用首尾裁剪和 `220px` 高度上限。
- Image Generation 主行显示 prompt 或保存路径；运行态使用稳定 `16:9` loading surface，失败和不安全 URL 必须 fail closed。
- Hook prompt 合并为 User message 气泡，并在气泡下显示 Hook feedback 辅助状态；不得渲染 hook run id 或通用 Tool disclosure。
- Multi-Agent 的 `spawnAgent/sendInput/resumeAgent/closeAgent` 使用 action/status 主行、Agent 数量和可展开 Agent 状态详情；`wait` 不进入可见时间线，子 Agent activity 使用可打开子线程的紧凑状态行。
- `enteredReviewMode`、`exitedReviewMode` 和 `sleep` 不进入可见时间线；unknown item 保留协议诊断但不得渲染红色未知事件卡片。
- Context compaction 区分 manual/automatic 与 in-progress/completed；历史 item 缴省为 upstream 相同的 automatic/completed，实时 `item/started|completed` 保留生命周期。
- JSON、stdout、Diff 和结构化结果必须有高度上限、首尾策略或按需展开。
- 审批和用户输入位于时间线与 Composer 之间，不渲染为独立页面或多层卡片。

### 5.3 令牌

- 使用 Codex 的语义 surface token：sidebar/editor、main surface、elevated secondary、hover、selected、border light/default/heavy；不以单个硬编码灰阶替代所有层级。
- 状态色只表达 success/warning/error，不承担导航或品牌装饰。
- 4px 基础间距；真实 Electron toolbar 高 `46px`，对话 item 间距 `16px`，grouped item 间距 `4px`。
- 导航 row 使用 `--radius-token-row: 9999px`；Composer 单行半径使用 `22px`，surface 和浮层按 `8/10/12/16px` token 分层，不强制所有控件使用同一圆角。
- Electron 正文使用 `OpenAI Sans` Regular/Medium，基础字号 `14px`，代码字号 `12px`，medium 权重 `500`，Electron 正文字重 `445`。
- 主 surface 使用 `.5px` stroke、轻量多层 elevation；Electron 左面板使用 70% editor background 混合并向主 surface 下方延伸圆角背景。
- 不使用渐变 hero、装饰性卡片网格、紫色品牌块、彩色胶囊堆叠或嵌套卡片。

### 5.4 交互

- 所有图标按钮提供 tooltip、hover、pressed、disabled 和 `focus-visible`。
- Project menu 必须使用业务 semantic gateway 实现置顶、重命名、归档项目内对话和移除项目；“移除”只归档业务记录并保留工作区文件，不得伪装为磁盘删除。
- Thread menu 必须使用 Codex 原生 `thread/name/set`、`thread/archive`、`thread/delete`；Renderer 不得直接调用 raw method，删除必须经过明确的二次确认。
- Project/Thread 的 Finder、复制工作目录和复制会话 ID 必须由 Main semantic gateway 校验 owner 后调用系统能力；Renderer 不得读取工作目录路径。项目“全部已读”必须以业务 binding 的完整 Thread ID 集为范围。
- 只有 deep link、多窗口、stable worktree、remote connection 或 Thread fork/binding 具备完整产品 owner 时才显示对应条件菜单项；不得为追求菜单数量放置无效入口。
- 菜单 action 完成后必须同步当前选择、列表和只读状态；失败时保留当前数据并显示可恢复错误，不能乐观隐藏后静默失败。
- Disclosure 使用稳定箭头与行高，不因 loading/status 变化抖动。
- 动效只用于 opacity/transform，持续时间 `100-180ms`，遵守 reduced motion。
- 键盘可完成侧栏、菜单、tab、审批、MCP 表单、Composer 和子线程导航。

## 6. 治理分类

### current

- `App.tsx` 的 semantic state 与 gateway 调用。
- `AppSidebar`、`WorkspaceHome`、`ConversationTimeline`、`PendingInteractions`、`ConversationStatusSurface`。
- `PlanPanel`、`ExecutionPanel` 和 `McpElicitationForm` 的业务/交互行为。
- 单一设计令牌与组件样式入口。

### compat

- 无。UI 对齐不建立新旧主题切换，不保留旧视觉 fallback。

### deprecated

- 无。确认替代实现后直接删除旧样式和旧组件，不长期标记弃用。

### dead

- 未引用组件、selector、文案和测试 fixture。
- 高饱和蓝色用户气泡、渐变首页 banner、彩色 Profile 卡片网格。
- 将工具结果默认完整展开的布局规则。
- 窄屏仍占据固定侧栏列的规则。
- 与统一 activity/interaction 视觉语法重复的卡片和状态面板样式。

## 7. 实施优先级

### P0：窗口与主工作流

- 统一设计令牌、字体、控件状态和焦点。
- 对齐 App shell、侧栏、Header、内容列、时间线、User/Assistant 和 Composer。
- 修正窄屏单栏、侧栏抽屉和检查器覆盖层。
- 删除首页营销式 hero 与装饰卡片网格；保留真实 Codex Home 的四项可执行 prompt starter，首页直接进入真实工作区。

### P1：全部 Agent 投影

- 收敛 Tool/Search/Shell/Diff/MCP/Reasoning/Plan 的活动行和详情结构。
- 对齐图片、Multi-Agent、review/compact/sleep/hook/unknown 状态。
- 对齐 pending approval、requestUserInput 和 MCP elicitation。

### P2：业务与全局状态

- 对齐 Project/Brief/Plan/Execution/Artifact/Deliverable 检查器。
- 对齐活动状态、catalog、hook、review、notice、diagnostic 和 realtime。
- 补空态、错误态、loading、offline、toast、键盘与 reduced motion。

### P3：治理与回归

- 删除 dead 组件、selector、文案和 fixture。
- 增加旧视觉特征与孤儿 selector 守卫。
- 完成相同 fixture、相同尺寸的桌面/窄屏截图回归和真实 Electron Gate B。

## 8. 验收

完成必须同时满足：

- 全量矩阵中每个 surface/state 有唯一组件出口和截图或 contract 证据。
- `1440x900`、`1024x768`、`768x900`、`420x900` 无重叠、横向滚动或文本截断。
- `420px` 下侧栏不占据主工作区固定列，Composer 和审批可完整操作。
- 长 JSON/stdout/Diff/MCP result 默认不淹没时间线。
- live/resume 使用同一视觉组件，状态恢复无布局跳变。
- MCP Resource Link、progress 截断、Dynamic Tool 失败态、Image Generation loading 和长 Tool text 必须进入真实 Electron Gate B。
- 五种 locale 的可见文案不溢出。
- typecheck、Renderer tests、contract tests、GUI smoke 和真实 Electron Gate B 通过。
- governance 扫描确认无旧视觉 fallback、重复 owner 或未引用 selector。

动态状态、完成度、证据与下一刀只记录在 `internal/exec-plans/xuanlan-codex-desktop-ui-progress.md`。
