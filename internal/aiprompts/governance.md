# LimeShot 治理规则

状态：`current`

## 分类

- `current`：Electron 直连 Codex；Rust 纯业务服务；受控 ToolHost/Provider/Media/Artifact 主链。
- `compat`：无。v1 尚无外部协议或历史版本兼容负担。
- `deprecated`：无。确认错误的设计直接删除，不保留过渡入口。
- `dead / deleted / forbidden-to-restore`：自研 Agent runtime、Agent App Server、RuntimeCore Thread/Turn/Item、WorkflowRun Agent 外壳、旧生成 client/schema、Tauri、production mock，以及没有执行器和消费者的空资源 catalog。

## 回流判定

以下任一新增即视为旧路回流：

- Rust crate、type、table 或 method 表达 Codex Thread/Turn/Item/history/compact。
- Rust 启动、代理或恢复 Codex。
- Electron 从 Rust 读取合成的 Agent 终态，而不是 Codex 原生 `turn/completed`。
- Renderer 调用 raw Codex/Rust method。
- 业务任务成功由聊天文本、Skill checklist 或脚本 exit code单独决定。
- 生产路径探测系统 runtime、其他应用目录或 mock backend。

## 删除规则

本仓库没有外部用户。错误实现一旦有 current owner 替代，应在同一变更中从 workspace、代码、schema、client、脚本、测试和文档物理删除，不新增 compat wrapper。
