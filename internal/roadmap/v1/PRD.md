# LimeShot v1 产品需求文档

| 文档属性 | 内容 |
| --- | --- |
| 文档版本 | `v1.0` |
| 文档状态 | `草案 / 可进入技术评审` |
| 更新日期 | `2026-07-28` |
| 产品范围 | LimeShot v1 桌面端，五类 AI 内容生产工作流与统一生产底座 |
| 关联架构 | [README.md](./README.md) |
| 业务工作流 | [BUSINESS.md](./BUSINESS.md) |
| 资源迁移 | [RESOURCE-MIGRATION.md](./RESOURCE-MIGRATION.md) |
| 执行计划 | [EXECUTION-PLAN.md](./EXECUTION-PLAN.md) |

## 1. 产品决策

LimeShot v1 定位为：

> 面向中文内容生产者的独立桌面 AI 制作工作台。用户把创作要求、交付规格和有权使用的素材组织进项目，由 Agent 形成可审核的制作计划；用户批准范围与成本后，LimeShot 调度云端生成和本地媒体处理，交付可追踪、可恢复、可审阅的内容成品。

LimeShot 是独立产品，Electron main 直接托管官方 `codex-rs` App Server。Codex 是唯一 Agent runtime；LimeShot 自己定义 GUI、业务 Profile、Project、计划、工具、任务和 Artifact，外部桌面产品不进入架构或运行时关系。

v1 不是单一模型生成器，也不是传统时间线剪辑器。产品价值来自四个连续动作：

1. 把模糊创作要求收敛为完整 Brief。
2. 把 Agent 建议固化为可版本化、可审批的 ProductionPlan。
3. 把批准后的计划交给 ToolHost 创建可恢复的 ProviderTask 与 MediaJob。
4. 把远端生成结果和本地后期结果固化为可审阅、可追踪的 Deliverable。

内容生产业务闭环为：

```text
创建项目
  -> 明确交付规格
  -> 导入或生成所需素材
  -> 与 Agent 对话
  -> 生成脚本 / 镜头表 / 素材缺口 / 制作计划
  -> 用户审阅并批准计划
  -> 执行本地媒体任务
  -> 审阅预览和最终文件
  -> 导出或在系统中显示交付物
```

任何不能落入这个闭环的能力，不进入 v1 主导航、模式入口或完成定义。

## 2. 产品原则

### 2.1 项目是业务容器

所有 Brief、素材、业务 Conversation、计划、任务、产物和交付记录必须归属一个本地文件夹 Project。LimeShot 同时支持不绑定 Project 的 standalone Codex 会话；standalone 不进入 Rust 业务投影，不加载 Project 动态工具，也不能创建媒体任务或交付物。

### 2.2 场景是业务入口

业务工作台固定提供五类 Project Profile：`全能模式`、`短剧短片`、`转绘视频`、`口播视频`、`电商视频`。Profile 只定义 Brief 字段、业务阶段、Skill、工具、素材要求、审批策略和可见能力，不直接绑定模型、Codex method、provider task code 或 FFmpeg 参数。Profile 的发布条件是对应真实 provider 和本地媒体 Gate B 通过；缺少执行能力时必须明确阻断，不能用策划结果伪装完整业务交付。

### 2.3 对话承接意图，结构化对象承接事实

用户可通过自然语言表达目标和修改意见，但 Brief、SourceAsset、ProductionPlan、MediaJob 和 Deliverable 才是可持久化、可校验和可恢复的业务事实。聊天文本不能替代审批、任务状态或交付记录。

### 2.4 计划先审阅，批准后执行

Agent 负责需求澄清、完整性检查和计划生成。任何计划内媒体处理必须基于用户批准的 ProductionPlan；素材不足、规格冲突或审批缺失时，系统必须停止执行并展示明确原因。

### 2.5 能力承诺必须可验证

用户界面、营销文案和验收标准只能描述由当前 Codex、ToolHost、Provider adapter、FFprobe/FFmpeg 和持久化主链真实支持的能力。每项图片、视频、语音、分析或字幕能力都必须具备 provider、授权、成本、内容安全和交付合同。

### 2.6 总体架构图

总体架构图见[架构与流程图册](./DIAGRAMS.md#1-总体架构图)。该图固定产品域与技术承载关系：Electron 是桌面宿主并直接连接 Codex；Codex 负责 Agent loop、Thread/Turn/Item、Skills 和工具编排；LimeShot ToolHost 承接业务工具；Provider adapter 与 FFprobe/FFmpeg 执行远端生成和确定性本地媒体处理。Renderer 不直接访问本地文件、Codex、provider 或 FFmpeg。

### 2.7 核心业务流程图

核心业务流程图见[架构与流程图册](./DIAGRAMS.md#9-业务生产流程图)。该图规定 `needs_input`、未批准、素材失效和执行失败均不是成功状态；只有用户确认过的 Artifact 才能成为当前 Deliverable。

### 2.8 关键时序图

关键时序图见[架构与流程图册](./DIAGRAMS.md#5-turn-与动态工具时序图)，展示一次真实请求如何经过 Electron、Codex、Rust Business Service、ToolHost、任务执行器和 Project Store。

## 3. 问题与机会

### 3.1 用户问题

轻量内容生产者通常拥有素材和发布目标，但缺少稳定的制作流程：

- 需求散落在聊天、笔记、文件名和脑中，交付规格容易遗漏。
- 素材很多，但不清楚哪些可用、缺什么、应如何组织成片。
- AI 能给建议，却经常不知道真实素材和本地文件状态。
- 命令行 FFmpeg 可复现但门槛高，失败、进度和输出不透明。
- 一键式工具容易直接执行，用户在覆盖文件或长时间处理前没有审阅机会。
- 应用重启后，对话、任务和文件之间的关系容易丢失。

### 3.2 产品机会

Codex 适合完成需求澄清、文本产物生成、计划编排和结构化工具调用；ToolHost 将调用限制在批准的 Project、Provider、受管 Node task 和结构化 FFprobe/FFmpeg operation 内。Codex 的原生动态工具协议与 LimeShot 的审批、任务和 Artifact 合同连接后，形成可信的一体化生产链。

产品价值不在于提供通用 AI 对话界面，而在于持续向用户呈现以下四项业务事实：

1. 我要交付什么？
2. 当前素材够不够？
3. Agent 准备怎么做？
4. 现在执行到哪里，最终文件在哪里？

## 4. 目标用户与 JTBD

### 4.1 核心用户

**独立内容创作者**

- 为短视频平台制作 15 秒至 10 分钟内容。
- 已有拍摄素材、录音、图片或品牌资源。
- 能判断内容好坏，但不愿维护复杂剪辑工程和命令行脚本。

**小团队内容运营**

- 需要把访谈、课程、产品素材整理成多个交付版本。
- 重视规格一致、过程可复查和文件可定位。
- v1 按单机单用户设计，不承诺实时多人协作。

### 4.2 非目标用户

- 需要专业多轨时间线、关键帧、调色和音频混音的专业剪辑师。
- 需要云端团队审片、权限流、素材 DAM 或自动投放的企业客户。

### 4.3 核心 JTBD

当我有一个内容目标、可用素材或可确认的生成方向时，我希望 AI 帮我补齐需求、形成可审阅方案，并在我批准范围与成本后完成素材生成、本地后期和交付，这样我不必跨多个工具拼流程，也不会失去对内容、成本和文件的控制。

### 4.4 辅助 JTBD

- 当我只有选题时，我希望先得到脚本、镜头表和素材清单，再决定是否进入制作。
- 当素材不足时，我希望明确知道缺什么，而不是让 AI 假装已经拥有这些素材。
- 当处理时间较长时，我希望看到进度、可取消，并能在失败后知道原因和重试范围。
- 当我重新打开项目时，我希望恢复对话、批准过的计划、任务状态和交付文件。

## 5. v1 目标与非目标

### 5.1 产品目标

- 用户无需外部终端即可完成一次从 Brief、素材准备、远端生成、本地后期到 MP4 交付的闭环。
- Agent 的建议和实际执行之间有明确的批准边界。
- 每个输出都能追溯到项目、计划版本、输入素材和媒体任务。
- 失败、中断、取消、素材不足和规格冲突都有真实可见状态。
- 应用重启后，可恢复项目和非运行中事实，不把内存状态当作唯一记录。

### 5.2 v1 固定的业务 Profile

业务 Profile 固定在 GUI 中，用于降低启动成本和组织业务阶段；Profile 不直接等于某个模型。实际执行由 Skill、dynamic tool catalog、Provider capability、ProductionPlan、CostQuote 和审批共同决定，详细阶段以 [BUSINESS.md](./BUSINESS.md) 为准。

| Profile | GUI 名称 | 业务重点 | v1 Skill 入口 |
| --- | --- | --- | --- |
| `general` | 全能模式 | 通用策划、单项生成和多能力组合 | `universal` |
| `short_form` | 短剧短片 | 剧本、分镜、资产、分组、视频生成和分集合成 | `short-form` |
| `visual_transform` | 转绘视频 | 源片分析、目标本地化、目标资产、视频重生成和合成 | `redraw` |
| `talking_video` | 口播视频 | 脚本保真、出镜人/声音资产、口播生成、封面与混剪 | `talking` |
| `commerce_video` | 电商视频 | 商品事实、卖点、商品资产、视频生成和平台规格交付 | `commerce` |

#### 内容策划

所有 Profile 都可以从内容策划开始：用户输入主题、目标受众、平台、时长、画幅、语言、语气和禁用表达；Agent 生成脚本、镜头表、素材清单、风险提示和建议 ProductionPlan。用户可以继续对话修改，并批准策划类 Deliverable。

#### 素材与生成协同

所有 Profile 都可以导入视频、音频、图片或文本，也可以按计划生成缺失资产。ToolHost 创建远端 ProviderTask 或本地 MediaJob；用户审阅并批准计划、成本和生成范围后执行，再确认最终 Deliverable。

### 5.3 明确不做

以下能力不进入 v1：

- 自动发布到抖音、视频号、小红书、YouTube 等外部平台。
- 多人实时协作、云同步、远程审片和组织权限。
- 专业 NLE 时间线、任意滤镜图、业务侧插件系统和任意 shell。
- 未注册 provider、任意模型 key、任意 provider task code 或任意网络请求。
- AI 自动下载未授权网络素材或默认声称拥有第三方版权。
- 未绑定 Project 的业务 Conversation、业务 MediaJob 或业务 Deliverable。
- 复制第三方代码、Skill、prompt、图标、模板、私有协议或品牌资产。

图片、视频、语音、分析、ASR、字幕、素材授权、模型目录、成本、余额和充值属于 v1 业务底座，但必须使用 LimeShot 自有或已获授权的 provider 和商业系统，不能用 Codex + FFmpeg 名义代替。

## 6. 业务对象与事实源

| 对象 | 作用 | 关键关系 | 事实源 |
| --- | --- | --- | --- |
| `Project` | 一次内容生产的容器 | 拥有其他全部业务对象 | project repository + workspace grant |
| `BusinessProfile` | 固定项目类型与业务策略 | 决定 Brief schema、Skill、工具、审批和 capability gate | BusinessCore catalog |
| `Brief` | 定义创作目标与交付约束 | 每个 Project 一个 current 版本，可保留历史版本 | project repository |
| `SourceAsset` | 用户已导入且授权使用的本地素材 | 属于 Project，可被多个 Plan 引用 | workspace file + artifact index |
| `Conversation` | 用户与 Agent 的内容生产上下文 | 属于 Project，绑定一个 Codex Thread | binding repository + Codex history |
| `ProductionPlan` | Agent 生成、用户审核的版本化制作计划 | 引用 Brief、SourceAsset 和 Artifact | project repository |
| `TaskRun` | 一次可恢复的业务执行 | 固化 scope、输入 hash、成本、审批和子任务引用 | task repository |
| `ProviderTask` | 一次远端生成、分析或语音任务 | 属于 TaskRun，经 provider adapter 执行 | task repository + provider reconciliation |
| `MediaJob` | 一次可取消、可追踪的媒体处理任务 | 必须来自已批准 Plan 或明确的用户操作 | task repository |
| `Artifact` | 脚本、镜头表、字幕、预览、缩略图、MP4 等产物 | 记录来源、类型和 lineage | workspace file + artifact index |
| `Deliverable` | 经用户确认用于交付的 Artifact 版本与规格 | 指向一个或多个 Artifact | project repository |
| `CostQuote` | 远端付费阶段的预估成本合同 | 与 scope hash、余额和 ApprovalReceipt 绑定 | project repository |

### 6.1 Project

必填字段：

- `project_id`
- `name`
- `workspace_grant`
- `business_profile`: 固定 Profile catalog 中的 key
- `profile_version`: Profile 业务规则版本
- `state`: `draft`、`active`、`archived`
- `current_brief_id`
- `conversation_id`
- `created_at` / `updated_at`

规则：

- 一个 workspace 同时最多绑定一个 active Project，避免输出目录和索引互相污染。
- 归档只隐藏默认列表，不删除素材和交付物。
- v1 不实现硬删除。删除策略需另行定义恢复和用户数据语义。
- BusinessProfile 的标签、图标和字段显示可由 GUI 固定；其执行模式和 capability gate 以 BusinessCore catalog 与 ToolHost availability 为准。

### 6.2 Brief

Brief 至少覆盖：

- 主题或核心信息。
- 目标受众。
- 目标平台或使用场景。
- 目标时长或允许区间。
- 画幅与分辨率。
- 语言、语气和表达风格。
- 必须包含的信息。
- 禁用说法、品牌限制或合规提示。
- 期望交付物类型和文件规格。

Brief 完整性分三档：

| 状态 | 含义 | 系统行为 |
| --- | --- | --- |
| `incomplete` | 缺少影响方案的关键信息 | Agent 提问，不生成可批准计划 |
| `workable` | 足以生成完整业务方案 | 允许生成 ProductionPlan |
| `conflicting` | 约束相互冲突或素材无法满足 | 显示冲突，要求用户修改或明确取舍 |

### 6.3 SourceAsset

素材类型：

- `video`
- `audio`
- `image`
- `text`

每个素材记录：

- 用户可见名称与受控本地引用。
- 文件 size、hash、MIME 和导入时间。
- FFprobe 或图片探测得到的时长、分辨率、帧率、codec、声道等客观元数据。
- 用户声明的用途、版权或授权备注，可为空但不得由 Agent 编造。
- `available`、`missing`、`changed`、`unsupported` 状态。

检测到文件缺失或 hash 改变时，引用它的计划必须重新校验，不得继续沿用旧探测结果。

### 6.4 ProductionPlan

ProductionPlan 是自然语言意图与实际执行之间的业务合同，至少包含：

- `plan_id`、`project_id`、`version`、`state`。
- 基于的 `brief_id` 和 Brief 版本。
- 脚本、镜头表或段落结构。
- 每个镜头/段落与 SourceAsset 的明确映射。
- 素材缺口、假设、不可执行项和风险。
- 预计交付规格、预计时长和预计输出大小区间。
- 结构化 operation 列表及其依赖关系。
- 创建者、批准者、创建时间和批准时间。

计划不可原地覆盖。Agent 或用户修改后创建新版本，旧版本保持可追溯。

### 6.5 Artifact 与 Deliverable

Artifact 类型至少包括：

- `script`
- `shot_list`
- `asset_requirements`
- `subtitle`
- `thumbnail`
- `preview_video`
- `final_video`
- `diagnostic_report`

当前媒体竖切的机器合同为 `media-manifest.v1`、`media-output.v1` 与 `qa-report.v1`。`media-output.v1` 和对应 passing `qa-report.v1` 必须属于同一个 TaskRun；FFmpeg exit code、Task success、QA report 与 Deliverable 是不同业务事实。

Deliverable 不是文件副本，而是用户确认的交付记录：

- 指向 Artifact。
- 固化交付规格和显示名称。
- 记录关联 Plan 版本与确认时间。
- 每个 Project 只能有一个 current Deliverable；切换 current 时保留历史记录。
- 媒体交付确认前重新校验 output 与 QA Artifact 的文件大小和 SHA-256。
- 导出到 workspace 外时，记录导出结果，不把外部路径当作长期授权。

## 7. 核心任务流

### 7.1 新建会话或选择本地项目

```text
打开 LimeShot
  -> 选择五类 Business Profile 之一
  -> 在首页输入首个制作需求
  -> 未选择 Project 时创建 standalone Codex Thread
  -> 自动发送需求为首个 Turn

或

点击 Composer 底部“+”并选择本地文件夹
  -> Electron 打开系统目录选择器
  -> 用户选择或新建一个目录
  -> 以该目录创建 Project 与 incomplete Brief
  -> 保持首页与当前输入不变
  -> 用户提交需求时创建 Project Conversation 并发送首个 Turn
```

要求：

- 首屏必须让用户先理解“做什么”，不要求先选模型或 runtime。
- 首页五类 Profile 入口与说明区固定保留在 Composer 上方；不得用 Project 下拉框替换或挤占该区域。
- Composer 底部采用 `+ / 当前 Project / Profile / 发送` 布局；`+` 菜单提供 standalone、已有本地 Project 与“选择或新建文件夹”。
- 未选择 Project 时提交需求不得弹出目录选择器或创建 Rust Project。
- “选择或新建文件夹”必须打开系统目录选择器；用户取消时不得创建 Project 或 Conversation。
- Renderer 不提交或接收任意 workspace path；目录项目的选中路径只存在于 Electron Main 与 Rust Business Service 边界内。
- 不显示自定义“项目名称 + 内容目标”创建弹窗；Brief 缺口由 Conversation 收集，并可在项目详情中结构化编辑。
- 若资源尚未准备完成，可进入只读项目，但 Agent 和媒体动作显示不可用原因。

### 7.2 内容策划

```text
填写 Brief
  -> Agent 检查完整性
  -> 缺信息时进入 needs_input
  -> 用户补充
  -> Agent 生成脚本 / 镜头表 / 素材清单
  -> 形成 ProductionPlan v1
  -> 用户提出修改，生成 v2...
  -> 用户批准一个版本
  -> 导出策划 Artifact，或继续准备素材进入生产
```

### 7.3 生产工作流执行

```text
批准 ProductionPlan
  -> ToolHost 创建 TaskRun
  -> 校验 provider capability / 素材 / 授权
  -> 生成 CostQuote 并取得付费阶段批准
  -> 按批准 scope 创建 ProviderTask 和 MediaJob
  -> 显示阶段、成本、进度和中间 Artifact
  -> 部分失败时保留成功产物并定向重试
  -> FFprobe / 业务 QA
  -> 审阅 final_video
  -> 确认为 Deliverable
  -> 导出或在系统中显示
```

五类 Profile 的输入、阶段、审批和 QA 见 [BUSINESS.md](./BUSINESS.md)。

### 7.4 修改已批准计划

批准不是锁死项目：

1. 用户提出修改时，从已批准版本派生新 draft。
2. 已运行的 MediaJob 和 Artifact 保留，不改写历史。
3. 新版本必须重新批准。
4. 只复用输入和参数完全相同且校验仍有效的 Artifact。
5. 新版本交付后，旧 Deliverable 仍可查看，但不再标记为 current。

### 7.5 失败与恢复

- Codex 不可用：项目、Brief、素材、既有计划和交付物可读；禁止生成或修改 Agent 计划。
- Provider 不可用：保留项目、策划和本地媒体能力；依赖该 capability 的 stage 明确阻断。
- FFmpeg 不可用：允许策划、远端生成和审阅；本地后期 stage 不可用并显示资源修复动作。
- 应用退出时正在执行：任务标记 `interrupted`，重启后由用户从头重试。
- 素材移动或改变：标记素材异常，阻止依赖它的新执行。
- 磁盘不足：任务启动前尽量预检，执行中失败时保留诊断，清理未完成 `.part`。

## 8. 功能需求

### 8.1 项目与导航

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `PRJ-01` | 用户可从 Composer 底部 `+` 菜单选择已有本地 Project，或选择/新建本地文件夹后开始 Project Conversation | P0 |
| `PRJ-02` | 左侧导航显示 active 项目，支持搜索和归档筛选 | P0 |
| `PRJ-03` | 项目恢复时回到最近工作视图，并重建真实状态 | P0 |
| `PRJ-04` | 项目名称、Business Profile 和交付规格可编辑；Profile 改变后重校验 Brief 和计划 | P0 |
| `PRJ-05` | Brief、素材、业务 Conversation、计划、任务和交付物不得脱离 Project；standalone Codex 会话不得获得这些业务能力 | P0 |

### 8.2 Business Profile

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `PRO-01` | 五类 Profile 的布局入口、标签、图标和基础字段在 GUI 中固定展示 | P0 |
| `PRO-02` | BusinessCore 返回每个 Profile 的 Skill、工具、能力状态和阻断原因，Renderer 只做投影 | P0 |
| `PRO-03` | Profile 缺少必需 provider capability 时必须阻止执行并显示修复动作 | P0 |
| `PRO-04` | 新 provider 接入后只能扩展 capability mapping，不得改变既有 Project/Profile identity | P1 |

### 8.3 Brief

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `BRF-01` | 提供结构化表单，并允许 Agent 从对话中提出字段更新建议 | P0 |
| `BRF-02` | 修改 Brief 前显示变化，确认后生成新版本 | P0 |
| `BRF-03` | 显示完整性与冲突，不用模糊的“AI 正在思考”代替 | P0 |
| `BRF-04` | 缺失字段允许用户明确选择“暂不提供”，并记录为已知缺口 | P1 |

### 8.4 素材

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `AST-01` | 通过系统文件选择器批量导入视频、音频、图片和文本 | P0 |
| `AST-02` | 显示探测状态、时长、分辨率、codec、大小和异常 | P0 |
| `AST-03` | 支持预览受支持素材，并在系统中显示原文件 | P0 |
| `AST-04` | 检测 missing/changed/unsupported，影响计划时阻止执行 | P0 |
| `AST-05` | 用户可补充用途和授权备注，Agent 只能引用不能代填事实 | P1 |

### 8.5 Conversation 与 Agent

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `AGT-01` | standalone Codex 会话与 Project Conversation 均可恢复，并保持 Project 绑定边界 | P0 |
| `AGT-02` | 输入器可引用 Brief、素材、计划和 Artifact，不直接传大文件 | P0 |
| `AGT-03` | 流式展示回复、工具调用、等待输入、等待批准和失败状态 | P0 |
| `AGT-04` | 用户可中断当前 Turn，已完成内容仍可见 | P0 |
| `AGT-05` | Agent 不足以作答时进入 `needs_input`，不得虚构素材或探测结果 | P0 |

### 8.6 计划与审批

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `PLN-01` | Agent 可从 workable Brief 创建版本化 ProductionPlan | P0 |
| `PLN-02` | 计划审阅页同时展示脚本/结构、素材映射、缺口、输出规格和操作摘要 | P0 |
| `PLN-03` | 用户可批准或要求修改，不提供隐式自动批准 | P0 |
| `PLN-04` | 批准后任何实质修改都生成新版本并重新批准 | P0 |
| `PLN-05` | 计划不可执行时必须给出字段级原因和修复入口 | P0 |

### 8.7 媒体任务

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `JOB-01` | 只从批准计划或明确的单次用户动作创建结构化 MediaJob | P0 |
| `JOB-02` | 展示 queued/preparing/running/terminal 状态与稳定进度 | P0 |
| `JOB-03` | 支持取消和失败后从头重试，不承诺断点续转 | P0 |
| `JOB-04` | 覆盖文件、高耗时或大体积任务必须二次批准 | P0 |
| `JOB-05` | 任务完成后建立输入、计划、job、输出 Artifact 的 lineage | P0 |
| `JOB-06` | FFmpeg 成功后必须对已提交输出执行确定性 QA；QA 失败删除输出并将任务标为 failed | P0 |
| `JOB-07` | QA 通过时原子登记 `media-output.v1` 与 `qa-report.v1`，不得只登记其一 | P0 |

### 8.8 交付物

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `DLV-01` | 用户可预览或在系统中显示 Artifact | P0 |
| `DLV-02` | 用户确认 Artifact 后创建 Deliverable，并标记 current 版本 | P0 |
| `DLV-03` | 导出前展示文件名、格式、分辨率、时长和目标位置 | P0 |
| `DLV-04` | 目标已存在时必须明确选择覆盖、更名或取消 | P0 |
| `DLV-05` | 导出失败不改变 Deliverable 的内部有效性 | P0 |
| `DLV-06` | 只有带同 TaskRun passing QA 的媒体输出可确认；每个 Project 恰有一个 current Deliverable，旧记录保留 | P0 |
| `DLV-07` | 确认时重新校验 output/QA Artifact 的大小和 SHA-256，文件缺失或变化时 fail closed | P0 |

### 8.9 Provider、Task 与成本

| ID | 需求 | 优先级 |
| --- | --- | --- |
| `RUN-01` | 每次执行创建 TaskRun，并持久化批准 scope、输入 hash、子任务引用和恢复点 | P0 |
| `RUN-02` | TaskRun 支持部分成功、定向重试、取消、中断和应用重启恢复 | P0 |
| `RUN-03` | ProviderTask 与 MediaJob 分开投影，但在同一任务中心按 TaskRun 聚合 | P0 |
| `CAP-01` | CapabilityCatalog 是模型、输入限制、价格、并发和 availability 的唯一产品事实源 | P0 |
| `CAP-02` | Provider 原始 model key、task code 和响应不得进入 Renderer 或 BusinessProfile | P0 |
| `COST-01` | 远端付费批次执行前显示 CostQuote、余额、范围和有效期并取得明确批准 | P0 |
| `COST-02` | 实际消耗写入 CostLedger；scope、模型或价格变化时旧批准失效 | P0 |
| `BILL-01` | 账户区提供余额、充值入口和交易记录，Agent 不能直接执行支付 | P0 |

## 9. 状态机与审批

### 9.1 Project

```text
draft -> active -> archived
          ^          |
          +----------+
```

### 9.2 ProductionPlan

```text
draft -> needs_input -> draft
  |
  +-> ready_for_review -> approved -> executing -> delivered
            |               |          |
            |               |          +-> failed
            |               +-> delivered（纯策划交付）
            |               +-> superseded
            |               +-> canceled
            +-> superseded
```

说明：

- `ready_for_review` 只表示内容齐备，不等于用户批准。
- `approved` 固化 plan version；执行时不再接受原地修改。
- 内容策划项目可以在批准后直接生成脚本、镜头表和素材清单 Deliverable，不创建伪造的 MediaJob。
- 依赖任务部分失败时 Plan 进入 `failed`，成功 Artifact 仍保留。
- 新版本获批后，旧 draft/review/approved 版本进入 `superseded`，历史可读。

### 9.3 MediaJob

```text
queued -> preparing -> running -> succeeded
                     |       |
                     |       +-> failed
                     +----------> canceling -> canceled
                     +----------> interrupted
```

### 9.4 TaskRun

```text
draft -> awaiting_approval -> queued -> running
  -> partially_succeeded -> succeeded
  -> failed / canceling -> canceled / interrupted
```

TaskRun 不复制 Codex Turn 或维护第二套 Agent stage DAG。本地媒体任务的显式 retry 只接受 `failed/canceled/interrupted`，保留旧记录并创建带 `retryOfTaskRunId` 的新 TaskRun；每个失败节点只有一个直接后继，重试前必须重新校验批准 scope、依赖、素材 hash 和 runtime。`partially_succeeded` 必须保留成功 ProviderTask、MediaJob 和 Artifact，后续只重试失败 scope。远端 task 已提交但尚未终态时，应用恢复必须先 reconcile，不能重复计费提交。

### 9.5 强制审批点

以下动作必须由用户在当前项目上下文中批准：

- ProductionPlan 从 `ready_for_review` 进入 `approved`。
- 每个包含远端付费任务的 CostQuote 与批次 scope。
- 真人脸部、声音样本或其他需独立授权的 provider asset 注册。
- 覆盖已有文件。
- 预计耗时或输出大小超过产品阈值的媒体任务。
- 修改已批准计划后执行新版本。
- 任何未来外部发布、上传或网络写入行为；v1 不提供这些行为。

无活跃窗口时，审批保持 waiting 或超时拒绝，不能自动同意。

## 10. 信息架构与界面状态

### 10.1 一级导航

```text
新建会话
搜索

项目
  - Project
      - Conversation

设置
  - Runtime 与资源状态
  - 隐私与诊断
  - 关于与版本
```

信息架构可以参考成熟桌面 Agent 产品的导航密度、任务恢复和底部输入器交互，但 LimeShot 的导航、状态、命令和功能 owner 必须由自身产品定义，不依赖任何外部桌面产品。

### 10.2 首次页

首次页固定展示五类 Profile：

- `全能模式`
- `短剧短片`
- `转绘视频`
- `口播视频`
- `电商视频`

选中 Profile 后，下方区域展示其目标、业务提示和交付预期，该区域必须保持在 Composer 上方。Composer 底部复用桌面 Codex 的紧凑工具栏形态：左侧 `+` 打开向上浮层，用于选择 standalone、已有本地 Project 或“选择或新建文件夹”；底栏持续显示当前 Project，右侧保留 Profile 与发送按钮。未选择 Project 时提交首个需求会启动 standalone Codex Thread；选择本地 Project 后提交才启动 Project Conversation。需要用户取舍时，可展示由 catalog 验证的同一 capability 候选方案，但不暴露 provider 私有 task code。账户、余额与充值只有在真实 Cost/Account owner 落地后才进入默认 GUI，不显示假入口。

### 10.3 项目工作区

进入项目后默认采用 Conversation-first 布局：

```text
左侧栏                 中央主画布                    按需打开的右侧面板
Project                Codex Conversation            Project 详情
  - Conversation       Turn / Item / activity        Brief / Plan / Approval
新建会话               底部 Composer                 后续 Task / Artifact
```

Conversation 是默认主画布，不得退化为“左 Brief 表单、右 Agent 小窗”的 Dashboard。Codex 工具过程在消息流中折叠为可展开的 activity；原始工具名只在用户展开后出现。项目详情由真实语义按钮打开，小窗口下覆盖或收窄主画布；当前计划状态、运行任务和关键错误必须始终可达。

### 10.4 项目概览

项目概览回答：

- 当前 Brief 是否完整。
- 素材是否可用，有哪些缺口。
- 当前计划版本和审批状态。
- 是否有运行、失败或中断任务。
- current Deliverable 是什么，文件是否仍存在。

禁止用多个营销卡片取代这些状态。

### 10.5 空、忙、错、恢复状态

- 空项目：Composer 可立即输入需求，Agent 按 Brief 缺口提问；项目详情同时提供结构化 Brief，不能只显示无动作的空白聊天框。
- Agent 运行：显示可中断状态，历史内容保持可操作。
- MediaJob 运行：显示阶段、进度、预计输出和取消动作。
- 错误：显示业务原因、影响对象、重试或修复动作和 trace id。
- 恢复中：明确标记正在重建状态，不把缓存显示成最终成功。

## 11. Agent 行为合同

Agent 是项目内的计划者和编排者，不是隐藏的文件系统或 shell owner。Business Profile、Brief、ProductionPlan、TaskRun、MediaJob 和 Deliverable 的约束必须由 BusinessCore 与 ToolHost 执行，不能通过 prompt 文本替代权限、审批和状态检查。

### 11.1 上下文输入

每个 Turn 通过 Codex 原生 input 和 LimeShot dynamic tools 获得受控上下文：

- current Brief 及版本。
- SourceAsset 列表、探测元数据和授权备注。
- current/selected ProductionPlan 摘要。
- 相关 Artifact 元数据。
- 可用结构化工具及其 schema。

不把未授权路径、凭证、完整日志或无关项目数据放入上下文。

### 11.2 必须遵守

- 区分“用户提供的事实”“工具探测事实”“Agent 建议”和“未知信息”。
- Brief 不完整时先提问；允许给草案，但不得标记为可批准计划。
- 只引用真实存在且状态可用的 SourceAsset id。
- 所有可执行操作写入 ProductionPlan，不在聊天文本中暗中执行。
- 调用媒体工具时只提交结构化参数，不拼 shell 或任意 FFmpeg argv。
- 工具失败时如实反映，不声称已生成文件。
- 计划变更必须形成新版本并要求重新审批。
- 不把 Business Profile 名称直接当作上游 Codex model、provider 或 prompt mode；Profile 必须先经过 BusinessCore policy 和 ToolHost capability lowering。

### 11.3 禁止行为

- 编造素材内容、时长、版权、人物授权或品牌事实。
- 未经批准覆盖文件或开始高成本任务。
- 把互联网知识当作用户项目的已验证事实。
- 暗示拥有未接入的视频生成、配音、数字人或发布能力。
- 通过通用 shell 绕过 ToolHost、workspace grant 或审批。

## 12. 媒体任务与交付合同

ProductionPlan 记录用户批准的业务 scope；ToolHost 将具体媒体动作编译为结构化 operation。codec、argv 和原子落盘属于 media adapter 合同，以 [README.md](./README.md#7-业务与-agent-分离) 为准，不进入 UI 或 Agent 自由参数。

执行前必须确认：Plan 仍为 approved；Brief、素材与 scope 未失效；输入仍在授权范围；runtime capability 和磁盘空间可用；覆盖与高成本审批已取得。任一检查失败时，任务不得进入 running。

只有实际输出通过 FFprobe/业务 QA，并在同一事务建立 `media-output.v1 + qa-report.v1` 后，Task 才能进入 succeeded。预期与实际容器、时长、文件大小、stream 或 codec 不满足策略时删除输出并记录 `MEDIA_QA_FAILED`。Task succeeded 仍不等于已交付；只有 GUI 用户显式确认且 output/QA 文件 hash 复验通过后，系统才能创建或切换 current Deliverable。

### 12.1 默认交付预设

v1 可提供少量结构化预设，但必须展示最终规格：

| 预设 | 画幅 | 默认容器 | 说明 |
| --- | --- | --- | --- |
| 竖屏短视频 | 9:16 | MP4 | 分辨率和码率由 capability 与素材决定 |
| 横屏视频 | 16:9 | MP4 | 适合常规网页和桌面播放 |
| 保持源规格 | 原始 | MP4 | 只在输入规格兼容时可用 |

不在 PRD 中锁死具体 codec/码率数值；它们由资源能力、兼容性测试和结构化 preset schema 定义。

## 13. 权限、隐私与业务安全

- 只处理用户通过系统目录选择器明确授权的本地 Project workspace，以及通过独立系统对话框明确导入的外部素材。
- 项目间不共享素材路径和 Conversation 上下文。
- 凭证不进入 Brief、Agent 消息、SQLite 普通字段或诊断包。
- 诊断导出前展示包含范围，并默认脱敏路径和用户内容。
- v1 不主动上传项目文件、对话或交付物；Codex/provider 所需网络行为必须在隐私说明中单独披露。
- 用户对素材版权和人物授权负责；产品提供备注与提醒，不替用户做法律判断。
- 外部链接只能经 Electron host 的受控能力打开，不能由 Agent 任意执行本地程序。

## 14. 成功指标

v1 先验证闭环是否成立，不用注册数、聊天条数等虚荣指标代替交付。

### 14.1 北极星指标

**有效交付项目数**：用户在一个 Project 中批准 ProductionPlan，成功生成并确认至少一个 Deliverable。

### 14.2 漏斗指标

- 创建项目 -> Brief 达到 workable 的转化率。
- workable Brief -> 计划进入 ready_for_review 的转化率。
- ready_for_review -> approved 的转化率和中位审阅时长。
- approved -> 首个 TaskRun 启动的转化率。
- TaskRun 启动 -> Deliverable 确认的成功率。
- 首次创建项目 -> 首个 Deliverable 的中位时长。

### 14.3 质量指标

- Deliverable 的实际规格验证通过率。
- TaskRun、ProviderTask 与 MediaJob 的成功、部分成功、失败、取消和 interrupted 分布。
- 因素材缺失、规格冲突、磁盘和 runtime 导致的失败分布。
- 用户批准后又立即派生新版本的比例，用于判断计划审阅是否充分。
- 应用重启后项目状态、Conversation 和交付物恢复成功率。

### 14.4 v1 目标值设定原则

在内部 dogfood 获得至少 20 个完整项目样本前，不伪造百分比目标。Phase 0 固化事件定义，Phase 3-5 建立基线，发布候选阶段再基于样本填写目标值和退出阈值。

指标采集必须遵循本地优先和最小化原则；没有遥测授权时，可通过用户主动导出的脱敏诊断或测试证据评估。

## 15. 验收场景

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| `AC-01` | 内容策划闭环 | 任一 Profile 的完整 Brief 可形成脚本、镜头表、素材清单和版本化计划；应用重启后可读取批准版本及 Conversation |
| `AC-02` | Brief 不完整 | 缺少目标时长和画幅时进入 `needs_input`，不得生成 `ready_for_review` 计划或声称可直接出片 |
| `AC-03` | 本地媒体闭环 | 受支持素材与 workable Brief 经计划批准后由真实 FFmpeg 处理；GUI 显示进度与 passing QA，用户显式确认后形成唯一 current video Deliverable，重启后可读回 |
| `AC-04` | 素材不足 | 计划列出缺口和假设；未得到用户取舍前不得进入 approved/executing |
| `AC-05` | 素材改变 | 计划批准后输入被替换时阻止执行，标记 SourceAsset changed，并要求重新探测和批准 |
| `AC-06` | 覆盖保护 | 目标已存在时要求覆盖、更名或取消；无活跃窗口或审批超时时不得覆盖 |
| `AC-07` | 取消与清理 | MediaJob 取消后无孤儿 FFmpeg、无伪造 final Artifact，未完成 `.part` 被回收 |
| `AC-08` | 进程故障恢复 | Codex、受管 Node 或 FFmpeg 退出后 GUI 显示准确状态；重启后 Thread 和任务可对账，运行中本地任务为 interrupted |
| `AC-09` | 能力边界 | 远端任务从 CapabilityCatalog 解析并经 CostQuote 批准；不可用时阻断，不能用 shell 或 raw provider 绕过 |
| `AC-10` | 打包应用 | 干净 macOS arm64 与 Windows x64 环境能准备受校验的 Codex/FFmpeg，并在无系统 PATH/终端依赖下完成 `AC-03` |
| `AC-11` | 分层隔离 | GUI 改动不要求修改 runtime adapter；codex-rs 升级不改变业务 contract；Renderer 无 raw task code、shell 或 FFmpeg argv |
| `AC-12` | 短剧短片闭环 | 完成剧本、分镜、资产、分组、视频片段、失败组重试、字幕和分集合成，形成通过 QA 的 Deliverable |
| `AC-13` | 转绘视频闭环 | 有权使用的源视频完成全范围分析、本地化、资产、生成单元、付费生成、连续性 QA 和成片；多集不得只处理首集 |
| `AC-14` | 口播视频闭环 | 精确稿、授权人物与声音完成片段生成、可选封面/B-roll、字幕、混音和拼接，授权与成本可追溯 |
| `AC-15` | 电商视频闭环 | 经确认的商品事实完成卖点、镜头、缺失资产、片段、CTA、品牌/事实 QA 和平台交付，不编造价格或功效 |
| `AC-16` | 成本与恢复 | 批次部分成功后重启先 reconcile，保留成功 Artifact，只重试失败项；重提有新 quote/approval 且不重复计费 |
| `AC-17` | 交付完整性 | 非媒体输出、缺少 passing QA、output/QA 文件缺失或 hash 改变时拒绝确认，不产生或切换 current Deliverable |

## 16. 未来机会与进入条件

以下方向只记录机会，不进入 v1 backlog 承诺：

| 机会 | 进入条件 |
| --- | --- |
| 平台发布 | OAuth、平台 API、草稿/发布审批、失败重试和审计记录完成 |
| 多人协作 | 身份、权限、同步冲突、审阅意见和云端数据模型完成 |
| 专业时间线 | 明确目标用户、工程格式、非破坏编辑和渲染模型完成 |
| 模板/素材市场 | 版权、签名、版本、定价、下架和本地缓存合同完成 |
| 第三方 Skill 市场 | sandbox、权限、签名、升级和 workflow 兼容策略完成 |

未来新增 Business Profile 或为既有 Profile 接入执行能力时，必须满足：

1. 已有真实 provider/runtime owner。
2. 输入、输出、成本、权限和失败状态可结构化表达。
3. 能进入同一 Project/Plan/Job/Artifact/Deliverable 主链。
4. 有 Gate B 或对应真实外部系统证据。

## 17. v1 完成定义

只有同时满足以下业务条件，LimeShot v1 才可标记完成：

- Business Workspace 固定展示五类 Profile，并由自有 Skill、dynamic tools 和业务门禁驱动完整生产流程。
- 用户能创建 Project、形成 workable Brief、导入和探测 SourceAsset。
- Conversation 可恢复，并与 Project、Codex Thread 保持唯一绑定。
- Agent 能生成带素材映射和缺口的版本化 ProductionPlan。
- 未批准 Plan 不得触发计划内媒体执行，批准后修改必须重新审批。
- 真实 FFmpeg 任务可显示进度、取消、失败、中断和重试状态。
- 每个 final Artifact 能追溯到 Plan 版本、输入素材和 MediaJob。
- 每个媒体 final Artifact 都有同 TaskRun passing `qa-report.v1`，QA 失败不留下成功输出。
- 用户能审阅、确认、导出 Deliverable，且覆盖行为经过批准。
- TaskRun、ProviderTask、MediaJob、CostQuote、ApprovalReceipt 和 CostLedger 可追溯并支持恢复。
- 短剧、转绘、口播和电商分别完成一个真实 provider + 本地合成 Gate B。
- 素材不足、文件改变、runtime 不可用和进程崩溃不产生假成功。
- macOS arm64 与 Windows x64 的打包 Gate B 均完成一个真实素材到 MP4 的业务闭环。
- Provider capability 不可用时明确阻断，不出现生成成功、媒体进度或交付完成等虚假状态。
- GUI、Codex client、BusinessCore、ToolHost、provider adapter 与 media adapter 的依赖方向满足架构分离合同。

## 18. 决策记录

| 决策 | 结果 | 原因 |
| --- | --- | --- |
| 是否固定展示五类业务 Profile | 是 | GUI 负责稳定业务入口，运行时能力矩阵负责阻止虚假生成承诺 |
| 是否复用外部桌面产品壳 | 否 | LimeShot 是独立产品，仅使用 codex-rs runtime |
| 是否复刻五类业务工作流 | 是 | 通过 LimeShot 自有 GUI、Skill、dynamic tools、task scripts、provider/media adapter 独立实现 |
| 是否复制第三方实现资产 | 否（默认） | 未确认迁移授权前只做独立功能复刻，详见 [RESOURCE-MIGRATION.md](./RESOURCE-MIGRATION.md) |
| 是否让 Agent 直接执行计划 | 否 | 生产操作必须经过版本化计划和用户批准 |
| 是否在 v1 做完整时间线 | 否 | 会扩大编辑器和渲染模型，偏离 Agent + 结构化媒体闭环 |
| 是否暴露 provider 原始模型与任务码 | 否 | 仅在业务需要取舍时展示 capability 范围内的产品化方案 |
| 是否采用本地优先 | 是 | 项目事实、素材索引与交付本地优先；远端生成显式披露并经批准 |

本 PRD 定义 LimeShot v1 “为谁做、解决什么问题、交付什么结果”。技术进程、协议、资源供应链与平台实现以同目录 [README.md](./README.md) 为准；若二者冲突，必须先在同一变更中消除冲突，不能由实现自行选择。
