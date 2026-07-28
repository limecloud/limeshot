# LimeShot v1 业务能力与生产流程规格

状态：`current / provider selection pending`
日期：`2026-07-28`
关联文档：[PRD.md](./PRD.md)、[README.md](./README.md)、[DIAGRAMS.md](./DIAGRAMS.md)、[PROVIDER-ARCHITECTURE.md](./PROVIDER-ARCHITECTURE.md)

## 1. 目标

LimeShot v1 交付五类完整内容生产流程：全能模式、短剧短片、转绘视频、口播视频和电商视频。五类流程共享 Project、Conversation、Capability、成本、任务、Artifact 和 Deliverable 底座。

GUI 可固定展示 Profile、表单、阶段和审批栏；Agent 执行仍由同一个 Codex App Server 承担。Profile 不创建独立 runtime，也不复制 Codex Thread/Turn/Item 状态机。

## 2. 独立实现与技术边界

- 不复制第三方代码、Skill 正文、提示词、模型 key、task code、API 域名、图标、模板、测试夹具或项目目录。
- LimeShot Skill、schema、provider adapter 和业务规则在本仓库形成事实源；task catalog 只在首个受管 task 与 executor、fixture 同批落地后建立。
- 取得明确书面授权后，才能按逐文件 manifest 迁移第三方资源；未确认前走 clean-room 实现。
- Electron main 按首次 Conversation 惰性启动官方 Codex App Server，并直接消费上游原生协议。
- Rust Business Service 是确定且唯一的业务后端，拥有 Project、Brief、binding、Plan、Task、Provider、Media、Artifact 与 ToolHost。
- Codex `item/tool/call` 先到 Electron，再由 Electron 路由为 Rust `tool/call`；Rust 不启动、不代理、不包装 Codex。

## 3. 共享业务底座

### 3.1 Project 与 Conversation

每个 Project 至少包含：Profile、Brief、workspace grant、一个或多个 Conversation binding、ProductionPlan、TaskRun、Artifact 和 Deliverable。Conversation 绑定 Codex `threadId`：

```text
projectId + conversationId <-> codexThreadId
```

Codex 保存 Thread history；LimeShot 保存业务对象和面向 GUI 的必要投影。不得复制完整 history 或用聊天文本替代任务、审批和交付事实。

### 3.2 Capability 与模型目录

`CapabilityCatalog` 是远端生成能力的产品事实源，至少包含稳定 `capabilityId`、provider/adapter version、输入输出模态、画幅/分辨率/时长限制、引用资产策略、价格单位、并发、超时和 availability。

BusinessProfile、Skill 与 GUI 只引用 `capabilityId`。Provider 原始模型名、task code、endpoint 和响应格式仅存在于 adapter lowering 与审计记录。

### 3.3 成本与授权

远端付费任务启动前必须：

1. 生成绑定精确 scope hash 的 `CostQuote`。
2. 校验余额、配额、模型价格和资产授权。
3. 取得用户对范围与成本的明确批准。
4. 固化 `ApprovalReceipt`。
5. 执行后将实际消耗写入 `CostLedger`。

余额不足、quote 过期、价格变化或 scope 变化会使批准失效。Agent 不直接充值，也不能把自然语言“继续”解释为付费或肖像/声音授权。

### 3.4 TaskRun、ProviderTask 与 MediaJob

`TaskRun` 是 LimeShot 的可恢复业务执行记录，不是 Agent Turn 的替代品。一个 Turn 可创建零到多个 TaskRun；TaskRun 的状态只由 ToolHost 执行器或 reconcile 更新。

| 对象 | Owner | 用途 |
| --- | --- | --- |
| `TaskRun` | BusinessCore + project repository | 固化批准的业务 scope、步骤、成本与产物引用 |
| `ProviderTask` | provider adapter | 云端图片、视频、音频、分析、ASR 和生成任务 |
| `MediaJob` | media adapter | 本地 probe、proxy、抽帧、转码、拼接、混音、字幕和封装 |

TaskRun 使用 `draft -> awaiting_approval -> queued -> running -> partially_succeeded/succeeded/failed/canceled/interrupted`。ProviderTask 使用 submit/read/reconcile/cancel/download；MediaJob 使用结构化 operation。Agent 不直接调用 HTTP、SDK、shell 或 FFmpeg。

### 3.5 素材、Artifact 与 Deliverable

`AssetRecord` 统一记录用户素材、授权资产、provider 引用、AI 生成资产和 FFmpeg 派生资产，并保存 source、hash、owner、consent、用途、有效期和 lineage。

- `RunRecord` 保存外部 task id、状态摘要、重试、成本和脱敏诊断。
- `Artifact` 保存脚本、JSON、图片、音频、视频、字幕、manifest 和 QA 报告。当前媒体链在 QA 通过时原子登记同 TaskRun 的 `media-output.v1 + qa-report.v1`。
- `Deliverable` 指向用户确认的最终 Artifact 版本。Task succeeded、passing QA 与 Deliverable 互不替代；确认时复验 output/QA 文件 hash，每个 Project 只允许一个 current，旧记录保留。

Provider raw response、临时下载、proxy、`.part` 和完整日志不进入普通工作区。

## 4. 全能模式

### 4.1 目标与能力

承接不能预先归入单一 Profile 的内容任务，由 Codex 识别意图并选择一个或多个已注册业务工具：

- 内容策划、脚本、镜头表和素材清单。
- 图片、视频、语音和字幕的单项生成。
- 素材分析、裁切、拼接、转码、封装和导出。
- 多步骤 TaskRun 组合，每个远端或高成本阶段独立审批。

### 4.2 限制

全能模式不是任意 shell 或任意工具入口。无法映射到注册 dynamic tool/capability 的请求返回 `CAPABILITY_NOT_SUPPORTED`，不能由 Codex临时编写脚本绕过。

## 5. 短剧短片

### 5.1 输入

- 已批准剧本或分集脚本。
- 画幅、分辨率、语言和目标时长。
- 视觉风格与 capability 选择。
- 可选角色、场景和道具参考素材。

### 5.2 阶段

```text
剧本导入与校验
  -> 标准分镜
  -> 角色 / 场景 / 道具识别
  -> 参考资产生成与审阅
  -> 分镜分组与时长校验
  -> 视频提示与参考绑定
  -> 成本报价与批次批准
  -> 视频片段并发生成
  -> 失败片段定向重试
  -> 字幕 / 混音 / 拼接
  -> FFprobe QA
  -> 分集 Deliverable
```

### 5.3 门禁

- 一项 Project 只承载一个短剧制作包。
- 剧本、视觉风格、资产批次、分组方案和付费批次分别确认。
- 每个镜头只能进入一个生成分组，时长和引用资产数量必须满足 capability。
- 部分失败只重试失败分组，保留成功片段和成本记录。

## 6. 转绘视频

### 6.1 输入

- 用户有权使用的源视频或分集视频。
- 目标语言、市场、角色/场景本地化策略。
- 目标视觉风格、画幅、声音策略和 capability。

### 6.2 阶段

```text
源视频 ingest
  -> proxy / 抽帧 / ASR / 视频理解
  -> 源角色、场景、道具和镜头时间线
  -> 本地化合同
  -> 目标角色 / 场景 / 道具资产
  -> 目标分镜与对白覆盖校验
  -> 生成单元与 PromptManifest
  -> 资产审阅、报价和批准
  -> 视频单元并发生成
  -> 连续性、人物、对白和文字 QA
  -> 字幕 / 混音 / 分集合成
  -> Deliverable
```

### 6.3 门禁

- 源片分析覆盖真实全时长，不能只处理可见片段。
- 目标资产和生成范围分别审阅；上游变更使下游批准失效。
- 单元时长、人物绑定、对白覆盖和引用资产必须通过结构化校验。
- 修复批次需要新 quote 和批准；不得静默替换已付费计划。

## 7. 口播视频

### 7.1 输入与类型

- 精确口播稿或经用户批准的改写稿。
- 用户自己的出镜人图片和声音样本，或明确授权复用的项目资产。
- 画幅、分辨率、平台、封面标题和视频类型。
- 类型支持纯口播、口播加商品演示、口播加信息图卡。

### 7.2 阶段

```text
脚本保真与分段
  -> 出镜人 / 声音授权检查
  -> capability 与成本确认
  -> 口播片段生成
  -> 可选封面与 B-roll
  -> 字幕、节奏、混音和拼接
  -> FFprobe QA
  -> 视频包与最终成片
```

用户提供精确稿时不得自行改写，只允许为模型时长限制拆分。改写模式同时保留原稿和批准稿。

## 8. 电商视频

### 8.1 输入

- 商品事实、品牌规则、目标平台、受众和 CTA。
- 商品图片、视频、Logo、包装和演示素材。
- 可选主播、声音和参考风格。

### 8.2 阶段

```text
商品事实与合规校验
  -> 卖点排序与脚本
  -> 镜头表和素材映射
  -> 缺失商品资产生成
  -> 主播 / 商品演示 / 信息图场景生成
  -> 成本与批次批准
  -> 视频片段生成
  -> 字幕、价格/CTA、混音和拼接
  -> 品牌与商品事实 QA
  -> 平台规格 Deliverable
```

Agent 不得编造商品参数、价格、功效、库存或促销信息；所有可见事实来自 Brief 或用户确认的数据源。

## 9. LimeShot Skills 与动态工具

每个 Profile 对应一个自有 Skill pack：`core`、`universal`、`short-form`、`redraw`、`talking`、`commerce`。

Skill 负责解释意图、收集缺失输入、选择注册工具和解释结果。Skill 不包含 provider 密钥、HTTP、任务轮询、成本计算、FFmpeg 参数、数据库写入或最终状态判定。

当前已落地的 Agent 业务动作只通过 allowlisted dynamic tools 表达：

```text
project_read / plan_create
```

`plan_create` 经 `tool/call -> ToolHost` 创建版本化 ProductionPlan；不暴露 raw `plan/create` RPC。计划批准只能由 GUI 用户动作调用 `approval/decide`，不提供 `plan_approve` dynamic tool。当前 `task/start|cancel|retry` 与 `deliverable/confirm` 也是 GUI semantic action，不进入 dynamic tool catalog；最终交付必须是用户的独立明确决定，不能由 Agent、Turn 终态或 FFmpeg exit code代替。

工具 schema、Project scope、批准和执行终态由 ToolHost 决定，不能依赖 Codex 自由解释 Markdown 后临时拼接流程。

## 10. GUI 业务工作台

- 左侧：新建会话、新建项目、搜索、Project 与当前 Conversation 树；归档和账户只在真实 owner 落地后出现。
- 首次页：五类 Profile、业务提示和输入器；提交后由 Electron 创建受管 workspace 和 Project，再直接进入 Codex Conversation；不显示自定义项目表单，也不弹系统目录选择器。
- 项目区：默认显示 Agent 对话和底部输入器；Brief、ProductionPlan、ApprovalReceipt、素材、任务、QA Artifact 与 current Deliverable 位于可打开的项目详情面板。
- 任务中心：ProviderTask 与 MediaJob 的统一投影，同时保留任务类型和成本差异。
- 账户中心：余额、报价、实际消耗、充值和交易记录。

GUI 只消费 semantic projection。长任务无事件时通过 `task.read/reconcile` 对账，不能根据聊天文本推断进度。

## 11. v1 完成定义

- 五类 Profile 均有独立 Skill、固定 GUI 入口、ToolHost 门禁和真实 Gate B。
- Capability、余额、quote、approval、cost ledger 和 Artifact lineage 可追溯。
- TaskRun 支持幂等、部分成功、定向重试、取消和应用重启恢复。
- 图片、视频、语音、分析和字幕至少各有一个合法接入路径；未完成者明确 unavailable。
- 短剧、转绘、口播和电商各完成一个真实输入到 Deliverable 的端到端验收。
- 用户资产、真人脸部、声音样本、商品事实、成本和覆盖行为都有明确审批与审计。
