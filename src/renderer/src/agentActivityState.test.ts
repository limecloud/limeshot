import { describe, expect, it } from 'vitest';

import { applyAgentActivityEvent, createAgentActivityState, dismissAgentNotice } from './agentActivityState';

describe('agentActivityState', () => {
  it('merges thread context, status, usage, realtime, hooks, and safety reviews without changing turn history', () => {
    let state = createAgentActivityState();
    state = applyAgentActivityEvent(state, { type: 'thread.context.updated', threadId: 'thread-1', patch: { lifecycle: 'active', name: 'Render', model: { current: 'gpt-5' } } });
    state = applyAgentActivityEvent(state, { type: 'thread.status.updated', threadId: 'thread-1', status: { type: 'active', waitingOnApproval: true, waitingOnUserInput: false } });
    state = applyAgentActivityEvent(state, { type: 'thread.usage.updated', threadId: 'thread-1', turnId: 'turn-1', usage: { totalTokens: 10, inputTokens: 4, cachedInputTokens: 1, cacheWriteInputTokens: 0, outputTokens: 6, reasoningOutputTokens: 2 } });
    state = applyAgentActivityEvent(state, { type: 'thread.realtime.updated', threadId: 'thread-1', update: { kind: 'started', sessionActive: true, version: 'v2' } });
    state = applyAgentActivityEvent(state, { type: 'thread.realtime.updated', threadId: 'thread-1', update: { kind: 'transcriptDelta', role: 'user', text: 'hello ' } });
    state = applyAgentActivityEvent(state, { type: 'thread.realtime.updated', threadId: 'thread-1', update: { kind: 'transcriptDone', role: 'user', text: 'hello world' } });
    state = applyAgentActivityEvent(state, { type: 'hook.updated', threadId: 'thread-1', hook: { id: 'hook-1', eventName: 'afterTurn', status: 'running', entries: [] } });
    state = applyAgentActivityEvent(state, { type: 'hook.updated', threadId: 'thread-1', hook: { id: 'hook-1', eventName: 'afterTurn', status: 'completed', durationMs: 12, entries: [{ kind: 'output', text: 'ok' }] } });
    state = applyAgentActivityEvent(state, { type: 'review.updated', threadId: 'thread-1', review: { id: 'review-1', turnId: 'turn-1', status: 'approved', action: 'command', summary: 'npm test', risk: 'low' } });

    expect(state.threads['thread-1']).toMatchObject({
      lifecycle: 'active', name: 'Render', model: { current: 'gpt-5' },
      status: { waitingOnApproval: true }, usage: { totalTokens: 10 },
      realtime: { state: 'connected', transcript: 'hello world', provisional: false },
      hooks: [{ id: 'hook-1', status: 'completed' }],
      reviews: [{ id: 'review-1', status: 'approved' }],
    });
  });

  it('keeps global consumers bounded, preserves completed search results, and dismisses notices', () => {
    let state = createAgentActivityState();
    state = applyAgentActivityEvent(state, { type: 'notice.updated', notice: { id: 'warning-1', scope: 'global', level: 'warning', kind: 'warning', message: 'Check config' } });
    state = applyAgentActivityEvent(state, { type: 'catalog.updated', update: { id: 'mcp:docs', domain: 'mcp', status: 'ready', label: 'docs' } });
    state = applyAgentActivityEvent(state, { type: 'diagnostic.recorded', diagnostic: { id: 'process:1', domain: 'process', code: 'processExited', level: 'info' } });
    state = applyAgentActivityEvent(state, { type: 'composer.search.updated', search: { sessionId: 'search-1', query: 'App', status: 'searching', files: [{ path: 'src/App.tsx', name: 'App.tsx' }] } });
    state = applyAgentActivityEvent(state, { type: 'composer.search.updated', search: { sessionId: 'search-1', query: '', status: 'completed', files: [] } });

    expect(state.catalog).toEqual([{ id: 'mcp:docs', domain: 'mcp', status: 'ready', label: 'docs' }]);
    expect(state.diagnostics).toHaveLength(1);
    expect(state.composerSearch).toEqual({ sessionId: 'search-1', query: 'App', status: 'completed', files: [{ path: 'src/App.tsx', name: 'App.tsx' }] });
    expect(dismissAgentNotice(state, 'warning-1').notices).toEqual([]);
  });

  it('keeps agent errors semantic so the renderer owns localized copy', () => {
    const state = applyAgentActivityEvent(createAgentActivityState(), {
      type: 'agent.error', threadId: 'thread-1', turnId: 'turn-1', message: 'private upstream detail', willRetry: true,
    });

    expect(state.notices).toEqual([{
      id: 'error:turn-1', scope: 'thread', level: 'error', kind: 'error',
      threadId: 'thread-1', turnId: 'turn-1', status: 'retrying',
    }]);
    expect(JSON.stringify(state)).not.toContain('private upstream detail');
  });
});
