import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { app, shell } from 'electron';

import { CODEX_VERSION, CodexClient, type CodexNotification, type CodexRequestMethod, type CodexRequestParams, type CodexRequestResult, type CodexToolCallRequest, type CodexToolCallResponse } from '@codex/index';
import type { AgentEvent, AgentInteractionExternalOpenInput, AgentInteractionExternalOpenResult, AgentInteractionSubmitInput, AgentInteractionSubmitResult, AgentPendingInteractionProjection } from '../../shared/agent';
import { InteractionCoordinator } from './interactions';

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
  if (process.platform === 'win32' && process.arch === 'x64') return 'codex-x86_64-pc-windows-msvc.exe';
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

function standaloneDirectory(): string {
  const path = join(app.getPath('userData'), 'standalone');
  mkdirSync(path, { recursive: true });
  return realpathSync(path);
}

export class CodexSupervisor {
  private child?: ChildProcessWithoutNullStreams;
  private client?: CodexClient;
  private startPromise?: Promise<void>;
  private readonly listeners = new Set<(notification: CodexNotification) => void>();
  private readonly activeThreadIds = new Set<string>();
  private readonly unmaterializedThreadIds = new Set<string>();
  private readonly interactions: InteractionCoordinator;

  constructor(private readonly routeToolCall: (request: CodexToolCallRequest) => Promise<CodexToolCallResponse>) {
    this.interactions = new InteractionCoordinator((url) => shell.openExternal(url));
  }

  start(): Promise<void> {
    if (this.client) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.spawn().finally(() => { this.startPromise = undefined; });
    return this.startPromise;
  }

  async stop(): Promise<void> {
    this.interactions.disconnectAll();
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
  defaultCwd(): string { return standaloneDirectory(); }

  subscribe(listener: (notification: CodexNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeInteractions(listener: (event: AgentEvent) => void): () => void {
    return this.interactions.subscribe(listener);
  }

  listInteractions(): AgentPendingInteractionProjection[] {
    return this.interactions.list();
  }

  submitInteraction(input: AgentInteractionSubmitInput): AgentInteractionSubmitResult {
    return this.interactions.submit(input);
  }

  openInteractionExternal(input: AgentInteractionExternalOpenInput): Promise<AgentInteractionExternalOpenResult> {
    return this.interactions.openExternal(input);
  }

  private async spawn(): Promise<void> {
    const codexHome = resolveCodexHome();
    const cwd = standaloneDirectory();
    mkdirSync(codexHome, { recursive: true });
    const child = spawn(resolveExecutable(), ['app-server', '--listen', 'stdio://'], {
      cwd,
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
      this.interactions.disconnectAll();
      console.error(`Codex App Server exited: code=${String(code)} signal=${String(signal)}`);
    });
    const client = new CodexClient(child);
    client.handle('item/commandExecution/requestApproval', (params, meta) => this.interactions.request('item/commandExecution/requestApproval', params, meta));
    client.handle('item/fileChange/requestApproval', (params, meta) => this.interactions.request('item/fileChange/requestApproval', params, meta));
    client.handle('item/tool/requestUserInput', (params, meta) => this.interactions.request('item/tool/requestUserInput', params, meta));
    client.handle('mcpServer/elicitation/request', (params, meta) => this.interactions.request('mcpServer/elicitation/request', params, meta));
    client.handle('item/permissions/requestApproval', (params, meta) => this.interactions.request('item/permissions/requestApproval', params, meta));
    client.handle('item/tool/call', (params) => this.routeToolCall(params as CodexToolCallRequest));
    client.handle('account/chatgptAuthTokens/refresh', async () => {
      throw new Error('Desktop host 不管理外部 ChatGPT 凭证，请重新登录 Codex');
    });
    client.handle('attestation/generate', async () => {
      throw new Error(`当前平台没有可用的客户端证明能力: ${process.platform}-${process.arch}`);
    });
    client.handle('currentTime/read', async () => ({ currentTimeAt: Math.floor(Date.now() / 1000) }));
    client.handle('applyPatchApproval', (params, meta) => this.interactions.request('applyPatchApproval', params, meta));
    client.handle('execCommandApproval', (params, meta) => this.interactions.request('execCommandApproval', params, meta));
    client.subscribe((notification) => {
      this.reconcileInteractions(notification);
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

  private reconcileInteractions(notification: CodexNotification): void {
    if (notification.method === 'unknown') return;
    const params = typeof notification.params === 'object' && notification.params !== null
      ? notification.params as Record<string, unknown>
      : {};
    const threadId = typeof params.threadId === 'string' ? params.threadId : undefined;
    if (notification.method === 'serverRequest/resolved') {
      this.interactions.resolveRaw(params.requestId);
    } else if (notification.method === 'turn/completed' && threadId) {
      const turn = typeof params.turn === 'object' && params.turn !== null ? params.turn as Record<string, unknown> : {};
      if (typeof turn.id === 'string') this.interactions.completeTurn(threadId, turn.id);
    } else if (notification.method === 'thread/closed' && threadId) {
      this.interactions.closeThread(threadId);
    }
  }
}
