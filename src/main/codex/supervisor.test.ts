import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/tmp/limeshot'),
    getPath: vi.fn(() => '/tmp/limeshot-private'),
    isPackaged: true,
  },
  shell: { openExternal: vi.fn() },
}));

import { resolveCodexHome } from './supervisor';

const originalLimeShotCodexHome = process.env.LIMESHOT_CODEX_HOME;
const originalCodexHome = process.env.CODEX_HOME;

afterEach(() => {
  restoreEnvironment('LIMESHOT_CODEX_HOME', originalLimeShotCodexHome);
  restoreEnvironment('CODEX_HOME', originalCodexHome);
});

describe('Codex home resolution', () => {
  it('uses the shared standard Codex home in a packaged application', () => {
    delete process.env.LIMESHOT_CODEX_HOME;
    delete process.env.CODEX_HOME;

    expect(resolveCodexHome()).toBe(resolve(join(homedir(), '.codex')));
  });

  it('honors an explicit shared Codex home in a packaged application', () => {
    delete process.env.LIMESHOT_CODEX_HOME;
    process.env.CODEX_HOME = resolve('/tmp/shared-codex-home');

    expect(resolveCodexHome()).toBe(resolve('/tmp/shared-codex-home'));
  });
});

function restoreEnvironment(name: 'LIMESHOT_CODEX_HOME' | 'CODEX_HOME', value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
