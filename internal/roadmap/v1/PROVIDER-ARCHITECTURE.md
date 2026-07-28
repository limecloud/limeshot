# LimeShot v1 Provider 与任务架构

状态：`current / provider selection pending`
日期：`2026-07-28`

## 1. 范围与主链

本文定义图片、视频、语音、ASR 和视频分析服务如何进入 LimeShot。Provider 不是 Agent runtime，也不直接暴露给 Renderer 或 Codex：

```text
Codex item/tool/call
  -> Electron Main route
  -> Rust Business Service tool/call
  -> ToolHost schema / Project scope / approval
  -> BusinessCore capability + quote policy
  -> Provider adapter
  -> official HTTP/SDK
  -> reconcile / download / verify
  -> Artifact repository
  -> task projection
```

Renderer、Skill、Codex 和 Electron main 均不得直接调用 provider HTTP/SDK 或持有 provider 凭证。Provider 网络边界归 Rust Business Service 内的 ToolHost adapter；endpoint、raw model key、task code 和响应对象不进入 semantic IPC 或 Codex input。

## 2. 领域对象

| 对象 | 作用 | Owner |
| --- | --- | --- |
| `CapabilityDescriptor` | 稳定业务能力、输入输出、限制、价格与 availability | resource catalog + adapter discovery |
| `ProviderAccount` | 账户、区域、余额、配额和 credential reference | credential broker + account repository |
| `CostQuote` | 精确 scope、模型快照、单价、数量、总额与有效期 | BusinessCore |
| `ApprovalReceipt` | 用户对 quote hash、资产授权和执行范围的批准 | BusinessCore + project repository |
| `TaskRun` | 一次批准后的业务执行和子任务聚合 | BusinessCore + project repository |
| `ProviderTask` | provider 异步任务、幂等键、状态、成本与输出 | provider adapter + task repository |
| `AssetRecord` | 输入/输出资产来源、授权、引用和 lineage | artifact repository |

TaskRun 不复制 Codex Turn。Turn 可以请求 TaskRun，TaskRun 在 Turn 结束后继续执行；其终态来自 provider reconcile 和 Artifact 验证。

## 3. CapabilityCatalog

Renderer、Profile、Skill 和 BusinessCore 只引用稳定 `capabilityId`：

```text
image.generate
video.generate
video.image_to_video
video.talking_head
audio.tts
audio.asr
video.analyze
```

每项 capability 至少声明：

- adapter id/version、provider model snapshot 和区域。
- 输入/输出模态、MIME、大小、数量与引用策略。
- 画幅、分辨率、时长、语言、声音和人物限制。
- 价格单位、估算规则、并发、超时和轮询策略。
- `available/degraded/unavailable/deprecated` 与用户可解释 reason code。
- 真人、声音、版权、内容安全和地域策略。

目录由两层组成：仓库内受签名静态合同，以及 adapter 的运行时 discovery 快照。运行时快照不能扩展静态合同未声明的权限。

## 4. ProviderPort

每个 adapter 实现同一语义：

```ts
interface ProviderPort {
  listCapabilities(): Promise<CapabilitySnapshot[]>;
  quote(input: NormalizedTaskInput): Promise<ProviderQuote>;
  prepareAssets(input: AssetPreparationInput): Promise<PreparedAsset[]>;
  submit(input: ApprovedTaskInput): Promise<ProviderTaskSnapshot>;
  read(taskRef: ProviderTaskRef): Promise<ProviderTaskSnapshot>;
  cancel(taskRef: ProviderTaskRef): Promise<ProviderTaskSnapshot>;
  download(taskRef: ProviderTaskRef, grant: DestinationGrant): Promise<DownloadedOutput[]>;
  readBalance(accountRef: AccountRef): Promise<AccountBalance>;
}
```

接口名只表达合同；具体实现可为 Rust adapter 或由 Rust ToolHost 调用的受管 Node task。选择依据是官方 SDK、跨平台支持和安全边界；实现不得进入 Electron renderer/main，也不得增加第二套 Agent runtime。

adapter 负责 normalized input lowering、鉴权、状态归一化、rate limit、退避、对账、下载和 provider 错误分类。adapter 不拥有 Profile、业务阶段、GUI 文案、批准规则或 Artifact 最终成功判定。

## 5. 状态机与恢复

### 5.1 ProviderTask

```text
prepared -> submitting -> pending -> running
  -> downloading -> verifying -> succeeded
  -> failed / canceling -> canceled / unknown
```

- `submitting` 前持久化 idempotency key、quote hash、scope hash 和 account reference。
- timeout 或进程退出后先 read/reconcile，不直接重提。
- provider 不支持原生幂等时，adapter 必须保存 submit attempt 和外部 task id；无法证明未提交时进入 `unknown`，等待人工处理。
- 只有下载结果通过 MIME、size、hash、解码和业务 contract 验证后才能 `succeeded`。

### 5.2 TaskRun

```text
draft -> awaiting_approval -> queued -> running
  -> partially_succeeded -> succeeded
  -> failed / canceling -> canceled / interrupted
```

TaskRun 聚合 ProviderTask、MediaJob 和 Artifact 引用。部分失败保留成功结果和已花成本；重试只创建失败 scope 的新 quote/approval，不覆盖历史。

## 6. 报价、批准与记账

报价计算至少绑定：capability、model snapshot、normalized input hash、输入资产 hash、数量、时长/分辨率、单价、币种、税费口径、有效期和 provider account。

执行前必须同时满足：

1. quote 未过期且价格快照未变化。
2. scope、Brief/Plan 版本和输入资产 hash 未变化。
3. 余额/配额足够。
4. 付费、真人、声音、版权和远端上传批准齐全。
5. adapter capability 仍为 available/degraded-allowed。

ProviderTask 结束后写入实际 cost。估算与实际不一致必须保留差异，不允许覆写原 quote。

## 7. 资产准备与下载

- ToolHost 只向 adapter 传入已授权的 `AssetRecord`，不传任意本地路径。
- 上传前校验 MIME、大小、hash、引用数量、人物/声音授权、provider policy 和 region。
- provider 临时引用记录有效期，过期后重新准备但不得改变业务资产身份。
- 下载写入 Project workspace 内的 `.part`，校验后原子重命名。
- 拒绝路径穿越、符号链接逃逸、意外重定向、超限文件和 MIME 欺骗。
- 原始 provider response 仅存脱敏摘要；凭证、签名 URL 和完整用户内容不写普通日志。

## 8. ToolHost 产品面

Provider 动作只作为 dynamic tool 或 main 内部命令存在：

```text
capability_list
cost_quote
approval_record
task_start
task_read
task_cancel
artifact_list
```

`task_start` 必须同时验证 Codex `threadId/turnId`、Project binding、tool schema、批准、quote 和 workspace grant。Renderer 使用对应 semantic API 审阅/批准和读取 task projection，但不能提交 raw provider request。

## 9. 凭证与网络安全

- 凭证保存在 OS keychain，通过不可逆 credential reference 引用。
- 凭证不进入 Codex input、dynamic tool result、SQLite 普通字段、Artifact 或诊断包。
- adapter 固定 HTTPS origin、重定向策略、timeout、response 大小和 TLS 验证。
- 代理、证书和地域策略必须显式配置，不继承未知 shell 环境。
- provider 日志默认脱敏 authorization、query token、signed URL、用户路径和输入内容。

## 10. Provider 选择门禁

候选 provider 必须提供可验证的官方文档、商业使用条款、数据处理与地域说明、稳定鉴权、能力/限制、价格、异步任务读取和取消语义。只存在参考应用私有 endpoint/task code 的能力保持 unavailable。

v1 最低能力矩阵：

| Capability | 最低验收 |
| --- | --- |
| `image.generate` | reference policy、成本、下载与图像解码 |
| `video.generate` / `video.image_to_video` | 异步任务、取消/对账、视频解码 |
| `video.talking_head` | 人物与声音授权门禁 |
| `audio.tts` | voice catalog、语言、试听与授权 |
| `audio.asr` | 时间戳、字幕 Artifact 与长音频限制 |
| `video.analyze` | 全时长覆盖、结构化时间线与实体结果 |

## 11. 验证与完成定义

- contract fixture 覆盖 quote、submit、pending、success、failure、cancel、rate limit 和 malformed response。
- crash/restart 测试证明 reconcile 不重复创建任务或扣费。
- negative test 证明 Renderer、Skill 和 Codex 无法获取 credential、endpoint、raw model key 或绕过审批。
- 下载测试覆盖 redirect、超限、MIME 欺骗、路径穿越、损坏媒体和原子落盘。
- 每个进入 available 的 capability 至少完成一次真实 sandbox Gate B。
- 未选择或未合法接入的 provider 保持 unavailable，不使用 mock 伪装产品完成。
