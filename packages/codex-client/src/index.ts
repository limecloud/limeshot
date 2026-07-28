import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import type {
  CodexNotification,
  CodexRequestMap,
  CodexRequestMethod,
  CodexRequestParams,
  CodexRequestResult,
} from './types';

interface CodexPeer { stdin: Writable; stdout: Readable }
interface Pending { resolve(value: unknown): void; reject(error: Error): void }
interface NativeMessage { id?: number; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string } }
type ReverseHandler = (params: unknown) => Promise<unknown>;

export class CodexRpcError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'CodexRpcError';
  }
}

export class CodexClient {
  private readonly pending = new Map<number, Pending>();
  private readonly reverseHandlers = new Map<string, ReverseHandler>();
  private readonly notificationListeners = new Set<(notification: CodexNotification) => void>();
  private readonly lines;
  private nextId = 1;
  private closed = false;

  constructor(private readonly peer: CodexPeer) {
    this.lines = createInterface({ input: peer.stdout });
    this.lines.on('line', (line) => void this.receive(line));
    this.lines.on('close', () => this.failPending(new Error('Codex App Server connection closed')));
  }

  async initialize(version: string): Promise<void> {
    await this.requestRaw('initialize', {
      clientInfo: { name: 'limeshot', title: 'LimeShot', version },
      capabilities: { experimentalApi: true },
    });
    this.notify('initialized', {});
  }

  request<M extends CodexRequestMethod>(method: M, params: CodexRequestParams<M>): Promise<CodexRequestResult<M>> {
    return this.requestRaw(method, params) as Promise<CodexRequestResult<M>>;
  }

  handle(method: string, handler: ReverseHandler): () => void {
    this.reverseHandlers.set(method, handler);
    return () => this.reverseHandlers.delete(method);
  }

  subscribe(listener: (notification: CodexNotification) => void): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  notify(method: string, params: unknown): void { this.write({ method, params }); }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.lines.close();
    this.failPending(new Error('Codex App Server client closed'));
  }

  private requestRaw(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Codex App Server client is closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.write({ id, method, params }); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }

  private async receive(line: string): Promise<void> {
    let message: NativeMessage;
    try { message = JSON.parse(line) as NativeMessage; }
    catch { this.failPending(new Error('Codex App Server emitted invalid JSON')); return; }
    if ('jsonrpc' in message) {
      this.failPending(new Error('Codex native protocol must not contain jsonrpc'));
      return;
    }
    if (typeof message.id === 'number' && typeof message.method === 'string') {
      const handler = this.reverseHandlers.get(message.method);
      if (!handler) { this.write({ id: message.id, error: { code: -32601, message: 'Method not found' } }); return; }
      try { this.write({ id: message.id, result: await handler(message.params) }); }
      catch (error) { this.write({ id: message.id, error: { code: -32000, message: error instanceof Error ? error.message : 'Reverse request failed' } }); }
      return;
    }
    if (typeof message.method === 'string') {
      for (const listener of this.notificationListeners) listener({ method: message.method, params: message.params });
      return;
    }
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new CodexRpcError(message.error.code, message.error.message));
    else pending.resolve(message.result);
  }

  private write(message: unknown): void { this.peer.stdin.write(`${JSON.stringify(message)}\n`); }
  private failPending(error: Error): void { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear(); }
}

export * from './types';
export type { CodexRequestMap };
