import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { currentPlatformKey, resolveVerifiedCodexBinary } from './codex-resource.mjs';

const root = resolve(import.meta.dirname, '../..');
const businessName = process.platform === 'win32' ? 'business-server.exe' : 'business-server';
const codexName = process.platform === 'win32' ? 'codex.exe' : 'codex';
const businessSource = resolve(root, 'rust', 'target', 'release', businessName);
const codexSource = resolveVerifiedCodexBinary(root, {
  binary: process.env.LIMESHOT_CODEX_PACKAGE_BIN,
  requireBinary: true,
  variableName: 'LIMESHOT_CODEX_PACKAGE_BIN',
});

if (!existsSync(businessSource)) {
  throw new Error(`Rust companion 不存在，请先运行 npm run rust:build:release: ${businessSource}`);
}

const binDirectory = resolve(
  root,
  'rust',
  'target',
  'package-resources',
  currentPlatformKey(),
  'bin',
);
mkdirSync(binDirectory, { recursive: true });
copyFileSync(businessSource, resolve(binDirectory, businessName));
copyFileSync(codexSource, resolve(binDirectory, codexName));

console.log(`已准备 ${currentPlatformKey()} 发布资源: ${binDirectory}`);
