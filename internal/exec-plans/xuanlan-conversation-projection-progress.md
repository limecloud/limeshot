# Codex 对话全量投影实施进度

> 状态：已完成
> 更新时间：2026-07-29
> 路线图：`internal/roadmap/xuanlan/README.md`
> Item 合同：`internal/roadmap/xuanlan/ITEM-PROJECTIONS.md`
> Event 合同：`internal/roadmap/xuanlan/EVENT-PROJECTIONS.md`

## 主目标

让 LimeShot 对话页完整消费 Codex App Server 的 Thread、Turn、18 类 Item、72 个 notification 投影出口和 11 类 reverse request。Search、Shell、Diff、MCP、动态业务工具、Reasoning、图片、多 Agent、审批和用户输入必须经过真实 Electron semantic bridge 可见、可交互、可恢复；任何已知类型不得静默丢弃。

## Current owner

```text
Codex app-server native JSONL
  -> packages/codex-client generated protocol
  -> Electron main supervisor / reverse-request owner
  -> main semantic projection
  -> preload typed gateway
  -> Renderer conversation projection / reducer
  -> ItemRenderer / PendingInteraction / status surfaces
```

Rust Business Service 只处理 `item/tool/call -> tool/call -> ToolHost` 业务执行，不拥有 Codex history、pending request 或 GUI Agent 状态。

## 当前阶段

Phase E 已完成：固定 Codex `0.145.0`、全量协议适配、本地化/可访问性/性能审计和真实 Electron Gate B 均已闭环。

Phase A 已完成固定 `0.145.0` experimental schema、18 类 Item 数据模型、72/72 原生 notification allowlist/reducer、11-method typed reverse contract、Electron pending owner、semantic action token、legacy/v2 去重与 host-only fail-closed handler。

Phase B 已完成：18 类 ItemRenderer 已接入真实对话页并保持 `Turn.items` 原序，多 Agent 子线程通过只读 semantic navigation 查看且不改变 conversation binding。Phase C 已完成五类阻塞交互的可恢复 Pending Interaction surface。Phase D 已完成 72 类 notification 的专用 semantic consumer、unknown drift guard 与 App 接线。Phase E 已通过完整测试、构建、真实桌面主链、冷启动恢复和窄屏截图验收。

## 优先级与退出条件

### P0 / Phase A：协议、投影与 pending 生命周期

- [x] 从固定 Codex `0.145.0` 生成 experimental TypeScript schema。
- [x] 建立 18 类 `AgentItemProjection` 判别联合与未来 audio/localAudio optional compatibility。
- [x] 建立固定版本 72/72 method 运行时 allowlist。
- [x] 18 类 Item 均进入单一安全 projector；未知 Item fail visible。
- [x] notification 不再对已知 method 静默返回 `undefined`。
- [x] reducer 支持 message/plan/reasoning/command delta、patch snapshot、MCP progress、Turn plan/diff/usage 与 completed 覆盖。
- [x] 增加 18/18 Item projector 参数化 contract test，不再只依赖两个消息 fixture。
- [x] 增加 72/72 notification coverage test，证明每个 allowlisted method 都有合法 semantic 出口。
- [x] Codex client 暴露 typed reverse request handler，不丢 raw request identity。
- [x] Electron main 建立独立 pending map、semantic `interactionId` 与一次性 action token。
- [x] 11/11 reverse request 均有明确 handler：5 类 GUI interaction、dynamic tool Rust route、3 类 host-only、2 类 legacy 去重兼容。
- [x] 断线、Turn 完成、thread closed 与 `serverRequest/resolved` 会终结 pending interaction。

### P0 / Phase B：18 类 ItemRenderer

- [x] 删除按 `kind` 重排时间线的现有逻辑，严格保持 `Turn.items` 原序。
- [x] UserMessage 全输入模态、AgentMessage、HookPrompt、Plan、Reasoning。
- [x] CommandExecution、Search/List/Read、live output、terminal interaction、exit/duration。
- [x] FileChange 与 Turn Diff 的结构化、可折叠渲染。
- [x] MCP arguments/progress/content/structuredContent/error 与安全媒体/资源结果。
- [x] Dynamic tool arguments 与 text/image/audio content。
- [x] CollabAgentToolCall、SubAgentActivity 与只读 thread semantic navigation。
- [x] WebSearch action/result、ImageView、Sleep、ImageGeneration。
- [x] Review boundary、ContextCompaction 与 Unknown Item fail-visible UI。
- [x] live/replay 使用同一 ItemRenderer；completed snapshot 不保留流式伪终态。

### P0 / Phase C：阻塞交互 UI

- [x] Command approval、File approval、Permission approval。
- [x] RequestUserInput 的单选、多选、Other、freeform、secret 与 auto-resolution。
- [x] MCP elicitation 的 form/openai-form/url 模式与结构化校验。
- [x] 同 Thread 多请求排队、跨 Thread 待处理入口、提交防重和 resolved/expired/disconnected 状态。
- [x] Renderer 不接收 raw Codex request id、绝对路径、stdin secret 或凭证。

### P1 / Phase D：72 notification 专用消费面

- [x] Thread metadata/status/environment/settings/goal/token header。
- [x] Hook、安全 review、warning、MCP startup 与 model state。
- [x] Account、Apps、remote control、import、filesystem 与 config 的全局/设置 consumer。
- [x] Fuzzy file search 与 Composer mention consumer。
- [x] Realtime transcript/audio/session consumer；SDP 只留 host owner。
- [x] DX 有界诊断记录、known-but-nonvisual 与 unknown drift guard。

### P0 Gate / Phase E：本地化、性能与验收

- [x] 新增用户可见文案覆盖 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`。
- [x] 长 stdout、Diff、JSON 和 MCP content 有界；流式更新合批；自动滚动不抢用户位置。
- [x] 键盘、焦点、读屏、reduced motion 与窄窗口回归。
- [x] `npm run typecheck`、contract tests、受影响 Renderer tests 全部通过。
- [x] 真实 Electron Gate B 覆盖 Search、Shell output、Diff、MCP、dynamic tool、approval、requestUserInput、图片、interrupt 与 resume。
- [x] Gate B 证明 Renderer -> preload/IPC -> Codex app-server/Rust ToolHost -> GUI，不使用 production mock fallback。

## 本轮写集

- `packages/codex-client/src/{generated/**,types.ts,index.ts,index.test.ts}`
- `src/main/codex/{itemProjection.ts,projection.ts,projection.test.ts,interactions.ts,interactions.test.ts,supervisor.ts}`
- `src/main/codex/{threadNavigation.ts,threadNavigation.test.ts}`
- `src/main/ipc.ts`
- `src/shared/{agent.ts,desktop.ts}`
- `src/preload/index.ts`
- `src/renderer/src/{agentState.ts,agentState.test.ts,agentActivityState.ts,agentActivityState.test.ts,App.tsx,App.test.ts,ConversationTimeline.tsx,ConversationTimeline.test.tsx,ConversationStatusSurface.tsx,ConversationStatusSurface.test.tsx,PendingInteractions.tsx,PendingInteractions.test.tsx,McpElicitationForm.tsx,i18n.ts,styles.css}`
- `scripts/smoke/electron-smoke.mjs`
- `internal/roadmap/xuanlan/**`
- `README.md`、`RELEASE_NOTES.md` 与 `v0.3.0` 版本事实源
- 本执行进度文件

避让：`rust/crates/**` 业务实现、Provider/media 主链、其他 LimeCloud 仓库。不修改参考 Codex/Lime 仓库；提交与发布仅在用户明确授权后执行。

## 进度日志

### 2026-07-28：固定 schema 与 projection/reducer 基座

已完成：

- [x] 使用受管 Codex `rust/target/codex-release/0.141.0/codex-aarch64-apple-darwin app-server generate-ts --experimental` 生成类型；保留 experimental 是因为 dynamic tools 属于产品主链。
- [x] `packages/codex-client/src/types.ts` 收敛到生成的 Thread/Turn/UserInput/request/response 类型，并建立 72 method allowlist。
- [x] 新增 `src/shared/agent.ts`，保留 18 类 Item 的结构字段，不再压扁成五字段卡片。
- [x] 新增 `src/main/codex/itemProjection.ts`，实现输入模态、命令、Diff、MCP、动态工具、多 Agent、Search、图片、review 与 compaction 的有界、脱敏投影。
- [x] 重写 `src/main/codex/projection.ts`，核心生命周期使用专用事件，其余已知通知进入明确的 thread/global/diagnostic notice 出口。
- [x] 扩展 `agentState.ts`，按 index 更新 reasoning、追加有界 command output、替换 patch snapshot、保留 MCP progress 和 Turn metadata。
- [x] `thread/list.sortKey` 从不属于固定 schema 的 `recency_at` 修正为 `updated_at`。

未完成：

- [ ] `projection.ts` 的 generic notice 只是完整路由的中间态，不代表 72 个最终页面 consumer 已完成。
- [ ] 现有测试没有形成 18/18、72/72 参数化覆盖。
- [ ] Reverse request 仍只有 `item/tool/call` business route，其余 9 类会被 Codex client 返回 `Method not found`。
- [ ] `App.tsx` 仍按 kind 重排并只显示通用活动行，18 类专用 Renderer 尚未开始。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/projection.test.ts src/renderer/src/agentState.test.ts`：3 个文件，9 项通过。
- 未运行 Electron Gate B；因此不能宣称用户对话页已支持这些投影。

### 2026-07-29：进度跟踪方法纠正

- [x] 对照 `~/Documents/dev/ai/aiclientproxy/lime/AGENTS.md`、`internal/exec-plans/*progress.md` 与完成度规则，确认 roadmap 与动态进度必须分离。
- [x] `internal/roadmap/xuanlan` 恢复为稳定 planning/contract source。
- [x] 新建本文件作为唯一 current execution tracker，补齐主目标、当前阶段、写集、退出条件、逐轮证据、完成度和下一刀。
- [x] 随后补齐 18/18 Item 与 72/72 notification 参数化 coverage，避免“文档列全”但机器合同未锁定。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/projection.test.ts src/renderer/src/agentState.test.ts`：3 个文件，11 项通过。
- 未运行 Electron Gate B；本轮证据只证明类型、projection 路由与 reducer，不证明 GUI 主链。

### 2026-07-29：Reverse request pending owner

已完成：

- [x] `CodexClient` 增加 10-method typed request/response map，reverse request id 支持上游 `string | number`，handler 可在 client/main 内关联 raw id。
- [x] 增加 10-method 编译期全集校验与运行时长度测试，协议新增 method 时不能静默漏接。
- [x] 新增 `InteractionCoordinator`，Renderer projection 只包含 semantic `interactionId`、一次性 action token、安全摘要和结构化选项。
- [x] Command/File/Permission/UserInput/MCP elicitation 进入统一 pending 队列；legacy exec/patch 与 v2 同动作去重并分别转换响应。
- [x] `item/tool/call` 继续走 Electron -> Rust `tool/call` -> ToolHost；没有把业务执行移入 Renderer。
- [x] 外部 ChatGPT token refresh 和 attestation 在当前无 host capability 时明确 fail closed，不返回伪 token。
- [x] `serverRequest/resolved` raw id 不再下发 Renderer；main 映射为 semantic interaction resolved。Turn 完成、thread closed、进程退出也会清理 pending。
- [x] 增加 `agent:interaction-list` / `agent:interaction-submit` semantic IPC 和 preload typed gateway，支持窗口晚打开后读取 pending。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/interactions.test.ts src/main/codex/projection.test.ts src/renderer/src/agentState.test.ts src/renderer/src/App.test.ts`：5 个文件，23 项通过。
- `InteractionCoordinator` 覆盖 legacy/v2 去重、raw id 不进入 projection、secret 不进入 projection、一次性提交和 Turn 终态 fail-closed。
- 未运行 Electron Gate B；pending owner 与 IPC 已接通，但交互 UI 尚未实现，因此审批/用户输入仍不能宣称用户可操作。

### 2026-07-29：原序时间线与全 Item Renderer

已完成：

- [x] 拆出 `ConversationTimeline` / `AgentItemRenderer`，`App.tsx` 删除按 `kind` 分组的旧 Renderer，live 与 resume 均按 `Turn.items` 原序走同一渲染路径。
- [x] 覆盖 18 类 Item projection 的全部 19 个判别值；Search/List/Read、Shell、Diff、MCP、dynamic tool、Reasoning、图片、review、compaction 和 unknown 均有专用 DOM 出口。
- [x] UserMessage 支持 text/image/audio/skill/mention；MCP 与 dynamic tool 支持 text/image/audio/resource/resourceLink/JSON 内容。
- [x] Turn plan、Turn diff、token usage、command output、terminal interaction、exit code 和 duration 已进入时间线。
- [x] stdout、Diff、JSON、命令和媒体预览均有界；只允许 `https` 与对应 `data:image|audio` URL，拒绝 `file:` 媒体地址。
- [x] 新增的用户可见文案同步 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`。
- [x] 保持 Turn 失败只展示本地化通用错误，不把上游 Codex error detail 泄露到 Renderer。

未完成：

- [ ] CollabAgentToolCall 与 SubAgentActivity 已可见，但子线程 semantic navigation 尚无 gateway/UI。
- [ ] Pending Interaction UI、72 notification 最终 consumer 与真实 Electron Gate B 尚未开始本阶段实现。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run src/renderer/src/ConversationTimeline.test.tsx src/renderer/src/App.test.ts src/renderer/src/agentState.test.ts`：3 个文件，14 项通过。
- `ConversationTimeline.test.tsx` 锁定 19 个 Item 判别值的原序 DOM、Turn plan/diff/usage、长输出首尾保留与不安全媒体拒绝。
- 未运行 Electron Gate B；因此当前证据证明 Renderer contract，不证明真实 Codex/Rust 主链。

### 2026-07-29：多 Agent 子线程 semantic navigation

已完成：

- [x] 对照上游 `codex-rs/app-server/README.md` 与 TUI `agent_navigation.rs`，子 Agent 采用 view-only 语义，不通过 `thread/resume` 抢占写入所有权。
- [x] 新增 `agent:thread-inspect` semantic IPC；main 先做 metadata-only `thread/read` 并校验 `parentThreadId`，只有直接子线程才返回安全 projection。
- [x] 普通历史使用 `thread/read(includeTurns=true)`；上游明确报告 paginated thread 时，回退 `thread/turns/list(sortDirection=asc, itemsView=full)` 并设置 100 页上限。
- [x] Renderer 使用独立子线程查看栈，不修改 Rust conversation binding；子线程 Composer 明确只读，支持逐层进入和返回上级 Agent。
- [x] CollabAgentToolCall 与 SubAgentActivity 均发出 semantic thread id，UI 不显示 raw Codex method、绝对路径或内部错误。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/threadNavigation.test.ts src/renderer/src/ConversationTimeline.test.tsx src/renderer/src/App.test.ts`：4 个文件，20 项通过。
- 主进程测试覆盖父子关系 fail closed 与 paginated fallback；App 测试覆盖只读切换、输入禁用和返回父线程。
- 未运行 Electron Gate B；子线程真实 app-server 路径留到 Phase E 总 Gate。

### 2026-07-29：统一 Pending Interaction surface

已完成：

- [x] App 启动调用 `agent:interaction-list` 恢复 pending，并消费 `interaction.updated|resolved`；列表保留有界终态，不依赖窗口必须先于请求打开。
- [x] Command/File/Permission 三类审批使用同一队列面，提交 typed semantic envelope；File approval 可按 `itemId` 从当前 Turn 的 `fileChange` Item 补齐 Diff。
- [x] RequestUserInput 支持单选、多选、Other、freeform、secret 与 auto-resolution countdown；secret input 不把值同步到可序列化 DOM 属性，只在 semantic submit payload 中出现。
- [x] MCP `form|openai/form|url` 全部有专用交互；object schema 支持 string/number/integer/boolean、single enum、multi enum、required、长度和数值范围校验。
- [x] MCP URL 原值只保留在 Electron main；Renderer 只收到无 query/credential 的 label。“打开浏览器”校验 HTTPS/hostname/userinfo 且不 resolve 请求，用户明确完成后才发送 accept。
- [x] 同 Thread 严格按 `createdAt` FIFO，其他 Thread 通过 tab 进入；submitting 禁用控件并防双击，resolved/expired/disconnected 均有明确非操作终态。
- [x] `agent:interaction-open-external` 已贯通 typed desktop API、preload allowlist、main coordinator 与 Electron `shell.openExternal`。
- [x] 新增用户可见文案同步 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/interactions.test.ts src/main/codex/projection.test.ts src/main/codex/threadNavigation.test.ts src/renderer/src/agentState.test.ts src/renderer/src/ConversationTimeline.test.tsx src/renderer/src/PendingInteractions.test.tsx src/renderer/src/App.test.ts`：8 个文件，41 项通过。
- main 测试覆盖 URL 不进入 projection、合法 HTTPS host open、`http:` 与带 username/password URL fail closed，并证明 open 不移除 pending、不触发 resolved。
- Renderer/App 测试覆盖三类审批 envelope、FIFO、跨 Thread tab、提交防重、五种状态、UserInput 全输入模式、secret DOM 边界、MCP primitive/enum/multi-select、URL 两阶段和启动恢复/事件订阅。
- 未运行 Electron Gate B；因此 Phase C 已具备 typed gateway 与 contract 证据，但真实 app-server 桌面主链仍由 Phase E 总 Gate 验收。

### 2026-07-29：72 notification 专用消费面与 drift guard

已完成：

- [x] `thread.context.updated` 收敛 Thread lifecycle/name/goal/environment/settings/model/safety metadata；`thread.status.updated` 与 `thread.usage.updated` 保持独立高频状态通道。
- [x] 新增有界 `agentActivityState`，按 Thread 合并 context/status/usage/realtime，按 id 更新 Hook 与 Guardian review，并对 notice/catalog/diagnostic 做有界去重。
- [x] 新增 `ConversationStatusSurface`，消费 header/status、goal/settings、realtime transcript/audio、Hook、安全 review、warning、catalog、Composer file search 与默认折叠诊断。
- [x] Account、Apps、remote control、MCP、import、filesystem、sandbox 与 login 进入结构化 catalog；raw/process/moderation/SDP/compatibility 进入 DX，不污染 Item 时间线。
- [x] Codex client 对未知 notification 生成 `{ method: 'unknown', sourceMethod, params }`，main 投影只下发脱敏 protocol diagnostic；raw method、payload、绝对路径和凭证不进入 Renderer event。
- [x] 建立 `Record<CodexNotificationMethod, AgentEvent['type']>` 与 72 份最小合法 fixture，逐 method 锁定唯一 semantic 出口，不再以空 params 证明假覆盖。
- [x] App 订阅链已接入 activity reducer；archived/deleted/closed/systemError 禁用 Composer，文件搜索结果写入 `@path` mention，warning 可关闭。
- [x] Agent error reducer 不保存上游错误 detail，也不硬编码英文用户文案；错误 notice 由 Renderer 使用五语言 semantic fallback。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/interactions.test.ts src/main/codex/projection.test.ts src/main/codex/threadNavigation.test.ts src/renderer/src/agentState.test.ts src/renderer/src/agentActivityState.test.ts src/renderer/src/ConversationTimeline.test.tsx src/renderer/src/ConversationStatusSurface.test.tsx src/renderer/src/PendingInteractions.test.tsx src/renderer/src/App.test.ts`：10 个文件，49 项通过。
- App 集成测试覆盖 model/environment header、warning dismiss、fuzzy search mention、archived Composer 只读和脱敏 unknown diagnostic。
- 未运行真实 Electron Gate B；当前证据证明固定协议到 Renderer semantic/UI contract，不证明打包 Electron 与真实 app-server/Rust ToolHost 的端到端链路。

### 2026-07-29：Phase E 本地化、可访问性与流式性能审计

已完成：

- [x] DX 从 Electron main 的英文 `message` 收敛为稳定 `code + optional detail`；Renderer 对 diagnostic domain/code 做五语言映射，未知协议 method 和 payload 仍不下发。
- [x] Thread status、Goal status、Hook status、Guardian risk、Environment state、常见 catalog status 与 realtime fallback 全部使用五语言固定文案；terminal interaction 使用本地化遮蔽摘要，不展示 stdin。
- [x] 新增 `AgentEventBatcher`，同一绘制帧内的高频 delta/usage/realtime events 只触发一次 activity/timeline state 提交，同时严格保持事件原序；interaction pending 与 Turn 完成业务副作用仍立即处理。
- [x] 时间线改为 `role=log`、`aria-relevant="additions text"` 与非 atomic 更新，避免每次 delta 重读完整历史。
- [x] Pending Interaction 补齐 region/tabpanel/tab 关系、左右方向键和跟随焦点；只有页面当前无焦点时才聚焦新请求，不抢正在输入的 Composer。
- [x] 倒计时使用非播报 `role=timer`，reduced motion 禁止 spinner/展开旋转动画；420px 以下 Composer、权限表格和动作按钮有稳定单列约束。
- [x] stdout、Diff、JSON、MCP/realtime 继续使用既有有界 buffer/preview；代码中不存在主动 timeline auto-scroll，因此不会抢用户阅读位置。

验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/interactions.test.ts src/main/codex/projection.test.ts src/main/codex/threadNavigation.test.ts src/renderer/src/agentState.test.ts src/renderer/src/agentActivityState.test.ts src/renderer/src/agentEventBatcher.test.ts src/renderer/src/ConversationTimeline.test.tsx src/renderer/src/ConversationStatusSurface.test.tsx src/renderer/src/PendingInteractions.test.tsx src/renderer/src/App.test.ts`：11 个文件，50 项通过。
- 新增测试锁定单帧事件原序合批、Timeline log 语义、Pending tab 键盘/焦点、timer 非播报、稳定 enum 本地化与 App 下一帧刷新。
- `browse` 技能未能启动：其固定 Chromium 未安装；没有执行全局浏览器下载。真实窗口检查继续使用仓库既有 Electron Playwright Gate，不引入 browser-only mock。

### 2026-07-29：真实 Electron Gate B 与固定运行时恢复审计

已完成：

- [x] Gate B 通过真实 Electron、受管 Codex `0.141.0`、临时 Responses fixture、stdio MCP、Rust ToolHost 和媒体链执行 11 次确定性请求及两次冷启动；未向 Renderer 注入 mock state。
- [x] 修复 MCP 结果断言：按 `call_id` 从第七次 Responses 请求结构化定位 `function_call_output`，避免 `JSON.stringify` 转义导致误报失败。
- [x] 现场证明 Search、live Shell、Diff、MCP、动态工具、图片、文件审批、MCP elicitation、requestUserInput/secret DOM 脱敏、interrupt、standalone/project 冷启动恢复和 420px 无横向溢出均通过。
- [x] 核对固定上游 `rust-v0.141.0`：`thread/turns/items/list` 明确返回 `-32601`；`thread/turns/list(itemsView=full)` 只能重放 rollout 已持久化 Event。
- [x] 核对上游提交 `11e0f3d3ae`：`0.141.0` 使用的 limited history 策略主动删除 `persistExtendedHistory`，明确不持久化 `ExecCommandBegin/End`；因此恢复的 canonical Thread 不含 `commandExecution`，不能由 main、Rust 或 Renderer 合成补回。

验证证据：

- `npm run verify:gui-smoke`：除 `projectionsRestored` 外全部 Gate 证据为 `true`，其中 `mcpOutputRouted: true`；恢复 Item 类型为 `userMessage`、`agentMessage`、`webSearch`、`reasoning`、`imageGeneration`、`fileChange`、`mcpToolCall`，唯一缺少 `commandExecution`。
- 上游 `0.143.0` 引入 `thread/start.historyMode: "paginated"` 与 `thread/items/list` 的 schema，但真实 Gate 随后证明该版本 runtime 仍明确拒绝 paginated Thread；真正启用 paginated app-server 的提交 `da61f7d8e1` 首次进入稳定 `0.145.0`。这是一条版本升级，不是可在 `0.141.0` 或 `0.143.0` 上用兼容代码弥补的缺口。

### 2026-07-29：固定 Codex 0.143.0 与 paginated 能力审计

已完成：

- [x] 用户确认后将受管 Codex 固定到官方 `rust-v0.143.0`；archive SHA-256 为 `7df2384f037519dff7dbf4252e60913a5c1c7fdb66c1467c9125b2b2d3594a86`，可执行文件 SHA-256 为 `9070e47d422129106bc41ca651a9998b06a6c55bd42a7c3362b48f1d2850766f`。
- [x] 更新 runtime manifest、resource provenance 守卫与版本事实源，并用固定可执行文件重新生成 668 个 experimental TypeScript schema 文件；清除 5 个旧版本遗留生成文件。
- [x] native history reader 已按 `thread.historyMode` 分流；paginated 路径先使用 `thread/turns/list(itemsView="notLoaded")` 分页读取 Turn，再按 `turnId` 使用 `thread/items/list` 分页 hydration canonical Item。
- [x] 真实 Gate 证明固定 `0.143.0` 以 `-32601 paginated_threads is not supported yet` 拒绝创建 paginated Thread；新 Thread 已恢复为固定能力常量 `CODEX_NEW_THREAD_HISTORY_MODE="legacy"`，避免 Agent 全面不可用且不在 LimeShot 侧合成历史。
- [x] 0.143.0 新增 `currentTime/read` 后，11/11 reverse request 已锁定；Electron host 返回整数 Unix seconds，该请求不进入 Renderer。
- [x] command approval fixture 同步 0.143.0 必填 `environmentId`，MCP Gate 断言改为按 `call_id` 结构化定位 `function_call_output`。

阶段验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/interactions.test.ts src/main/codex/threadNavigation.test.ts`：3 个文件，16 项通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/interactions.test.ts src/main/codex/projection.test.ts src/main/codex/threadNavigation.test.ts src/renderer/src/agentState.test.ts src/renderer/src/agentActivityState.test.ts src/renderer/src/agentEventBatcher.test.ts src/renderer/src/ConversationTimeline.test.tsx src/renderer/src/ConversationStatusSurface.test.tsx src/renderer/src/PendingInteractions.test.tsx src/renderer/src/App.test.ts`：11 个文件，52 项通过。
- `npm run test:contracts`：2 个文件，8 项通过。
- `npm run governance:runtime-boundary`、`npm run verify:app-version`、`npm run resource:check`：通过。
- `npm run electron:build`：通过。
- 0.143.0 paginated Gate：失败于真实 `thread/start`，上游返回 `-32601 paginated_threads is not supported yet`；Provider 请求数为 0，Renderer 正确进入 Agent unavailable，未使用 fallback。
- 上游 `rust-v0.143.0` 官方测试明确断言 `accepts_legacy_and_rejects_paginated`；支持提交 `da61f7d8e1` 不属于任何 `0.144.x`，首个包含它的稳定 tag 是 `rust-v0.145.0`，该版本官方测试改为 `accepts_legacy_and_paginated`。
- 0.143.0 legacy 能力门重跑真实 Gate：除 `projectionsRestored` 外全部证据为 `true`；`historyRestored`、`interruptRestored`、MCP route、审批/用户输入、双冷启动、Rust ToolHost、媒体、Artifact、QA 和 Deliverable 全部通过。
- legacy 恢复 Item 类型为 `userMessage`、`agentMessage`、`webSearch`、`reasoning`、`imageGeneration`、`fileChange`、`mcpToolCall`，唯一缺少 `commandExecution`，与上游 limited history 根因一致。
- Gate locator 已改为精确匹配 `Gate B complete`，避免被 `Projection Gate B complete` 子串误命中；不改变产品路径。
- `/tmp/limeshot-gate-b-legacy.hZ6LLU` 生成 10 张真实 Electron 截图；人工核对 desktop `2880x1694` 与窄窗 `420x900` 均非空、Composer 可见、无元素重叠，Gate 同时证明无水平溢出及 secret/绝对路径/raw method 不进入 Renderer。

### 2026-07-29：固定 Codex 0.145.0 与全量原生 schema

已完成：

- [x] 用户明确确认将核心 runtime 升级至首个稳定支持 paginated history 的 `rust-v0.145.0`。
- [x] 官方 archive SHA-256 `072a30a65f05666735889ef0f60b56db186adbdde9d5c5cc1a64be0b598530fe` 与 GitHub release digest 一致；可执行文件 SHA-256 为 `1da3f4e0e96028b8a771814293c3033dafd1971f943f6c7e79b0897fe705f590`，版本输出为 `codex-cli 0.145.0`。
- [x] 从固定二进制重新生成并机械同步 697 个 experimental TypeScript 文件；schema 收敛为 18 类 Item、72 类原生 notification、11 类 reverse request。
- [x] 新 Thread 能力切为 `CODEX_NEW_THREAD_HISTORY_MODE="paginated"`；legacy Thread 仍走上游原生 full-turn replay，不在 LimeShot 侧合成。
- [x] `thread/items/list` 按 0.145.0 的 `{ turnId, item }` entry 解包，并由分页合同测试锁定。
- [x] `audio/localAudio`、环境连接通知和 raw response completion 从兼容边界转为当前原生合同，既有安全 projector 与 Renderer 已覆盖。
- [x] WebSearch opaque `results` 的常见字段继续结构化显示，额外或未知字段进入有界、敏感键脱敏的 JSON 明细，不再静默丢弃。
- [x] Gate fixture 改走 `0.145.0` 原生 `image_gen/imagegen` 扩展与 `/v1/images/generations`，不再向 Responses SSE 注入已不产生 Turn Item 的旧 `image_generation_call`。
- [x] Gate 使用原生 `tool_search -> tool_search_output -> mcp__gate_b/echo_tool` 发现链路验证延迟 MCP 工具，同时保持 MCP elicitation 与结构化输出投影。

阶段验证证据：

- `npm run typecheck`：通过。
- `npx vitest run packages/codex-client/src/index.test.ts src/main/codex/threadNavigation.test.ts src/main/codex/projection.test.ts src/renderer/src/ConversationTimeline.test.tsx`：4 个文件，20 项通过。
- 完整 11 文件 Vitest：52 项通过。
- 最终当前工作树 `npm test`：17 个文件、65 项全部通过。
- `npm run test:contracts`：2 个文件，8 项通过。
- `npm run resource:check`、`npm run verify:app-version`、`npm run governance:runtime-boundary`、`npm run electron:build`、`git diff --check`：通过。
- `npm run verify:gui-smoke`：固定 Codex `0.145.0`，12 次确定性 Responses 请求，两次冷启动，`gateEvidence` 全部为 `true`；`mcpOutputRouted`、`historyRestored`、`projectionsRestored`、`interruptRestored` 均为 `true`。
- canonical paginated history 恢复类型为 `userMessage`、`dynamicToolCall`、`agentMessage`、`webSearch`、`reasoning`、`imageGeneration`、`commandExecution`、`fileChange`、`mcpToolCall`；没有 Electron cache、Rust history mirror 或 Renderer synthesis。
- `/tmp/limeshot-gate-b-0.145-final` 生成 11 张真实 Electron 截图；人工核对 desktop `2880x1694` 与窄窗 `420x900` 均非空、Composer 可见、无元素重叠或水平溢出。

### 2026-07-29：v0.3.0 发布候选收口

- [x] 用户明确要求递交并发布 `v0.3.0`。
- [x] npm、Cargo、侧栏、README、Release Notes 与 GitHub Actions 手动发布默认值统一为 `0.3.0`。
- [x] 截图中的 `paginated_threads is not supported yet` 已通过隔离上游探针定位为旧 `0.143.0`/非 Local store 路径；固定 `0.145.0` Local store 原生 `thread/start(historyMode="paginated")` 成功。
- [x] 发布候选重新通过版本、资源、类型、协议、65 项 Vitest、39 项 Rust 测试、release build 与真实 Electron Gate B；Gate B 固定 Codex `0.145.0`，12 次 Responses 请求及全部 `gateEvidence` 为 `true`。

### 2026-07-29：Codex 原生对话自动归组

目标：打开或导入本地 Project 后，同一工作目录的 Codex 根 Thread 自动嵌套到该 Project，其余根 Thread 自动进入“最近”；用户可直接查看 canonical Turn/Item 历史，不使用独立导入对话框，也不得复制 history、恢复外部宿主工具能力或绕过 Renderer semantic API。

窄写集：`src/shared/desktop.ts`、`src/preload/index.ts`、`src/main/ipc.ts`、`src/renderer/src/{App,AppSidebar,ConversationTimeline,i18n,styles}*`、本执行计划、`internal/aiprompts/commands.md`、`internal/roadmap/v1/PRD.md` 和既有 `scripts/smoke/electron-smoke.mjs` Gate B 编排。避让 `rust/crates/**`、Provider/media、资源版本、发布配置及并行 GUI 重构的非导入部分。

退出条件：

- [x] 历史只来自 Codex `thread/list` 的非 ephemeral 根 Thread，完整分页覆盖 CLI、VS Code、Exec 和 App Server。
- [x] Main 将 Project `workspacePath` 本身及所有子目录的 `cwd` 归入该 Project，并共享短时 Thread 目录缓存；相邻前缀目录不会误归组，其余历史进入“最近”。
- [x] 自动发现的 Thread 通过既有 canonical history reader 展示完整 Turn/Item；Renderer 不保存导入注册表或 Codex history。
- [x] 未绑定的 Codex Thread 为只读，Main 拒绝其 `turn/start`，不继承其它 Codex 宿主的动态工具或审批能力。
- [x] 侧栏不显示独立导入入口，也不打开导入弹窗；Project 导入继续复用现有系统目录选择器。
- [x] 对话读取期间不在消息流中央插入“正在恢复对话”文案，只保留顶部加载图标及无障碍状态标签。
- [x] TypeScript 与导入相关 Renderer 测试通过。
- [x] 真实 Electron Gate B 验证自动 Project 嵌套、最近列表、完整历史、只读状态、无 Renderer 导入注册表和重启恢复。

`scripts/smoke/electron-smoke.mjs` 已超过 1000 行，本轮仍在该单一 Gate B 编排中追加有界自动归组断言，因为只有该进程同时拥有真实 Electron、preload/IPC、固定 Codex child 和已物化 Thread。Gate 新增一次 Responses 请求用于物化外部历史种子；后续若再扩展独立场景，应先拆出可复用的 UI evidence helper。

验证证据：

- `npm run typecheck`：通过。
- 自动归组、侧栏与时间线相关测试通过；当前工作树全量 Vitest 为 19 个文件、97 项通过。
- `npm run test:contracts`：协议生成物同步后通过，2 个文件、8 项通过；相关 Rust 4 个 package、24 项通过。
- Electron Main/Preload/Renderer production build：通过。
- `npm run verify:gui-smoke`：固定 Codex `0.145.0`、Business protocol v5、13 次 Responses 请求，全部 `gateEvidence` 为 `true`；其中 `automaticImportListing`、`conversationImport`、`importedConversationReadOnly`、`importedConversationRestoredAfterRestart` 均为 `true`。只读 `turn:start` 的拒绝由 `src/main/ipc.test.ts` 覆盖，Gate B 不再向 Electron handler 注入预期异常。

## 分类

- `current`：固定 Codex native client、Electron direct supervisor、`AgentItemProjection`、main semantic projection、Renderer reducer。
- `compat`：升级前创建的 legacy Thread 与 deprecated `mcpAppResourceUri` 只按固定旧事实读取；不伪造 paginated history。
- `deprecated`：`item/fileChange/outputDelta`、`thread/compacted`、legacy applyPatch/exec approval；只识别、去重和迁出。
- `dead / forbidden-to-restore`：Rust Codex proxy/history mirror、第二套 Agent loop、Renderer raw method/raw request id、按 kind 重排真实 Item 顺序、已知事件 `undefined` 丢弃。

## 当前完成度

- 本轮完成度：100%。0.145.0 固定资源、697 个生成类型、paginated reader、图片扩展、MCP 延迟发现和真实桌面恢复均已验证。
- 整体目标完成度：100%。Phase A 至 Phase E 全部退出条件已满足。
- 主线状态：已完成。

## 阻塞

- 无。

## 下一刀

- 无；本执行计划已完成。
