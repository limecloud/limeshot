---
name: limeshot-release-workflow
description: Prepare and execute LimeShot releases across version sources, release notes, candidate scope, validation, Forge, commit/tag/push, GitHub Actions, macOS/Windows assets, and checksums. Use when the user asks to release, publish, bump a version, prepare a tag, inspect release CI, or finish a partially completed release.
---

# LimeShot 发布

先完整读取 `internal/aiprompts/release-workflow.md`、`quality-workflow.md`、根 `AGENTS.md` 和当前 `git status --short`。

## WHEN

用户要求发版、递交版本、改版本号、生成 Release Notes、处理 tag、监控发布 Actions 或补齐 Release 资产时使用。

## WHAT

形成可审计的 release candidate，通过本地与平台门禁，保持 tag/commit/版本/Notes/资产一致，并在用户授权范围内完成或停在明确阶段。

## HOW

1. 规范化 `X.Y.Z` 与 `vX.Y.Z`，检查本地/远端 tag、Release 和最近提交。
2. 盘点 tracked/untracked diff，区分 release metadata、candidate changes 和明确 excluded changes。
3. 同步 `package.json`/lock、Rust workspace/lock、版本文案、workflow 默认值、README 与中英文 Release Notes。
4. 运行 `verify:app-version`、`resource:check`、`typecheck`、contracts、Vitest、Rust tests 和 Gate B；按用户“只准备”要求可停在未提交状态。
5. 发版写操作前汇总 candidate、排除项、验证与风险，并获得对 commit/tag/push 的明确授权。
6. 授权后连续完成 commit、tag、push 和远端复核；已发布 tag 默认不改写，漏发进入下一 patch。
7. 监控 `.github/workflows/release.yml`，确认质量、macOS、Windows 与 publish job 全部成功。
8. 复核 Release 非 draft、tag/commit 一致、DMG/ZIP、Squirrel EXE/NuGet/RELEASES 和统一 SHA-256 完整。

## REFERENCE

- “只修改脚本，下版本发布”：不 commit、不 push、不建 tag，不触发 release workflow；执行计划记录待平台验证。
- “覆盖已发布版本”：默认拒绝直接重打，建议下一 patch；若坚持必须单独确认删除/重建远端引用风险。
- 本地 DMG/EXE：只作验收，不上传正式 Release。
- Windows 未跑：不能在 Release Notes 声称 Windows 已发布。

## LIMITS

- 本 skill 不把“发版”以外的请求解释为 git 写授权。
- 不使用 `git add -A` 吞入未知并行改动。
- 不 force-push、不覆盖 tag、不删除 Release asset，除非用户明确确认精确目标和影响。
- 任一平台失败时不得发布半套正式资产。
