# LimeShot Skills 标准

状态：`current`

## 两类 Skill

| 类型 | 目录 | 使用者 | 事实源 |
| --- | --- | --- | --- |
| 开发 Agent workflow | `.codex/skills/**` | 在仓库中开发、测试、治理和发版的 Codex | `AGENTS.md`、`internal/aiprompts/**` |
| 产品 runtime Skill | `resources/skills/**` | LimeShot 内受管 Codex App Server | `resources/skills/catalog.v1.json` 与各 `SKILL.md` |

两类 Skill 名字可以表达相近领域，但目录、发现、生命周期和权限完全独立。产品不能扫描 `.codex/skills`；开发 Agent 不能把 `resources/skills` 当作仓库操作授权。

## 开发 Agent Skill

- 使用官方 Codex 结构：`SKILL.md` + 推荐的 `agents/openai.yaml`，按需增加 `references/`、`scripts/`、`assets/`。
- frontmatter 只保留 `name` 与 `description`；description 同时写清能力和触发场景。
- 主文件只写高频工作流与判断，领域背景引用 `internal/aiprompts/**`，不复制长文。
- 新建 skill 使用官方 `skill-creator` 初始化和 `quick_validate.py` 校验。
- 名称使用 lowercase hyphen-case；项目专属治理入口允许 `limeshot-` 前缀以避免与全局 skill 混淆。
- 不把 commit、push、delete 等危险操作写成隐式授权。

## 产品 Runtime Skill

- 只描述内容生产角色、约束、工具使用和业务输出，不包含仓库路径、git、CI 或开发命令。
- Skill 只选择 Rust ToolHost 注册的能力；不能运行任意 shell、写任意路径或直接请求 Provider/FFmpeg。
- `core` 提供全局业务护栏，profile skill 只补领域差异，不重复 Agent loop 或通用安全策略。
- 工具 schema、Project scope、业务审批、capability 和 Artifact contract 以 Rust/catalog 为事实源；Skill 文本不能扩大权限。
- 新增 catalog 项必须有真实 instruction file、目标 profile、消费者、i18n 名称/描述和 contract test。
- 能力不存在时明确报告 blocked，不生成占位 provider、空 workflow 或 production mock。

## 渐进披露

Skill 主文件保持短小，只保留模型无法从工具/schema 推断的高信号规则。详细协议、长案例和平台差异放 reference；确定性重复操作优先脚本化，但脚本仍必须处于对应权限边界。

## 最低检查单

1. 目录类型是否正确，是否混入另一类 Skill 的内容。
2. name、description、目录名、catalog id 和 profile 是否一致。
3. 触发条件、输入、输出、失败和审批是否明确。
4. 是否只引用已注册工具、artifact contract 和 current owner。
5. 是否包含绝对本地路径、旧品牌、Tauri、自研 Agent runtime 或 fallback。
6. 开发 skill 是否通过官方校验；runtime skill 是否通过 `npm run resource:check`、Rust skill/catalog 测试和 Gate B（若影响产品主链）。

## 禁止事项

- 不从其他项目整包复制 skill 后只改名称。
- 不让 Skill 成为第二份 protocol、schema 或 catalog。
- 不把 README、安装指南、变更日志塞进单个 skill 目录。
- 不创建没有真实消费者和验证的“未来 skill”。
- 不用 prompt 文本绕过 ToolHost、GUI 用户审批或 Artifact QA。
