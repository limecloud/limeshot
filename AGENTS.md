# LimeShot 源码仓库指南

本仓库当前没有外部协议兼容负担。发现错误抽象、重复实现、临时旁路或已脱离构建图的代码时，优先直接替换或删除，不保留双轨。

## 事实源

1. 代码仓库是唯一记录系统。影响实现的决策、计划、阻塞与验证结果必须落在仓库内。
2. 根文件只保留仓库级约束和导航；领域规则放在 `internal/aiprompts/`，执行进度放在 `internal/exec-plans/`。
3. 每种能力只能有一个继续演进的 owner。`current` 可扩展；`compat` 只能委托；`deprecated` 只能迁出；`dead` 应删除并补回流守卫。
4. 唯一产品链是 `Electron Renderer -> preload typed gateway -> Electron Main -> managed Codex App Server + Rust Business Service -> semantic projection -> GUI`。
5. Codex App Server 是唯一 Agent runtime。Agent loop、Thread/Turn/Item、history、Skills、MCP、审批、sandbox、Multi-Agent、compact 与流式终态对齐 `/Users/coso/Documents/dev/rust/codex`。
6. Rust Business Service 是唯一产品业务后端，只拥有 Project、Profile、Brief、Conversation binding、Plan、业务审批、Task、Provider、Cost、Artifact、Deliverable 与媒体执行。
7. Codex native JSONL 与 Rust JSON-RPC 2.0 / JSONL 是两套独立协议。类型、envelope、pending map、错误与恢复语义不得复用。
8. Rust 后端只能落在 `rust/crates/**` 的既有领域 owner；Electron main 只承接桌面能力、进程监管、协议路由和 GUI 投影。
9. 新命名使用短领域词。除对外产品名和外部固定协议外，不在 crate、命令、API、类型、模块或脚本前添加品牌前缀。
10. 已删除的自研 Agent App Server、RuntimeCore、WorkflowRun、Rust Codex proxy、Tauri、raw renderer bridge 与 production mock 均为 `dead / deleted / forbidden-to-restore`。

## 工程约束

1. 全程使用中文；代码注释保持所在文件既有语言。
2. 先读后写，保持改动集中；用户未明确要求时，不主动 commit、push、tag、reset 或创建分支。
3. 工作树存在未知改动时，遵循 `internal/aiprompts/parallel-agent-collaboration.md`：声明窄写集、避让脏热区，不覆盖或暂存他人改动。
4. 重大产品架构变更必须在同一变更集中更新 `internal/aiprompts/architecture.md`，并在执行计划完成架构确认。未确认不得标记完成或进入 release evidence。
5. 非生成文件接近 `800` 行时优先拆分；超过 `1000` 行不得继续堆叠业务逻辑，除非执行计划记录原因和退出条件。
6. 用户数据、日志、缓存和凭证必须走 Electron/Node/Rust 平台 API 或统一封装；新增行为默认同时考虑 macOS arm64 与 Windows x64。
7. 新脚本优先进入现有 `scripts/<domain>/` 或所属 package，不在 `scripts/` 根目录堆放临时入口。
8. 生产路径不得回退 mock、系统 PATH、Homebrew、npm global 或其他桌面应用目录。资源缺失或完整性失败必须 fail closed。
9. 用户可见文案覆盖 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`，并补稳定回归。
10. 配置、协议、依赖与版本改动必须同步 schema、消费者、文档、锁文件与测试。
11. `.codex/skills/**` 只服务开发 Agent；`resources/skills/**` 只服务产品内 Codex runtime。两者不得互相扫描、复制 catalog 或作为 fallback。

## 危险操作确认

删除文件/目录或用户数据、批量覆盖、修改系统配置/权限、数据库结构或批量数据、全局依赖、`git commit/push/tag/reset`、删除或重建 Release 引用前，必须先解析精确目标、影响范围和恢复方式，并获得用户明确确认。用户已明确要求的同一发布流程可连续执行；不得把局部授权扩大到 force-push、重打已发布 tag 或清理无关改动。

确认格式：

```text
⚠️ 危险操作检测！
操作类型：[具体操作]
影响范围：[精确文件、数据、分支、tag 或远端]
风险评估：[不可逆结果与恢复方式]

请确认是否继续？[需要明确的“是 / 确认 / 继续”]
```

## 协议与质量

1. 改 Codex method 时，同步固定上游类型、Codex client、Electron allowlist/reverse request、semantic projection 与 contract fixture。
2. 改 Rust business method 时，同步 Rust protocol/schema/router、TS client、Electron semantic gateway、preload/shared API 与 contract fixture。
3. 改 Renderer semantic API 时，必须成组检查 Renderer、preload、Electron main、对应后端 client 和 `npm run test:contracts`。
4. 普通改动优先运行受影响的定向测试；Rust 改动先跑对应 crate，再按跨 crate 风险扩大。
5. GUI、Bridge、Workspace、Agent 或业务主路径改动至少运行 `npm run verify:gui-smoke`。
6. 真实交互证据分级：浏览器/DOM 投影是 Gate A；Gate B 必须证明真实 Electron、preload/IPC、Codex child、Rust business child、两条 stdio 协议和用户可见状态。
7. 默认本地门禁为 `npm run verify:local`；协议边界单独使用 `npm run test:contracts`。
8. 更新版本、Forge、Electron、Codex manifest 或 workspace manifest 时执行 `npm run verify:app-version` 与 `npm run resource:check`。

## 执行方式

1. 长任务必须更新 `internal/exec-plans/`，记录目标、窄写集、排除项、退出条件、验证和阻塞。
2. 路线图任务先说明主目标、当前阶段和下一刀；治理删除必须直接服务 current 主链。
3. 用户明确无兼容需求时，直接迁移调用并删除旧入口，不新增 wrapper、fallback 或双读双写。
4. 收尾报告 `current / compat / deprecated / dead` 分类、实际验证、未验证原因和完成度百分比。

## 导航

- 工程入口：`internal/aiprompts/README.md`
- 架构总览：`internal/aiprompts/overview.md`
- 全局架构：`internal/aiprompts/architecture.md`
- 命令边界：`internal/aiprompts/commands.md`
- 治理规则：`internal/aiprompts/governance.md`
- 质量与 GUI：`internal/aiprompts/quality-workflow.md`、`internal/aiprompts/playwright-e2e.md`
- 发布流程：`internal/aiprompts/release-workflow.md`
- Skills 边界：`internal/aiprompts/skill-standard.md`
- 产品与验收：`internal/roadmap/v1/PRD.md`
- 协议与图册：`internal/roadmap/v1/PROTOCOL.md`、`internal/roadmap/v1/DIAGRAMS.md`
- 业务规格：`internal/roadmap/v1/BUSINESS.md`
- 执行计划：`internal/exec-plans/README.md`

## 高频命令

```bash
npm run verify:local
npm run test:contracts
npm run verify:gui-smoke
npm run governance:runtime-boundary
npm run resource:check
npm run verify:app-version
npm run electron:dev
npm run test:rust
```
