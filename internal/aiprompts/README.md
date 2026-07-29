# `internal/aiprompts` 索引

本目录存放 LimeShot 的工程规则、模块边界和高频工作流。根 `AGENTS.md` 只保留仓库级硬约束与导航；具体任务先按本页选择事实源，再修改代码。

## 使用原则

1. 先读后写；不确定 owner 时先读 `overview.md` 和 `architecture.md`。
2. Agent 能力先判断是否属于上游 Codex；属于 Codex 的能力不得在 Rust 或 Renderer 重建。
3. 产品业务先判断是否属于 Rust Business Service；Electron 只负责桌面能力、路由和投影。
4. 改命令、协议或 bridge 时先读 `commands.md`，再按 `quality-workflow.md` 选择门禁。
5. 新旧并存、路径删除和兼容判断先读 `governance.md`。
6. 工作树存在未知改动或多个终端并行时先读 `parallel-agent-collaboration.md`。
7. `.codex/skills/**` 与 `resources/skills/**` 的用途不同；修改前先读 `skill-standard.md`。

## 架构与边界

- `overview.md`：产品链、owner 和文档分层的快速入口。
- `architecture.md`：全局架构、数据归属、进程规则、媒体执行与架构确认。
- `commands.md`：Renderer semantic API、Codex native protocol、Rust JSON-RPC 与 Tool route。
- `governance.md`：`current / compat / deprecated / dead`、删除规则与回流守卫。
- `parallel-agent-collaboration.md`：脏工作树和并行开发写集协议。

## 质量与交付

- `quality-workflow.md`：风险分级、最低门禁、Gate A/B、测试与收尾证据。
- `playwright-e2e.md`：真实 Electron/Playwright 交互验证、定位策略和证据要求。
- `release-workflow.md`：release candidate、版本事实源、Forge、GitHub Actions、tag 与资产复核。
- `skill-standard.md`：开发 Agent skill 与产品 runtime skill 的边界和新增检查单。

## 产品事实源

- `../roadmap/v1/PRD.md`：产品范围、用户故事和验收标准。
- `../roadmap/v1/BUSINESS.md`：业务对象、审批、Task、Artifact 与 Deliverable。
- `../roadmap/v1/PROTOCOL.md`：双协议、semantic IPC 和错误边界。
- `../roadmap/v1/DIAGRAMS.md`：架构、流程与时序图册。
- `../roadmap/v1/PROVIDER-ARCHITECTURE.md`：Provider 与远程能力边界。
- `../roadmap/v1/RESOURCE-MIGRATION.md`：受管 Node/FFprobe/FFmpeg/Codex 资源策略。
- `../roadmap/xuanlan/README.md`：Codex Desktop GUI parity 与 ThreadItem/Event 投影主线。

## 常见入口

- 改 Codex Thread/Turn/Item、history、审批、MCP、Skills 或 Multi-Agent：先读 `architecture.md`、`commands.md`，再对照 `/Users/coso/Documents/dev/rust/codex`。
- 改 Project、Brief、Plan、业务审批、Task、Provider、Artifact 或 Deliverable：先读 `architecture.md` 与对应 v1 业务/协议文档。
- 改 Electron/preload/IPC：先读 `commands.md`，执行 `npm run test:contracts`。
- 改 GUI 壳、对话、Workspace 或业务主路径：先读 `quality-workflow.md` 和 `playwright-e2e.md`。
- 做迁移、删除、去 fallback：先读 `governance.md`。
- 发版、改版本、Forge、签名或 Release 资产：先读 `release-workflow.md`。
- 新增或修改 skill：先读 `skill-standard.md`。

## 对应项目 Skills

- 治理收口：`.codex/skills/limeshot-governance/`
- 命令边界：`.codex/skills/limeshot-command-boundary/`
- 质量与交付：`.codex/skills/limeshot-quality-workflow/`
- 发布：`.codex/skills/limeshot-release-workflow/`
