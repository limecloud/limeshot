import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { app } from 'electron';

import {
  BusinessClient,
  type BusinessRequestMethod,
  type BusinessRequestParams,
  type BusinessRequestResult,
} from '@business/index';

function executableName(): string { return process.platform === 'win32' ? 'business-server.exe' : 'business-server'; }

function resolveExecutable(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'bin', executableName());
  const override = process.env.LIMESHOT_BUSINESS_BIN;
  if (!override || !isAbsolute(override)) throw new Error('开发环境必须通过 LIMESHOT_BUSINESS_BIN 指定绝对路径');
  return resolve(override);
}

function resourcesDirectory(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources') : resolve('resources');
}

export class BusinessSupervisor {
  private child?: ChildProcessWithoutNullStreams;
  private client?: BusinessClient;
  private startPromise?: Promise<void>;

  start(): Promise<void> {
    if (this.client) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.spawn().finally(() => { this.startPromise = undefined; });
    return this.startPromise;
  }

  async stop(): Promise<void> {
    const client = this.client;
    const child = this.child;
    this.client = undefined;
    this.child = undefined;
    if (client) {
      try { await client.request('business/shutdown' as BusinessRequestMethod, {} as never); }
      catch { child?.kill(); }
      client.close();
    }
    if (child && child.exitCode === null) child.kill();
  }

  async request<M extends BusinessRequestMethod>(method: M, params: BusinessRequestParams<M>): Promise<BusinessRequestResult<M>> {
    await this.start();
    if (!this.client) throw new Error('Rust Business Service 未连接');
    return this.client.request(method, params);
  }

  private async spawn(): Promise<void> {
    const root = join(app.getPath('userData'), 'business');
    const dataDir = join(root, 'data');
    const managedDir = join(root, 'managed');
    const logDir = join(root, 'logs');
    for (const directory of [dataDir, managedDir, logDir]) mkdirSync(directory, { recursive: true });
    const child = spawn(resolveExecutable(), [
      '--stdio', '--data-dir', dataDir, '--resources-dir', managedDir, '--log-dir', logDir,
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    child.stderr.on('data', (chunk) => console.error(`[business-server] ${String(chunk).trimEnd()}`));
    child.once('exit', (code, signal) => {
      if (this.child !== child) return;
      this.client?.close();
      this.client = undefined;
      this.child = undefined;
      console.error(`Rust Business Service exited: code=${String(code)} signal=${String(signal)}`);
    });
    const client = new BusinessClient(child);
    try {
      await client.initialize(randomUUID(), app.getVersion());
      this.client = client;
    } catch (error) {
      client.close();
      child.kill();
      throw error;
    }
  }
}
