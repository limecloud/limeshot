import { describe, expect, it } from 'vitest';

import { projectNotification, projectThread } from './projection';

describe('Codex semantic projection', () => {
  it('projects canonical history without creating a second agent state model', () => {
    expect(projectThread({
      id: 'thread-1',
      turns: [{
        id: 'turn-1', status: 'completed', error: null,
        items: [
          { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: '生成方案', text_elements: [] }] },
          { type: 'agentMessage', id: 'agent-1', text: '先补充目标平台。' },
        ],
      }],
    })).toEqual([{
      id: 'turn-1', status: 'completed',
      items: [
        { id: 'user-1', kind: 'user', text: '生成方案' },
        { id: 'agent-1', kind: 'assistant', text: '先补充目标平台。' },
      ],
    }]);
  });

  it('maps only allowlisted notifications into renderer events', () => {
    expect(projectNotification({ method: 'item/agentMessage/delta', params: {
      threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', delta: '片段',
    } })).toEqual({
      type: 'message.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', delta: '片段',
    });
    expect(projectNotification({ method: 'account/updated', params: {} })).toBeUndefined();
  });
});
