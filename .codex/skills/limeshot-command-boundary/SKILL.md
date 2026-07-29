---
name: limeshot-command-boundary
description: Govern LimeShot commands across Codex native JSONL, Rust JSON-RPC 2.0, Electron/preload semantic APIs, reverse requests, and dynamic business tools. Use when adding, changing, routing, debugging, or removing a method, IPC action, approval, tool call, notification, or protocol type.
---

# LimeShot 命令边界

先完整读取 `internal/aiprompts/commands.md`，再读 `architecture.md` 和 `quality-workflow.md`。涉及上游 Codex method 时对照固定版本 `/Users/coso/Documents/dev/rust/codex`。

## WHEN

修改 Codex request/notification/reverse request、Rust business method、Renderer action、preload/IPC、动态业务工具或出现 `method not found` / envelope 错误时使用。

## WHAT

让一个命令只属于正确协议和 owner，并同步所有生产消费者、类型、allowlist、projection、fixture 与负向测试。

## HOW

1. 先分类：Codex native method、Rust business RPC、Renderer semantic action，或 `item/tool/call -> Rust tool/call` 路由。
2. 禁止用一个 raw proxy 合并四条边界；两套 stdio client 保持独立 envelope、pending map、timeout 和错误。
3. Codex method 成组同步：固定上游类型 -> `packages/codex-client` -> Electron allowlist/reverse handler -> semantic projection -> contract fixture。
4. Rust method 成组同步：Rust protocol/schema -> router -> TS business client -> Electron semantic route -> preload/shared API -> Renderer consumer。
5. 动态业务工具只走 Rust ToolHost catalog/schema/scope/approval/capability；Agent 不能调用 GUI-only 的批准、task 或 deliverable action。
6. 删除命令时清所有消费者和正向 fixture，并在 governance guard 保留必要的负向断言。
7. 至少运行 `npm run test:contracts` 和 `npm run typecheck`；真实主路径再运行 `npm run verify:gui-smoke`。

## REFERENCE

- `thread/read`：Codex native method，不得生成 Rust business type。
- `task/start`：Rust business method，只由 GUI semantic action触发，不注册动态工具。
- `plan_create`：Codex dynamic tool，经 `item/tool/call -> tool/call -> ToolHost`，不是 raw `plan/create` RPC。
- 系统目录选择：Renderer 触发 `project.open`，绝对路径只在 Electron/Rust 边界存在。

## LIMITS

- Renderer 不提交 raw method、绝对路径、脚本、环境变量、Provider request 或 FFmpeg argv。
- Rust 不声明 `thread/*`、`turn/*`、`item/*`、history 或 compact。
- 不把 legacy approval 或 notification 当成新增 current method 的依据。
- schema、catalog 和 Skill 文本不能扩大实际执行权限。
