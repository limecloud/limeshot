import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { CodexClient } from './index';

describe('CodexClient', () => {
  it('uses the native JSONL envelope without jsonrpc', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const client = new CodexClient({ stdin, stdout });
    const request = client.request('thread/read', { threadId: 'thread-1', includeTurns: true });
    await new Promise((resolve) => setImmediate(resolve));
    const envelope = JSON.parse(writes.join('').trim()) as { id: number; jsonrpc?: string };
    expect(envelope.jsonrpc).toBeUndefined();
    stdout.write(`${JSON.stringify({ id: envelope.id, result: { thread: { id: 'thread-1' } } })}\n`);
    await expect(request).resolves.toMatchObject({ thread: { id: 'thread-1' } });
    client.close();
  });

  it('preserves the canonical dynamic tool envelope', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const client = new CodexClient({ stdin, stdout });
    const request = client.request('thread/start', {
      cwd: '/workspace',
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
      dynamicTools: [{ type: 'function', name: 'project_read', description: 'Read project', inputSchema: { type: 'object' } }],
    });
    await new Promise((resolve) => setImmediate(resolve));
    const envelope = JSON.parse(writes.join('').trim()) as { id: number; params: { dynamicTools: Array<{ type: string }> } };
    expect(envelope.params.dynamicTools[0]?.type).toBe('function');
    stdout.write(`${JSON.stringify({ id: envelope.id, result: { thread: { id: 'thread-1' } } })}\n`);
    await expect(request).resolves.toMatchObject({ thread: { id: 'thread-1' } });
    client.close();
  });
});
