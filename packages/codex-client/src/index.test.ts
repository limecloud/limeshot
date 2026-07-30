import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { CODEX_NEW_THREAD_HISTORY_MODE, CODEX_SERVER_REQUEST_METHODS, CodexClient } from './index';

describe('CodexClient', () => {
  it('locks the complete 11-method reverse request surface', () => {
    expect(CODEX_SERVER_REQUEST_METHODS).toHaveLength(11);
    expect(CODEX_SERVER_REQUEST_METHODS).toContain('currentTime/read');
  });

  it('requests native paginated history from the fixed 0.145 runtime', () => {
    expect(CODEX_NEW_THREAD_HISTORY_MODE).toBe('paginated');
  });

  it('keeps model discovery and thread setting updates on the native typed envelope', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const client = new CodexClient({ stdin, stdout });

    const models = client.request('model/list', { cursor: null, limit: 100, includeHidden: false });
    await new Promise((resolve) => setImmediate(resolve));
    const modelRequest = JSON.parse(writes.shift()!.trim()) as { id: number; method: string; params: unknown; jsonrpc?: string };
    expect(modelRequest).toMatchObject({ method: 'model/list', params: { cursor: null, limit: 100, includeHidden: false } });
    expect(modelRequest.jsonrpc).toBeUndefined();
    stdout.write(`${JSON.stringify({ id: modelRequest.id, result: { data: [], nextCursor: null } })}\n`);
    await expect(models).resolves.toEqual({ data: [], nextCursor: null });

    const update = client.request('thread/settings/update', { threadId: 'thread-1', model: 'gpt-5.6', effort: 'xhigh' });
    await new Promise((resolve) => setImmediate(resolve));
    const updateRequest = JSON.parse(writes.shift()!.trim()) as { id: number; method: string; params: unknown; jsonrpc?: string };
    expect(updateRequest).toMatchObject({
      method: 'thread/settings/update',
      params: { threadId: 'thread-1', model: 'gpt-5.6', effort: 'xhigh' },
    });
    expect(updateRequest.jsonrpc).toBeUndefined();
    stdout.write(`${JSON.stringify({ id: updateRequest.id, result: {} })}\n`);
    await expect(update).resolves.toEqual({});
    client.close();
  });

  it('keeps Goal, plugin discovery, and collaboration modes on native JSONL envelopes', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const client = new CodexClient({ stdin, stdout });

    const goal = client.request('thread/goal/set', { threadId: 'thread-1', objective: 'Ship', status: 'active' });
    await new Promise((resolve) => setImmediate(resolve));
    const goalRequest = JSON.parse(writes.shift()!.trim()) as { id: number; method: string; params: unknown; jsonrpc?: string };
    expect(goalRequest).toMatchObject({ method: 'thread/goal/set', params: { threadId: 'thread-1', objective: 'Ship', status: 'active' } });
    expect(goalRequest.jsonrpc).toBeUndefined();
    stdout.write(`${JSON.stringify({ id: goalRequest.id, result: {} })}\n`);
    await expect(goal).resolves.toEqual({});

    const plugins = client.request('plugin/list', { cwds: ['/workspace'] });
    await new Promise((resolve) => setImmediate(resolve));
    const pluginRequest = JSON.parse(writes.shift()!.trim()) as { id: number; method: string; params: unknown; jsonrpc?: string };
    expect(pluginRequest).toMatchObject({ method: 'plugin/list', params: { cwds: ['/workspace'] } });
    expect(pluginRequest.jsonrpc).toBeUndefined();
    stdout.write(`${JSON.stringify({ id: pluginRequest.id, result: { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] } })}\n`);
    await expect(plugins).resolves.toEqual({ marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] });

    const modes = client.request('collaborationMode/list', {});
    await new Promise((resolve) => setImmediate(resolve));
    const modeRequest = JSON.parse(writes.shift()!.trim()) as { id: number; method: string; params: unknown; jsonrpc?: string };
    expect(modeRequest).toMatchObject({ method: 'collaborationMode/list', params: {} });
    expect(modeRequest.jsonrpc).toBeUndefined();
    stdout.write(`${JSON.stringify({ id: modeRequest.id, result: { data: [] } })}\n`);
    await expect(modes).resolves.toEqual({ data: [] });
    client.close();
  });

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
      historyMode: 'paginated',
      dynamicTools: [{ type: 'function', name: 'project_read', description: 'Read project', inputSchema: { type: 'object' } }],
    });
    await new Promise((resolve) => setImmediate(resolve));
    const envelope = JSON.parse(writes.join('').trim()) as { id: number; params: { dynamicTools: Array<{ type: string }>; historyMode: string } };
    expect(envelope.params.dynamicTools[0]?.type).toBe('function');
    expect(envelope.params.historyMode).toBe('paginated');
    stdout.write(`${JSON.stringify({ id: envelope.id, result: { thread: { id: 'thread-1' } } })}\n`);
    await expect(request).resolves.toMatchObject({ thread: { id: 'thread-1' } });
    client.close();
  });

  it('allows standalone threads to use the app-server default cwd', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const client = new CodexClient({ stdin, stdout });
    const request = client.request('thread/start', {
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
    });
    await new Promise((resolve) => setImmediate(resolve));
    const envelope = JSON.parse(writes.join('').trim()) as { id: number; params: { cwd?: string } };
    expect(envelope.params.cwd).toBeUndefined();
    stdout.write(`${JSON.stringify({ id: envelope.id, result: { thread: { id: 'thread-standalone', turns: [] } } })}\n`);
    await expect(request).resolves.toMatchObject({ thread: { id: 'thread-standalone' } });
    client.close();
  });

  it('routes typed reverse requests and preserves string request ids internally', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const writes: string[] = [];
    stdin.on('data', (chunk) => writes.push(chunk.toString()));
    const client = new CodexClient({ stdin, stdout });
    client.handle('item/fileChange/requestApproval', async (params, meta) => {
      expect(params.itemId).toBe('item-1');
      expect(meta).toEqual({ id: 'approval-1', method: 'item/fileChange/requestApproval' });
      return { decision: 'decline' };
    });

    stdout.write(`${JSON.stringify({
      id: 'approval-1',
      method: 'item/fileChange/requestApproval',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', startedAtMs: 1 },
    })}\n`);
    await new Promise((resolve) => setImmediate(resolve));

    expect(JSON.parse(writes.join('').trim())).toEqual({ id: 'approval-1', result: { decision: 'decline' } });
    client.close();
  });

  it('forwards unknown notifications to the drift guard instead of dropping them', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const client = new CodexClient({ stdin, stdout });
    const received: unknown[] = [];
    client.subscribe((notification) => received.push(notification));

    stdout.write(`${JSON.stringify({
      method: 'future/privateNotification',
      params: { value: 1 },
    })}\n`);
    await new Promise((resolve) => setImmediate(resolve));

    expect(received).toEqual([{
      method: 'unknown',
      sourceMethod: 'future/privateNotification',
      params: { value: 1 },
    }]);
    client.close();
  });
});
