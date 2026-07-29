import { describe, expect, it } from 'vitest';

import { platformKey } from './codex-resource.mjs';

describe('Codex platform key', () => {
  it.each([
    ['darwin', 'arm64', 'darwin-arm64'],
    ['darwin', 'x64', 'darwin-x64'],
    ['win32', 'x64', 'win32-x64'],
  ])('maps %s-%s to %s', (platform, arch, expected) => {
    expect(platformKey(platform, arch)).toBe(expected);
  });

  it('keeps unsupported platforms explicit', () => {
    expect(platformKey('linux', 'x64')).toBe('linux-x64');
  });
});
