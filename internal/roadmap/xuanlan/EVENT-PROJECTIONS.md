# Codex Event 与 Reverse Request 全量投影表

状态：`current event contract / exhaustive`

## 1. 出口代码

为保证所有协议事实都有去向，本文使用以下出口：

| 代码 | 投影出口 |
| --- | --- |
| `TL` | Conversation 时间线/Item renderer |
| `TP` | Turn 附属计划、Diff、用量或终态 |
| `PI` | Pending interaction，位于 Composer 上方并锚定 item |
| `HS` | 对话页 header/status region |
| `GN` | 应用级通知、设置或全局状态 |
| `DX` | 诊断-only；脱敏、有界、默认不进用户时间线 |

“DX”不是丢弃：必须被类型识别、记录和测试，只是不把底层协议噪声直接暴露给普通用户。

## 2. 72 类 `ServerNotification`

### 2.1 Thread、Turn 与 Hook（1-21）

| # | Method | 出口 | 投影方案 |
| --- | --- | --- | --- |
| 1 | `error` | `TP/HS` | 按 thread/turn 显示错误；`willRetry=true` 显示重试中且不提前宣告 Turn failed |
| 2 | `thread/started` | `HS` | 建立/刷新 Thread metadata、status、name、cwd 安全摘要；不把空 turns 当完整历史 |
| 3 | `thread/status/changed` | `HS/PI` | 投影 `notLoaded/idle/systemError/active`；active flags 驱动 waiting approval/input |
| 4 | `thread/archived` | `GN/HS` | 侧栏移入归档；当前页切只读并保留内容 |
| 5 | `thread/deleted` | `GN` | 从列表移除；当前页显示已删除且禁用输入，不自行删除 Project |
| 6 | `thread/unarchived` | `GN/HS` | 恢复侧栏可见与可操作状态 |
| 7 | `thread/closed` | `HS` | 标记 runtime 已关闭，当前历史仍可读；清理 live spinner/pending input |
| 8 | `skills/changed` | `GN` | 刷新 Composer Skill mention catalog；不进入时间线 |
| 9 | `thread/name/updated` | `HS` | 更新标题与侧栏名称；null 回退 preview/首条用户消息 |
| 10 | `thread/goal/updated` | `HS` | 显示 goal 状态、预算/阶段入口；不映射为 Rust ProductionPlan |
| 11 | `thread/goal/cleared` | `HS` | 清除 goal indicator，不删除历史 goal 相关消息 |
| 12 | `thread/environment/connected` | `HS` | 环境状态显示 connected，附 environment id 的安全标签 |
| 13 | `thread/environment/disconnected` | `HS` | 显示断开与受影响执行能力，禁止假装本地 fallback |
| 14 | `thread/settings/updated` | `HS` | 刷新 model、effort、sandbox/permission/service tier 等下一 Turn 设置 |
| 15 | `thread/tokenUsage/updated` | `TP/HS` | 更新本 Turn 与总 token、context remaining；节流渲染 |
| 16 | `turn/started` | `TL/TP` | 建立 Turn，保持 item 原序；显示 running 和 start time |
| 17 | `hook/started` | `TL/HS` | 建立 Hook 活动；并行相同 Hook 可视觉合并计数，但保留 run id |
| 18 | `turn/completed` | `TL/TP` | 以完整 Turn 覆盖终态；完成/中断/失败、error、timing 均投影并清 pending |
| 19 | `hook/completed` | `TL` | 更新 Hook status、duration、entries；blocked/failed 输出显著显示 |
| 20 | `turn/diff/updated` | `TP` | 替换 Turn 聚合 Diff snapshot；不 append，不代替各 fileChange item |
| 21 | `turn/plan/updated` | `TP` | 更新 checklist：pending/inProgress/completed 和 explanation；与 `plan` item 分开 |

### 2.2 Item 生命周期、流和进程（22-38）

| # | Method | 出口 | 投影方案 |
| --- | --- | --- | --- |
| 22 | `item/started` | `TL` | 以 18 类判别联合创建/更新 item；未知类型 fail visible |
| 23 | `item/autoApprovalReview/started` | `PI/TL` | 在目标 item 显示 Guardian review 中、action、风险占位；无 target 时放全局审批区 |
| 24 | `item/autoApprovalReview/completed` | `PI/TL` | 显示 approved/denied/timedOut/aborted、risk、authorization、rationale，结束 review spinner |
| 25 | `item/completed` | `TL` | completed item 为权威终态，覆盖 delta 草稿并结束对应 item pending 状态 |
| 26 | `rawResponseItem/completed` | `DX` | 仅实验诊断/兼容；不得与正式 item 双重渲染或据此合成终态 |
| 27 | `rawResponse/completed` | `DX` | 记录 response 级诊断与关联 id，不进入普通时间线 |
| 28 | `item/agentMessage/delta` | `TL` | 追加到指定 AgentMessage stream buffer，合批 Markdown 渲染 |
| 29 | `item/plan/delta` | `TL` | 更新 proposed plan 临时草稿；completed text 整体替换 |
| 30 | `command/exec/outputDelta` | `DX/GN` | 独立 `command/exec` API 的输出，不混入 Agent CommandExecution；只在相应 host 工具页显示 |
| 31 | `process/outputDelta` | `DX/GN` | 独立 `process/spawn` 的 base64 stream，按 process handle 投影到专用进程面板 |
| 32 | `process/exited` | `DX/GN` | 终结专用进程面板，显示 exit/signal；不推导 Agent Turn 状态 |
| 33 | `item/commandExecution/outputDelta` | `TL` | 追加指定命令 stdout/stderr 有界 buffer，更新 live preview |
| 34 | `item/commandExecution/terminalInteraction` | `TL/DX` | 显示“已发送终端输入”的遮蔽摘要；processId 只留 main，secret stdin 不下发 |
| 35 | `item/fileChange/outputDelta` | `DX` | deprecated；识别但不覆盖 patch，只记录兼容诊断 |
| 36 | `item/fileChange/patchUpdated` | `TL/TP` | 以完整 `changes[]` 替换 item 当前 Diff snapshot |
| 37 | `serverRequest/resolved` | `PI` | 以 request id 清理跨客户端已解决交互，按钮 disabled 并显示已处理 |
| 38 | `item/mcpToolCall/progress` | `TL` | 更新 MCP 最新进度和有界历史；完成时由 completed item 终结 |

### 2.3 MCP、账号、应用与系统资源（39-51）

| # | Method | 出口 | 投影方案 |
| --- | --- | --- | --- |
| 39 | `mcpServer/oauthLogin/completed` | `GN/PI` | 关闭 OAuth 等待，显示成功/失败并刷新 MCP server status |
| 40 | `mcpServer/startupStatus/updated` | `HS/GN` | 显示 server starting/ready/failed；失败不回退假 MCP |
| 41 | `account/updated` | `GN` | 刷新账号菜单与可用能力，不写对话历史 |
| 42 | `account/rateLimits/updated` | `HS/GN` | 更新 rate limit/重置时间；影响发送能力时在 Composer 明示 |
| 43 | `app/list/updated` | `GN` | 刷新 Apps/connectors catalog 和 mention surface |
| 44 | `remoteControl/status/changed` | `GN` | 更新远程控制设置页/全局 indicator，不进入对话流 |
| 45 | `externalAgentConfig/import/progress` | `GN` | 迁移进度只进入设置/导入任务 UI |
| 46 | `externalAgentConfig/import/completed` | `GN` | 终结导入任务，逐类型显示成功/失败 |
| 47 | `fs/changed` | `GN/DX` | 只路由给对应 watch consumer；不把任意文件变更画成 Agent fileChange |
| 48 | `item/reasoning/summaryTextDelta` | `TL` | 按 `summaryIndex` 更新 reasoning summary part |
| 49 | `item/reasoning/summaryPartAdded` | `TL` | 创建指定 summary part 和视觉分段 |
| 50 | `item/reasoning/textDelta` | `TL` | 按 `contentIndex` 更新 raw reasoning；展示受策略控制 |
| 51 | `thread/compacted` | `TL/DX` | deprecated 兼容；没有对应 ContextCompaction item 时显示一次信息行，避免重复 |

### 2.4 Model、安全、告警与搜索（52-61）

| # | Method | 出口 | 投影方案 |
| --- | --- | --- | --- |
| 52 | `model/rerouted` | `TL/HS` | 显示 from/to model 和 reason 的信息行，更新当前 model indicator |
| 53 | `model/verification` | `HS/DX` | 显示验证中/结果；普通 UI 只展示 allowlisted 结论，详情脱敏 |
| 54 | `turn/moderationMetadata` | `DX` | 安全元数据不直接 stringify 给用户；仅驱动受审核 policy UI |
| 55 | `model/safetyBuffering/updated` | `HS` | `showBufferingUi` 驱动安全缓冲提示，可展示 fasterModel 选择 |
| 56 | `warning` | `HS/GN` | thread-scoped 进入对话 warning 区，否则应用通知；去重并可关闭 |
| 57 | `guardianWarning` | `HS/TL` | 高优先级安全警告，关联当前 Thread；不得被普通 warning 折叠吞掉 |
| 58 | `deprecationNotice` | `GN` | 开发/设置通知，显示 summary/details；不污染用户消息流 |
| 59 | `configWarning` | `GN` | 设置诊断显示 summary/details/path/range；path 由 host 安全显示 |
| 60 | `fuzzyFileSearch/sessionUpdated` | `PI` | 更新 Composer 文件 mention 搜索结果；按 session id 丢弃陈旧响应 |
| 61 | `fuzzyFileSearch/sessionCompleted` | `PI` | 终结搜索 loading，空结果/失败明确显示 |

### 2.5 Realtime、Windows 与登录（62-72）

| # | Method | 出口 | 投影方案 |
| --- | --- | --- | --- |
| 62 | `thread/realtime/started` | `HS/PI` | 显示语音会话已连接、录音/播放状态；建立 realtime session |
| 63 | `thread/realtime/itemAdded` | `TL` | 将 realtime item 以其结构化类型投影到当前 Thread，不 stringify raw payload |
| 64 | `thread/realtime/transcript/delta` | `TL/PI` | 更新临时语音转写，标记 provisional，不能提前写成最终用户消息 |
| 65 | `thread/realtime/transcript/done` | `TL` | 用 final transcript 替换 provisional 文本并结束转写状态 |
| 66 | `thread/realtime/outputAudio/delta` | `PI` | 送入有界音频播放队列；不在 DOM 创建每个 chunk |
| 67 | `thread/realtime/sdp` | `DX` | 由 Electron/WebRTC owner 消费，Renderer 不显示 raw SDP |
| 68 | `thread/realtime/error` | `HS/PI` | 停止录音/播放，显示可恢复错误；不必判定普通 Turn failed |
| 69 | `thread/realtime/closed` | `HS/PI` | 终结 realtime session、释放媒体状态、保留最终 transcript |
| 70 | `windows/worldWritableWarning` | `GN` | Windows 安全警告，显示路径与风险的安全摘要和设置入口 |
| 71 | `windowsSandbox/setupCompleted` | `GN/PI` | 结束 setup flow，显示 success/error 和下一步 |
| 72 | `account/login/completed` | `GN/PI` | 结束登录等待，刷新账号状态；失败保留重试入口 |

## 3. 11 类 `ServerRequest`

Reverse request 必须由 Electron main 的独立 pending map 持有。Renderer 只接收 semantic `PendingInteractionProjection` 和一次性 action token，不能看到 raw JSON-RPC request id 或直接写 protocol response。

| # | Method | Owner | GUI 投影与处理 |
| --- | --- | --- | --- |
| 1 | `item/commandExecution/requestApproval` | Electron + GUI | 命令审批：reason、command、cwd、actions、network context、policy amendment；接受一次/会话/规则、拒绝、拒绝并停止 |
| 2 | `item/fileChange/requestApproval` | Electron + GUI | Patch 审批：Diff、reason、grantRoot；接受一次/会话、拒绝、拒绝并停止 |
| 3 | `item/tool/requestUserInput` | Electron + GUI | 1-3 个问题：单/多选、Other、freeform、secret、auto-resolution 倒计时 |
| 4 | `mcpServer/elicitation/request` | Electron + GUI | `form`、`openai/form`、`url` 三模式；accept/decline/cancel，结构化校验 |
| 5 | `item/permissions/requestApproval` | Electron + GUI | cwd、reason、environment 与 permission profile diff；接受/拒绝，显示作用域 |
| 6 | `item/tool/call` | Electron -> Rust ToolHost | 无直接用户表单；时间线显示 dynamic tool，main 校验 binding 后路由 Rust 并回传结构化结果 |
| 7 | `account/chatgptAuthTokens/refresh` | Electron credential broker | host-only，不进入 Renderer；失败投影登录/凭证通知，绝不显示 token |
| 8 | `attestation/generate` | Electron platform capability | host-only，受支持平台生成；失败为 capability error，不提供伪造 fallback |
| 9 | `currentTime/read` | Electron host | 返回整数 Unix seconds；host-only，不进入 Renderer，也不读取系统时区或用户内容 |
| 10 | `applyPatchApproval` | Electron + GUI legacy | legacy patch 审批兼容；与 v2 item approval 去重，同一动作只显示一个 prompt |
| 11 | `execCommandApproval` | Electron + GUI legacy | legacy exec 审批兼容；与 v2 item approval 去重，不自动接受 |

## 4. Pending Interaction 通用合同

```ts
type PendingInteractionProjection =
  | CommandApprovalProjection
  | FileApprovalProjection
  | PermissionApprovalProjection
  | UserInputRequestProjection
  | McpElicitationProjection;
```

每个 projection 至少包含：

- semantic `interactionId`，仅用于 Renderer action，不等同 raw request id；
- thread/turn/item anchor；
- createdAt、可选 expiresAt/autoResolutionAt；
- `pending | submitting | resolved | expired | disconnected`；
- 本地化标题、说明、结构化选项；
- 是否包含 secret、network、filesystem 或 session-wide effect 的风险标签。

通用规则：

- 同一 Thread 同时存在多个请求时按 started time 排队，并显示数量；不能后来的 prompt 覆盖前一个。
- 当前打开其他 Thread 时显示跨 Thread 待处理入口，点击切回对应 Thread。
- submit 后立即 disabled，等待 server response 或 `serverRequest/resolved`；失败可重试，但不能重复提交已经 resolved 的请求。
- Turn 完成、thread closed、断线或 server resolved 时终止交互；Renderer 定时器不能单独宣告权威 resolved。
- secret 输入使用 password control，不进入日志、遥测、React error boundary 或历史 item。

## 5. 审批选项全集

### 5.1 Command execution

- `accept`：仅本次批准。
- `acceptForSession`：会话范围批准，必须明确范围。
- `acceptWithExecpolicyAmendment`：应用 proposed exec policy；展示规则摘要后确认。
- `applyNetworkPolicyAmendment`：展示 host/protocol/action 和持久范围。
- `decline`：拒绝命令，Agent 可继续。
- `cancel`：拒绝并中断 Turn，需使用危险后果文案。

### 5.2 File change

- `accept`
- `acceptForSession`
- `decline`
- `cancel`

### 5.3 Guardian auto review

状态全集：`inProgress`、`approved`、`denied`、`timedOut`、`aborted`。风险全集：`low`、`medium`、`high`、`critical`。授权全集：`unknown`、`low`、`medium`、`high`。这些是审批辅助事实，不能由 Renderer 自己覆盖用户决定。

## 6. `requestUserInput` 表单

- question 数量为 1-3；多问题使用 stepper，不用嵌套 modal。
- 有 options 时用 radio/checkbox；`isOther=true` 提供 freeform Other。
- 无 options 时使用 freeform textarea；`isSecret=true` 使用 secret input 且禁止回显。
- answer wire 是每 question id 对应 `answers[]`；UI 不把多选拼成一个逗号字符串。
- `autoResolutionMs` 显示可访问倒计时；自动解决发生后 UI 只响应 server resolved，不自行构造答案。
- 完成后可在时间线保留“已回答 N 个问题”的非敏感 receipt；secret 和自由文本默认不回显。

## 7. MCP Elicitation 三模式

| mode | UI |
| --- | --- |
| `form` | 按 `McpElicitationSchema` 渲染 boolean、number/integer、string、enum、array 等受支持字段 |
| `openai/form` | 使用 capability-gated schema renderer；未知字段提供明确 unsupported，不猜测提交结构 |
| `url` | 显示 server、message、真实 URL host；用户明确点击后由 host 打开，完成后 accept/decline/cancel |

所有模式显示 MCP server 身份和请求 message。表单做 required、format、range、enum 等客户端校验，但 server response 仍是权威。`_meta` 只处理 allowlisted action metadata。

## 8. 非 Item 页面投影

### 8.1 Turn plan

`turn/plan/updated` 是执行 checklist，不是 `ThreadItem.plan`，也不是 Rust `ProductionPlan`。每步状态：`pending`、`inProgress`、`completed`。页面可在活动区展示紧凑 checklist，Turn 完成后保留最终状态。

### 8.2 Turn diff

`turn/diff/updated` 是本 Turn 全部文件修改的聚合 snapshot。放在 Turn 底部“本轮变更”面板，按需展开；具体文件工具行仍由 `fileChange` item 呈现。

### 8.3 Token usage

显示 total/last 的 total、input、cached input、cache write、output、reasoning output 和 context window。普通视图只显示 context remaining；完整明细在 usage popover。

### 8.4 Thread settings/status

Header 显示当前 model、reasoning、service tier、permission/sandbox、environment 与 active flags。`waitingOnApproval`、`waitingOnUserInput` 同时影响 pending interaction badge 和侧栏 Thread 状态。

## 9. Hook 投影

Hook 使用 `HookRunSummary`：event、handler type、execution mode、scope、source、status、status message、timing、entries。

- running Hook 进入低干扰 live activity；相同 Hook 并行可聚合为 `xN`。
- completed 且无输出时折叠为完成行。
- stdout/stderr/feedback/context 等 entry 按 kind 显示，长内容截断并提供完整 transcript。
- blocked/failed 显著显示 status message，并说明是否阻断当前动作。
- source path 只显示安全相对位置；点击由 host 处理。
- `hookPrompt` 与对应 `hookRunId` 关联展示，不重放 Hook。

## 10. 状态终结表

| 触发 | 必须终结的 UI |
| --- | --- |
| `item/completed` | item spinner、item progress、对应输出草稿 |
| `turn/completed: completed` | Turn spinner、可结束的 Hook live row、无效 pending interaction |
| `turn/completed: interrupted` | 所有运行 item 改中断态，保留部分输出 |
| `turn/completed: failed` | Turn error + 运行 item 失败/中断态 |
| `serverRequest/resolved` | 对应表单/审批按钮 |
| `thread/closed` | Thread live status、全部 pending interaction |
| transport EOF/crash | 所有提交中交互转 disconnected，等待 resume/read 对账 |

## 11. 全量覆盖测试

- 18 个 ThreadItem fixture：started、delta/progress、completed、replay 各至少一条；有状态的类型覆盖全部 terminal status。
- 72 个 notification fixture：每个 method 断言唯一出口，不允许 default silent return。
- 11 个 reverse request fixture：断言 owner、semantic projection/host-only 路由和 response mapping。
- 参数化覆盖 UserInput 7 类型、CommandAction 4 类型、Collab tool 5 类型、Agent status 7 类型、WebSearch action 4 类型。
- MCP content 覆盖 text/image/audio/resource/resourceLink/unknown JSON、structuredContent 和 error。
- approval 覆盖 accept/session/policy/network/decline/cancel、Guardian 五终态。
- 乱序、重复、late delta、completed overwrite、disconnect、resume/read、itemsView 非 full。
- 未知 item/notification fail visible，未知 reverse request fail closed。
- Electron Gate B 至少真实验证 Agent Markdown、Search、Shell output、File Diff、MCP、dynamic tool、审批、requestUserInput、interrupt 与历史恢复。
