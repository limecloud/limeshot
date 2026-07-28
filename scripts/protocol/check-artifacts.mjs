import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'limeshot-artifacts-'));

try {
  const result = spawnSync(
    'cargo',
    ['run', '--quiet', '--manifest-path', 'rust/Cargo.toml', '-p', 'artifacts', '--bin', 'generate-artifact-schemas', '--', temporaryRoot],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || 'artifact generator failed');
  }

  const expectedDirectory = join(temporaryRoot, 'schemas/artifacts');
  const actualDirectory = join(root, 'schemas/artifacts');
  const [expectedFiles, actualFiles] = await Promise.all([
    readdir(expectedDirectory),
    readdir(actualDirectory),
  ]);
  if (expectedFiles.sort().join('\n') !== actualFiles.sort().join('\n')) {
    throw new Error('artifact schema 文件集合漂移。请运行 npm run artifact:generate。');
  }

  for (const file of expectedFiles) {
    const [expected, actual] = await Promise.all([
      readFile(join(expectedDirectory, file), 'utf8'),
      readFile(join(actualDirectory, file), 'utf8'),
    ]);
    if (expected !== actual) {
      throw new Error(`artifact schema 漂移: schemas/artifacts/${file}。请运行 npm run artifact:generate。`);
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
