import { describe, expect, it, vi } from 'vitest';

import { inspectSubThread, readFullThreadTurns } from './threadNavigation';

const metadata = {
  thread: {
    id: 'thread-child',
    parentThreadId: 'thread-parent',
    name: ' Child\u0000 thread ',
    agentNickname: 'reviewer',
    agentRole: 'review',
    historyMode: 'legacy',
    turns: [],
  },
};

describe('inspectSubThread', () => {
  it('validates the parent before returning a bounded semantic projection', async () => {
    const request = vi.fn(async (_method: string, params: { includeTurns?: boolean }) => params.includeTurns
      ? { thread: { ...metadata.thread, turns: [{ id: 'turn-child', status: 'completed', itemsView: 'full', items: [] }] } }
      : metadata);

    await expect(inspectSubThread({ request } as Parameters<typeof inspectSubThread>[0], {
      parentThreadId: 'thread-parent',
      threadId: 'thread-child',
    })).resolves.toEqual({
      threadId: 'thread-child',
      parentThreadId: 'thread-parent',
      name: 'Child  thread',
      agentNickname: 'reviewer',
      agentRole: 'review',
      turns: [{ id: 'turn-child', status: 'completed', itemsView: 'full', items: [] }],
    });
    expect(request).toHaveBeenNthCalledWith(1, 'thread/read', { threadId: 'thread-child' });
    expect(request).toHaveBeenNthCalledWith(2, 'thread/read', { threadId: 'thread-child', includeTurns: true });
  });

  it('fails closed when the target is not a direct child', async () => {
    const request = vi.fn(async () => ({ thread: { ...metadata.thread, parentThreadId: 'different-parent' } }));

    await expect(inspectSubThread({ request } as Parameters<typeof inspectSubThread>[0], {
      parentThreadId: 'thread-parent',
      threadId: 'thread-child',
    })).rejects.toThrow('目标线程不属于当前 Agent');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('pages full turns in chronological order for paginated threads', async () => {
    const request = vi.fn(async (method: string, params: { includeTurns?: boolean; cursor?: string | null; turnId?: string }) => {
      if (method === 'thread/read' && !params.includeTurns) {
        return { thread: { ...metadata.thread, historyMode: 'paginated' } };
      }
      if (method === 'thread/read') throw new Error('paginated threads do not support thread/read(includeTurns=true)');
      if (method === 'thread/turns/list' && !params.cursor) {
        return { data: [{ id: 'turn-1', status: 'completed', itemsView: 'notLoaded', items: [] }], nextCursor: 'page-2', backwardsCursor: null };
      }
      if (method === 'thread/turns/list') {
        return { data: [{ id: 'turn-2', status: 'completed', itemsView: 'notLoaded', items: [] }], nextCursor: null, backwardsCursor: null };
      }
      if (params.turnId === 'turn-1' && !params.cursor) {
        return {
          data: [{ turnId: 'turn-1', item: { type: 'userMessage', id: 'user-1', clientId: null, content: [{ type: 'text', text: 'run command', text_elements: [] }] } }],
          nextCursor: 'item-page-2',
          backwardsCursor: null,
        };
      }
      if (params.turnId === 'turn-1') {
        return {
          data: [{ turnId: 'turn-1', item: {
            type: 'commandExecution', id: 'command-1', command: 'echo ready', cwd: '/workspace', processId: null,
            source: 'agent', status: 'completed', commandActions: [], aggregatedOutput: 'ready\n', exitCode: 0, durationMs: 2,
          } }],
          nextCursor: null,
          backwardsCursor: null,
        };
      }
      return {
        data: [{ turnId: 'turn-2', item: { type: 'agentMessage', id: 'agent-2', text: 'done', phase: null, memoryCitation: null } }],
        nextCursor: null,
        backwardsCursor: null,
      };
    });

    const result = await inspectSubThread({ request } as Parameters<typeof inspectSubThread>[0], {
      parentThreadId: 'thread-parent',
      threadId: 'thread-child',
    });

    expect(result.turns.map((turn) => turn.id)).toEqual(['turn-1', 'turn-2']);
    expect(result.turns[0]?.items.map((item) => item.type)).toEqual(['userMessage', 'commandExecution']);
    expect(result.turns.every((turn) => turn.itemsView === 'full')).toBe(true);
    expect(request).toHaveBeenNthCalledWith(3, 'thread/turns/list', expect.objectContaining({ sortDirection: 'asc', itemsView: 'notLoaded', cursor: null }));
    expect(request).toHaveBeenNthCalledWith(4, 'thread/turns/list', expect.objectContaining({ cursor: 'page-2' }));
    expect(request).toHaveBeenNthCalledWith(5, 'thread/items/list', expect.objectContaining({ turnId: 'turn-1', cursor: null }));
    expect(request).toHaveBeenNthCalledWith(6, 'thread/items/list', expect.objectContaining({ turnId: 'turn-1', cursor: 'item-page-2' }));
    expect(request).toHaveBeenNthCalledWith(7, 'thread/items/list', expect.objectContaining({ turnId: 'turn-2', cursor: null }));
  });

  it('keeps legacy thread recovery on the native full-turn replay path', async () => {
    const request = vi.fn(async () => ({
      data: [{ id: 'turn-legacy', status: 'completed', itemsView: 'full', items: [] }],
      nextCursor: null,
      backwardsCursor: null,
    }));

    await expect(readFullThreadTurns(
      { request } as Parameters<typeof readFullThreadTurns>[0],
      'thread-legacy',
      'legacy',
    )).resolves.toEqual([{ id: 'turn-legacy', status: 'completed', itemsView: 'full', items: [] }]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('thread/turns/list', expect.objectContaining({ itemsView: 'full' }));
  });
});
