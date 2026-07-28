# LimeShot 质量工作流

状态：`current`

## 最低门禁

| 改动面 | 最低验证 |
| --- | --- |
| 文档/治理 | current/dead 语义扫描、链接与 Mermaid 人工检查 |
| Codex client | framing、request、notification、reverse request、timeout、EOF、crash cleanup |
| Rust business protocol | schema、TS client、router fixture、unknown method/invalid params |
| Electron/preload | semantic allowlist contract + typecheck |
| Project binding | bind/read、唯一性、restart 后 `thread/resume|read` fixture |
| ToolHost | catalog/schema/scope/approval/cancel/timeout negative tests |
| Provider/Media | reconcile、成本、下载、真实 FFprobe/FFmpeg fixture、确定性 QA、Artifact 完整性负向测试 |
| GUI 主链 | 真实 Electron Gate B，不使用 production mock |

## Gate B

Gate B 必须证明真实 Electron、preload/IPC、Codex child、Rust business child、两条独立 stdio 协议、Project binding、一个真实 Turn 和用户可见终态。媒体/交付主链还必须覆盖结构化执行、取消或失败、Artifact/QA、GUI semantic confirm 与重启恢复；浏览器投影或单侧 fixture 只能作为 Gate A。

## 正式发布

- `.github/workflows/release.yml` 是正式 DMG、ZIP、SHA-256 与 GitHub Release 的唯一构建和发布 owner；开发机产物只能用于本地验收，不得上传为正式 Release asset。
- workflow 固定 Node 22 与 Rust stable，从 `resources/codex/manifest.v1.json` 下载官方 Codex，并在打包前同时校验 archive hash、executable hash 与版本输出。
- GitHub Release 先建立 draft；只有版本、类型、协议、Rust、Forge、App bundle、签名完整性、DMG、ZIP 和下载后 hash 全部通过，才允许覆盖资产并发布。
- 当前发布矩阵只有 `macOS arm64`。新增平台前必须先补 Codex manifest、业务 companion、Forge maker 和平台验收，不得上传未校验占位包。

## 收尾报告

每轮报告 current/compat/deprecated/dead 分类、实际运行的验证、未验证原因和完成度。旧 Agent runtime 单测通过不构成 current 进展。
