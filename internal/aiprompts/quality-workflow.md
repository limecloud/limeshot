# LimeShot 质量工作流

状态：`current`

## 唯一受测产品链

```text
Electron Renderer -> preload -> Electron Main
  -> managed Codex App Server
  -> Rust Business Service
  -> semantic projection -> GUI
```

测试必须说明覆盖了哪一段。旧 runtime、production mock、浏览器静态投影或单侧 protocol fixture 通过，不能证明完整产品链可交付。

## 选择最低门禁

先跑最贴风险的检查，再按跨层影响扩大：

| 改动面 | 最低验证 |
| --- | --- |
| 文档/治理 | `git diff --check`、链接/术语扫描；触及回流规则加 `npm run governance:runtime-boundary` |
| 纯 TS projection/state/parser | 相关 Vitest 文件 + `npm run typecheck` |
| React 组件/交互 | 相关 `*.test.tsx` + 五语言断言；主路径加 Gate B |
| Codex client/method | framing/request/reverse-request/timeout/EOF tests + `npm run test:contracts` |
| Rust business protocol | schema/client/router fixture + `npm run test:contracts` + 对应 crate 测试 |
| Electron/preload/semantic IPC | `npm run typecheck` + `npm run test:contracts` + Gate B |
| Project binding/history restore | Rust repository tests + Codex resume/read fixture + Gate B |
| ToolHost/Provider/Media | 对应 crate tests、negative cases；用户路径加 Gate B |
| 资源 manifest | `npm run resource:check` |
| 版本/Forge/workspace manifest | `npm run verify:app-version` + `npm run resource:check` |
| 正式发布 | `npm run verify:local` + GitHub Actions platform/packaged evidence |

默认本地聚合入口：

```bash
npm run verify:local
```

不要发明不存在的 `test:related`、`test:resume` 或脚本治理命令。需要缩小测试时直接运行对应 Vitest 文件或 Rust crate。

## 证据等级

| 等级 | 能证明 | 不能证明 |
| --- | --- | --- |
| Unit | 纯转换、状态机、parser、schema 的确定性 | 跨模块接线、进程边界 |
| Contract | protocol、typed client、semantic API 集合一致 | Electron 与用户可见状态 |
| Domain integration | Rust repository/executor/SQLite/进程协作 | Codex 或 Electron 主链 |
| Gate A | Renderer DOM、交互和可见投影 | preload、IPC、child process |
| Gate B | 真实 Electron、preload/IPC、Codex child、Rust child、两套 stdio 与 GUI | live Provider、打包安装器和另一操作系统 |
| Platform/packaged | 实际 macOS/Windows runner、App bundle/Squirrel 与内嵌资源 | 未运行平台 |
| Live | 指定 Provider/model/config 下的能力 | 其他 Provider、地区和平台 |

`npm run verify:gui-smoke` 是当前 Gate B：使用真实 Electron、真实 Codex/Rust 进程和受控 provider/media fixtures，不是 production mock，也不等于 live Provider 或 packaged clean-machine evidence。

## Gate B 合同

Gate B 至少证明：

1. preload semantic API 存在且 Renderer 不接触 raw protocol。
2. Codex 与 Rust child 均由 Electron 启动并使用独立 stdio client。
3. 一个真实 Turn 到达 Codex terminal event，业务工具输出经过 Rust ToolHost 返回。
4. Project binding、paginated history、projection 和 interrupt 可在冷启动后恢复。
5. 业务链覆盖审批、Task、Artifact/QA、Deliverable 或本轮声明的等价主路径。
6. production mock fallback、绝对路径泄漏和水平溢出为零。
7. 失败输出包含 scenario、expected/actual 与最近进程日志，不只报 timeout。

## 测试作者合同

- 从 public boundary 进入，不直接调用私有 handler 伪造跨层成功。
- 等待真实业务事件或 terminal predicate，不用固定 sleep 合成完成态。
- 每个测试隔离 user data、workspace、数据库、端口和凭证。
- fixture 必须显式 test-only；生产代码不得根据测试失败自动回退 fixture。
- 修复缺陷时在最接近根因的 owner 层补回归，再按风险补跨层证据。
- 不为已删除 runtime 或静态常量保留正向行为测试；旧名只进负向 guard。

## 正式发布

- `.github/workflows/release.yml` 是正式产物唯一 owner；本地包不得上传为 Release asset。
- workflow 固定 Node 22、Rust stable 和 manifest 指定 Codex，校验 archive/executable hash 与版本。
- macOS arm64 与 Windows x64 必须在各自 runner 原生构建；Windows 使用 Forge Squirrel。
- publish job 只在质量与全部平台 job 成功后汇总资产、生成统一 `SHA256SUMS.txt` 并发布。
- 未在真实平台运行的步骤必须写成待验证，不能因 YAML 可解析而标记通过。

## 收尾报告

报告风险类型、实际命令、证据等级、未执行原因、Gate B/平台状态、四类治理归属和完成度。路线图任务还要说明本轮证明了哪条主链在前进。
