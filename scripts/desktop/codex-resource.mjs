import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export function platformKey(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (platform === 'win32' && arch === 'x64') return 'win32-x64';
  return `${platform}-${arch}`;
}

export function currentPlatformKey() {
  return platformKey(process.platform, process.arch);
}

export function resolveVerifiedCodexBinary(root, options = {}) {
  const {
    binary = process.env.LIMESHOT_CODEX_BIN,
    requireBinary = false,
    variableName = 'LIMESHOT_CODEX_BIN',
  } = options;
  const manifest = JSON.parse(readFileSync(resolve(root, 'resources', 'codex', 'manifest.v1.json'), 'utf8'));
  const platformKey = currentPlatformKey();
  const release = manifest.releases.find((candidate) => candidate.platformKey === platformKey);
  if (!release) throw new Error(`Codex manifest 尚未声明当前平台: ${platformKey}`);
  if (requireBinary && !binary) {
    throw new Error(`必须通过 ${variableName} 指定已校验的官方 Codex 绝对路径`);
  }

  const candidate = binary
    ?? resolve(root, 'rust', 'target', 'codex-release', manifest.version, release.executableName);
  if (!isAbsolute(candidate) || !existsSync(candidate)) {
    throw new Error(`缺少固定 Codex ${manifest.version}: ${candidate}`);
  }
  const sha256 = createHash('sha256').update(readFileSync(candidate)).digest('hex');
  if (sha256 !== release.executableSha256) {
    throw new Error(`Codex executable SHA-256 不匹配: ${candidate}`);
  }
  const version = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0 || version.stdout.trim() !== `codex-cli ${manifest.version}`) {
    throw new Error(`Codex 版本不匹配: ${version.stdout.trim() || version.stderr.trim()}`);
  }
  return resolve(candidate);
}
