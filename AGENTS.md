# LimeShot Agent 指南

## 唯一产品链

```text
Electron Renderer
  -> preload typed gateway
  -> Electron Main
       -> managed Codex: codex app-server --listen stdio://
       -> Rust Business Service over JSON-RPC 2.0 / JSONL / stdio
  -> Codex Thread / Turn / Item projection + Rust business projection
  -> GUI

Codex item/tool/call
  -> Electron Main route
  -> Rust Business Service tool/call
  -> ToolHost
  -> managed Node task / Provider / FFprobe / FFmpeg
  -> Task / Artifact projection
```

## 不可违反的决策

- Codex App Server 是唯一 Agent runtime。不得实现、派生、镜像或恢复第二套 Agent loop、Thread/Turn/Item、Conversation history、Skills、MCP、Codex 原生工具审批、工具循环、compact、Multi-Agent 或流式终态。
- Electron main 直接拥有 Codex 可执行文件、原生协议连接和 GUI 流式投影；Rust Business Service 不启动、不代理、不包装 Codex。
- Rust Business Service 是唯一产品业务后端，只拥有 Project、Profile、Brief、Conversation binding、Plan、业务 ApprovalReceipt、Task、Provider、Cost、Artifact、Deliverable 和媒体执行。
- Rust 业务协议使用标准 JSON-RPC 2.0，wire 必须包含 `"jsonrpc":"2.0"`。Codex stdio 使用上游原生 JSONL，具有 JSON-RPC 语义但省略 `jsonrpc` 字段。两套协议、类型和 pending map 不得复用。
- Rust 只保存 `projectId/conversationId <-> codexThreadId` 绑定，不保存完整 Codex history，不根据 delta 合成 Turn 终态。恢复必须由 Electron 调用 `thread/resume|read`。
- Codex reverse request 由 Electron 路由至 Rust `tool/call`；Rust ToolHost 校验 schema、Project scope、workspace grant、capability 和审批后才可执行。
- Renderer 不得调用 raw Codex method、raw Rust JSON-RPC、任意脚本路径、provider HTTP 或 FFmpeg argv。
- 不使用 Tauri，不建立参考应用运行时关系，不从 PATH、Homebrew、npm global 或其他桌面应用目录探测生产资源。

## Current Owner

- `packages/codex-client/**`：固定上游 Codex 原生协议 client；只存在于 Electron main。
- `src/main/codex/**`：Codex 资源解析、进程监管、握手、reverse request 和流式投影。
- `src/main/business/**`、`packages/business-client/**`：Rust 业务服务监管和标准 JSON-RPC client。
- `src/main/ipc/**`、`src/preload/**`、`src/shared/**`：Renderer semantic API 和 allowlist。
- `rust/crates/business-server/**`：Rust 业务进程入口和 JSON-RPC router。
- `rust/crates/business-protocol/**`：纯业务 request/result/event 类型，不得依赖 Codex 类型。
- `rust/crates/business-core/**`：业务用例协调，不拥有 Agent 状态。
- `rust/crates/projects/**`：Project、Brief、Conversation binding、ProductionPlan、ApprovalReceipt 和业务持久化。
- `rust/crates/tools/**`：ToolHost、任务目录、schema、scope 和执行前业务审批校验。
- `rust/crates/providers/**`、`rust/crates/media/**`：Provider 与 FFprobe/FFmpeg adapter。
- `rust/crates/artifacts/**`：Artifact contracts、lineage 与 schema。
- `resources/skills/**`：LimeShot 自有 Codex Skills。
- `src/renderer/**`：GUI projection，不拥有后端事实。

## Dead / Deleted / Forbidden To Restore

- 自研 Agent App Server、`RuntimeCore`、自研 Thread/Turn/Item 与 Agent WorkflowRun。
- `rust/crates/app-server*`、`runtime-core`、`workflow-runtime` 及其生成 client/schema。
- Rust 到 Codex 的 protocol adapter、history mirror、terminal synthesizer 和 recovery loop。
- Renderer raw bridge、production mock、任意 shell 和系统 runtime fallback。
- 没有执行器、schema 或消费者的空 catalog、占位目录和预留 manifest。

旧路径只能出现在治理守卫、删除记录和历史说明中，不能恢复为 compat、fallback 或新 owner。

## 工程约束

- 全程中文沟通；代码注释保持所在文件既有语言。
- 先读后写，保持改动集中；不主动 commit、push、tag 或创建分支。
- 新命名使用短领域词，不在内部类型、method 或模块前添加产品品牌。
- 非生成文件接近 800 行时优先拆分，超过 1000 行不得继续堆叠业务逻辑。
- 用户可见文案覆盖 `zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`。
- Codex method 变化同步上游类型、main allowlist、projection 和 contract test。
- Rust business method 变化同步 protocol/schema、business client、main semantic gateway 和 contract test。
- 生产路径禁止 mock fallback；资源或能力不可用时 fail closed。
- GUI、Bridge 或 Agent 主路径改动必须补真实 Electron Gate B。

## 事实源

- 产品与验收：`internal/roadmap/v1/PRD.md`
- 总架构：`internal/aiprompts/architecture.md`
- 命令边界：`internal/aiprompts/commands.md`
- 治理：`internal/aiprompts/governance.md`
- 协议：`internal/roadmap/v1/PROTOCOL.md`
- 图册：`internal/roadmap/v1/DIAGRAMS.md`
- 业务：`internal/roadmap/v1/BUSINESS.md`
- 执行：`internal/exec-plans/v1-implementation.md`
