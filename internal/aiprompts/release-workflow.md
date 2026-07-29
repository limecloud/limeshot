# LimeShot 发布工作流

状态：`current`

## 核心原则

- 发版默认是端到端流程：整理 candidate、更新版本和 Release Notes、跑门禁、commit、tag、push、监控 Actions、复核 Release 资产。
- `git commit`、`git tag`、`git push`、删除/重建 tag 或覆盖已发布引用属于高风险操作，必须获得用户明确授权。
- `.github/workflows/release.yml` 是正式桌面产物唯一 owner；开发机产物只用于验收。
- 已发布 tag 不改写。发现漏发内容时默认进入下一 patch 版本；删除或重建远端 tag 必须单独确认。

## 入口检查

1. 明确版本 `X.Y.Z` 与 tag `vX.Y.Z`。
2. 读取 `AGENTS.md`、`quality-workflow.md`、当前 `git status --short`、最近提交和 tag。
3. 检查本地/远端目标 tag 与 GitHub Release 是否存在。
4. 盘点 tracked/untracked diff，区分 release metadata、candidate changes 和 excluded changes。
5. 工作树有未知改动时声明窄写集，不用 `git add -A` 吞入并行改动。

## 版本事实源

- `package.json`、`package-lock.json`
- `rust/Cargo.toml`、`rust/Cargo.lock`
- 显示当前版本的 Renderer 文案
- `.github/workflows/release.yml` 的手动触发默认值（若仓库保留显式默认）
- `README.md`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md`

更新后必须运行：

```bash
npm run verify:app-version
```

Release Notes 使用当前版本单页策略。中文是 primary，英文是 companion；内容面向用户归并，不逐条抄 commit message，也不声称未在真实平台验证的能力已发布。

## Candidate 门禁

正式发版至少运行：

```bash
npm run verify:app-version
npm run resource:check
npm run typecheck
npm run test:contracts
npm test
npm run test:rust
npm run verify:gui-smoke
```

`npm run verify:local` 可覆盖本地聚合门禁。GUI smoke 证明当前主机 Gate B，不替代 macOS/Windows packaged job。

## Forge 与平台资产

- `forge.config.mjs`、`electron-forge package/make` 和官方 maker 是唯一打包事实源。
- macOS arm64 发布 DMG 与 ZIP，并校验 App 版本、内嵌 Codex/business-server、codesign、DMG 和 ZIP。
- Windows x64 使用 `windows-2022`、MSVC 与 Forge Squirrel，发布版本化 Setup EXE、NuGet package 和 `RELEASES`。
- Codex 必须来自 `resources/codex/manifest.v1.json`，下载后同时校验 archive SHA-256、executable SHA-256 和版本输出。
- publish job 汇总平台资产后生成单一 `SHA256SUMS.txt`；任何平台失败都不得发布半套 Release。
- 签名 secrets 未配置时必须明确记录 unsigned 状态，不伪造签名或公证成功。

## Git 写操作

授权前汇总目标版本、candidate 文件、排除项、验证和风险。授权后连续完成 commit、tag、push 和远端复核；中途失败必须修复或明确阻塞，不能把剩余步骤留给用户猜测。

成功后复核：

```bash
git status --short
git log --oneline --decorate --max-count=3
git tag --list "vX.Y.Z"
git ls-remote --tags origin "refs/tags/vX.Y.Z"
```

监控 `.github/workflows/release.yml` 到全部 job 完成，再检查 Release 非 draft、版本/tag/commit 一致、资产集合完整且 SHA-256 可复验。

## 收尾

报告完成度、版本/tag/commit、实际 candidate、验证、平台/签名状态、Release URL、资产和未完成缺口。用户要求“只准备、不发布”时，明确停在未提交或未推送状态，不触发 tag workflow。
