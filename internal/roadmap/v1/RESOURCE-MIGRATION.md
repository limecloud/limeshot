# LimeShot v1 资源迁移与独立实现规格

状态：`current / rights evidence required`
日期：`2026-07-28`

## 1. 决策

`shotfun-core`、`redraw`、`koubo` 等目录表达的业务能力可以进入 LimeShot 规划，但“能力可复刻”不等于“文件可复制”。迁移分为三类：

1. LimeShot 已有原创或明确兼容许可证的资源，可直接进入 current 目录。
2. 责任方拥有著作权或书面迁移授权的资源，经逐文件 manifest、扫描和改造后迁入。
3. 无可验证授权的资源，只提取业务需求和输入输出合同，独立重建实现。

参考桌面应用的 `.app` bundle、下载 CDN、内部目录、私有 API、账号体系、品牌和媒体样例不是 LimeShot 生产资源来源。Codex 必须来自 OpenAI 官方 release；Node、FFmpeg 和 Provider 分别使用可审计的独立来源。

## 2. 目标资源结构

```text
resources/
  codex/                # Electron-owned Codex release manifest
  runtime/              # Rust-owned Node / FFmpeg release manifest
  skills/
    core/
    universal/
    short-form/
    redraw/
    talking/
    commerce/
  tasks/                # 首个获准的 managed Node task 落地时创建
  artifacts/            # artifact contract catalog
  providers/            # provider-neutral capability catalog
  services/             # voice/video/ASR/analysis service catalog
  migration-manifests/  # rights/source/hash/target/review evidence
schemas/
  artifacts/
  tasks/
```

代码 owner：

```text
resources/skills -> Codex Skills extra roots
resources/codex -> Electron Codex resource supervisor
首个 task 落地后的 resources/tasks -> ToolHost -> managed Node
resources/providers/services -> ToolHost provider adapters
resources/artifacts/schemas -> BusinessCore + artifact repository
structured media operations -> ToolHost -> managed FFprobe/FFmpeg
```

Codex manifest 只供 Electron 使用；Rust Business Service 只能管理 Node/FFmpeg 等业务执行资源。旧 Rust Agent App Server、RuntimeCore 或 WorkflowRuntime 不再是任何资源的 owner。

## 3. 分类

### 3.1 Current

- 本仓库独立编写的 PRD、Skill、schema、provider-neutral catalog 和 service catalog。
- 固定 `rust-v0.141.0` 的 OpenAI 官方 Codex release 及其 hash/license/NOTICE。
- 经过明确来源、许可证和完整性校验的 Node 与 FFmpeg 发行物。
- 经批准迁移 manifest 登记的源文件。

### 3.2 Conditional

- `shotfun-core`、`redraw`、`koubo` 中责任方确实拥有权利的 Skill、脚本、contract 和目录数据。
- 第三方开源依赖中许可证允许商业使用、修改与再分发的代码。
- 有明确授权范围的模板、图标、图片、音频和视频。

进入 current 前必须记录 source repository/revision、rights evidence、source/target hash、license、NOTICE、修改说明和责任开发者批准。

### 3.3 Clean-room

- 只有 bundle 或截图、没有源仓库和授权证据的能力。
- 私有 endpoint、task code、账号、积分、模型目录和错误码。
- 第三方 prompt/Skill 具体表达、视觉模板、品牌资产和样片。
- 依赖旧技术栈或绕过 ToolHost 权限的实现。

### 3.4 Dead / forbidden-to-introduce

- 参考应用绝对路径、CDN、update manifest 和资源探测。
- API key、token、cookie、账号、客户数据和私人素材。
- Renderer 或 Skill 中的 provider HTTP、shell、FFmpeg argv 和任意脚本路径。
- 未登记的二进制、archive、模板、图片、音频或视频。
- 把旧 Rust App Server/RuntimeCore 作为迁移目标。

## 4. 业务能力映射

### 4.1 `shotfun-core`

| 参考能力 | LimeShot current owner |
| --- | --- |
| Project/Profile/Brief/Plan | BusinessCore + project repository |
| Agent conversation | managed Codex Thread/Turn/Item |
| Skills | `resources/skills/**` + Codex Skills |
| 业务工具 | dynamic tools + ToolHost |
| account balance / cost | Provider adapter + BusinessCore ledger |
| artifact store/output | workspace grant + artifact repository |
| media/voice/video services | provider adapter catalog |
| local media | structured ToolHost media operations |

不能把参考项目的 service 或 CLI 原样放进 Electron main。可复用脚本必须缩成单一任务、登记在 catalog、由受管 Node 执行，并且不拥有凭证、批准或最终 Artifact 状态。

### 4.2 `redraw`

`redraw` 保留为 LimeShot 领域名。业务阶段如下：

| Stage | 输入 | 结构化输出 | 门禁 |
| --- | --- | --- | --- |
| ingest | 源视频、目标语言、画幅 | AssetRecord、probe report | 文件有效且用户有权使用 |
| source analysis | proxy、抽帧、ASR、理解结果 | SourceTimeline、SourceShot、EntityRegistry | 全时长覆盖、时间线无缺口 |
| localization | 源事实、目标市场 | LocalizationContract | 用户确认不可推断项 |
| target assets | 角色/场景/道具需求 | AssetRegistry | 真人/声音/版权批准 |
| target shots | 源镜头、目标资产 | TargetShot、DialogueCoverage | 人物、对白和镜头完整 |
| generation | 批准 scope | ProviderTask、segment Artifact | quote、幂等、定向重试 |
| assembly | 片段、音频、字幕 | MediaJob、Deliverable | FFprobe 与业务 QA |

适合迁移的 validator 可作为受管 Node task；schema 和最终成功规则仍由 artifact contract 与 ToolHost 校验。不得把一组 Markdown 步骤当作可恢复任务事实。

### 4.3 `koubo`

LimeShot 使用 `talking` 作为 current 领域名，不把 `koubo` 带入 crate、method、schema 或目录。

| 参考能力 | LimeShot 实现 |
| --- | --- |
| 口播脚本与分段 | `talking` Skill + Script Artifact |
| 出镜人与声音绑定 | AssetRecord + ConsentReceipt + VoiceBinding |
| talking-head | `video.talking_head` provider tool |
| TTS | `audio.tts` provider tool |
| B-roll/商品演示 | TaskRun + structured media tools |
| HTML/动效模板 | 独立设计的 template schema 与 renderer |
| 封面、字幕、混音 | Artifact contracts + media tools |

## 5. Agent Skills

每个迁入或重建的 Skill 必须：

- 从 PRD、BUSINESS、tool catalog 和 artifact contract 读取事实。
- 只调用已注册 dynamic tools，不包含 HTTP、SDK、shell、FFmpeg argv 或数据库写入。
- 不硬编码 provider model key、task code、价格、余额或私有错误码。
- 不把聊天文本、Markdown checklist 或 Turn 完成当作 TaskRun 成功。
- 使用独立工具分别处理付费、真人/声音、覆盖和导出批准。
- 通过负向测试证明无法越过 Project scope 与 ToolHost。

## 6. 任务脚本

Node task 是受管执行资源，不是第二套 workflow runtime。允许迁移的脚本应满足：

当前仓库没有通过授权、schema、执行器和 fixture 验收的 Node task，因此不保留空 catalog 或占位目录。首个 task 必须与 catalog entry、JSON Schema、ToolHost executor、负向测试和 Gate B 同批落地。

- 单一、确定性的输入输出合同，参数通过 JSON Schema 校验。
- 无交互、无任意网络、无凭证读取、无 shell 字符串。
- 只读 ToolHost 授予的输入，输出到指定临时目录。
- 固定 Node 版本、固定 script path、最小环境、timeout、输出上限和取消语义。
- 由 ToolHost 校验输出并登记 Artifact；脚本不能直接宣布业务成功。

| 类型 | 处理方式 |
| --- | --- |
| timeline/binding/prompt validator | 可迁为 managed Node task + fixture |
| 纯数据转换/manifest 生成 | 可迁为 managed Node task |
| provider submit/poll/download | 改造成 ProviderPort adapter，不作为通用脚本 |
| FFprobe/FFmpeg | 改造成 structured media operation |
| artifact path/index/save | 由 artifact repository 承担 |
| 客户项目、特定剧集、一次性样例 | `dead`，不迁移 |

## 7. Artifact 与模型目录

Artifact contract 至少覆盖 script、shot-list、source-timeline、source-shot、entity-registry、asset-registry、target-shot、dialogue-coverage、generation-unit、prompt-manifest、subtitle、media-manifest 和 qa-report。

每份 schema 固定 `$id`、schema version、artifact type、project id、producer、source refs、content hash 和 created time。旧版本不可原地改义。

CapabilityCatalog 从 provider 官方资料和 live discovery 构建，不复制参考应用的 model/task catalog。静态合同规定允许范围，运行时快照只收窄 availability、价格、配额和健康状态。

## 8. 授权迁移流程

每个迁移批次必须：

1. 指定来源仓库、revision 和原始文件，不以 `.app` bundle 为唯一来源。
2. 记录著作权人、授权文本、商业使用、修改和再发布范围。
3. 生成逐文件 SHA-256、目标路径、owner、license 和 NOTICE manifest。
4. 扫描 secret、账号、私有域名、客户数据、绝对路径、样片和品牌资产。
5. 替换 provider/task code、路径、环境变量和旧品牌命名。
6. 通过 dependency、schema、fixture、安全和跨平台评审。
7. 责任开发者批准后才进入构建图。

## 9. 回流守卫

- 禁止 current 代码引用参考应用安装路径、CDN 或 bundle resource。
- 禁止 Skill/Renderer 出现 provider endpoint、API key、raw task code、shell 或 FFmpeg argv。
- 禁止未登记二进制和媒体进入 `resources/`。
- 禁止 Node task 自行 spawn 非授权 executable、访问任意网络或写 Artifact index。
- 禁止旧 Rust App Server、RuntimeCore 和 WorkflowRun Agent 外壳重新进入 production build。

## 10. 完成定义

- 每个构建资源都可追溯到原创记录、兼容许可证或书面授权。
- `shotfun-core`、`redraw`、`koubo` 的有效业务能力都映射到 LimeShot 自有 Skill、tool/task、artifact contract 和 GUI。
- Provider/model/voice catalog 来自官方资料和 live discovery。
- 语音、视频、ASR、分析和本地媒体路径各完成真实 ToolHost Gate B。
- 没有第三方 bundle、品牌、私有协议、密钥、样片或客户项目进入生产包。
