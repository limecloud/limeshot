# LimeShot 治理规则

状态：`current`

## 分类

- `current`：唯一继续演进的 owner，可新增能力和测试。
- `compat`：只为真实外部协议、已发布数据或平台迁移委托 current owner；必须有退出条件，不承接新逻辑。
- `deprecated`：只允许迁出调用、数据和文档，不得新增消费者。
- `dead`：已脱离构建图或被 current owner 替代，应物理删除并补回流守卫。

当前 LimeShot 没有必须保留的 `compat` 或 `deprecated` 产品路径。确认错误的设计直接删除，不用 wrapper 延长寿命。

## Current 事实源

| 能力 | Owner |
| --- | --- |
| Agent loop、Thread/Turn/Item、history、Skills、MCP、Multi-Agent | managed Codex App Server |
| Codex process、native protocol、reverse request、projection | `packages/codex-client/**`、`src/main/codex/**` |
| 产品业务、Task、Provider、Media、Artifact、Deliverable | Rust Business Service 与 `rust/crates/**` |
| Renderer 可调用命令 | preload typed semantic API + Electron main |
| 产品 runtime Skills | `resources/skills/**` |
| 开发 Agent 工作流 Skills | `.codex/skills/**` |
| 正式桌面打包与 Release | `forge.config.mjs` + `.github/workflows/release.yml` |

## Dead / Deleted / Forbidden To Restore

- 自研 Agent App Server、RuntimeCore、Thread/Turn/Item、history mirror、terminal synthesizer 和 Agent WorkflowRun。
- `rust/crates/app-server*`、`runtime-core`、`workflow-runtime`、旧生成 client/schema 与 Rust Codex proxy。
- Tauri、Renderer raw bridge、production mock、任意 shell 与系统 runtime fallback。
- 从 PATH、Homebrew、npm global 或其他应用目录探测 Codex、Node、FFmpeg/FFprobe。
- 没有 executor、schema、消费者和负向测试的空 catalog、占位目录与预留 manifest。

历史执行计划、删除记录和 git history 可以出现旧名，但不能成为文档导航、依赖、fallback、catalog alias 或正向测试事实源。

## 回流判定

以下任一新增即视为旧路回流：

- Rust crate/type/table/method 表达 Codex Thread、Turn、Item、history、compact 或 Agent terminal state。
- Rust 启动、代理、包装、恢复 Codex，或 Electron 从 Rust 读取合成 Agent 终态。
- Renderer 提交 raw Codex/Rust method、文件路径、脚本、环境变量、Provider HTTP 或 FFmpeg argv。
- 业务 Task 成功由聊天文本、Skill checklist、单一 exit code 或 Renderer 缓存推断。
- production 入口在资源缺失时回退 mock、PATH、系统安装或参考应用目录。
- `.codex/skills/**` 被产品 catalog 扫描，或 `resources/skills/**` 被当作开发 Agent workflow。
- 新增平级 business backend、Agent loop、history store、workflow DAG 或第二份恢复状态机。

## 治理流程

1. 先声明主目标和唯一事实源。
2. 盘点入口层、协议层、服务层、存储层和旁路层中的同类实现。
3. 将实际路径标记为 `current / compat / deprecated / dead`。
4. 优先迁移调用并删除旧入口；没有真实兼容负担时不设计过渡层。
5. 同步清 schema、client、catalog、fixture、正向测试和文档导航。
6. 在现有守卫中加入最小负向规则，防止旧路径恢复。
7. 运行与边界最贴近的验证，并在执行计划记录剩余旁路。

不要把“目录里还有代码”当作保留理由。是否 current 取决于构建图、真实消费者、owner 和守卫，不取决于历史投入。

## 删除规则

错误实现一旦有 current owner 替代，应在同一变更中从 workspace、代码、schema、client、脚本、测试和文档物理删除。删除文件、目录、tag、Release asset 或用户数据前仍需遵守危险操作确认；治理结论本身不扩大删除授权。

## 验证与汇报

最低运行：

```bash
npm run governance:runtime-boundary
npm run test:contracts
```

按改动补 `npm run resource:check`、定向测试和 `npm run verify:gui-smoke`。收尾必须说明收掉的 surface、四类归属、回流守卫、实际验证和下一刀。
