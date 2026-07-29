---
name: limeshot-quality-workflow
description: Choose and execute LimeShot validation for TypeScript, React, Codex protocol, Rust business logic, Electron/preload, resources, Forge, GUI, and release changes. Use when deciding minimum gates, proving Gate A/Gate B, diagnosing test scope, or judging whether a change is deliverable.
---

# LimeShot 工程质量

先完整读取 `internal/aiprompts/quality-workflow.md`。协议/bridge 读 `commands.md`，GUI 交互读 `playwright-e2e.md`，治理删除读 `governance.md`，发版读 `release-workflow.md`。

## WHEN

不确定应跑哪些测试、改动跨越协议或进程边界、需要 GUI 证据、准备交付或解释某项验证能证明什么时使用。

## WHAT

按最高风险边界选择最小充分门禁，区分 unit、contract、Gate A、Gate B、platform/packaged 与 live 证据，并诚实记录未验证范围。

## HOW

1. 归类改动：文档/治理、TS、React、Codex client、Rust protocol/domain、Electron/preload、资源、Forge/版本或正式发布。
2. 先运行最贴 owner 的定向测试，再按跨层影响扩大；不要用全量测试替代真实进程证据。
3. 命令或协议改动默认运行 `npm run test:contracts`；类型边界运行 `npm run typecheck`。
4. 资源运行 `npm run resource:check`；版本/Forge 追加 `npm run verify:app-version`。
5. GUI、Bridge、Agent 或业务主路径运行 `npm run electron:build` 与 `npm run verify:gui-smoke`。
6. 正式本地聚合使用 `npm run verify:local`；平台安装包必须等待对应 GitHub Actions runner。
7. 检查输出中的关键 evidence，而不只看 exit code。
8. 汇报风险、命令、证据等级、未执行原因、Gate B/平台状态和剩余 blocker。

## REFERENCE

- 纯 projection：相关 Vitest + typecheck，通常不需要 Gate B。
- preload/IPC 改动：contracts + typecheck + Gate B。
- Rust media 取消/QA：对应 crate tests + Gate B 的 Task/Artifact evidence。
- Windows Squirrel：YAML 解析和 macOS 交叉检查不够，必须由 `windows-2022` packaged job 证明。
- 受控 provider fixture 的真实 Electron 流程是 Gate B，但不是 live Provider。

## LIMITS

- 不发明 `package.json` 中不存在的命令。
- Gate A 不能替代 Gate B，macOS Gate B 不能替代 Windows packaged evidence。
- production mock 通过不能标为可交付。
- 环境限制、跳过项和失败必须明确记录，不能写成已通过。
