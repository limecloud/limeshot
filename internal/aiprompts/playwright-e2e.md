# Playwright 与 Electron E2E

状态：`current`

## 使用边界

LimeShot 是 Electron 桌面应用。浏览器页面只能提供 Gate A；需要证明 preload、IPC、Codex/Rust child 或系统对话框时，必须使用真实 Electron Gate B。

当前自动化事实源是 `scripts/smoke/electron-smoke.mjs` 与 `npm run verify:gui-smoke`。不要另建 production mock 页面、raw bridge 或平级 E2E backend。

## 标准流程

1. 声明本轮 claim boundary：要证明 DOM、IPC、Codex、Rust、媒体进程还是打包资源。
2. 先运行相关 unit/contract 测试，避免用 GUI 定位协议错误。
3. 重建 Electron：`npm run electron:build`。
4. 运行 `npm run verify:gui-smoke`，保存结构化 Gate B 输出和失败日志。
5. 需要人工续测时复用同一应用会话，使用稳定 `data-testid`、角色、标题或业务文本定位。
6. 对响应式变更检查宽屏和窄屏，验证内容不重叠、Composer 可见、无水平溢出。
7. 收尾记录实际经过的进程边界、fixture 类型、用户可见终态和未覆盖平台。

## 证据要求

- Electron、Codex、Rust 进程身份与版本。
- preload API 和 semantic command 已命中。
- Thread/Turn/Item 与 Project/Task/Artifact 使用可关联 identity。
- reverse request、审批或用户输入由 GUI 完成，不从测试直接写 pending map。
- history/projection/interrupt 与本轮相关业务状态可恢复。
- 不包含 secret、用户绝对路径、raw JSON-RPC 或未脱敏进程输出。
- 截图只证明可见结果；结构化日志和状态断言证明链路。

## 定位策略

优先顺序：

1. `data-testid` 或稳定业务属性。
2. 可访问角色与名称。
3. 稳定标题或用户可见文本。
4. CSS 结构选择器只用于没有语义定位的内部布局断言。

不要依赖动态 class hash、数组下标、像素坐标或固定等待。需要系统文件/目录选择时，在 Electron 层注入 test-only dialog fixture，不把绝对路径暴露给 Renderer。

## 故障分类

- `method not found`：检查 Codex/Rust protocol client、allowlist、router 和 fixture 是否同版本。
- preload API 缺失：检查 contextBridge、shared type 和 Electron entry，不补 renderer fallback。
- Agent 不可用：先看 Codex version/hash、initialize、thread store 和 stderr，不在 Rust 重建 session。
- 业务服务不可用：检查 business-server args、JSON-RPC initialize、data/resources/log dirs。
- UI 可见但状态不恢复：检查 binding 与 `thread/resume|read`、Rust repository，不从 DOM 合成事实。
- 只在 Windows/macOS 失败：归类为 platform/packaged 缺口，必须由对应 runner 复现。

## 结果判定

只有断言、结构化证据和进程日志共同支持 claim 才算通过。脚本 exit code 为 0 但关键 evidence 为 false，仍判失败；Gate A 通过不能替代 Gate B；macOS Gate B 不能替代 Windows packaged evidence。
