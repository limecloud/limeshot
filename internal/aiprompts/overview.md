# LimeShot 工程总览

状态：`current`

## 唯一产品链

```text
Electron Renderer
  -> preload typed semantic API
  -> Electron Main
       -> managed Codex App Server over native JSONL
       -> Rust Business Service over JSON-RPC 2.0 / JSONL
  -> Codex projection + business projection
  -> GUI
```

Codex App Server 是唯一 Agent runtime；Rust Business Service 是唯一产品业务后端；Electron Main 是 Desktop Host，不承接第三套 runtime 或业务事实源。

## Owner 快速表

| Domain | Current owner |
| --- | --- |
| Codex process / protocol / projection | `packages/codex-client/**`、`src/main/codex/**` |
| Rust process / business protocol | `packages/business-client/**`、`src/main/business/**`、`rust/crates/business-*` |
| Renderer semantic API | `src/shared/**`、`src/preload/**`、`src/main/ipc.ts` |
| Project / Plan / Task / Artifact / Deliverable | `rust/crates/projects/**`、`artifacts/**`、`business-core/**` |
| Dynamic business tools | `rust/crates/tools/**` |
| Provider / Media | `rust/crates/providers/**`、`rust/crates/media/**` |
| Product runtime Skills | `resources/skills/**` |
| Developer Agent Skills | `.codex/skills/**` |
| GUI projection | `src/renderer/**` |

## 先读顺序

1. 产品和数据归属：`architecture.md`。
2. 方法、事件和 bridge：`commands.md`。
3. 新旧路径与删除：`governance.md`。
4. 验证与交付：`quality-workflow.md`。
5. 业务或产品细节：`../roadmap/v1/**`。

不要把历史执行计划、截图参考、其他桌面应用或本地安装路径当作 runtime 依赖。它们只能提供研究 evidence，不能成为 current owner。
