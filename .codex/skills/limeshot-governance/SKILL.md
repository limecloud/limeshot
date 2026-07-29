---
name: limeshot-governance
description: Govern LimeShot fact-source convergence, legacy removal, current/compat/deprecated/dead classification, and anti-regression guards. Use when removing or replacing runtime, bridge, command, storage, skill, packaging, mock, fallback, or duplicate-owner paths.
---

# LimeShot 治理

先完整读取 `internal/aiprompts/governance.md`。需要定位 owner 时读 `internal/aiprompts/overview.md`；涉及协议/bridge 时再读 `commands.md`；涉及交付判断时再读 `quality-workflow.md`。

## WHEN

处理新旧并存、错误 owner、compat/deprecated 退出、production fallback、重复协议/存储、已删除 runtime 回流或“是否可以删”时使用。

## WHAT

把能力收敛到一个 current owner，迁移真实消费者，删除无兼容负担的旧 surface，并用最小守卫阻止恢复。

## HOW

1. 先声明产品主目标和本轮窄写集；脏工作树遵循 `parallel-agent-collaboration.md`。
2. 盘点入口、协议、服务、存储、catalog、fixture、测试和文档导航。
3. 为实际路径标记 `current / compat / deprecated / dead`，不要把 `dead-candidate` 当最终结论。
4. 选择唯一 owner：Agent 语义归 Codex；产品业务归 Rust Business Service；桌面能力和投影归 Electron；Renderer 只用 semantic API。
5. 没有真实外部兼容时直接迁移调用并删除旧入口，不新增 wrapper、fallback 或双写。
6. 同步清 schema、client、catalog alias、正向测试和 current 文档，并在已有治理脚本补负向守卫。
7. 运行 `npm run governance:runtime-boundary`；触及命令加 `npm run test:contracts`，触及 GUI 主链加 `npm run verify:gui-smoke`。
8. 更新执行计划，报告四类归属、删除 surface、守卫、验证和下一刀。

## REFERENCE

- “Rust 是否要保存 Codex history”：否，Agent history 属于 Codex；Rust 只保存 Conversation binding。
- “资源缺失是否回退系统 FFmpeg”：否，production 必须 fail closed。
- “开发 skill 是否放入产品 catalog”：否，`.codex/skills` 与 `resources/skills` 完全分离。
- “旧实现无人使用但测试仍通过”：迁移或删除测试，不能用旧测试给 dead 路径续命。

## LIMITS

- 治理结论不自动授权删除文件、用户数据、tag 或 Release asset。
- 不恢复自研 Agent runtime、Rust Codex proxy、Tauri、raw Renderer bridge 或 production mock。
- 不为了减少 diff 创造长期 compat。
- 路线图任务中，治理必须服务主链，不能替代产品交付。
