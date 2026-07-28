# 脚本目录

- `desktop/`：Electron 开发启动与受管 companion 定位。
- `protocol/`：由 Rust protocol / artifact contract 生成和校验 TypeScript/JSON Schema。
- `quality/`：版本、静态质量与资源来源检查。
- `smoke/`：真实 Electron Gate B；本地 Responses fixture 只驱动固定 Codex 测试，不进入生产运行时。

脚本不得承接业务流程编排、Provider HTTP、媒体处理或生产 mock fallback；这些能力分别归 Rust owner。

`npm run resource:check` 只校验 `resources/` 的 JSON 格式和禁止回流的第三方 bundle 标识；它不是授权迁移证据的替代品。
