## LimeShot v0.1.0

发布日期：2026-07-28

### 首个可用版本

- 提供以对话为中心的 Electron 桌面工作台，支持全能、短剧短片、转绘、口播和电商五类制作入口。
- Electron Main 直接监管固定版本的官方 Codex App Server；Rust Business Service 通过 JSON-RPC 2.0 独立承接 Project、Brief、Plan、Approval 和业务工具。
- 支持创建受管项目、连续对话、流式回复、历史恢复、业务工具调用、制作计划生成与用户审批。
- 内置 LimeShot Skills、业务工具目录、Artifact contracts、Provider capability 与媒体服务声明。

### 修复

- “新建项目”不再打开系统目录选择器，而是直接创建受管 workspace 并进入对话。
- 修复多个项目共用默认 `main` 会话名称时的 binding 冲突。
- 修复 Codex 空 Thread 在冷启动恢复时尚未持久化导致的会话失败。
- 修复开发预览必须手工设置 `LIMESHOT_CODEX_BIN` 才能启动对话的问题。
- 隐藏 Electron IPC 和进程路径等内部错误细节，避免普通用户看到调试信息。

### 测试与质量

- 真实 Electron Gate B 覆盖 preload/IPC、Codex child、Rust child、Project binding、Turn、工具路由、计划审批和历史恢复。
- 协议、Artifact schema、Rust workspace、React GUI 和受管 workspace 均有自动化回归。
- 生产路径不包含 Tauri、自研 Agent runtime、Renderer mock fallback 或系统 PATH runtime fallback。

### 当前范围

- 本版本发布 macOS Apple Silicon 构建。
- 应用使用 ad-hoc 完整签名，尚未完成 Developer ID 签名与 Apple notarization；首次打开时需要在 macOS“隐私与安全性”中确认。
- Node、FFmpeg/FFprobe 和正式媒体 Provider 尚未进入可用状态；相关能力保持 fail-closed。
- Codex 账户登录 GUI、上游原生工具审批和完整设置页将在后续版本迭代。

**完整变更**：`Initial commit` -> `v0.1.0`
