import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { BusinessClient } from './index';

describe('BusinessClient', () => {
  it('uses standard JSON-RPC 2.0 envelopes', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const client = new BusinessClient({ stdin, stdout });
    const request = client.request('business/status/read', {});
    await new Promise((resolve) => setImmediate(resolve));
    const envelope = JSON.parse(writes.join('').trim()) as { jsonrpc: string; id: number };
    expect(envelope.jsonrpc).toBe('2.0');
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: envelope.id, result: { status: 'ready', serverPid: 1, protocolVersion: 1, startedAtEpochMs: 1 } })}\n`);
    await expect(request).resolves.toMatchObject({ status: 'ready' });
    client.close();
  });
});
