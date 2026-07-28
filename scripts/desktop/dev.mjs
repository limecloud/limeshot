import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { resolveVerifiedCodexBinary } from './codex-resource.mjs';

const root = resolve(import.meta.dirname, '../..');
const binary = resolve(root, 'rust', 'target', 'debug', process.platform === 'win32' ? 'business-server.exe' : 'business-server');
const codexBinary = resolveVerifiedCodexBinary(root);
const codexHome = resolveDevelopmentCodexHome();
const build = spawnSync('cargo', ['build', '--manifest-path', 'rust/Cargo.toml', '-p', 'business-server'], {
  cwd: root,
  stdio: 'inherit',
});

if (build.status !== 0 || !existsSync(binary)) {
  process.exit(build.status ?? 1);
}

const electronVite = process.platform === 'win32'
  ? resolve(root, 'node_modules', '.bin', 'electron-vite.cmd')
  : resolve(root, 'node_modules', '.bin', 'electron-vite');
const server = spawnSync(electronVite, ['dev', ...process.argv.slice(2)], {
  cwd: root,
  env: {
    ...process.env,
    LIMESHOT_BUSINESS_BIN: binary,
    LIMESHOT_CODEX_BIN: codexBinary,
    LIMESHOT_CODEX_HOME: codexHome,
  },
  stdio: 'inherit',
});
process.exit(server.status ?? 1);

function resolveDevelopmentCodexHome() {
  const candidate = process.env.LIMESHOT_CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
  if (!isAbsolute(candidate)) throw new Error('LIMESHOT_CODEX_HOME 必须是绝对路径');
  return resolve(candidate);
}
