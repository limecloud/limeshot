import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import {
  BUSINESS_PROTOCOL_VERSION,
  type BusinessRequestMap,
  type BusinessRequestMethod,
  type BusinessRequestParams,
  type BusinessRequestResult,
} from './generated';

interface BusinessPeer {
  stdin: Writable;
  stdout: Readable;
}

interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: { domainCode?: string; retryable?: boolean };
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class BusinessRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly domainCode?: string,
  ) {
    super(message);
    this.name = 'BusinessRpcError';
  }
}

export class BusinessClient {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly lines;
  private nextId = 1;
  private closed = false;

  constructor(private readonly peer: BusinessPeer) {
    this.lines = createInterface({ input: peer.stdout });
    this.lines.on('line', (line) => this.receive(line));
    this.lines.on('close', () => this.failPending(new Error('Rust Business Service connection closed')));
  }

  async initialize(instanceId: string, version: string): Promise<void> {
    await this.requestRaw('initialize', {
      clientInfo: { name: 'limeshot-electron', version },
      protocolVersion: BUSINESS_PROTOCOL_VERSION,
      instanceId,
    });
    this.notify('initialized', {});
  }

  request<M extends BusinessRequestMethod>(
    method: M,
    params: BusinessRequestParams<M>,
  ): Promise<BusinessRequestResult<M>> {
    return this.requestRaw(method, params) as Promise<BusinessRequestResult<M>>;
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.lines.close();
    this.failPending(new Error('Rust Business Service client closed'));
  }

  private requestRaw(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Rust Business Service client is closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.write({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private receive(line: string): void {
    let message: { jsonrpc?: string; id?: number; result?: unknown; error?: JsonRpcErrorPayload };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      this.failPending(new Error('Rust Business Service emitted invalid JSON'));
      return;
    }
    if (message.jsonrpc !== '2.0' || typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new BusinessRpcError(message.error.code, message.error.message, message.error.data?.domainCode));
    } else {
      pending.resolve(message.result);
    }
  }

  private write(message: unknown): void {
    this.peer.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export type { BusinessRequestMap };
export * from './generated';
