import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pty = vi.hoisted(() => {
  const process = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((listener: (data: string) => void) => { process.dataListener = listener; }),
    onExit: vi.fn((listener: (event: { exitCode: number }) => void) => { process.exitListener = listener; }),
    dataListener: undefined as ((data: string) => void) | undefined,
    exitListener: undefined as ((event: { exitCode: number }) => void) | undefined,
  };
  return { process, spawn: vi.fn(() => process) };
});

vi.mock('node-pty', () => ({ spawn: pty.spawn }));

import { DESKTOP_IPC } from '../../shared/desktop';
import { WorkspaceTerminalHost } from './terminal';

let fixtureRoot = '';

beforeEach(async () => {
  vi.clearAllMocks();
  pty.process.dataListener = undefined;
  pty.process.exitListener = undefined;
  fixtureRoot = await mkdtemp(join(tmpdir(), 'limeshot-terminal-'));
  await mkdir(join(fixtureRoot, '.git'), { recursive: true });
  await writeFile(join(fixtureRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
});

afterEach(async () => {
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

describe('WorkspaceTerminalHost', () => {
  it('owns a persistent PTY per renderer and forwards input, resize, output, and close', async () => {
    const host = new WorkspaceTerminalHost();
    const owner = event(7);
    const other = event(8);
    const started = await host.start(owner.value, fixtureRoot, { projectId: 'project-1', cols: 90, rows: 24 });

    expect(started.branch).toBe('main');
    expect(pty.spawn).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({
      cwd: fixtureRoot,
      cols: 90,
      rows: 24,
      name: 'xterm-256color',
    }));
    host.write(owner.value, started.sessionId, 'printf ready\r');
    host.resize(owner.value, started.sessionId, 132, 40);
    expect(pty.process.write).toHaveBeenCalledWith('printf ready\r');
    expect(pty.process.resize).toHaveBeenCalledWith(132, 40);
    expect(() => host.write(other.value, started.sessionId, 'nope')).toThrow('不属于当前窗口');

    pty.process.dataListener?.('terminal-ready');
    expect(owner.send).toHaveBeenCalledWith(DESKTOP_IPC.workspaceTerminalEvent, {
      sessionId: started.sessionId,
      type: 'output',
      data: 'terminal-ready',
    });

    host.close(owner.value, started.sessionId);
    expect(pty.process.kill).toHaveBeenCalledOnce();
    expect(() => host.resize(owner.value, started.sessionId, 80, 24)).toThrow('不存在');
  });
});

function event(id: number) {
  const send = vi.fn();
  return {
    send,
    value: {
      sender: {
        id,
        send,
        isDestroyed: vi.fn(() => false),
        once: vi.fn(),
      },
    } as unknown as Parameters<WorkspaceTerminalHost['start']>[0],
  };
}
