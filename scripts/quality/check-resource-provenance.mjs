import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const resourceRoot = resolve(root, 'resources');
const prohibited = [
  /shotfun/iu,
  /koubo/iu,
  /cn\.shotfun/iu,
  /\/Applications\/ShotFunClawGlobal\.app/iu,
];

const files = await collectFiles(resourceRoot);
const violations = [];
let codexManifest;

for (const file of files) {
  const content = await readFile(file, 'utf8');
  if (prohibited.some((pattern) => pattern.test(content))) {
    violations.push(relative(root, file));
  }
  if (file.endsWith('.json')) {
    try {
      const parsed = JSON.parse(content);
      if (file === resolve(resourceRoot, 'codex', 'manifest.v1.json')) codexManifest = parsed;
    } catch (error) {
      violations.push(`${relative(root, file)}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }
}

validateCodexManifest(codexManifest, violations);

if (violations.length > 0) {
  throw new Error(`资源来源守卫失败:\n${violations.join('\n')}`);
}

process.stdout.write(`${JSON.stringify({ ok: true, resources: files.length })}\n`);

function validateCodexManifest(manifest, errors) {
  const sha256 = /^[a-f0-9]{64}$/;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.resourceId !== 'codex') {
    errors.push('resources/codex/manifest.v1.json: invalid manifest identity');
    return;
  }
  if (manifest.version !== '0.145.0' || manifest.sourceRevision !== 'rust-v0.145.0' || manifest.license !== 'Apache-2.0') {
    errors.push('resources/codex/manifest.v1.json: version, revision or license is not pinned');
  }
  if (!Array.isArray(manifest.releases) || manifest.releases.length === 0) {
    errors.push('resources/codex/manifest.v1.json: at least one verified release is required');
    return;
  }
  const platforms = new Set();
  for (const release of manifest.releases) {
    if (
      typeof release.platformKey !== 'string'
      || platforms.has(release.platformKey)
      || typeof release.sourceUrl !== 'string'
      || !release.sourceUrl.startsWith('https://github.com/openai/codex/releases/download/rust-v0.145.0/')
      || typeof release.archiveName !== 'string'
      || typeof release.executableName !== 'string'
      || !sha256.test(release.archiveSha256)
      || !sha256.test(release.executableSha256)
    ) {
      errors.push(`resources/codex/manifest.v1.json: invalid release ${String(release.platformKey)}`);
    }
    platforms.add(release.platformKey);
  }
  for (const requiredPlatform of ['darwin-arm64', 'win32-x64']) {
    if (!platforms.has(requiredPlatform)) {
      errors.push(`resources/codex/manifest.v1.json: missing required platform ${requiredPlatform}`);
    }
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}
