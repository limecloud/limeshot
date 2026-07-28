# LimeShot v1 实施计划

状态：`active`
主目标：Electron 直接消费 Codex，Rust 只实现产品业务，不重做 Agent Runtime。

## 当前阶段

Phase 4：旧 Agent runtime 已物理删除并由治理守卫覆盖；真实 Codex `project_read -> plan_create`、Rust ProductionPlan/ApprovalReceipt 和 GUI 用户审批已通过 Electron Gate B。v0.2.0 已接通 `approved Plan -> SourceAsset -> media_probe -> media_transcode -> media-output.v1 + qa-report.v1 -> GUI confirm -> current Deliverable`，包含后台进度、GUI 取消、timeout、原子输出、确定性 QA、显式 retry、交付完整性复验和冷重启恢复；下一步落实 CI 构建的可再分发 FFmpeg release，并进入 Provider reconcile。

## 分类

- `current`：Electron direct Codex、Rust business JSON-RPC、Project/Brief/binding、ToolHost、ProductionPlan、ApprovalReceipt、SourceAsset、TaskRun、MediaJob、Artifact/QA lineage、Deliverable 与 GUI semantic projection。
- `compat`：无。
- `deprecated`：无。
- `dead / deleted / forbidden-to-restore`：`app-server-protocol`、`app-server`、`runtime-core`、`workflow-runtime`、旧 app-server client/schema/supervisor、workflow DAG resources、raw `plan/create` RPC、`plan_approve` Agent 工具、无执行器和消费者的空 task catalog/目录。

## 本轮写集

- 全部 `internal/**` 事实源和根 `AGENTS.md`。
- Rust workspace、纯业务 crates、business protocol/server/client。
- Electron main/preload/shared 与 Forge/package scripts。
- governance/contract scripts 和 resource manifest。

不修改其他 LimeCloud 仓库，不复制参考应用私有资源，不调用 live Provider，不提交 Git。

## 本轮退出条件

- [x] 全部文档明确禁止重实现 Codex Runtime。
- [x] 旧 Agent App Server/RuntimeCore/WorkflowRun 代码、schema、client、tests 和 build entry 物理删除。
- [x] Rust Business Service 可独立表达 Project/Brief/binding/catalog，不包含 Thread/Turn/Item/history。
- [x] Electron main 具备 Rust business supervisor 的唯一入口，不存在 AppServerSupervisor。
- [x] Codex 与 Rust 两套 protocol 名称和 wire contract 不混用。
- [x] governance guard 阻止旧路径、旧 method 和 Rust Codex dependency 回流。
- [x] 清理审计保留被 BusinessCore 消费的 `resources/runtime` fail-closed manifest，删除无消费者的空 `resources/tasks` catalog 与目录。
- [x] npm lock、TypeScript、contract、Rust、Electron build、基础 Electron/preload/Rust Gate B 已通过。
- [x] Agent 通过 `plan_create` 创建版本化 ProductionPlan；raw `plan/create` RPC 已删除并有回流守卫。
- [x] GUI 用户通过 `approval.decide` 批准计划，Rust 原子持久化不可变 `ApprovalReceipt`；Agent 不具备批准工具。
- [x] Gate B 证明固定 Codex `0.141.0`、两个 dynamic tool、GUI 审批、计划持久化与 history restore。
- [x] 新建项目由 Electron 创建受管 workspace 后直接进入 Codex Conversation，全程不弹系统目录选择器；默认项目页为会话主画布，Brief/Plan 位于真实项目详情面板。
- [x] 多个 Project 可各自使用默认 `conversationId=main`；旧数据库自动迁移为复合主键，binding 替换使用 `expectedCodexThreadId` compare-and-swap。
- [x] Gate B 从 GUI 点击新建项目，断言系统目录选择器调用为零，完成受管 workspace、Rust 持久化、Codex thread、binding 和 Conversation ready，并在完整重启 Electron/Codex/Rust 后恢复未发言空会话。
- [x] 开发入口自动校验并注入固定 Codex `0.141.0` binary；不再要求手工设置 `LIMESHOT_CODEX_BIN`，开发预览可复用显式或默认的本机 Codex home 进入已认证对话。
- [x] Electron 系统文件选择器只把用户明确选中的单一素材路径交给 Rust；Rust 复制到受管 workspace 并只向 Renderer 返回 path-free `SourceAsset`。
- [x] `source-asset/import`、`project/execution/read`、`task/start` 已同步 Rust protocol/schema、client、main/preload semantic gateway 与测试。
- [x] `task/start` 校验批准状态、不可变 ApprovalReceipt、`media_probe` operation、Project/SourceAsset scope 与输入 hash；未批准、错误 operation、素材变化和 runtime unavailable 全部 fail closed。
- [x] SQLite 持久化 TaskRun、MediaJob、Artifact 和 lineage；启动时将遗留 queued/running 本地任务改为 interrupted。
- [x] `media-manifest.v1` 写入 Project workspace，记录 SourceAsset、Plan/version、ApprovalReceipt、TaskRun 和 MediaJob 全链引用。
- [x] GUI 项目详情固定显示素材、媒体运行条件、最近任务和 Artifact，文案覆盖五语言。
- [x] Gate B 从 GUI 导入素材并启动探测，证明系统对话框、preload/IPC、Rust JSON-RPC、固定 argv、Artifact 文件与完整重启恢复。
- [x] `media_transcode` 只接受已批准 Plan 中的固定 operation，并要求同素材前置 operation 已成功；Renderer 不接触路径、codec 或 argv。
- [x] FFmpeg 在 Rust 后台线程执行，stdout/stderr 并发有界排空，`-progress pipe:1` 写回 MediaJob；取消、timeout、输出超限和 shutdown 均执行 kill + wait。
- [x] 输出先写 `.part`，成功后原子 rename 并登记 `media-output.v1`；失败、取消、timeout 和 Artifact 持久化失败清理临时或最终文件。
- [x] `task/cancel` 已同步 Rust protocol/schema/client、main/preload semantic gateway、五语言 GUI 与定向测试。
- [x] Gate B 从 GUI 完成一次转码并取消第二次转码，证明进度可见、固定 argv、成功 lineage、取消终态、无遗留进程、`.part` 为零和完整重启恢复。
- [x] Rust business protocol v4 包含 `task/retry`、`TaskRun.retryOfTaskRunId`、QA/Deliverable projection 与 `deliverable/confirm`；只允许 failed/canceled/interrupted retry，重新校验 Plan/receipt/dependency/hash/runtime，旧 TaskRun 与 Artifact 历史保持不变。
- [x] SQLite 幂等迁移 retry lineage；每个失败节点最多一个直接后继，GUI 通过 RotateCcw 动作创建新任务，不暴露路径、codec 或 argv。
- [x] 原子登记同 TaskRun 的 `media-output.v1 + qa-report.v1`；确定性 QA 检查 MP4 container、正时长、非空文件和至少一个带 codec 的音视频 stream，失败删除输出并记录 `MEDIA_QA_FAILED`。
- [x] `deliverable/confirm` 只由 GUI semantic action 触发；Rust 复验 output/QA Artifact 大小和 SHA-256，拒绝错误类型、缺少 passing QA 或被篡改文件，并以 SQLite 唯一索引保证每个 Project 一个 current Deliverable。
- [x] 五语言 GUI 展示 QA 结果、确认动作和 Deliverable 历史；Gate B 完成真实点击确认与完整重启读回。
- [x] FFmpeg 来源调研已收口：不直接采用缺少 macOS arm64 或 GPLv3 的第三方 bundle；生产产物改由 CI 从固定 upstream revision、固定 LGPL 配置可复现构建，完成前 manifest 保持 blocked。

## 下一刀

1. 建立 macOS arm64 / Windows x64 FFmpeg reproducible build workflow，产出许可证、NOTICE、configure flags 与 SHA-256，并完成 packaged clean-machine Gate B。
2. 实现 ProviderTask submit/read/reconcile/cancel/download；远端未知终态必须先 reconcile，不得重复提交或计费。
3. Node managed task 仍只有在 catalog、schema、executor、负向测试与 Gate B 同批完成时才建立 `resources/tasks`。

## 验证

- `node scripts/quality/check-runtime-boundary.mjs`：通过。
- 旧 runtime 禁止路径与生产代码引用扫描：`0`。
- `node scripts/quality/check-resource-provenance.mjs`：通过，检查资源 JSON 与固定 Codex release 元数据。
- `node scripts/quality/check-version.mjs`：通过。
- `node scripts/protocol/check.mjs`、`node scripts/protocol/check-artifacts.mjs`：通过。
- `cargo test --manifest-path rust/Cargo.toml`：通过。
- `npm run typecheck`、`npm run test:contracts`、`cargo test --manifest-path rust/Cargo.toml`、`npm run electron:build`：通过。
- `npm test`：通过，9 个测试文件、23 个测试；覆盖新会话首条消息排队、结构化转码启动、GUI 取消、稳定 TaskRun identity retry、QA 失败投影与用户确认 Deliverable。
- `src/renderer/src/PlanPanel.test.tsx`：通过，覆盖用户批准参数、Plan 状态更新与 `ApprovalReceipt` 投影。
- `cargo test --manifest-path rust/Cargo.toml -p projects`：19 项通过；覆盖复合 binding 主键迁移、多 Project 同名 `main` 会话、binding compare-and-swap、非交付 Artifact、缺少 passing QA 及 output/QA 文件篡改拒绝。
- `npm run verify:gui-smoke`：通过；`providerRequestCount=3`，`project_read`/`plan_create` 工具输出均回送 Codex，GUI receipt 存在，Plan 持久化为 `approved`，history restore 成功，`newProjectCreated=true`，`newProjectRestoredAfterRestart=true`。
- `npm run verify:local`：通过；最终 Gate B 额外确认 `projectDialogCallCount=0`、`qaReportPersisted=true`、`currentDeliverablePersisted=true`，新建项目未调用系统目录选择器，交付确认与冷启动恢复均走真实 current bridge。
- `cargo test --manifest-path rust/Cargo.toml -p projects -p media -p business-core -p business-server`：通过；覆盖未批准、素材 hash 改变、runtime unavailable、lineage 和重启 interrupted。
- 扩展 Gate B：通过；`importDialogCallCount=1`、`mediaTaskPersisted=true`、`sourceAssetPersisted=true`、`artifactLineagePersisted=true`、`structuredProbeArgv=true`，完整重启后 GUI 与 semantic API 均读回 succeeded Task/Job/Artifact。
- FFmpeg/retry Gate B：通过；`mediaOutputPersisted=true`、`retryLineagePersisted=true`、`structuredFfmpegArgv=true`、`transcodeProgressBeforeCancel=10`、`ffmpegProcessReaped=true`、`partialOutputsCleaned=true`，完整重启后同时读回原 succeeded output、canceled history 与新 succeeded retry lineage。
- QA/Deliverable Gate B：通过；`qaReportPersisted=true`、`currentDeliverablePersisted=true`，GUI 通过 semantic action 确认 retry 输出，完整重启后读回 passing QA Artifact 与同一唯一 current Deliverable。
- GUI 截图 smoke：真实 Electron 首页、默认 Conversation 与项目详情三态已取证；自定义创建弹窗已删除，工具过程默认折叠为 activity。
- 开发预览启动链：`scripts/desktop/dev.mjs` 在 Rust companion 之前校验 Codex manifest、SHA-256 和版本，并注入 binary 与开发 Codex home；Gate B 显式隔离到临时 fixture Codex home，不读取本机账号。

## 阻塞

- FFmpeg 技术来源已选择为固定 upstream source 的 CI LGPL build，但跨平台二进制、许可证包、NOTICE、hash 和 clean-machine Gate B 尚未产出；当前 fixture 不进入打包资源或 production fallback。
- live Provider 未选择，对应 capability 必须 unavailable。
- Codex 登录/账户、上游原生工具审批 reverse request 与真实 Provider 仍未接入 GUI；这不影响已完成的 Rust 业务计划审批。
