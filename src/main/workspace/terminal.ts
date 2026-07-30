import { existsSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import * as pty from 'node-pty';

import {
  DESKTOP_IPC,
  type WorkspaceTerminalEvent,
  type WorkspaceTerminalStartInput,
  type WorkspaceTerminalStartResult,
} from '../../shared/desktop';
import { readGitBranch } from './context';

interface TerminalSession {
  process: pty.IPty;
  sender: WebContents;
  senderId: number;
}

const MAX_SESSIONS_PER_RENDERER = 4;
const MAX_INPUT_LENGTH = 16_384;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 28;

export class WorkspaceTerminalHost {
  readonly #sessions = new Map<string, TerminalSession>();

  async start(
    event: IpcMainInvokeEvent,
    workspacePath: string,
    input: WorkspaceTerminalStartInput,
  ): Promise<WorkspaceTerminalStartResult> {
    const ownedSessionCount = [...this.#sessions.values()].filter((session) => session.senderId === event.sender.id).length;
    if (ownedSessionCount >= MAX_SESSIONS_PER_RENDERER) throw new Error('终端会话数量已达上限');

    const shell = resolveShell();
    const terminalProcess = pty.spawn(shell.executable, shell.args, {
      name: 'xterm-256color',
      cols: normalizeDimension(input.cols, DEFAULT_COLS),
      rows: normalizeDimension(input.rows, DEFAULT_ROWS),
      cwd: workspacePath,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
    });
    const sessionId = randomUUID();
    const session: TerminalSession = { process: terminalProcess, sender: event.sender, senderId: event.sender.id };
    this.#sessions.set(sessionId, session);

    terminalProcess.onData((data) => this.#emit(session, { sessionId, type: 'output', data }));
    terminalProcess.onExit(({ exitCode }) => {
      this.#emit(session, { sessionId, type: 'exit', exitCode });
      this.#sessions.delete(sessionId);
    });
    event.sender.once('destroyed', () => this.closeOwnedBy(event.sender.id));

    return {
      sessionId,
      title: `${userInfo().username}@${hostname().split('.')[0]}`,
      cwdLabel: basename(workspacePath),
      ...await readGitBranch(workspacePath),
    };
  }

  write(event: IpcMainInvokeEvent, sessionId: string, data: string): void {
    const session = this.#ownedSession(event, sessionId);
    if (typeof data !== 'string' || !data || data.length > MAX_INPUT_LENGTH) throw new Error('无效的终端输入');
    session.process.write(data);
  }

  resize(event: IpcMainInvokeEvent, sessionId: string, cols: number, rows: number): void {
    const session = this.#ownedSession(event, sessionId);
    session.process.resize(normalizeDimension(cols, DEFAULT_COLS), normalizeDimension(rows, DEFAULT_ROWS));
  }

  close(event: IpcMainInvokeEvent, sessionId: string): void {
    const session = this.#ownedSession(event, sessionId);
    this.#closeSession(sessionId, session);
  }

  closeOwnedBy(senderId: number): void {
    for (const [sessionId, session] of this.#sessions) {
      if (session.senderId === senderId) this.#closeSession(sessionId, session);
    }
  }

  dispose(): void {
    for (const [sessionId, session] of this.#sessions) this.#closeSession(sessionId, session);
  }

  #ownedSession(event: IpcMainInvokeEvent, sessionId: string): TerminalSession {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('无效的终端会话标识');
    const session = this.#sessions.get(sessionId);
    if (!session || session.senderId !== event.sender.id) throw new Error('终端会话不存在或不属于当前窗口');
    return session;
  }

  #emit(session: TerminalSession, terminalEvent: WorkspaceTerminalEvent): void {
    if (!session.sender.isDestroyed()) session.sender.send(DESKTOP_IPC.workspaceTerminalEvent, terminalEvent);
  }

  #closeSession(sessionId: string, session: TerminalSession): void {
    this.#sessions.delete(sessionId);
    try { session.process.kill(); } catch { /* The PTY may have already exited. */ }
  }
}

function resolveShell(): { executable: string; args: string[] } {
  if (process.platform === 'win32') {
    const windowsRoot = process.env.SystemRoot ?? 'C:\\Windows';
    return { executable: process.env.ComSpec ?? join(windowsRoot, 'System32', 'cmd.exe'), args: [] };
  }
  const preferred = process.env.SHELL && existsSync(process.env.SHELL)
    ? process.env.SHELL
    : process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  return { executable: existsSync(preferred) ? preferred : '/bin/sh', args: ['-l'] };
}

function normalizeDimension(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(2, Math.min(1_000, Math.round(value))) : fallback;
}
