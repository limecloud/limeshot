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
| Provider/Media | reconcile、成本、下载、真实 FFprobe/FFmpeg fixture |
| GUI 主链 | 真实 Electron Gate B，不使用 production mock |

## Gate B

Gate B 必须证明真实 Electron、preload/IPC、Codex child、Rust business child、两条独立 stdio 协议、Project binding、一个真实 Turn 和用户可见终态。浏览器投影或单侧 fixture 只能作为 Gate A。

## 收尾报告

每轮报告 current/compat/deprecated/dead 分类、实际运行的验证、未验证原因和完成度。旧 Agent runtime 单测通过不构成 current 进展。
