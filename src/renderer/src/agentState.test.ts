import { describe, expect, it } from 'vitest';

import { applyAgentEvent, runningTurn } from './agentState';

describe('agentState', () => {
  it('streams deltas into one canonical item and replaces it with the completed item', () => {
    let turns = applyAgentEvent([], 'thread-1', {
      type: 'turn.started', threadId: 'thread-1', turn: { id: 'turn-1', status: 'inProgress', items: [] },
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'message.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: '方案',
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'message.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: '如下',
    });
    expect(turns[0]?.items[0]?.text).toBe('方案如下');
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'turn.completed', threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'completed', items: [{ id: 'item-1', kind: 'assistant', text: '最终方案' }] },
    });
    expect(turns[0]?.items[0]?.text).toBe('最终方案');
    expect(runningTurn(turns)).toBeUndefined();
  });

  it('ignores events from other threads', () => {
    const turns = [{ id: 'turn-1', status: 'completed' as const, items: [] }];
    expect(applyAgentEvent(turns, 'thread-1', {
      type: 'message.delta', threadId: 'thread-2', turnId: 'turn-2', itemId: 'item-2', delta: 'ignored',
    })).toBe(turns);
  });

  it('preserves streamed items when turn/completed omits its item snapshot', () => {
    const active = [{
      id: 'turn-1',
      status: 'inProgress' as const,
      items: [
        { id: 'tool-1', kind: 'tool' as const, title: 'project_read', text: '', status: 'completed' },
        { id: 'message-1', kind: 'assistant' as const, text: 'Gate B complete' },
      ],
    }];
    const completed = applyAgentEvent(active, 'thread-1', {
      type: 'turn.completed',
      threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'completed', items: [] },
    });

    expect(completed[0]).toMatchObject({ status: 'completed', items: active[0].items });
  });
});
