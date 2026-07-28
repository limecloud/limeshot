# LimeShot v1 执行计划

状态：`active / business vertical slices`
日期：`2026-07-28`

## 1. 主目标

交付真实、可恢复、可审计的：

```text
Electron direct Codex
  + Rust pure business service
  + controlled Node/Provider/FFmpeg ToolHost
  -> five-profile GUI
```

当前阶段：Phase 0 已完成；Phase 1 的 Project/Brief/binding、Phase 2 的 direct Codex、Phase 3 的 `project_read -> plan_create -> GUI approval` 已通过同一条真实 Electron 双子进程 Gate B。下一步进入 approved ProductionPlan 到 Task/Artifact 的业务执行竖切。

## 2. Phase 0：架构与治理收敛

**写集**

- AGENTS、PRD、架构、协议、图册、业务、Provider、资源和执行计划。
- current/dead 分类与回流守卫。
- Cargo/npm/Forge 构建入口清理。

**退出条件**

- 全仓只有 Electron direct Codex + Rust business 主链。
- 自研 Agent App Server、RuntimeCore、Thread/Turn/Item、WorkflowRun 已物理删除，且禁止恢复。
- 旧 client/schema/test/build script 不再引用已删除 owner。
- 没有 Tauri 或 production mock。

## 3. Phase 1：Rust Business Service 竖切

状态：`current vertical slice / Gate B complete`

**写集**

- business protocol/server/client。
- Project、Brief、Conversation binding repository。
- Profile、Skill、Provider、Service、Artifact catalog。
- standard JSON-RPC 2.0 stdio lifecycle。

**退出条件**

- Electron -> Rust -> SQLite 的 Project/Brief/binding Gate B。
- business schema、Rust router、TS client、preload semantic API 无漂移。
- Rust workspace 不包含 Codex dependency、Thread/Turn/Item 类型或 method。

## 4. Phase 2：Direct Codex 竖切

状态：`current direct thread/turn/recovery slice / Gate B complete`

**写集**

- `packages/codex-client/**` 原生 JSONL peer 和固定版本类型。
- `src/main/codex/**` executable、supervisor、initialize/initialized 和 event projection。
- Thread start/resume/read、Turn start/interrupt。

**退出条件**

- Electron 直接完成一个 Thread 和至少两个 Turn。
- `turn/completed` 是唯一 Turn 完成事实。
- restart 后用 Rust binding 调用 Codex resume/read。
- Rust 不参与 Codex transport 或 history。

## 5. Phase 3：Tool Route

状态：`project_read + plan_create + GUI approval vertical slice complete / task executor pending`

**写集**

- Rust ToolHost catalog/schema/dispatcher。
- Codex `thread/start.dynamicTools`。
- Electron `item/tool/call -> Rust tool/call -> Codex response` route。
- scope、approval、timeout、cancel 和 bounded result。

**退出条件**

- unknown tool、schema drift、cross-project、missing approval 和 unavailable resource 全部 fail closed。
- dynamic tools 不可用时业务动作明确 unavailable，不回退 shell。
- ToolCallContext 不形成 Rust Agent state。

当前证据：固定 Codex `0.141.0` 在真实 Electron 中依次发起 `project_read` 与 `plan_create`，Electron 将两个 `item/tool/call` 路由到 Rust ToolHost；GUI 用户随后调用 `approval.decide`，Rust 原子写入 `approved` ProductionPlan 与不可变 `ApprovalReceipt`，最后由 semantic API 读回持久化状态。raw `plan/create` RPC 和 `plan_approve` dynamic tool 均不存在。

## 6. Phase 4：Managed Node 与媒体

- 从 approved ProductionPlan 创建第一个结构化 TaskRun/MediaJob，不允许从聊天文本或 Turn 终态推断执行成功。
- allowlisted Node task catalog、固定 script、最小环境、timeout/cancel。
- FFprobe、结构化 media operation、FFmpeg job 和 Artifact lineage。
- 真实 fixture 证明进度、取消、无孤儿进程和输出 QA。

## 7. Phase 5：Provider 与成本

- CapabilityCatalog、ProviderPort、quote、approval、ProviderTask、ledger 和 reconcile。
- 图片、视频、TTS、ASR、视频分析 adapter。
- 至少一个 sandbox 完成 quote -> approve -> submit -> reconcile -> download -> Artifact。

## 8. Phase 6：五类业务

先交付 `talking` 或 `commerce` 纵向链，再扩展 general、short-form 和 redraw。每个 Profile 必须有固定 GUI、Skill、tools、capability gate、审批、失败状态和真实 Deliverable。

## 9. Phase 7：安全与发布

- 双子进程 crash/restart、backpressure、日志脱敏和诊断导出。
- Electron Forge、macOS/Windows 签名、资源 manifest、SBOM、NOTICE。
- macOS arm64 与 Windows x64 clean-machine packaged Gate B。

## 10. 统一门禁

| 改动面 | 最低验证 |
| --- | --- |
| governance | forbidden path/method/dependency scan |
| business protocol | schema/client/router contract |
| Codex client | native wire/reverse request/crash contract |
| Electron/preload | semantic allowlist + typecheck + GUI smoke |
| Project binding | unique bind + restart resume/read |
| ToolHost | schema/scope/approval negative tests |
| Provider/Media | reconcile/cost/download + real media fixture |

## 11. 完成定义

只有所有阶段具备仓库内证据时 v1 才可完成。旧 Agent runtime 单测、mock、聊天文本和静态截图不能替代 direct Codex、Rust business 和真实业务 Gate B。
