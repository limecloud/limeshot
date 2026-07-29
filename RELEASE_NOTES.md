## LimeShot v0.3.0

发布日期：2026-07-29

### 对话与 Agent

- 将受管 Agent runtime 升级并固定为 OpenAI Codex `0.145.0`，同时校验官方 archive 与 executable SHA-256。
- 新 Thread 使用 Codex 原生 paginated history；恢复时由 Electron 分页读取 canonical Turn 与 Item，不在 LimeShot 内镜像或重建 Agent history。
- 完整投影 Codex 的 18 类 ThreadItem、72 类 notification 和 11 类 reverse request。已知类型不再静默丢弃，未知协议漂移以脱敏诊断显式呈现。
- 时间线严格保持 `Turn.items` 原始顺序，并为 Reasoning、Plan、Shell、Diff、Search、MCP、动态业务工具、图片、Review、Context Compaction 与 Multi-Agent 提供专用渲染。
- 新增 Command、File、Permission Approval，RequestUserInput 与 MCP Elicitation。Electron Main 持有 pending request 和一次性 action token，Renderer 不接触 raw request id 或敏感参数。
- 新增多 Agent 子线程只读导航、Turn plan/diff/token usage、Thread status/environment/goal、Hook、Guardian、Realtime 与诊断状态面。

### 桌面交互

- 首页默认进入可直接输入的新对话，不再要求先创建 Project；Project 可从 Composer 上下文中按需选择或打开本地目录。
- 侧栏增加 standalone Conversation 历史、最近项目排序/固定和项目菜单；新建对话会清理旧会话投影并保持 Profile 工作区。
- 对话活动与运行状态移入右侧检查器，主时间线保持消息优先；窄窗口下 Composer、审批表单和菜单保持单列且无水平溢出。
- 高频 delta、usage 与 realtime 事件按绘制帧合批，同时保持原始事件顺序；长输出、Diff、JSON 与媒体内容使用有界投影。
- 新增交互焦点、键盘导航、读屏语义和 reduced-motion 处理；用户可见文案覆盖五种 locale。

### 架构边界

- Codex App Server 继续作为唯一 Agent runtime；Electron 直接持有 Codex native protocol，Rust Business Service 继续作为唯一产品业务后端。
- standalone Conversation 不携带业务工具；进入 Project 后才向 Codex 暴露经过 Rust ToolHost 校验的动态业务工具。
- Renderer 只使用 preload semantic API，不接触 raw Codex method、raw JSON-RPC、绝对路径、Provider HTTP、FFmpeg argv 或凭证。

### 测试与发布

- TypeScript 类型检查、协议/Artifact 合同、17 个 Vitest 文件共 65 项测试，以及 39 项 Rust 测试全部通过。
- 真实 Electron Gate B 使用固定 Codex `0.145.0` 完成 12 次确定性 Responses 请求与两次冷启动；Search、Shell、Diff、MCP、审批、用户输入、图片、interrupt、paginated history 恢复和业务工具路由证据全部通过。
- Gate B 同时验证媒体任务、取消/重试、Artifact lineage、QA、Deliverable、FFmpeg 进程回收和部分输出清理。
- 正式 macOS arm64 DMG、ZIP 和 `SHA256SUMS.txt` 继续只由 GitHub Actions 构建、复验并发布。

### 当前范围

- 本版本发布 macOS Apple Silicon 构建，使用 ad-hoc 完整签名，尚未完成 Developer ID 签名与 Apple notarization。
- 正式包尚未携带可再分发的 FFmpeg/FFprobe runtime；缺少受管媒体资源时服务保持 fail closed。
- 远端图片、视频、语音 Provider、成本结算和 Codex 账户登录 GUI 尚未交付。

**完整变更**：`v0.2.0` -> `v0.3.0`
