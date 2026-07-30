# Codex ThreadItem 全量渲染合同

状态：`current rendering contract / exhaustive`
上游集合：固定 Codex `0.145.0` experimental schema，共 18 类

## 1. 通用 Item 外壳

每个 item 使用 `threadId + turnId + item.id` 定位，保留 `item.type` 判别。通用外壳只拥有以下显示能力，不吞掉各类型的结构字段：

- icon、动词标题、来源、状态、耗时；
- 折叠/展开与“打开完整记录”；
- started/completed 时间和 live/replay 来源；
- pending interaction 锚点；
- error、declined、interrupted 和 unknown 降级。

连续工具可以放进 `ActivityCluster`，但聚合只影响视觉，不能合并 identity、生命周期或输出。

## 2. 全量矩阵

| # | `ThreadItem.type` | 主投影 | 默认形态 | 关键交互 |
| --- | --- | --- | --- | --- |
| 1 | `userMessage` | 用户消息 | 右侧消息块 | 图片/音频预览、Skill/Mention、复制 |
| 2 | `hookPrompt` | Hook 上下文 | 默认隐藏的系统活动 | 展开 Hook 来源与片段 |
| 3 | `agentMessage` | Assistant 回复 | 无卡片 Markdown | 链接、代码复制、memory citation |
| 4 | `plan` | Proposed Plan | 独立计划块 | 展开、复制，完成态替换流草稿 |
| 5 | `reasoning` | Reasoning | 折叠活动 | 展开 summary；raw content 受策略控制 |
| 6 | `commandExecution` | Shell/探索活动 | 紧凑命令行 | 输出、审批、完整 transcript、终止锚点 |
| 7 | `fileChange` | 文件修改 | 紧凑文件摘要行 | 打开 Review 工作区、审批、选择文件 |
| 8 | `mcpToolCall` | MCP 工具 | server/tool 活动行 | 参数、progress、内容/资源/媒体结果 |
| 9 | `dynamicToolCall` | LimeShot 业务工具 | namespace/tool 活动行 | 参数、text/image/audio 结果、业务详情 |
| 10 | `collabAgentToolCall` | 多 Agent 调度 | Agent 活动行 | 打开/切换目标 Agent |
| 11 | `subAgentActivity` | 子 Agent 生命周期 | 轻量事件行 | 打开 Agent thread |
| 12 | `webSearch` | Web Search | 搜索活动行 | query/URL、结果列表、打开外链 |
| 13 | `imageView` | 查看图片 | 图片活动 + 缩略图 | 放大、在 host 中定位 |
| 14 | `sleep` | 等待 | 倒计时活动行 | interrupt Turn |
| 15 | `imageGeneration` | 图片生成 | 生成活动 + 结果图 | 预览、打开保存位置、错误详情 |
| 16 | `enteredReviewMode` | Review 边界 | 模式分隔条 | 展开 review 说明 |
| 17 | `exitedReviewMode` | Review 边界 | 结果分隔条 | 展开 review 说明/结果 |
| 18 | `contextCompaction` | Context 压缩 | 信息分隔条 | 无副作用，仅说明上下文已压缩 |

## 3. `userMessage`

字段：`id`、`clientId`、`content[]`。必须按 `content` 原序渲染全部 7 类 `UserInput`：

| `UserInput.type` | 投影 | 行为 |
| --- | --- | --- |
| `text` | 文本与 `text_elements` 富片段 | 清理控制字符；保留换行；特殊片段可点击 |
| `image` | 远端图片缩略图 | lazy load、失败占位、点击 lightbox，不把 URL 当正文 |
| `localImage` | host 介导的本地图片 | Renderer 不直接读 path；通过安全 media URL 展示 |
| `audio` | 远端音频播放器 | 时长、播放/暂停、加载失败态 |
| `localAudio` | host 介导的音频播放器 | 不暴露真实系统路径；禁止自动播放 |
| `skill` | Skill token/chip | 显示 name，点击打开只读 Skill 摘要 |
| `mention` | 文件/资源 mention | 显示 name，点击通过 host capability 打开/定位 |

`text_elements` 用于文本内部特殊范围，必须校验 UTF-8 byte range；非法范围跳过样式而不是让渲染崩溃。恢复时不得只取 text 而丢掉附件。

## 4. `hookPrompt`

字段：`fragments[{text, hookRunId}]`。它是持久化上下文事实，不是普通用户消息。

- 默认不占据主阅读流，归入相邻 Hook 活动的“注入上下文”区域。
- 展开后逐 fragment 显示截断文本和关联 `hookRunId`。
- 只读，不提供重放 Hook 按钮。
- replay 不触发 Hook；若找不到对应 Hook 通知，仍显示“Hook 上下文”可诊断行，不能丢弃。

## 5. `agentMessage`

字段：`text`、`phase`、`memoryCitation`。

- `text` 使用支持 GFM 的 Markdown renderer：标题、列表、表格、引用、代码块、行内代码、链接和图片均需安全处理。
- Streaming 使用 `item/agentMessage/delta`；completed item 的 `text` 为权威终态。
- `phase` 用于区分 commentary/final 等消息阶段时，应以低干扰标签表达，不能改变 item 顺序。
- `memoryCitation.entries` 显示引用标记；展开显示 `path`、行范围、note。点击路径必须经过 host allowlist。
- `memoryCitation.threadIds` 可显示“来自历史会话”，通过 semantic thread action 打开，不暴露 raw method。
- 空的 started item 显示稳定高度的 streaming caret；完成后为空则移除视觉正文但保留可诊断 identity。

## 6. `plan`

这是模型提出的 Markdown 计划，不等同于 Rust `ProductionPlan`。

- 标题为“Proposed Plan/建议方案”，正文按 Markdown 渲染。
- `item/plan/delta` 只形成临时草稿；completed `plan.text` 必须整体替换草稿，上游明确两者可能不一致。
- 默认展开；长计划可折叠，但首屏显示标题和前两行摘要。
- 不显示“批准业务计划”按钮，避免与 Rust 业务审批混淆。

## 7. `reasoning`

字段：`summary[]`、`content[]`。

- 默认仅展示 summary，折叠标题使用“思考中/已思考”。
- `summaryPartAdded(summaryIndex)` 创建分段；`summaryTextDelta` 追加到指定 summary；不能合并成单字符串。
- `contentIndex` 同理更新 raw reasoning content。
- raw `content` 默认不展示；只有产品策略与上游配置明确允许时才放入二级“原始推理”区域。
- completed item 全量覆盖流式数组；不同 summary part 之间保留分隔。
- interrupted 时保留已到达 summary，并标注“思考已中断”，不得永久 spinner。

## 8. `commandExecution`

字段：`pluginId`、`scriptPath`、`command`、`cwd`、`processId`、`source`、`status`、`commandActions[]`、`aggregatedOutput`、`exitCode`、`durationMs`。

### 8.1 友好摘要

根据 `commandActions` 优先显示结构化标题：

| action | 标题 | 详情 |
| --- | --- | --- |
| `read` | 读取 | `name/path` |
| `listFiles` | 列出文件 | path |
| `search` | 搜索 | query + path |
| `unknown` | 运行命令 | command |

一条 command 含多个 action 时按原序列出；原始 command 始终可展开查看。不得仅凭命令字符串自行再实现 Shell parser。

### 8.2 状态与输出

- started：现在时标题、spinner、command、cwd 相对显示。
- output delta：追加到有界日志 buffer；ANSI 转为安全样式或剥离危险控制序列。
- live preview：显示头部和尾部，省略区标记“另有 N 行”；完整输出进 transcript drawer。
- completed：显示 exit code、duration；`exitCode=0` 成功，非零失败详情，但最终视觉状态仍以 `status` 为准。
- `declined` 单独显示用户拒绝，不标成执行失败。
- `pluginId/scriptPath` 显示可信插件来源；不能让命令输出伪造来源 badge。
- `source=userShell` 显示用户 Shell；`unifiedExecInteraction` 作为已有 process 的交互，不重复渲染成新独立任务。

### 8.3 交互

- `item/commandExecution/requestApproval` 在对应 item 锚定审批表面。
- `terminalInteraction` 只作为“已向终端发送输入”的安全摘要；默认遮蔽可能为 secret 的 stdin。
- process 可交互能力只能由明确 semantic API 提供；Renderer 不直接获得 raw PTY handle 或任意 stdin channel。
- Turn 运行时提供全局 interrupt；单进程 terminate 只有上游固定协议和 main allowlist 已支持时才显示。

## 9. `fileChange`

字段：`changes[{path, kind, diff}]`、`status`。

- 摘要显示新增/修改/删除/重命名文件数与行数统计。
- 时间线只显示紧凑摘要，不内联文件或 Turn diff；点击后打开 Review 工作区，并默认选中该 item 的首个文件。
- 桌面 Review 保留固定宽度对话列，Diff 占主面积，文件导航位于最右并按路径树展示；选中文件后在独立 viewer 显示 diff。Diff 使用 parser 和语法高亮，显示 hunk、行号、insert/delete/context，并对长内容做有界预览和水平滚动。
- `item/fileChange/patchUpdated` 替换当前 changes snapshot，不把重复 diff 当字符串 append。
- `item/fileChange/outputDelta` 已 deprecated 且当前不再发送；若收到只进兼容诊断，不能覆盖结构化 patch。
- approval 展示 reason 和可选 grantRoot；接受/本次拒绝/拒绝并停止映射上游决定。
- completed/failed/declined 分开；失败时保留 diff 供检查。

## 10. `mcpToolCall`

字段：`server`、`tool`、`arguments`、`appContext`、deprecated `mcpAppResourceUri`、`pluginId`、`result`、`error`、`durationMs`。

### 10.1 标题与参数

- 标题显示 `server / tool`；如有 `appContext.appName/actionName`，优先用可读名称，技术名作为次级信息。
- 参数用 JSON tree/table 展示，默认折叠并遮蔽 token、password、authorization 等敏感键。
- `pluginId`、connector/link 上下文显示可信来源；`appContext.resourceUri` 可提供 host 介导的“打开资源”。
- deprecated `mcpAppResourceUri` 只做读取兼容，优先 `appContext.resourceUri`。

### 10.2 进度和结果

- started 显示“正在调用”；progress notification 维护有界进度列表，主行显示最新一条。
- result.content 逐 block 渲染：text、image、audio、embedded resource、resource link、未知 JSON。
- `structuredContent` 用 schema-aware JSON viewer，不与 text content 重复铺满页面。
- `_meta` 默认不展示，只读取 allowlisted UI metadata。
- item `status=failed` 或 `error` 必须形成失败态；`McpToolCallResult` 本身只负责内容，不由 Renderer 从内容文本猜测成败。
- image/audio 必须有真实预览控件；blob/resource 只通过 host capability 读取。
- 多输出保持原顺序并限制预览高度；完整结果进 drawer。

### 10.3 MCP elicitation

`mcpServer/elicitation/request` 不是这个 item 的 result，而是独立 reverse request。若能以 thread/turn 关联，则在 MCP item 附近显示 pending 锚点；实际表单在 Composer 上方完成。

## 11. `dynamicToolCall`

字段：`namespace`、`tool`、`arguments`、`status`、`contentItems`、`success`、`durationMs`。

- LimeShot 业务工具显示 domain icon、namespace/tool 和业务可读标题，但技术 identity 可在详情查看。
- arguments 用工具 schema 渲染 key/value，不允许渲染任意 HTML。
- `item/tool/call` reverse request 由 Electron 路由 Rust ToolHost；UI 只显示运行状态，不能直接执行。
- output `inputText` 按文本/Markdown策略渲染；`inputImage` 显示安全图片；`inputAudio` 显示播放器。
- `status` 表示调用生命周期，`success` 表示业务返回；completed + `success=false` 仍显示业务失败。
- 与 Rust Task/Artifact 的业务投影通过稳定业务 id 关联，但不把 Turn 完成推导成 Task 完成。

## 12. `collabAgentToolCall`

工具全集：`spawnAgent`、`sendInput`、`resumeAgent`、`wait`、`closeAgent`。

通用字段：sender、receivers、prompt、model、reasoningEffort、`agentsStates`。

| tool | 运行中 | 完成/失败投影 | 交互 |
| --- | --- | --- | --- |
| `spawnAgent` | 正在创建 Agent | Agent 名称、model、effort、prompt 摘要 | 打开新 Agent |
| `sendInput` | 正在发送 | 目标 Agent 与 prompt 摘要 | 打开目标 Agent |
| `resumeAgent` | 正在恢复 | running/interrupted/errored 等状态 | 切换到 Agent |
| `wait` | 正在等待多个 Agent | 每个 receiver 的最终状态/message | 打开 Agent 列表 |
| `closeAgent` | 正在关闭 | 已关闭或失败 | 查看最终 thread |

`agentsStates` 状态全集：`pendingInit`、`running`、`interrupted`、`completed`、`errored`、`shutdown`、`notFound`。多 Agent 行显示友好 nickname/role；raw thread id 仅在诊断详情显示。

## 13. `subAgentActivity`

kind 全集：`started`、`interacted`、`interrupted`。

- 显示 `agentPath` 的“已启动/已交互/已中断”事件。
- `started` 更新 Agent switcher 的 running hint；`interrupted` 清除；`interacted` 只记录活动，不改变终态。
- 点击通过 semantic action 打开 `agentThreadId`；不得让 Renderer 直接调用 `thread/read`。

## 14. `webSearch`

字段：`query`、`action`、`results`。

action 全集：

| action | 标题与详情 |
| --- | --- |
| `search` | “正在搜索/已搜索”，显示 query 或 queries 首项及总数 |
| `openPage` | “正在打开/已打开页面”，显示 URL host + path |
| `findInPage` | “正在页内查找/已查找”，显示 pattern + URL |
| `other`/null | 使用 item.query 的通用搜索标题 |

- started 使用 spinner；completed 改为过去时并显示结果数。
- `results` 是上游允许演进的 opaque JSON，先通过结构守卫识别 title/url/snippet/source 等 allowlisted 字段；未知字段不直接 stringify 整块。
- 结果列表默认显示 3 条，可展开全部；外链经 Electron `shell.openExternal` 的 URL allowlist 打开。
- URL 显示真实 host，禁止结果内容伪造应用内按钮。

## 15. `imageView`

- 标题“已查看图片”，显示 host 安全化后的相对位置。
- 通过 Electron 创建受控 media handle/URL，显示真实缩略图；不存在、权限不足、格式不支持都有明确状态。
- 点击打开 lightbox；“在文件中显示”是 host action，绝对 path 不下发 Renderer。
- replay 只重新读取预览，不触发任何工具调用。

## 16. `sleep`

- started 后显示“等待 N 秒”和可访问倒计时；reduced motion 下使用静态进度。
- 由 item/turn 生命周期结束，不由前端计时器宣告权威完成。
- 用户只能 interrupt Turn，不能由前端假装 sleep 已取消。
- replay 显示“等待了 N 秒”的完成记录，不重新倒计时。

## 17. `imageGeneration`

字段：`status`、`revisedPrompt`、`result`、`savedPath`。

- 运行中：稳定尺寸的生成占位、状态标题。
- 成功：优先展示 `result` 中可验证的图片；若为引用/URL，先经安全 media resolver。
- 显示 revised prompt，可复制但默认折叠长文本。
- `savedPath` 通过 host 介导显示相对位置和“打开/定位”操作。
- failed：失败摘要 + 可展开 result/error 文本，不显示破图。
- completed item 为权威结果；开始通知不应清空已经渲染的其他活动。

## 18. `enteredReviewMode`

- 在时间线插入“进入代码审查”模式分隔条，显示 review 摘要。
- Composer 显示 review mode 状态；若当前 Turn 不接受直接输入，则进入队列提示。
- replay 只恢复模式边界和历史，不启动新 review。
- 不把 review 文本伪装成 Assistant final answer。

## 19. `exitedReviewMode`

- 插入“结束代码审查”分隔条，可展开 review 结果。
- 清理对应 mode UI，但不自行判断 Turn 已完成。
- 与 entered 通过顺序配对；缺失 entered 时仍 fail visible 渲染退出事件。

## 20. `contextCompaction`

- 显示低干扰信息行“上下文已压缩”。
- 不展示或保存合成后的完整 history；Codex 仍是唯一 history owner。
- deprecated `thread/compacted` notification 只作为兼容触发，同一个 compaction 不重复显示。
- 恢复以持久化 `ContextCompaction` item 为准。

## 21. 未知 Item

升级后遇到未知 `type` 时：

- 时间线显示“暂不支持的活动：type”，带 warning icon；
- 保留 id、type、时间和脱敏字段名列表，不显示未经审核的原始值；
- 记录协议版本、method 和 schema drift 遥测；
- 不阻断同 Turn 后续 item；
- 若未知 item 关联 pending reverse request，仍必须使用通用 pending interaction 处理，不能自动批准或自动失败。
