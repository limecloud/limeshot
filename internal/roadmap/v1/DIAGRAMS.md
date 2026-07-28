# LimeShot v1 架构与流程图册

状态：`current / canonical`
日期：`2026-07-28`
关联文档：[PRD.md](./PRD.md)、[README.md](./README.md)、[PROTOCOL.md](./PROTOCOL.md)

## 1. 总体架构图

```mermaid
flowchart LR
    U[内容生产者] --> UI[Electron Renderer]
    UI --> PRE[Preload typed gateway]
    PRE --> HOST[Electron Main]

    HOST <--> CODEX[Managed Codex App Server\n唯一 Agent runtime]
    HOST <--> BIZ[Rust Business Service\n唯一业务后端]

    CODEX --> AGENT[Thread / Turn / Item\nSkills / MCP / Codex tool approvals]
    CODEX -->|item/tool/call| HOST
    HOST -->|tool/call| BIZ

    BIZ --> TOOL[ToolHost\nschema / scope / business approval gates]
    TOOL --> NODE[Managed Node tasks]
    TOOL --> PROVIDER[Image / Video / Voice / Analysis Provider]
    TOOL --> MEDIA[Managed FFprobe / FFmpeg]
    BIZ <--> STORE[(Project / Binding / Plan / Approval / Task / Artifact Store)]

    CODEX -->|Agent events| HOST
    BIZ -->|Business events| HOST
    HOST --> UI
```

Electron 直接连接 Codex，不经过 Rust。Rust 不实现 Agent runtime，只承接产品业务与工具执行。

## 2. 进程所有权图

```mermaid
flowchart TD
    E[Electron Main]
    E -->|spawn / stop / restart| C[Codex App Server]
    E -->|spawn / stop / restart| R[Rust Business Service]
    R -->|spawn allowlisted| N[Node task]
    R -->|spawn structured argv| F[FFprobe / FFmpeg]

    C -. forbidden .-> R
    R -. must not spawn .-> C
```

Codex 和 Rust 是 Electron 的平级受管子进程。这样可以从进程拓扑上阻止 Rust 包装 Codex并演变为第二套 runtime。

## 3. 启动与资源流程图

```mermaid
flowchart TD
    A[Electron 启动] --> B[定位 packaged Rust Business Service]
    B --> C[spawn Rust + initialize]
    C --> D[GUI ready / Project 可读]
    D --> E{用户开始 Conversation?}
    E -- 否 --> D
    E -- 是 --> F[Electron 定位并复验 packaged Codex]
    F --> G[spawn Codex app-server --listen stdio://]
    G --> H[initialize / initialized]
    H --> I[读取 Rust tool catalog]
    I --> J[thread/start + dynamicTools]
    J --> K[写入 codexThreadId binding]

    C --> L[Rust 校验 Node / FFmpeg manifest]
    L --> M{业务执行资源完整?}
    M -- 否 --> N[capability blocked]
    M -- 是 --> O[ToolHost 可执行]
```

Codex 按首次 Conversation 惰性启动，最终解析和 spawn 只归 Electron；Node/FFmpeg 的安装与执行归 Rust ToolHost。任一步失败都进入 blocked，不回退系统 PATH 或其他应用资源。

## 4. 新建 Project / Conversation 时序图

```mermaid
sequenceDiagram
    actor User as 用户
    participant UI as Renderer
    participant Host as Electron Main
    participant Biz as Rust Business Service
    participant Codex as Codex App Server

    opt 尚无 Project
        User->>UI: 选择 Profile，输入需求或点击新建项目
        UI->>Host: project.create(profileId, language, initialSubject?)
        Host->>Host: 创建应用数据区受管 workspace
        Host->>Biz: project/create(name, managed workspace, incomplete Brief)
        Biz-->>Host: Project + Brief v1
        Host-->>UI: Project created
    end
    User->>UI: 进入 Project 或新建 Conversation
    UI->>Host: agent.startConversation(projectId, conversationId)
    Host->>Biz: conversation/binding/read
    Biz-->>Host: binding = null
    Host->>Codex: thread/start(cwd, dynamicTools)
    Codex-->>Host: thread.id
    Host->>Biz: conversation/bind(projectId, conversationId, thread.id, expected=null)
    Biz-->>Host: binding
    Host-->>UI: Conversation ready
    opt 首页已有 initialSubject
        UI->>Host: agent.startTurn(projectId, conversationId, initialSubject)
        Host->>Codex: turn/start(threadId, input)
    end
```

Renderer 不提交任意 workspace path，也不显示自定义项目表单。Electron 在应用数据区分配受管 workspace；Rust 创建 Project/Brief 并只保存 `thread.id` 绑定，不保存 Thread 内容。系统目录选择器只属于未来明确的外部目录导入入口，不得出现在“新建项目”。

## 5. Turn 与动态工具时序图

```mermaid
sequenceDiagram
    actor User as 用户
    participant UI as Renderer
    participant Host as Electron Main
    participant Codex as Codex App Server
    participant Biz as Rust Business Service
    participant Exec as Node / Provider / FFmpeg

    User->>UI: 发送请求
    UI->>Host: turn.start(conversationId, input)
    Host->>Biz: conversation/binding/read
    Biz-->>Host: codexThreadId
    Host->>Codex: turn/start(threadId, input)
    Codex-->>Host: item/agentMessage/delta
    Host-->>UI: message delta projection

    Codex->>Host: item/tool/call
    Host->>Biz: tool/call(projectId, threadId, turnId, callId, input)
    Biz->>Biz: schema + scope + approval + capability
    Biz->>Exec: allowlisted execution
    Exec-->>Biz: result + verified artifact
    Biz-->>Host: bounded tool result
    Host-->>Codex: item/tool/call response

    Codex-->>Host: item/completed / turn/completed
    Host-->>UI: terminal Turn projection
```

`turn/completed` 是 Turn 终态；Task/Artifact 终态来自 Rust。任何一侧都不能合成另一侧的终态。

## 6. 恢复时序图

```mermaid
sequenceDiagram
    participant Host as Electron Main
    participant Biz as Rust Business Service
    participant Codex as Codex App Server
    participant UI as Renderer

    Host->>Biz: conversation/binding/read
    Biz-->>Host: codexThreadId
    alt 同一进程 active 空 Thread
        Host-->>UI: 空 Conversation ready
    else 需要恢复
        Host->>Codex: thread/resume(threadId)
    end
    alt resume 成功
        Codex-->>Host: canonical Thread
    else 普通恢复失败
        Host->>Codex: thread/read(threadId, includeTurns=true)
        Codex-->>Host: canonical Thread
    else 上游明确返回空 Thread 未 materialize
        Host->>Codex: thread/start(cwd, dynamicTools)
        Codex-->>Host: replacementThreadId
        Host->>Biz: conversation/bind(expected=oldThreadId, replacementThreadId)
        Biz-->>Host: binding replaced atomically
    end
    Host-->>UI: history projection
```

禁止从 Rust message table、缓存 delta 或固定 timeout 重建 Codex Thread。`conversationId` 只在 Project 内唯一；空 Thread 替换必须 compare-and-swap，不能覆盖已被其他请求更新的 binding。Phase 4 落地 Task repository 后，业务任务恢复另走 Rust `task/reconcile`，不混入 Codex history 恢复。

## 7. ProductionPlan 与业务审批时序图

```mermaid
sequenceDiagram
    actor User as 用户
    participant UI as Renderer
    participant Host as Electron Main
    participant Codex as Codex App Server
    participant Biz as Rust Business Service
    participant Store as Project Repository

    Codex->>Host: item/tool/call(plan_create)
    Host->>Biz: tool/call(context, plan_create, input)
    Biz->>Store: validate workable Brief + create version
    Store-->>Biz: ready_for_review ProductionPlan
    Biz-->>Host: bounded tool result
    Host-->>Codex: DynamicToolCallResponse
    Host-->>UI: Turn projection
    UI->>Host: plan.list(projectId)
    Host->>Biz: plan/list
    Biz-->>UI: semantic plan projection
    User->>UI: 批准计划
    UI->>Host: approval.decide(planId, expectedVersion, approve)
    Host->>Biz: approval/decide
    Biz->>Store: atomic state transition + immutable receipt
    Store-->>Biz: approved Plan + ApprovalReceipt
    Biz-->>Host: decision result
    Host-->>UI: approved + receipt
```

计划创建只能走 `plan_create -> tool/call -> ToolHost`；计划审批只能由 GUI 用户动作进入 `approval/decide`。Agent 不拥有 `plan_approve` 工具，也不能把自然语言确认解释为业务批准。

## 8. 业务生产流程图

```mermaid
flowchart TD
    A[选择 Profile / 创建受管 Project] --> B[Conversation 收集 Brief / 导入素材]
    B --> C{Brief workable?}
    C -- 否 --> D[Codex 提问并显示缺口]
    D --> B
    C -- 是 --> E[Codex 调用 plan_create 生成 ProductionPlan]
    E --> F{用户批准?}
    F -- 要求修改 --> D
    F -- 暂不处理 --> G[保持 ready_for_review]
    F -- 是 --> H[Rust 校验 capability / 授权 / 成本]
    H --> I[ProviderTask / MediaJob]
    I --> J{执行结果}
    J -- 失败或部分成功 --> K[保留成功 Artifact / 定向重试]
    K --> I
    J -- 成功 --> L[FFprobe + 业务 QA]
    L --> M{用户确认?}
    M -- 否 --> E
    M -- 是 --> N[Deliverable]
```

## 9. 阅读规则

- 总体架构图回答系统组成。
- 进程图回答谁能启动谁。
- 启动图回答受管资源如何准备。
- Conversation、Turn 和恢复图回答 Codex 与 Rust 如何分工。
- ProductionPlan 时序图回答 Agent 创建与用户审批为何是两条独立入口。
- 业务图回答从 Brief 到 Deliverable 的成功条件。
