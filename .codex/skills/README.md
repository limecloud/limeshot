# LimeShot 项目 Codex Skills

本目录只存放开发、治理、验证和发布 LimeShot 仓库的 Codex skills。产品内 Agent 使用的内容生产 Skills 位于 `resources/skills/**`，两套目录不共享 catalog 或运行权限。

## Current Skills

- `limeshot-governance`：事实源收口、旧路径分类、删除与回流守卫。
- `limeshot-command-boundary`：Codex native protocol、Rust JSON-RPC、Electron/preload 与 Renderer semantic API 同步。
- `limeshot-quality-workflow`：按风险选择单测、合同、Gate B 与平台证据。
- `limeshot-release-workflow`：release candidate、版本、Forge、tag、Actions 与资产复核。

仓库规则看 `AGENTS.md`，领域事实源看 `internal/aiprompts/README.md`。Skill 只提供高频执行入口，不复制或替代事实源。
