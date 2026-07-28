import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'limeshot-protocol-'));

try {
  const result = spawnSync(
    'cargo',
    ['run', '--quiet', '--manifest-path', 'rust/Cargo.toml', '-p', 'business-protocol', '--bin', 'generate-business-protocol', '--', temporaryRoot],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || 'protocol generator failed');
  }

  const files = [
    'packages/business-client/src/generated.ts',
    'schemas/business/protocol.json',
  ];
  for (const relativePath of files) {
    const [expected, actual] = await Promise.all([
      readFile(join(temporaryRoot, relativePath), 'utf8'),
      readFile(join(root, relativePath), 'utf8'),
    ]);
    if (expected !== actual) {
      throw new Error(`协议生成物漂移: ${relativePath}。请运行 npm run protocol:generate。`);
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
