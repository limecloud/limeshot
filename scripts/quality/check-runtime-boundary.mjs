import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const forbiddenPaths = [
  'rust/crates/app-server-protocol',
  'rust/crates/app-server',
  'rust/crates/runtime-core',
  'rust/crates/workflow-runtime',
  'packages/app-server-client',
  'schemas/app-server',
  'resources/workflows',
];
for (const relativePath of forbiddenPaths) {
  if (existsSync(resolve(root, relativePath))) throw new Error(`禁止恢复旧 Agent runtime 路径: ${relativePath}`);
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

const scanRoots = ['rust/crates', 'src', 'packages', 'resources/skills'];
const forbidden = /app-server-protocol|app_server_protocol|runtime-core|workflow-runtime|workflow\/run|APP_SERVER_BIN/;
for (const scanRoot of scanRoots) {
  for (const path of await files(resolve(root, scanRoot))) {
    if (!/\.(?:rs|toml|ts|tsx|js|mjs|md|json)$/.test(path)) continue;
    const source = await readFile(path, 'utf8');
    if (forbidden.test(source)) throw new Error(`旧 Agent runtime 语义回流: ${path}`);
  }
}

for (const path of await files(resolve(root, 'rust/crates'))) {
  if (!/\.(?:rs|toml)$/.test(path)) continue;
  const source = await readFile(path, 'utf8');
  if (path.endsWith('Cargo.toml') && /(?:^|[-_])codex(?:[-_]|\s*=)/im.test(source)) {
    throw new Error(`Rust Business Service 禁止依赖 Codex crate: ${path}`);
  }
  if (!path.includes('/tests/') && /codex_client|Command::new\([^\n]*codex|app-server[^\n]*stdio:\/\/|["'](?:thread|turn|item)\//i.test(source)) {
    throw new Error(`Rust Business Service 禁止启动、代理或实现 Codex: ${path}`);
  }
  if (path.includes('/business-protocol/') && /["'](?:thread|turn|item)\//.test(source)) {
    throw new Error(`Rust business protocol 禁止声明 Agent method: ${path}`);
  }
}

const businessProtocol = await readFile(resolve(root, 'schemas/business/protocol.json'), 'utf8');
if (businessProtocol.includes('"plan/create"')) {
  throw new Error('计划创建只能走 Codex dynamic tool -> tool/call -> ToolHost，禁止恢复 raw plan/create RPC');
}
