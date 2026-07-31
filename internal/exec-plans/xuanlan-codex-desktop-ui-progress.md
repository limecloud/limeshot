# Codex Desktop 全量 UI 对齐实施进度

> 状态：Composer 能力与 Production workspace 视觉/交互验收已完成；Review 与 Production extension owner 保持不变
> 更新时间：2026-07-31
> 固定参考：Codex Desktop `26.721.41059`
> 稳定规范：`internal/roadmap/xuanlan/CODEX-DESKTOP-UI-PARITY.md`
> 功能投影进度：`internal/exec-plans/xuanlan-conversation-projection-progress.md`

## 主目标

以已安装 Codex Desktop 的真实 Renderer 为设计事实源，逐 surface 复刻窗口骨架、侧栏、首页、对话、Composer、全部 Agent 投影、阻塞交互和 Review 工作区；产品业务由独立 extension workspace 承载并复用同一视觉语法。功能完整度、源码映射完成度、LimeShot 截图验收完成度和 Codex 对照截图完成度分别追踪，任一项未完成时不得宣称全量 parity。

## 2026-07-30：Composer 添加菜单、附件与原生能力入口

状态：已完成

- 目标：按用户提供的 Codex Desktop Composer 截图补齐“文件和文件夹、应用窗口截图、项目、目标、计划模式、Record a skill、Plugins”全部真实动作；首页与会话共用同一个菜单和 draft owner，不增加假按钮、Renderer 路径泄漏或 Rust 业务绑定。
- 固定事实：普通文件/目录聚合为 Codex Desktop 原生文件引用文本，图片/窗口截图使用 `localImage`，音频使用 `localAudio`；应用名（截图中的 Wave）来自 Electron 可捕获窗口而非硬编码；Goal 使用 `thread/goal/set`；Plan mode 使用 `turn/start.collaborationMode`；Plugin 使用经 Main 校验后的 `mention(plugin://...)`；Record a skill 仅由可用的 `record-and-replay` Plugin 提供。
- 窄写集：`packages/codex-client/src/**`、`src/{shared,preload,main}/**` 中对应 semantic command、`src/renderer/src/{App,Composer*,i18n,styles}.tsx?`、`extensions/{types,production/ProductionHome,production/production.css}`、相关 tests、`scripts/smoke/electron-smoke.mjs`、命令/架构/UI parity 文档和本执行计划。
- 排除项：不修改 Rust Business Service、Project/Plan/Task/Artifact 持久化、Review/Workspace 面板 owner、release/Forge；不实现第三方插件商店或安装器，不把开发 `.codex/skills` 扫描为产品 fallback，不向 Renderer 暴露绝对路径、raw Codex method 或 app-server generated type。
- 退出条件：文件/目录/窗口截图可经系统能力选择、以不含路径的 chip 展示并随 Turn 形成结构化输入；附件可移除且空文本可发送；项目选择、Goal、Plan mode、enabled Plugin 和 Record a skill 均命中各自真实 owner；首页 draft 与现有 Thread 行为一致；五语言、disabled/error/Escape/outside close/窄窗 containment 有覆盖；contracts、typecheck、Electron build、governance 与真实 Gate B 通过。
- 验证计划：Codex client/Main IPC/preload contract/Composer/App/i18n 定向 Vitest，`npm test -- --run`、`npm run test:contracts`、`npm run typecheck`、`npm run electron:build`、`npm run verify:gui-smoke`、`npm run governance:runtime-boundary`、`npm run governance:ui-parity` 与 `git diff --check`。
- [x] 固定 Codex Desktop 源码映射确认菜单顺序及真实 owner；“Attach Wave”已确认为应用窗口截图动作，Wave 不是产品常量。
- [x] 扩展 Codex native request map 与 Electron semantic gateway，完成路径隔离、catalog 校验和结构化 Turn input；普通文件/目录不再错误使用 `Mention`。
- [x] 首页/会话接入共用 Composer add menu、附件 chips、Goal/Plan mode 和 Plugin/Record a skill 选择；一次性选择提交后释放，Plan mode 按上游语义保留。
- [x] Gate B 通过真实模型菜单选择动态可用型号；15 次 Provider 请求证明文件/目录引用、窗口截图、Plugin 注入、Plan mode、Goal 和最终 model/effort。当前目录型号不支持 audio modality 时，Codex 按固定语义将 `localAudio` 二进制替换为受控占位，而不是由 LimeShot 伪造支持。
- [x] 真实 Electron 截图 `/tmp/limeshot-composer-capabilities-20260731/05-composer-capabilities.png` 人工复核通过：六个选择项完整可见、Composer 底部停靠、无重叠、无 Renderer 绝对路径。
- [x] `npm run verify:gui-smoke`、runtime/UI governance、10 项 contracts、typecheck、31 文件 136 项 Vitest、Electron build 与 `git diff --check` 全部通过。
- 治理分类：`current` 为 Codex native Composer + Electron typed semantic host + 共用 Renderer Composer；`compat`、`deprecated` 均为空；普通文件/目录伪装为 `Mention` 的映射属于 `dead`，已直接替换且无 wrapper/fallback。

## 2026-07-30：Composer 模型与推理强度切换

状态：已完成

- 目标：按用户提供的 Codex Desktop 截图，在 Thread Composer footer 增加当前 model/effort 触发器和两级菜单；型号与推理强度都使用固定 Codex `0.145.0` 的真实目录与 Thread settings，不把能力绑定到 Rust 业务层或 production extension。
- 窄写集：`packages/codex-client/src/{types,index.test}.ts`、`src/{shared/desktop,preload/index,main/ipc}.ts`、Main tests、`src/renderer/src/{App,ConversationModelMenu,i18n,main,styles}.tsx?`、组件 CSS/tests、`scripts/smoke/electron-smoke.mjs`、命令/架构/UI 规范和本执行计划。
- 排除项：不修改 Rust Business Service、业务 extension、Review 工作区 owner、未跟踪 `ConversationImportDialog.tsx` 或 release 文件；不硬编码截图型号，不开放 Renderer raw Codex proxy，不新增旧/新双轨。
- 退出条件：`model/list` 与 `thread/settings/update` 进入固定 typed allowlist；Main 校验会话 owner、只读状态和 model/effort 组合；菜单只显示动态目录和所选模型支持的 efforts；设置终态由 `thread/settings/updated` 回投；五语言、loading/error/disabled/Escape/outside close 与窄窗 containment 有覆盖；contracts、typecheck、Electron build 和真实 Gate B 通过。
- 验证计划：Codex client/Main IPC/组件/App/i18n 定向 Vitest，`npm run test:contracts`、`npm run typecheck`、`npm run electron:build`、`npm run verify:gui-smoke` 与 `git diff --check`。
- [x] Codex client 开放 `model/list`、`thread/settings/update` 生成类型，保持 native JSONL envelope 与独立 request map。
- [x] preload/Main 新增 `agent.listModels`、`agent.updateThreadSettings` typed semantic API；Renderer 不能提交 raw method 或其他 Thread setting。
- [x] Main 分页读取非隐藏模型，投影每个模型自己的 supported efforts；更新前校验 owner、只读状态、model/effort 组合并在必要时 resume Thread。
- [x] 当前 Thread 的 model/effort 只从 `thread/start`、`thread/resume` 响应或 `thread/settings/updated` 通知初始化；不再把 `model/list` 默认项误判为当前设置。
- [x] `ConversationModelMenu` 使用一级设置菜单与右侧 model/effort 二级菜单；模型选择保留兼容 effort，否则使用该模型默认值，并把 model/effort 合并成一个设置请求。
- [x] 当前型号不在非隐藏目录时仍显示上游型号；空 reasoning effort 显示“默认”，目录中有可选型号时仍可切换，不误报模型不可用。
- [x] active Turn、只读子线程和 runtime read-only 状态禁用控件；目录 loading/error/retry、更新失败、Escape 与 outside close 已实现。
- [x] 五语言与 Codex client/Main IPC/组件/App/i18n 回归已补；定向 32 项与全量 30 文件 129 项 Vitest 全部通过。
- [x] `npm run test:contracts` 9 项、typecheck、Electron build、runtime/UI governance 与 `git diff --check` 全部通过。
- [x] 增强 Gate B 全绿：13 次 provider fixture 保持通过，`modelSettingsEvidence` 8 项全部为 `true`，证明真实目录、start/resume 初始设置、型号/effort 通知终态与菜单 containment；人工复核截图 `/tmp/limeshot-model-menu-20260730/02-model-picker.png` 无裁切或重叠。

## 2026-07-29：Codex Review 工作区纠偏

状态：已完成

- 目标：纠正“窄右栏纵向堆叠文件、Diff、Environment、Runtime”的错误抽象；点击工具栏或时间线 `fileChange` 后进入 Codex Desktop 风格 Review 工作区，桌面结构固定为“对话列 -> 大面积 Diff -> 最右文件树”，顶部有独立“审阅”标签。
- 窄写集：`src/renderer/src/{App,ConversationReview,ConversationTimeline,conversationChanges,i18n,main,styles}.tsx?`、`src/renderer/src/conversationReview.css`、对应 Renderer tests、`scripts/{quality,smoke}/**`、本执行计划、架构与 xuanlan 投影规范。
- 排除项：不修改 `internal/exec-plans/v0.4.0-release.md` 与未跟踪 `ConversationImportDialog.tsx`；不新增 Git branch/commit/push 假能力，不改 preload、IPC、Codex/Rust 协议。
- 退出条件：Review 默认不在 DOM；工具栏或时间线 fileChange 可打开并选中对应文件；桌面对话列固定 `380-430px`，Diff 主区宽于最右文件树；`1024px` 使用专用 Review，`420px` 使用文件选择器且无横向溢出；Environment/Runtime 不进入 Review；定向/全量测试、typecheck、Electron build、UI/runtime governance 和 Gate B 通过并人工复核截图。
- 验证计划：先跑 `conversationChanges`、`ConversationReview`、`ConversationTimeline`、`App` 与 i18n 定向 Vitest，再跑全量 Vitest、`npm run typecheck`、`npm run governance:ui-parity`、`npm run governance:runtime-boundary`、`npm run electron:build`、`npm run verify:gui-smoke`；Gate B 断言桌面/紧凑/窄屏几何并保存截图。
- [x] 物理删除错误的 `ConversationInspector` 与 `conversationInspector.css`，不保留 wrapper、旧 selector、旧 `activity` workspace mode 或组合右栏双轨。
- [x] `ConversationReview` 成为文件树、受控文件选择和 Diff 的唯一 owner；`ConversationStatusSurface` 改为对话列内独立 Activity 浮层，不再进入 Review。
- [x] 工具栏“变更”和时间线 `fileChange` 均打开 Review；顶部显示独立“审阅”标签与关闭动作，Review 默认关闭。
- [x] 文件导航按路径树展示并支持筛选；viewer 保留 hunk、旧/新行号、addition/deletion/context、长内容有界预览与 aggregate diff fallback。
- [x] 五语言已补 Review、打开/关闭、已修改文件和筛选文件文案；旧环境检查器文案已删除。
- [x] 定向 Vitest 5 个文件 33 项与 `npm run typecheck` 已通过。
- [x] 全量 Vitest 23 个文件 107 项、`npm run typecheck`、UI/runtime governance、Electron production build 与 `git diff --check` 通过。
- [x] 真实 Electron Gate B 全绿：`changesReview`、`changesReviewCompact`、`changesReviewNarrow` 和 `activitySurface` 均为 `true`；证明真实 Electron/preload/IPC、Codex/Rust child、13 次 provider fixture、时间线打开 Review、桌面三列、`1024px` 专用 Review、`420px` 文件选择器及无横向溢出。
- [x] 截图目录：`/tmp/limeshot-review-workspace-20260729`；`02-review-workspace.png`、`02-review-workspace-1024.png` 与 `02-review-workspace-420.png` 已人工复核，无重叠、截断或错误层级。

## 2026-07-29：核心 Codex UI 与 Production 业务 extension 解耦

状态：已完成

- 目标：核心 Renderer 只拥有 Codex Desktop 壳、会话投影、阻塞交互和核心会话 surface；Project、Profile、Brief、Plan、Execution、Task、Artifact 与 Deliverable 迁入独立 production extension workspace。
- 窄写集：`src/renderer/src/{App,AppSidebar,ConversationTimeline,i18n,main,styles}.tsx?`、`src/renderer/src/extensions/**`、`scripts/quality/check-ui-parity.mjs`、`scripts/smoke/electron-smoke.mjs`、本执行计划、稳定 UI 规范和全局架构。
- 排除项：不修改未跟踪 `src/renderer/src/ConversationImportDialog.tsx` 和已脏 `internal/exec-plans/v0.4.0-release.md`；不改 preload、Electron IPC、Codex/Rust 协议或业务持久化；不建设动态第三方插件安装、下载或沙箱系统。
- 退出条件：核心 `App` 不加载业务 detail/profile/plan/execution 状态；核心右栏无业务 surface；项目编辑进入 `production-workspace`；业务样式和文案只存在于 extension；旧根组件物理删除并有回流守卫；定向/全量测试、typecheck、contracts、UI/runtime governance、Electron build 和 Gate B 通过。
- [x] 新增 `ProductExtension` 合同、静态可信 registry 和 `ExtensionHost`；production extension 独立注册 Home 与 Workspace 两种 surface。
- [x] `ProductionHome`、`ProductionWorkspace`、`ProductionProject`、`PlanPanel`、`ExecutionPanel`、业务 i18n 与 CSS 迁入 `extensions/production/**`。
- [x] 项目“编辑”不再切换核心 Project Inspector，而是进入独立 `production-workspace`；核心 Review 与 Activity surface 均不承载业务 UI。
- [x] 删除根 Renderer 的 `WorkspaceHome`、`ProjectOverview`、`PlanPanel`、`ExecutionPanel` 及对应旧测试；不保留 wrapper、fallback 或双轨样式/文案。
- [x] `governance:ui-parity` 递归扫描 extension，并禁止旧组件名、`project-inspector` 和业务 UI 回流核心 `App/styles/i18n`。
- [x] 修正 smoke 在 Electron 重启后复用旧 page Locator 的测试缺陷；assistant 可见性在进入独立 extension workspace 前取证，不再依赖旧 Inspector 与会话叠层布局。
- [x] 全量 Vitest 23 个文件 105 项、`npm run typecheck`、8 项 client contracts、UI/runtime governance、Electron production build 与 `git diff --check` 全部通过。
- [x] 真实 Electron Gate B 全绿：Codex/Rust child、13 次 provider fixture、审批/媒体/重试/QA/Deliverable/重启恢复均通过；`projectResponsiveEvidence.desktop|compact|narrow` 与 `coreBusinessInspectorAbsent` 全为 `true`。
- [x] 带截图 Gate B 再次通过；截图目录：`/tmp/limeshot-production-extension-20260729`。该轮截图只证明旧会话 surface 与 production workspace 解耦；旧变更右栏视觉结论已被本轮 Review 工作区纠偏取代。production workspace 的 `1280x900`、`1024x768`、`768x900`、`420x900` 均无重叠或横向溢出。

## Current owner

```text
Renderer semantic state
  -> AppShell
       -> AppSidebar
       -> WorkspaceHeader
       -> ConversationTimeline
       -> PendingInteractions | Composer
       -> ConversationReview(Diff + FileTree)
       -> ConversationStatusSurface(Activity popover)
  -> ExtensionHost
       -> production
            -> ProductionHome
            -> ProductionWorkspace(Brief + Plan + Execution + Artifact + Deliverable)
  -> core styles/i18n + extension-local styles/i18n
```

## 2026-07-31：Production workspace 视觉与交互验收

状态：已完成

- 主目标：完成 production extension workspace 的 Project、Brief、Plan、Execution、Artifact、Deliverable 视觉与交互验收，保持业务 UI 与核心 Codex 壳解耦。
- 完成结果：Project 摘要保持常驻；Brief、Plan、Execution 改为 extension 内部标签页；Execution 在桌面使用任务/产物双列、窄窗单列；核心壳不感知业务 section state。
- 窄写集：`src/renderer/src/extensions/production/**`、本执行计划；仅在需要补行为证据时扩展到 `scripts/smoke/electron-smoke.mjs`。
- 排除项：不修改核心 `App`、Review、Activity、Composer、preload、Electron IPC、Rust Business Service、Codex 协议和历史兼容入口；不新增动态第三方 UI 插件系统。
- 视觉退出条件：Project/Brief/Plan/Execution/Artifact/Deliverable 均有清晰单一层级、状态和主要动作；桌面/紧凑/窄窗无重叠、无水平溢出，输入与按钮可达；业务状态不进入核心 Review/Activity。
- 交互退出条件：Brief 保存、Plan 审批/退回、素材导入、媒体探测/转码、任务取消/重试、Artifact QA 与 Deliverable 确认均有 pending/error/success 可见反馈；现有定向测试与 Gate B 证据保持通过。
- 验证计划：production 定向 Vitest、`npm run typecheck`、`npm run governance:ui-parity`、`npm run governance:runtime-boundary`、`npm run electron:build`、`npm run verify:gui-smoke`、`git diff --check`。
- 设计审查：基线 Design Score `C`、AI Slop Score `A`；最终 Design Score `B`、AI Slop Score `A`。修复了单页纵向堆叠、`8-10px` 低可读正文、Brief 无脏/成功状态、Plan 退回提交空 note、raw profile/artifact/container 标识泄漏五项发现。
- 交互结果：Brief 仅在内容变化时允许保存，并投影未保存/已保存状态；Plan 退回必须填写修改意见，可取消且空意见不能提交；审批、素材导入、探测、转码、取消、重试、QA 和交付确认继续命中原 semantic API。
- 五语言：新增 workspace、Brief 保存、Plan 修改意见、媒体操作与 Artifact 用户语义文案，i18n key parity 测试通过；本轮真实截图语言为 `zh-CN`，其余语言的逐视口截图仍归入全量 locale 验收项。
- Gate B：`productionWorkspaceEvidence` 的 11 项全部为 `true`，覆盖标签切换、Brief dirty/revert、Plan 修改表单、Execution 激活；业务持久化、Artifact/QA、Deliverable、重启恢复及 15 次 Provider 请求继续全绿。
- 截图：基线 `/tmp/limeshot-production-workspace-20260731`；最终 `/tmp/limeshot-production-workspace-20260731-final`，包含 `1280x900`、`1024x768`、`768x900`、`420x900`、Plan 修改意见、Execution 与重启后完整交付终态。
- 验证：production 定向 Vitest 5 文件 9 项、全量 Vitest 33 文件 138 项、`npm run verify:local`、`git diff --check` 全部通过；聚合门禁包含 10 项 contract、41 项 Rust、typecheck、资源/版本、UI/runtime governance、Electron build 和真实 Gate B。
- [x] 完成三视口基线与设计审查记录。
- [x] 完成 production extension 内视觉/交互修正。
- [x] 完成定向测试、全量测试与真实 Electron Gate B 复验。
- 治理分类：`current` 为 `ExtensionHost -> production -> ProductionWorkspace` 及其本地 tabs/Brief/Plan/Execution 投影；`compat`、`deprecated` 为空；同时挂载三块业务 panel、空 note 退回和 raw profile/artifact/container 文案属于 `dead`，已直接替换且无 wrapper/fallback。
- 完成度：本切片 `100%`；全量 Codex Desktop parity 仍受 P0/P1 的真实对照截图与其余 locale 逐视口验收约束，不宣称全部完成。

## 事实源与限制

- [x] 确认 `/Applications/ChatGPT.app` bundle id 为 `com.openai.codex`，版本为 `26.721.41059`。
- [x] 解包 `Contents/Resources/app.asar` 至临时目录并确认包含 Vite Renderer、CSS、OpenAI Sans 声明和按 surface 拆分的 chunk。
- [x] 确认 Computer Use 本身已配置且可读取 Finder；读取 Codex Desktop 被平台应用策略单独拒绝。
- [x] 将“本地无 Desktop Renderer 源码”的旧判断从稳定规范撤销。
- [x] 收到用户提供的 Codex project home `2560x1304` 运行态截图，并提取 sidebar、四项建议、底部双层 Composer 和 toolbar 基线。
- [ ] 收集真实 Codex Desktop 的 thread/tool/approval 固定尺寸截图；Review 已使用本轮用户截图作为对照事实源。

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

## P2：产品 Extension 与全局状态

- [x] Project / Brief / Plan / Execution 从核心右栏迁入独立 production extension workspace；核心与业务 owner 已物理解耦。
- [x] Production workspace 内的 Project / Brief / Plan / Execution 完成 Codex 视觉语法和交互密度对齐。
- [x] Task / Artifact / QA / Deliverable / error 状态完成对齐。
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

- `AppShell -> Sidebar/Header/Timeline/Interaction/Composer/ConversationReview` 是唯一核心 Codex UI 主链。
- `ConversationTimeline` 保持 Item 原序和唯一 projection owner。
- `PendingInteractions` 保持 reverse request 唯一 interaction owner。
- `ConversationReview` 只拥有 Diff 与最右文件树，默认关闭；`ConversationStatusSurface` 只属于对话内 Activity 浮层。
- `ExtensionHost -> production -> ProductionHome|ProductionWorkspace` 是唯一产品业务 UI 主链。
- 核心 `styles.css/i18n.ts` 与 production extension 本地 CSS/i18n 分别拥有各自 surface。

### compat

- 无。不得保留上一版视觉主题开关或 fallback。

### deprecated

- 无。完成替代后直接清理，不建立长期弃用层。

### dead

- 根 Renderer 旧 `WorkspaceHome`、`ProjectOverview`、`PlanPanel`、`ExecutionPanel` 及其旧测试。
- 核心 Project Inspector、`project-inspector` selector、业务 detail/profile/plan/execution state 和业务文案。
- 错误的 `ConversationInspector`、`workspace-inspector`、`conversation-inspector` 以及 Environment/Runtime 与 Diff 组合布局。
- 上一轮猜测的 `--content-width: 760px`、统一小圆角规则和硬分割 sidebar。
- 非 Codex 的品牌顶栏、Profile 五栏分段卡条和卡片化检查器结构。
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
- [x] Project row 不再固定启动 `main` conversation，而是进入带项目上下文的 Project Home；项目编辑进入独立 production extension workspace，不隐式创建 Codex Thread。
- [x] App 集成测试覆盖 Project Home、项目历史子行完整 start target 和 Recent 去重；Main 合同测试覆盖 unmaterialized binding fallback。定向 26 项 tests 与 typecheck 通过。

### 2026-07-29：Project Home / Recent owner Gate B 收口

- [x] Project row 在真实 Electron 中只进入 Project Home，不隐式 materialize 固定 `main` Thread；项目历史只从嵌套会话子行恢复。
- [x] Recent 自动投影 Electron Main `thread/list` 返回的原生 Codex 历史；Renderer 无手工导入 action、无导入弹窗、无 `localStorage` 导入 registry。
- [x] 同一 Thread 同时存在业务 project binding 与原生 history 时，以 project binding 为唯一 owner，并从 Recent 去重。
- [x] 自动发现的未绑定历史保持只读；重启后独立 Thread、只读原生历史和项目 Thread 三条恢复路径均通过真实 Codex `thread/read|resume`。
- [x] Electron Gate B 13 次 provider 请求全部通过；`projectRowOpensHome`、`automaticImportListing`、`conversationImportEvidence`、`importedConversationRestoredAfterRestart` 和 Sidebar 菜单 21 项证据全绿。
- [x] 截图目录：`/tmp/limeshot-codex-sidebar-owner-20260729`；人工复验 `01-project-home.png`、`02-conversations-auto-projected.png`、`02-home-project-context.png` 无 owner 重复或错误选中。
- [x] `npm run typecheck`、全量 Vitest 20 个文件 100 项、8 项 client contracts、runtime/UI governance、resource provenance 与 Electron build 全部通过。

### 2026-07-29：Sidebar 静止态与目录历史归属

- [x] 对照固定 Renderer `tzl/izl`，Project 行的新增任务与菜单动作只在 hover、键盘 focus 或菜单打开时显示；选中 Project 不再常驻露出动作图标。
- [x] 项目会话由 `48px` 过深缩进收紧到 Codex 的 `40px` 文字起点；“显示更多”和错误状态同步使用同一前导槽位节奏。
- [x] Gate B 增加 `projectActionsRestHidden` 与 `codexProjectThreadIndent`，避免功能回归通过但静止态视觉再次漂移。
- [x] 打开本地目录后，该目录及其子目录中已有的 root Codex `exec` 历史自动归入 Project，会话保持只读且从 Recent 去重；realpath 路径别名和重启恢复均有覆盖。
- [x] 真实 Electron Gate B 的 `openedProjectExistingHistoryNested`、`openedProjectExistingHistoryRestored` 与 Sidebar 全部证据全绿；截图目录：`/tmp/limeshot-codex-sidebar-visual-v2-20260729`。
- [x] `npm run typecheck`、全量 Vitest 20 个文件 100 项、8 项 client contracts、runtime/UI governance、resource provenance 与 Electron build 全部通过。

## 完成度

- 源码映射：75%
- P0 主工作流实现：96%（Composer 全动作与 Review 工作区已对齐；条件型 Thread action 仍未完成）
- P1 Agent 投影视觉：74%（fileChange -> Review 与 Diff/FileTree 已完成；其余运行态 surface 继续逐项对照）
- P2 产品 extension：38%（核心/业务 owner 已解耦并迁入独立 workspace；业务 surface 的完整视觉与交互验收仍未完成）
- P3 治理与回归：82%
- Codex 运行态截图对照：12%（Project Home 与 Review 已有用户截图；其余 surface 仍受 Computer Use 应用策略限制）
- UI parity 整体：66%

## 下一刀

完成 production extension workspace 的 Project/Brief/Plan/Execution/Artifact/Deliverable 视觉和交互验收；这些能力不得回流核心 Review 或 Activity surface。随后为 branch、commit/push 和 compare 建立 semantic Git owner，再补 Review 的真实仓库操作；owner 建立前保持不显示，禁止 Renderer shell 或硬编码 `main`。Thread fork/continue、deep link、多窗口和 stable worktree 在完整产品 owner 建立前同样保持不显示。
