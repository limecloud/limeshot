## LimeShot v0.2.0

发布日期：2026-07-28

### 新功能

- 打通从已批准 ProductionPlan、素材导入、媒体探测、MP4 转码到交付确认的完整业务链。
- 新增结构化 FFprobe/FFmpeg 执行：后台进度、取消、超时、进程回收、`.part` 原子提交和失败清理均由 Rust Business Service 管理。
- 新增显式任务重试。失败、取消或中断的 TaskRun 会保留历史，并通过 `retryOfTaskRunId` 创建线性后继。
- 新增确定性媒体 QA。转码输出必须通过 MP4 容器、正时长、非空文件和可播放媒体流检查，才会原子登记 `media-output.v1` 与 `qa-report.v1`。
- 新增 GUI 交付确认。用户确认通过 QA 的媒体输出后，系统复验文件完整性并创建 Project 唯一的 current Deliverable，旧交付记录继续保留。
- 新建会话在 Codex Thread 准备期间即可输入，首条消息会在会话就绪后自动发送。

### 修复

- 取消、超时、应用退出和进程异常后会执行 kill + wait，不再遗留 FFmpeg 子进程或 `.part` 文件。
- 素材内容、输出文件或 QA 报告发生变化时 fail closed，避免使用失效输入或被篡改 Artifact。
- 媒体 QA 失败不再被 FFmpeg 的零退出码误判为任务或交付成功。
- SQLite 旧库会幂等补齐 retry lineage、QA 与 Deliverable 结构，并将重启时仍在执行的本地任务标为 interrupted。
- 切换 Project 或返回首页时会清理尚未发送的会话首条消息，避免请求被错误发送到其他会话。

### 优化与重构

- Rust business protocol 升级到 v4，新增 SourceAsset、TaskRun、MediaJob、Artifact QA、Deliverable projection 与 `deliverable/confirm`。
- 媒体业务按 `business-core`、`projects`、`media`、`artifacts` 的既有 owner 拆分，没有新增 Agent runtime 或第二套 workflow DAG。
- Renderer 继续只使用 preload semantic API，不接触文件路径、进程、codec、FFmpeg argv 或 raw JSON-RPC。
- 五种界面语言均补齐媒体执行、重试、QA 和交付状态文案。

### 测试与质量

- `npm run verify:local` 全量通过，覆盖版本、治理、资源、类型、协议、Artifact schema、全 Rust、release build 与真实 Electron Gate B。
- React 回归共 9 个测试文件、23 项测试；Projects repository 共 19 项测试。
- 真实 Gate B 覆盖 Codex 动态工具、GUI 计划审批、素材导入、媒体探测、转码、取消、重试、passing QA、交付确认与完整冷启动恢复。
- 交付负向测试覆盖非媒体 Artifact、缺少 passing QA、输出文件变化和 QA 报告变化。

### 文档

- 同步 PRD、业务规格、协议 v4、架构图、业务流程图、本地媒体时序图、质量门禁和执行计划。
- 明确 Task succeeded、passing QA、Artifact 与 Deliverable 是四类独立事实，最终交付只能由 GUI 用户明确确认。

### 当前范围

- 本版本发布 macOS Apple Silicon 构建。
- 应用使用 ad-hoc 完整签名，尚未完成 Developer ID 签名与 Apple notarization；首次打开时需要在 macOS“隐私与安全性”中确认。
- 媒体链已通过固定 FFprobe/FFmpeg fixture 的真实 Electron Gate B；可再分发的 macOS/Windows FFmpeg LGPL 构建尚未进入资源 manifest，因此正式打包应用中的媒体服务仍保持 fail-closed。
- 远端媒体 Provider、成本结算、Codex 账户登录 GUI和上游原生工具审批仍未交付。

**完整变更**：`v0.1.0` -> `v0.2.0`
