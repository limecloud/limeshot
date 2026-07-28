# LimeShot v1 实施计划

状态：`active`
主目标：Electron 直接消费 Codex，Rust 只实现产品业务，不重做 Agent Runtime。

## 当前阶段

Phase 3/4：旧 Agent runtime 已物理删除并由治理守卫覆盖；真实 Codex `project_read -> plan_create`、Rust ProductionPlan/ApprovalReceipt 和 GUI 用户审批已通过同一条 Electron Gate B。GUI 已收敛为 Conversation-first 工作区，项目创建不再使用自定义表单。当前从 approved ProductionPlan 继续进入 Task/Artifact 执行主链。

## 分类

- `current`：Electron direct Codex、Rust business JSON-RPC、Project/Brief/binding、ToolHost、ProductionPlan、ApprovalReceipt 与 GUI semantic projection。
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

## 下一刀

1. 从 approved ProductionPlan 创建第一个可恢复 TaskRun/MediaJob。
2. 落地结构化 FFprobe operation、任务状态和 Artifact lineage。
3. 首个 managed task 只有在 catalog、schema、executor、负向测试与 Gate B 同批完成时才建立 `resources/tasks`。

## 验证

- `node scripts/quality/check-runtime-boundary.mjs`：通过。
- 旧 runtime 禁止路径与生产代码引用扫描：`0`。
- `node scripts/quality/check-resource-provenance.mjs`：通过，检查资源 JSON 与固定 Codex release 元数据。
- `node scripts/quality/check-version.mjs`：通过。
- `node scripts/protocol/check.mjs`、`node scripts/protocol/check-artifacts.mjs`：通过。
- `cargo test --manifest-path rust/Cargo.toml`：通过。
- `npm run typecheck`、`npm run test:contracts`、`cargo test --manifest-path rust/Cargo.toml`、`npm run electron:build`：通过。
- `npm test`：通过，8 个测试文件、16 个测试；包含受管 workspace 本地化命名、重名分配、文件名清洗和 GUI 一键创建回归。
- `src/renderer/src/PlanPanel.test.tsx`：通过，覆盖用户批准参数、Plan 状态更新与 `ApprovalReceipt` 投影。
- `cargo test --manifest-path rust/Cargo.toml -p projects`：通过；覆盖复合 binding 主键迁移、多 Project 同名 `main` 会话和 binding compare-and-swap。
- `npm run verify:gui-smoke`：通过；`providerRequestCount=3`，`project_read`/`plan_create` 工具输出均回送 Codex，GUI receipt 存在，Plan 持久化为 `approved`，history restore 成功，`newProjectCreated=true`，`newProjectRestoredAfterRestart=true`。
- `npm run verify:local`：通过；最终 Gate B 额外确认 `projectDialogCallCount=0`，新建项目未调用系统目录选择器。
- GUI 截图 smoke：真实 Electron 首页、默认 Conversation 与项目详情三态已取证；自定义创建弹窗已删除，工具过程默认折叠为 activity。
- 开发预览启动链：`scripts/desktop/dev.mjs` 在 Rust companion 之前校验 Codex manifest、SHA-256 和版本，并注入 binary 与开发 Codex home；Gate B 显式隔离到临时 fixture Codex home，不读取本机账号。

## 阻塞

- Node 与 FFmpeg 的可再分发来源和许可证尚未确定。
- live Provider 未选择，对应 capability 必须 unavailable。
- Codex 登录/账户、上游原生工具审批 reverse request 与真实 Provider 仍未接入 GUI；这不影响已完成的 Rust 业务计划审批。
