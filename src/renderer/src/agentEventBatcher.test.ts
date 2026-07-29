import { describe, expect, it, vi } from 'vitest';

import type { AgentEvent } from '../../shared/desktop';
import { createAgentEventBatcher } from './agentEventBatcher';

describe('agentEventBatcher', () => {
  it('reduces every event in order with one scheduled render flush', () => {
    const callbacks: Array<() => void> = [];
    const cancel = vi.fn();
    const consume = vi.fn();
    const batcher = createAgentEventBatcher(consume, (callback) => {
      callbacks.push(callback);
      return cancel;
    });
    const events: AgentEvent[] = [
      { type: 'item.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', channel: 'agentMessage', delta: 'a' },
      { type: 'item.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', channel: 'agentMessage', delta: 'b' },
      { type: 'thread.usage.updated', threadId: 'thread-1', turnId: 'turn-1', usage: { totalTokens: 2, inputTokens: 1, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0 } },
    ];

    events.forEach((event) => batcher.push(event));
    expect(callbacks).toHaveLength(1);
    expect(consume).not.toHaveBeenCalled();
    callbacks[0]?.();
    expect(consume).toHaveBeenCalledWith(events);

    batcher.push(events[0]!);
    expect(callbacks).toHaveLength(2);
    batcher.dispose();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
