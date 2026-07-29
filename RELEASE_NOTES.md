## LimeShot v0.4.0

发布日期：2026-07-29

### 桌面体验

- 参考 Codex Desktop 的交互语法，完成 Sidebar、Project Home、Conversation Timeline、Composer 与阻塞交互的第一阶段 GUI 对齐。项目仍是 LimeShot 的业务入口，Codex Desktop 不是产品依赖或运行时组成。
- Project 侧栏增加真实会话树，每个项目默认显示最近五条绑定会话并支持展开；Project row 进入 Project Home，会话子行打开对应 canonical history。
- Recent 自动纳入未绑定的本地 Codex 根 Thread，并与 Project 会话按 Thread ID 去重；支持按项目或单列表组织，以及优先级、最近更新和手动排序。
- Project 与 Conversation 菜单补齐置顶、重命名、归档、删除、已读状态、Finder 和复制信息等具备完整 owner 的操作。永久删除对话必须二次确认，移除项目不会删除工作区文件。
- Home 使用项目上下文、四项任务建议和双层 Composer；Timeline、活动行、弹窗和窄窗布局完成第一轮响应式与可访问性收口。

### 对话与项目

- Codex `thread/list` 分页发现本地非 ephemeral 根 Thread；工作目录位于 Project 根目录或子目录的 Thread 自动归入对应 Project，其余进入 Recent。
- 正式包与开发态统一读取标准共享 Codex home（默认 `~/.codex`，可由受控环境变量覆盖），因此同一用户由 Codex CLI、编辑器或 LimeShot 创建的 canonical history 可被统一发现；LimeShot 不再建立私有 history silo。
- Project/Thread 工作目录归组会解析真实路径，macOS/Linux 符号链接和 Windows junction 指向同一目录时仍归入同一 Project；Project 根目录及其嵌套工作区的既有 Codex history 均进入项目会话树。
- 所有历史继续由 Codex `thread/read` 与 paginated history 提供。LimeShot 不复制 Agent history，也不从 delta 合成终态。
- 自动发现但未绑定的外部 Thread 以只读方式打开；Electron Main 拒绝对其启动 Turn，避免继承其他宿主的动态工具或审批能力。
- Business protocol 升级至 v5，增加 `project/rename`、`project/archive`、`conversation/binding/list` 与 `conversation/unbind`，并同步 Rust、JSON Schema、TypeScript client、Electron semantic gateway 和测试合同。
- 新会话物化后立即进入 Project 会话树，Turn 完成后从 Codex 重新读取标题；重命名、归档和删除通过完整 owner target 更新绑定关系。

### Agent 投影

- Reasoning、Plan、Search、Shell、Diff、MCP、Dynamic Tool、Resource 与 Media 使用紧凑 Activity Row；完成态降噪，失败、拒绝和中断保留明确终态。
- MCP 显示 server/tool、来源、资源、耗时和最近进度；Dynamic Tool 失败提升为可见终态，Image Generation 使用稳定媒体区域与有界 prompt/result。
- Hook prompt 合并为 User message；Multi-Agent 展示 create/message/resume/close、子 Agent 状态与只读子线程入口；wait/review/sleep 等边界事件不污染主时间线。
- Context Compaction 区分 automatic/manual 与 in-progress/completed。未知事件继续进入脱敏诊断 owner，不在主时间线生成误导性卡片。
- raw reasoning 不进入 DOM；JSON 参数、结果、长文本、stdout 与 diff 使用敏感键遮蔽和有界投影。

### 工程治理与品牌

- 新增仓库级 `AGENTS.md`、`internal/aiprompts/**` 与四个项目 Codex skills，固化命令边界、治理、质量和发布工作流；这些开发 Agent skills 与产品内 runtime skills 保持隔离。
- 增加 UI parity 治理守卫和真实 Electron Gate B 证据，继续锁定 `Electron Renderer -> preload -> Electron Main -> Codex + Rust Business Service` 唯一产品链。
- 使用 `assets/icons/limeshot.svg` 作为统一设计源，生成并接入 1024px PNG、macOS ICNS 和 Windows ICO；打包产物与运行时窗口统一使用 LimeShot 图标。

### 平台发布

- 首次提供 Windows x64 Squirrel 发布资产：Setup EXE、NuGet package 与 `RELEASES`。
- 继续提供 macOS Apple Silicon DMG 与 ZIP。两个平台均固定 OpenAI 官方 Codex `0.145.0`，校验 archive、executable、版本输出和包内 companion binaries。
- GitHub Actions 在 macOS 与 Windows 原生运行真实 Electron Gate B；两个平台资产全部成功后才统一生成 `SHA256SUMS.txt` 并发布 Release。
- Gate B 显式固定 `zh-CN` 测试语言，避免 Windows Runner 的系统 locale 改变可访问名称；产品的五语言内容继续由 locale 回归覆盖。

### 当前范围

- 本版本完成的是 Codex Desktop GUI parity 第一阶段，不宣称全量视觉或功能复刻；业务检查器、更多条件型 Thread 操作和完整运行态截图对照仍在后续路线图中。
- macOS 使用 ad-hoc 签名，尚未完成 Developer ID 签名与 Apple notarization。仓库尚未配置 Windows 签名 secrets，因此本版本 Windows Squirrel 资产为未签名构建。
- 正式包尚未携带可再分发的 FFmpeg/FFprobe runtime；缺少受管媒体资源时服务保持 fail closed。
- 远端图片、视频、语音 Provider、成本结算和 Codex 账户登录 GUI 尚未交付。

### 发布验证

- `npm run verify:local` 通过版本、runtime/UI 治理、资源来源、类型、协议、41 项 Rust 测试、release build 和真实 Electron Gate B。
- 完整 Vitest 共 20 个文件、100 项测试通过；Business/Codex client 合同共 8 项通过。
- Gate B 固定 Codex `0.145.0` 与 Business protocol v5，完成 13 次确定性 provider request；自动归组、canonical history、只读保护、Project binding、Agent 投影、审批、媒体、QA、Deliverable 和冷启动恢复证据全部通过。
- macOS/Windows 平台构建与正式资产仍以本版本 GitHub Actions 的结果为准；正式 Release 只接受 Actions 构建并复验的资产。

**完整变更**：`v0.3.0` -> `v0.4.0`
