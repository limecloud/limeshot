# LimeShot 仓库 Agent 治理迁移计划

状态：`complete`
更新日期：`2026-07-29`

## 主目标

借鉴 Lime 已稳定运行的仓库规则、工程 prompts 与项目 Codex skills，为 LimeShot 建立同样清晰的“根规则 -> 领域事实源 -> 高频执行 skill”三层治理结构，同时保持 LimeShot 的唯一产品链、双协议边界和既有业务 owner 不变。

## 迁移原则

1. 迁移判断方式、流程和守卫，不复制 Lime 专属 runtime、命令名或目录。
2. `AGENTS.md` 只保留仓库级硬约束、导航和高频门禁；长流程下沉 `internal/aiprompts/`。
3. `.codex/skills/**` 只服务开发 Agent；`resources/skills/**` 只服务产品内 Codex runtime，两者不得互相扫描或作为 fallback。
4. 架构、协议、业务和路线图继续复用现有事实源，不建立内容重复的第二份文档。
5. 当前工作树存在并行 GUI 与 Windows 发布改动，本计划只写声明范围，不覆盖、不暂存其他改动。

## 窄写集

- `AGENTS.md`
- `internal/aiprompts/README.md`
- `internal/aiprompts/overview.md`
- `internal/aiprompts/parallel-agent-collaboration.md`
- `internal/aiprompts/playwright-e2e.md`
- `internal/aiprompts/release-workflow.md`
- `internal/aiprompts/skill-standard.md`
- `internal/aiprompts/governance.md`
- `internal/aiprompts/quality-workflow.md`
- `internal/exec-plans/README.md`
- `internal/exec-plans/repository-agent-governance.md`
- `.codex/skills/README.md`
- `.codex/skills/limeshot-command-boundary/**`
- `.codex/skills/limeshot-governance/**`
- `.codex/skills/limeshot-quality-workflow/**`
- `.codex/skills/limeshot-release-workflow/**`

## 明确排除

- 当前并行修改的 `internal/roadmap/xuanlan/**`、`src/renderer/**`（包括 `ProjectOverview.tsx`）、`scripts/smoke/electron-smoke.mjs`、`scripts/quality/check-ui-parity.mjs` 与 `package.json`。
- 已准备但未发布的 Windows workflow、Forge、Codex manifest 与 supervisor 改动。
- Lime 的 Tauri compat、RuntimeCore/App Server owner、多模型 provider、Claw、OpenSpec、热力图、站点适配和内容写作规则。
- 新增生产 runtime、命令、数据库表、依赖或脚本。

## 交付切片

- [x] 盘点 Lime 受版本控制的 `AGENTS.md`、`internal/aiprompts/**` 与项目 skills。
- [x] 完成 current / reuse / deferred / not-applicable 迁移分类。
- [x] 重构根规则和 prompts 导航，补协作、E2E、发布、skill 双层边界。
- [x] 扩展治理与质量事实源，绑定 LimeShot 的真实命令和 Gate B。
- [x] 使用官方 `skill-creator` 初始化并适配四个项目 Codex skills。
- [x] 校验 frontmatter、`agents/openai.yaml`、文档链接、治理扫描和定向门禁。

## 退出条件

1. 根规则能把新任务路由到唯一事实源，不承载大段领域实现说明。
2. 四个 skill 都符合官方目录结构，名称、触发描述和默认 prompt 与 LimeShot 一致。
3. 文档明确区分开发 Agent skill 与产品 runtime skill。
4. 没有引入 Lime 专属旧名、第二套 Agent runtime、Tauri、production mock 或未落地命令。
5. `npm run governance:runtime-boundary`、`npm run resource:check`、`npm run typecheck`、skill 校验与 Markdown 链接检查通过；未执行项写明环境原因。

## 架构确认

- [x] 不改变 `Electron Renderer -> preload -> Electron Main -> Codex + Rust Business Service` 产品链。
- [x] 不改变 Codex native protocol 与 Rust JSON-RPC 2.0 两套独立边界。
- [x] 不新增 crate、runtime、协议 method、数据库表或业务 owner。
- [x] 本轮属于仓库治理与执行入口建设，不构成产品运行时架构变更。

## 验证结果

- `git diff --check`：通过。
- 文档入口存在性检查：通过。
- 新规则/skills 引用的 `npm run` 命令真实性审计：15 个文件全部通过。
- Skill frontmatter / 目录名 / description / `agents/openai.yaml` / `$skill-name` 默认 prompt：4 个 skill 全部通过 Ruby YAML 等价校验。
- 官方 `quick_validate.py` 与 `generate_openai_yaml.py`：环境缺少 `PyYAML`，未能直接运行；未修改全局 Python 环境，改用系统 Ruby YAML 完成同等字段与结构检查。
- `npm run governance:runtime-boundary`：通过。
- `npm run resource:check`：通过，13 个资源文件。
- `npm run typecheck`：通过。
- `npm run test:contracts`：2 个文件、8 项测试通过。
- 未重跑 Gate B：本轮只改仓库治理文档与开发 Agent skills，没有修改产品协议、GUI 或 runtime；上一轮本地 Gate B 已通过，但不作为本计划新增 evidence。

## 完成分类

- `current`：根规则、aiprompts 导航、协作/治理/质量/E2E/发布/skill 标准和四个项目 Codex skills。
- `compat`：无。
- `deprecated`：无。
- `dead / not applicable`：Lime 的 Tauri compat、RuntimeCore/App Server owner、多模型 provider、Claw、OpenSpec、热力图、站点适配与内容写作规则未迁入。
