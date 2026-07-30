## LimeShot v0.5.0

发布日期：2026-07-30

### Workspace 桌面体验

- 新增可组合的 Workspace Chrome。Review、Terminal、Browser、Files 和 Tasks 可以在右侧或底部面板打开、切换、关闭和扩展，不再把所有工具堆叠进对话侧栏。
- Project Terminal 使用 Electron Main 管理的 `node-pty`，工作目录固定在受管 Project workspace；输出、输入、resize、退出与关闭均通过 typed IPC，Renderer 不直接启动 shell。
- Project Files 提供受 workspace 边界约束的目录浏览、文本/Markdown 阅读和系统文件定位；路径穿越、超限读取、二进制内容和 workspace 外路径会被拒绝。
- Browser 使用 Electron 受管 `WebContentsView`，只允许 HTTP(S) 导航，提供前进、后退、刷新、标题和加载状态；弹窗、权限与任意文件协议不会直接进入 Renderer。
- Environment 菜单汇总本地 Project、Git branch、变更、Side Tasks、Browser 和素材入口，并把动作路由到对应 Workspace surface。

### 对话、模型与 Review

- Composer 增加 Codex 原生模型和推理强度选择。目录来自 `model/list`，更新通过 `thread/settings/update`，最终选中态由 `thread/settings/updated` 投影，不在 Renderer 或 Rust 业务层维护第二份模型状态。
- 模型菜单覆盖动态目录、每模型推理强度、加载/重试、只读和 active Turn 禁用、窄窗 containment、Escape 与 outside close；当前型号未出现在可见目录时仍保留上游真实值。
- Review 重构为独立工作区：对话列之外使用大面积 Diff 和文件树，时间线 File Change 与工具栏变更入口都打开同一 owner，不再混入 Environment、Runtime 或业务检查器。
- Conversation Timeline、Composer、Activity 与 Workspace 面板继续消费 Codex Thread / Turn / Item canonical projection，不复制 history 或从 delta 合成终态。

### 产品扩展与业务边界

- Renderer 核心壳与 Production 业务 UI 完成物理解耦。Project、Profile、Brief、Plan、Execution、Artifact 和 Deliverable 迁入静态可信 `production` extension workspace。
- Extension Host 只装配随应用构建的可信 extension，不引入可下载第三方代码、动态协议、权限沙箱或第二业务后端。
- Rust Business Service 继续是 Project、业务审批、Task、Provider、Cost、Artifact、Deliverable 与媒体执行的唯一 owner；Codex App Server 继续是唯一 Agent Runtime。
- 新增 LimeCore/AsterRouter 云端多模型目标架构文档，但该链路仍为 Target，不属于本版本已交付能力。

### 平台与打包

- 新增 `@xterm/xterm`、`@xterm/addon-fit` 和 `node-pty`，并在安装、release build 与 Forge ASAR 中准备当前 Electron ABI 对应的原生 PTY 资源。
- 继续发布 macOS Apple Silicon DMG/ZIP 与 Windows x64 Squirrel Setup EXE/NuGet/`RELEASES`，正式资产只由 GitHub Actions 构建。
- 两个平台继续固定 OpenAI 官方 Codex `0.145.0`，并校验 archive、executable、版本输出和包内 companion binaries。
- GitHub Actions 只有在质量门禁、macOS/Windows 原生 Gate B 和全部打包资产成功后才发布 Release，并生成统一 `SHA256SUMS.txt`。

### 当前范围

- 本版本没有打通 Claude、Gemini、Grok、Kimi 或 DeepSeek 的云端路由；Composer 展示的是当前 Codex Provider 返回的真实模型目录。
- Browser 是受控桌面浏览 surface，不是通用自动化或远程浏览器服务；Files 当前只读，不提供编辑器或任意文件系统入口。
- macOS 使用 ad-hoc 签名，尚未完成 Developer ID 签名与 Apple notarization。仓库未配置 Windows 签名 secrets 时，Windows Squirrel 资产保持未签名。
- 正式包尚未携带可再分发的 FFmpeg/FFprobe runtime；远端图片、视频和语音 Provider 仍未接入生产配置。

### 发布验证

- 本地候选必须通过版本、资源、类型、协议、完整 Vitest、Rust workspace、Electron release build 和真实 Electron Gate B。
- Gate B 必须证明模型设置、Workspace 面板、Review/Production owner、Codex/Rust 双子进程、动态工具、历史恢复和业务终态仍在同一真实 Electron 主链。
- macOS/Windows 平台构建、原生 PTY 与正式资产以本版本 GitHub Actions 结果为准；本地包不上传为 Release 资产。

**完整变更**：`v0.4.0` -> `v0.5.0`
