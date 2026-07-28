import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { app } from 'electron';

import { CODEX_VERSION, CodexClient, type CodexNotification, type CodexRequestMethod, type CodexRequestParams, type CodexRequestResult, type CodexToolCallRequest, type CodexToolCallResponse } from '@codex/index';

function executableName(): string { return process.platform === 'win32' ? 'codex.exe' : 'codex'; }

function resolveExecutable(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'bin', executableName());
  const override = process.env.LIMESHOT_CODEX_BIN;
  if (override) {
    if (!isAbsolute(override)) throw new Error('LIMESHOT_CODEX_BIN 必须是绝对路径');
    return resolve(override);
  }
  return resolve(app.getAppPath(), 'rust', 'target', 'codex-release', CODEX_VERSION, developmentExecutableName());
}

function developmentExecutableName(): string {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'codex-aarch64-apple-darwin';
  throw new Error(`当前开发平台没有受管 Codex release: ${process.platform}-${process.arch}`);
}

function resolveCodexHome(): string {
  if (app.isPackaged) return join(app.getPath('userData'), 'codex');
  const override = process.env.LIMESHOT_CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
  if (!isAbsolute(override)) throw new Error('LIMESHOT_CODEX_HOME 必须是绝对路径');
  return resolve(override);
}

function skillsDirectory(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources', 'skills') : resolve('resources', 'skills');
}

export class CodexSupervisor {
  private child?: ChildProcessWithoutNullStreams;
  private client?: CodexClient;
  private startPromise?: Promise<void>;
  private readonly listeners = new Set<(notification: CodexNotification) => void>();
  private readonly activeThreadIds = new Set<string>();
  private readonly unmaterializedThreadIds = new Set<string>();

  constructor(private readonly routeToolCall: (request: CodexToolCallRequest) => Promise<CodexToolCallResponse>) {}

  start(): Promise<void> {
    if (this.client) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.spawn().finally(() => { this.startPromise = undefined; });
    return this.startPromise;
  }

  async stop(): Promise<void> {
    this.client?.close();
    this.client = undefined;
    this.activeThreadIds.clear();
    this.unmaterializedThreadIds.clear();
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null) child.kill();
  }

  async request<M extends CodexRequestMethod>(method: M, params: CodexRequestParams<M>): Promise<CodexRequestResult<M>> {
    await this.start();
    if (!this.client) throw new Error('Codex App Server 未连接');
    const result = await this.client.request(method, params);
    if (method === 'thread/start' || method === 'thread/resume') {
      const threadId = (result as { thread?: { id?: unknown } }).thread?.id;
      if (typeof threadId === 'string') {
        this.activeThreadIds.add(threadId);
        if (method === 'thread/start') this.unmaterializedThreadIds.add(threadId);
        else this.unmaterializedThreadIds.delete(threadId);
      }
    } else if (method === 'turn/start') {
      this.unmaterializedThreadIds.delete((params as CodexRequestParams<'turn/start'>).threadId);
    }
    return result;
  }

  isThreadActive(threadId: string): boolean { return this.activeThreadIds.has(threadId); }
  isThreadUnmaterialized(threadId: string): boolean { return this.unmaterializedThreadIds.has(threadId); }

  subscribe(listener: (notification: CodexNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async spawn(): Promise<void> {
    const codexHome = resolveCodexHome();
    mkdirSync(codexHome, { recursive: true });
    const child = spawn(resolveExecutable(), ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    this.child = child;
    child.stderr.on('data', (chunk) => console.error(`[codex] ${String(chunk).trimEnd()}`));
    child.once('exit', (code, signal) => {
      if (this.child !== child) return;
      this.client?.close();
      this.client = undefined;
      this.child = undefined;
      this.activeThreadIds.clear();
      this.unmaterializedThreadIds.clear();
      console.error(`Codex App Server exited: code=${String(code)} signal=${String(signal)}`);
    });
    const client = new CodexClient(child);
    client.handle('item/tool/call', (params) => this.routeToolCall(params as CodexToolCallRequest));
    client.subscribe((notification) => {
      for (const listener of this.listeners) listener(notification);
    });
    try {
      await client.initialize(app.getVersion());
      await client.request('skills/extraRoots/set', { extraRoots: [skillsDirectory()] });
      this.client = client;
    } catch (error) {
      client.close();
      child.kill();
      throw error;
    }
  }
}
