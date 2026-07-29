# Codex Desktop 全量 UI 对齐实施进度

> 状态：P0 Sidebar 核心菜单与项目会话树 Gate B 完成，P1 Activity Row、MCP/Media 与 Multi-Agent/Boundary 第一轮完成
> 更新时间：2026-07-29
> 固定参考：Codex Desktop `26.721.41059`
> 稳定规范：`internal/roadmap/xuanlan/CODEX-DESKTOP-UI-PARITY.md`
> 功能投影进度：`internal/exec-plans/xuanlan-conversation-projection-progress.md`

## 主目标

以已安装 Codex Desktop 的真实 Renderer 为设计事实源，逐 surface 复刻窗口骨架、侧栏、首页、对话、Composer、全部 Agent 投影、阻塞交互和业务检查器。功能完整度、源码映射完成度、LimeShot 截图验收完成度和 Codex 对照截图完成度分别追踪，任一项未完成时不得宣称全量 parity。

## Current owner

```text
Renderer semantic state
  -> AppShell
       -> AppSidebar
       -> WorkspaceHeader
       -> WorkspaceHome | ConversationTimeline
       -> PendingInteractions | Composer
       -> ActivityInspector | ProjectInspector
  -> styles.css semantic token and responsive owner
```

## 事实源与限制

- [x] 确认 `/Applications/ChatGPT.app` bundle id 为 `com.openai.codex`，版本为 `26.721.41059`。
- [x] 解包 `Contents/Resources/app.asar` 至临时目录并确认包含 Vite Renderer、CSS、OpenAI Sans 声明和按 surface 拆分的 chunk。
- [x] 确认 Computer Use 本身已配置且可读取 Finder；读取 Codex Desktop 被平台应用策略单独拒绝。
- [x] 将“本地无 Desktop Renderer 源码”的旧判断从稳定规范撤销。
- [x] 收到用户提供的 Codex project home `2560x1304` 运行态截图，并提取 sidebar、四项建议、底部双层 Composer 和 toolbar 基线。
- [ ] 收集真实 Codex Desktop 的 thread/tool/approval/inspector 固定尺寸截图；当前仍需要用户截图或平台解除应用限制。

## P0：窗口与主工作流

### A. 源码映射与令牌

- [x] 定位 `app-D4iDTyKa.css`、`app-initial-Czet5G9g.css`、`app-main-BP5-48gp.js`。
- [x] 提取 Electron 字体、字号、字重、toolbar、thread width、item gap、row radius、surface elevation 和 sidebar 混合背景。
- [x] 建立 Codex source -> LimeShot owner 映射表。
- [ ] 提取 light/dark 两套完整 semantic color token。
- [ ] 提取 focus、hover、pressed、disabled 和 reduced-motion 状态矩阵。

### B. Shell / Sidebar / Header

- [x] 将硬分割双栏改成 `275px` Electron sidebar + elevated main surface。
- [x] Sidebar 宽度、`46px` toolbar、safe area、圆角延伸和窗口拖拽区完成第一轮源码对齐。
- [x] New task、search、project、thread row 使用统一紧凑 row 结构和状态。
- [x] 从固定 Renderer 的 `AYl/kYl` 与 `KVl` 锁定 Project/Thread 下拉菜单项目、顺序、确认流程和真实上游 method。
- [x] Project 菜单补齐置顶、Finder、编辑、重命名、全部已读、归档项目对话和移除项目；移除只归档业务项目，不删除工作区文件。
- [x] Thread 菜单补齐置顶、重命名、归档、删除、已读、Finder、复制工作目录和会话 ID；归档/删除调用 Codex 原生 method，删除必须二次确认。
- [x] 菜单的 hover、键盘导航/关闭、异步 pending/error、危险项语义色和 portal 实际高度定位通过真实 Electron Gate B。
- [x] Project 下按业务 binding 投影真实 Codex 会话树，首屏限制 5 条并支持展开显示；历史子行携带完整 `projectId/conversationId/threadId` owner target。
- [x] 项目会话标题由 Electron Main 调用 `thread/read` 读取，Renderer 不保存 history，也不从 delta 合成终态；新会话先插入摘要并在 Turn 完成后刷新标题。
- [x] 已绑定项目会话按 Thread ID 从 Recent 和导入候选去重；固定 Renderer 确认 Project row 进入 Project Home，历史 Thread 只由项目子行打开。
- [x] Header 标题、左右 action、hover/focus 和窄窗状态完成第一轮对齐。
- [ ] 原生窗口交通灯、失焦态和真实系统标题区仍缺运行态对照截图。

### C. Home / Thread / Composer

- [x] Home 删除 Profile 分段卡条，按用户截图重建项目标题、四项 prompt starter 和 `576px` 双层 Composer。
- [x] Thread 主列改为 `48rem`，Markdown 正文采用 `40rem` 语义宽度，保留 `56rem` wide block。
- [x] User/Assistant、activity row、turn gap 和 grouped gap 完成第一轮源码对齐。
- [x] Composer 改为独立 surface、textarea、utility/footer 和 send/stop control；Home Composer 停靠底部且 textarea 不暴露矩形 focus ring。
- [x] Gate B 已覆盖 `1440x900`、`1024x768`、`768x900`、`420x900` 的 main/interaction/project containment。
- [ ] Home 在 `1024x768`、`768x900`、`420x900` 的专用截图回归仍需补齐。

## P1：Agent 投影与阻塞交互

- [ ] Reasoning / Plan / Search / Shell / Diff 逐项完成源码映射、实现和截图。
- [x] Reasoning / Plan / Search / Shell / Diff 完成第一轮源码映射与实现；真实 Codex 对照截图仍未完成，因此父项保持未完成。
- [x] Activity 主行补结构化 query/path/action 摘要，completed 收起低价值状态文案，failed/declined/interrupted 保留终态。
- [x] raw reasoning 默认不进入 DOM；JSON arguments/result 在 stringify 前递归遮蔽敏感键。
- [x] Web Search 默认显示 3 条并支持展开/收起；File Change kind 区分 add/update/delete/move。
- [x] Proposed Plan、Turn Plan 和 Turn Diff 移除卡片边框与背景，统一为紧凑行和二级详情。
- [ ] MCP / dynamic tool / resource / media 逐项完成源码映射、实现和截图。
- [x] MCP / Dynamic Tool / Resource / Media 完成第一轮源码映射、实现和 LimeShot Electron 截图；真实 Codex 对照截图仍未完成，因此父项保持未完成。
- [x] MCP 主行显示 server/tool 与运行态最新 progress，详情限制最后 8 条；plugin/resource/duration 保留为来源信息。
- [x] 修复真实 MCP `resource_link` wire 被降级为 JSON 的 projector bug，Resource Link 显示 name + URI。
- [x] Dynamic Tool `success=false` 提升为 failed 主行终态；Image Generation 增加 prompt/path 摘要和稳定 `16:9` loading surface。
- [x] Tool text/resource text 使用首尾裁剪与 `220px` 高度上限，长 revised prompt/result 保持有界。
- [ ] Multi-Agent / review / compact / sleep / hook / unknown 完成源码映射、实现和截图。
- [x] Multi-Agent / Boundary 完成第一轮源码映射、实现和 LimeShot Electron 截图；真实 Codex 对照截图仍未完成，因此父项保持未完成。
- [x] Hook prompt 改为带 Hook feedback 辅助状态的 User message 气泡，不再显示 hook run id 或通用 Tool disclosure。
- [x] `spawnAgent/sendInput/resumeAgent/closeAgent` 使用 action/status 主行、Agent 数量和状态详情；`wait` 隐藏，sub-agent activity 使用可打开子线程的紧凑状态行。
- [x] `enteredReviewMode/exitedReviewMode/sleep` 隐藏；unknown item 不再进入主时间线，协议漂移继续由 diagnostic owner 承担。
- [x] Context compaction 投影 automatic/manual 与 in-progress/completed；`item/started|completed` 保留实时生命周期，历史无 source 时按 upstream 规则默认为 automatic/completed。
- [x] Command / File approval、User Input、MCP elicitation 完成第一批源码映射、实现和 LimeShot 截图；Permission approval 待真实 fixture。
- [x] User Input 改为逐题导航，返回时保留答案，secret 不进入 DOM，resolved surface 不残留。
- [x] request surface 使用 `24px` 圆角、`.5px` stroke、prominent elevation 和主次审批按钮，并通过 `420px` containment Gate。
- [ ] 长 JSON/stdout/diff/result 的折叠、高度和 overflow 行为继续逐 surface 对齐；当前 Tool/MCP text 已完成第一轮，完整 transcript/drawer 仍待后续能力。
- [x] stdout/diff/JSON 保持有界高度与首尾预览；Web Search 增加结果数量上限，完整 transcript/drawer 仍待后续能力。

## P2：业务检查器与全局状态

- [ ] Project / Brief / Plan / Execution 使用 Codex secondary panel 视觉语法重建。
- [ ] Task / Artifact / QA / Deliverable / error 状态完成对齐。
- [ ] Activity / catalog / hook / review / notice / diagnostic / realtime 完成对齐。
- [ ] 五种 locale 和窄窗文本溢出完成验收。

## P3：治理与回归

- [x] 重写 `governance:ui-parity` 的过时品牌行规则，避免误伤截图确认的 Electron product row；保留对旧 `.brand-row/.brand-mark` 的精确守卫。
- [x] 增加真实 Codex token、唯一 responsive owner、Activity summary、JSON redaction、dead selector 和 Electron Gate B 守卫。
- [x] 本轮 `npm run typecheck`、全量 94 项 tests、8 项 contracts、runtime/UI governance 和 resource provenance 全部通过。
- [x] 真实 Electron Gate B 覆盖 home/thread/projection/interaction/business/resume，并增加 project home 几何与 User Input `420px` Gate。
- [x] Electron Gate B 增加 MCP source/resource、最后 8 条 progress、Dynamic Tool failed、Image Generation loading 和长 Tool text containment 证据。
- [x] Electron Gate B 增加 Hook user bubble、Multi-Agent action/detail、sub-agent entry、compaction lifecycle 和 hidden boundary absence 证据。
- [ ] Computer Use 对 LimeShot 完成 AX tree、桌面和窄屏截图复验。

## 治理分类

### current

- `AppShell -> Sidebar/Header/Home|Timeline/Interaction|Composer/Inspector` 唯一 UI 主链。
- `ConversationTimeline` 保持 Item 原序和唯一 projection owner。
- `PendingInteractions` 保持 reverse request 唯一 interaction owner。
- `styles.css` 保持 semantic token、surface 和响应式唯一 owner。

### compat

- 无。不得保留上一版视觉主题开关或 fallback。

### deprecated

- 无。完成替代后直接清理，不建立长期弃用层。

### dead

- 上一轮猜测的 `--content-width: 760px`、统一小圆角规则和硬分割 sidebar。
- 非 Codex 的品牌顶栏、Profile 五栏分段卡条和 inspector 卡片化结构。
- 任何平级旧主题、重复 projection owner 和 production mock fallback。

## 进度日志

### 2026-07-29：撤销错误完成声明

- [x] 将上一轮 Phase A-E 的 100% 勾选全部撤销。
- [x] 明确原 Gate 只证明 LimeShot 自身功能与响应式，不证明 Codex Desktop 视觉一致。

### 2026-07-29：建立真实 Renderer 基线

- [x] 从真实 CSS 确认 `48rem` thread、`40rem` Markdown、`56rem` wide block、`46px` toolbar、`16px/4px` conversation gap。
- [x] 从真实 CSS 确认 `OpenAI Sans`、Electron `445` 正文字重、pill row、composer `22px` 单行半径和 main surface elevation。
- [x] 基线截图确认上一版存在通用管理工具式 sidebar、额外 profile segmented control、横向铺满投影和过度边框化问题。
- [x] Shell、Sidebar、Header、Home、Thread 和 Composer 完成 P0 第一轮重建。

### 2026-07-29：Sidebar 菜单与 destructive action 对齐

- [x] Codex Project menu 源码证据：`AYl/kYl` 包含 pin/unpin、open folder、rename/edit、mark all read、archive chats 和 remove，并由 archive/remove dialog 承担确认。
- [x] Codex Thread menu 源码证据：`KVl` 包含 pin、rename、archive、mark read/unread；上游 App Server 同时提供 `thread/delete`，LimeShot 删除入口必须显式确认。
- [x] Rust Business Service 增加 project rename/archive 与 conversation binding list/unbind，保持 Project/Binding 为唯一业务事实源。
- [x] Electron semantic gateway 增加 thread rename/archive/delete 与 project archive-all，不向 Renderer 暴露 raw Codex/Rust method。
- [x] AppSidebar 完成 Project/Thread 菜单、确认弹窗、pending/error 与列表刷新。
- [x] 定向 contract、Renderer test、typecheck、Electron build 和 Gate B 全部通过。
- [x] 协议提升至 v5，`project/rename`、`project/archive`、`conversation/binding/list`、`conversation/unbind` 的 Rust 测试通过；项目软归档不会删除 workspace 文件。
- [x] `npm run typecheck`、Sidebar/App Renderer 定向测试 17 项、projects 21 项、business-protocol 1 项和 `protocol:check` 已通过。
- [x] Main IPC 5 项合同覆盖 ownership、`thread/name/set|archive|delete`、成功后 CAS unbind 和 archive-all 部分失败结果。
- [x] Finder/复制/项目全部已读使用 typed semantic gateway；Renderer 不接触工作目录字符串或 raw method。
- [x] 全量 Vitest 19 个文件 93 项、client contract 8 项、runtime/UI governance、resource provenance 和 Electron build 通过。
- [x] 真实 Electron Gate B 的 `sidebarMenuEvidence` 21 项全绿；截图目录：`/tmp/limeshot-codex-sidebar-menus-20260729`。

#### 固定 Renderer 菜单逐项矩阵

| 菜单 | Codex 固定版本条件 | LimeShot 状态 |
| --- | --- | --- |
| Project pin/unpin | `showProjectPinAction` | [x] 本地 UI 偏好 |
| Project open in Finder | local project path 存在 | [x] Main 校验项目并调用系统文件管理器 |
| Project permanent worktree | Git workspace 且允许 stable worktree | [ ] LimeShot 尚无 worktree owner，不显示假入口 |
| Project edit/rename | local project | [x] 业务编辑与 `project/rename` |
| Project mark all read | project 有 thread keys | [x] 从业务 binding 解析完整 Thread ID 集并清理本地未读偏好 |
| Project archive chats | 有可归档 thread | [x] Codex archive + CAS unbind + 部分失败结果 |
| Project remove | project 存在 | [x] 业务软归档，不删除 workspace |
| Thread pin/unpin | `canPin` | [x] 本地 UI 偏好 |
| Thread rename/archive/read-state | thread 可操作 | [x] Codex rename/archive；read-state 为本地 UI 偏好 |
| Thread delete | LimeShot 增强项 | [x] Codex delete + 二次确认 + CAS unbind |
| Thread open folder/copy cwd/copy session id | 本地 cwd/thread 可用 | [x] Main ownership 校验后调用系统文件管理器/剪贴板 |
| Thread copy app link | Desktop deep link 已注册 | [ ] LimeShot 尚无 deep-link owner，不显示假入口 |
| Thread fork/continue | project/worktree 条件 | [ ] 需要 thread/fork 与新 binding 的完整产品链 |
| Thread open new window | 多窗口能力可用 | [ ] LimeShot 尚无多窗口 owner，不显示假入口 |
| Thread connection color/active/automation | remote/feature/automation 条件 | [ ] 当前产品模型不适用，不显示假入口 |

### 2026-07-29：Approval / User Input 第一批对齐

- [x] 从真实 Renderer 的 `IQ`、`xIs`、`oVs`、`DDt` 定位 request surface、approval 和逐题 User Input 组合。
- [x] 只渲染当前 pending/submitting blocking request；resolved/expired/disconnected 不保留大面板。
- [x] 完整 Electron Gate B 通过，截图目录：`/tmp/limeshot-codex-parity-p1-20260729`。

### 2026-07-29：用户 Project Home 截图对齐

- [x] 将截图基线固化为：`275px` sidebar、项目语境标题、四项 prompt starter、`576px` 底部双层 Composer、首页 toolbar 无居中标题。
- [x] 新建任务从项目进入时保留 Project context；未开始 Thread 前不伪造选中的会话子行。
- [x] 保留 Search、Project menu、pin/edit、Profile、typed gateway 等现有语义，不增加无后端事实的 Pull Request/Scheduled/Plugins 假入口。
- [x] 完整 Electron Gate B 再次通过，`newConversationHome` 和 `projectResponsive` 全部为 `true`。
- [x] 最新截图目录：`/tmp/limeshot-codex-reference-home-v2-20260729`。

### 2026-07-29：P1 Activity Row 第一轮对齐

- [x] 从固定 Codex Renderer 的 `uKc`、`SKc/OKc`、`RKc/VKc` 和 command summary 组合确认 reasoning 只投影 summary、completed activity 使用单行摘要、详情按 disclosure 展开。
- [x] Command、File Change、Web Search 主行补结构化摘要；MCP 运行态主行显示最新 progress。
- [x] raw reasoning 不再进入 DOM，MCP/Dynamic/opaque JSON 的敏感键值统一显示为 `[REDACTED]`。
- [x] Web Search 默认三条并可展开；文件变更使用 add/update/delete/move 语义色；Plan/Diff 去除卡片化 surface。
- [x] `npm run typecheck` 与 ConversationTimeline/i18n 定向测试通过，共 10 项。
- [x] 增强后的 Electron Gate B 通过：Search/Shell/File 摘要、completed 状态降噪、Turn Diff 无卡片、MCP secret 不入 DOM 均为 `true`。
- [x] 本轮截图目录：`/tmp/limeshot-codex-activity-p1-v2-20260729`，包含桌面和 `420px` projection 证据。
- [x] 删除 raw reasoning 对应的五语言死文案和孤儿 CSS selector；治理扫描改为要求 Activity summary、JSON redaction 与增强 Gate B 证据。

### 2026-07-29：MCP / Dynamic Tool / Resource / Media 第一轮对齐

- [x] 从固定 Codex Renderer 确认 MCP/Dynamic Tool 复用统一 Activity Row，MCP 主行优先可读 tool/source，长 content 与 raw output 分层处理。
- [x] MCP progress 只显示最后 8 条，运行态主行显示最新 progress；Tool text/resource text 增加首尾裁剪和 `220px` 高度上限。
- [x] MCP 显示 plugin/resource/duration，Resource Link 显示 name + URI；修复真实上游 `resource_link` snake-case wire 的 projector 兼容。
- [x] MCP error 与 Dynamic Tool `success=false` 提升为 failed 主行状态；completed 继续隐藏低价值完成徽标。
- [x] Image Generation 增加 prompt/path 摘要、稳定 `16:9` loading surface，并限制长 revised prompt/result。
- [x] `npm run typecheck`、主进程 projection contract、ConversationTimeline/i18n 定向测试和 UI governance 通过，共 18 项定向测试。
- [x] 增强后的 Electron Gate B 全绿：MCP source/resource/progress、长文本首尾与 containment、Dynamic failure、Image loading 全部为 `true`。
- [x] 本轮截图目录：`/tmp/limeshot-codex-mcp-media-p1-20260729`，包含桌面和 `420px` projection 证据。

### 2026-07-29：Multi-Agent / Boundary 第一轮对齐

- [x] 从固定 Renderer 的 `_T`、`qqn`、`Xol/esl`、`Lcl`、`J8c/Y8c` 确认 Hook、Multi-Agent、sub-agent、compaction 和隐藏边界的真实映射。
- [x] Hook prompt 合并为 User message 气泡并显示 Hook feedback；清理旧 `.agent-kv` 与 unknown 红色卡片孤儿样式/文案。
- [x] Multi-Agent 主行按 create/message/resume/close 与 running/completed/failed 显示，详情保留 prompt、model、reasoning effort、Agent 状态和子线程入口。
- [x] Sub-agent activity 使用 started/updated/interrupted 状态文案；`wait/review/sleep/unknown` 不进入可见时间线。
- [x] Context compaction 增加 source/status 投影；实时 `item/started` 显示 running，`item/completed` 与历史恢复显示 completed。
- [x] 五种 locale 同步新增 Hook、Multi-Agent、sub-agent 和 compaction 文案，删除不再可见的 boundary/unknown 死文案。
- [x] `npm run typecheck`、全量 79 项 tests、8 项 contracts、runtime/UI governance、resource provenance 与 Electron build 全部通过。
- [x] 增强 Electron Gate B 的 `projectionBoundaryParityEvidence` 7 项全绿，桌面与 `420px` 无横向溢出。
- [x] 本轮截图目录：`/tmp/limeshot-codex-boundary-multi-agent-p1-20260729`。

### 2026-07-29：Project 会话树第一轮对齐

- [x] `listProjectConversations` 通过 Business binding + Codex `thread/read` 返回项目会话摘要，不引入第二套 history owner。
- [x] 每个 Project 默认显示 5 条会话并支持展开显示；项目会话子行沿用 Thread 菜单、选中、未读和 pending/error 语义。
- [x] 重命名、归档和删除使用子行完整 owner target，不再把历史项目会话误判为 standalone。
- [x] 新项目会话启动后立即加入树；`turn.completed` 后重新读取上游标题。
- [x] `npm run typecheck`、Main/Sidebar/App 定向测试 25 项、全量 Vitest 19 个文件 94 项、client contract 8 项、runtime/UI governance、resource provenance 与 Electron build 全部通过。
- [x] 真实 Electron Gate B 的 `projectConversationNested` 与 Sidebar 菜单 21 项证据全绿；截图目录：`/tmp/limeshot-codex-sidebar-tree-20260729`。
- [x] Gate fixture 即使把同一项目 Thread 再注册为 imported standalone，Renderer 仍以 Project binding 为 owner，不再在 Recent 重复显示。
- [x] Project row 不再固定启动 `main` conversation，而是进入带项目上下文的 Project Home；项目编辑在 Home 的业务检查器中完成，不隐式创建 Codex Thread。
- [x] App 集成测试覆盖 Project Home、项目历史子行完整 start target 和 Recent 去重；Main 合同测试覆盖 unmaterialized binding fallback。定向 26 项 tests 与 typecheck 通过。

## 完成度

- 源码映射：72%
- P0 主工作流实现：90%（Sidebar 核心菜单、项目多会话树、Recent 去重和 Project Home 落点完成；条件型 Thread action 仍未完成）
- P1 Agent 投影视觉：72%
- P2 业务检查器：15%
- P3 治理与回归：70%
- Codex 运行态截图对照：8%（Project Home 已有用户截图；其余 surface 仍受 Computer Use 应用策略限制）
- UI parity 整体：59%

## 下一刀

先用真实 Electron Gate B 固化 Project Home -> 项目会话子行的导航、Recent 去重和 Home 业务检查器；再按用户截图继续侧栏视觉复验。随后只实现具备完整产品 owner 的 Thread fork/continue；deep link、多窗口和 stable worktree 在产品链建立前保持不显示。
