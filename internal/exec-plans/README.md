# `internal/exec-plans` 索引

本目录记录长任务的执行事实。计划不是愿望清单，必须随实现更新状态、写集、验证和阻塞。

## 规则

1. 长任务开始时记录主目标、当前阶段、下一刀、窄写集和排除项。
2. 重大架构变更必须包含架构确认与退出条件。
3. 验证项记录实际命令和结果；环境限制不能写成“已通过”。
4. 并行开发时持续追加新出现的排除项，不覆盖其他计划。
5. 完成后保留为仓库 evidence；历史路径不因此成为 current owner。

## 当前计划

- `v1-implementation.md`：v1 产品与业务主链。
- `xuanlan-conversation-projection-progress.md`：Codex Conversation 全量投影进度。
- `xuanlan-codex-desktop-ui-progress.md`：Codex Desktop GUI parity 进度。
- `v0.4.0-release.md`：当前 v0.4.0 双平台发布候选与发布 evidence owner。
- `v0.3.0-windows-release.md`：v0.3.0 的 Windows 缺口及并入 v0.4.0 的历史记录。
- `repository-agent-governance.md`：仓库规则、prompts 与项目 skills 治理迁移。
