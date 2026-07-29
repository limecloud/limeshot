import { describe, expect, it } from 'vitest';

import type { AgentItemProjection, AgentTurnProjection } from '../../shared/desktop';
import { applyAgentEvent, runningTurn } from './agentState';

const turn = (id: string, status: AgentTurnProjection['status'], items: AgentItemProjection[] = []): AgentTurnProjection => ({
  id,
  status,
  itemsView: 'full',
  items,
});

const message = (id: string, text: string): AgentItemProjection => ({ id, type: 'agentMessage', kind: 'assistant', text });
const tool = (id: string, title: string): AgentItemProjection => ({
  id,
  type: 'dynamicToolCall',
  kind: 'tool',
  title,
  text: '',
  status: 'completed',
  tool: title,
  arguments: null,
  content: [],
});

describe('agentState', () => {
  it('streams deltas into one canonical item and replaces it with the completed item', () => {
    let turns = applyAgentEvent([], 'thread-1', {
      type: 'turn.started', threadId: 'thread-1', turn: turn('turn-1', 'inProgress'),
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'item.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', channel: 'agentMessage', delta: '方案',
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'item.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', channel: 'agentMessage', delta: '如下',
    });
    expect(turns[0]?.items[0]?.text).toBe('方案如下');
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'turn.completed', threadId: 'thread-1',
      turn: turn('turn-1', 'completed', [message('item-1', '最终方案')]),
    });
    expect(turns[0]?.items[0]?.text).toBe('最终方案');
    expect(runningTurn(turns)).toBeUndefined();
  });

  it('ignores events from other threads', () => {
    const turns = [turn('turn-1', 'completed')];
    expect(applyAgentEvent(turns, 'thread-1', {
      type: 'item.delta', threadId: 'thread-2', turnId: 'turn-2', itemId: 'item-2', channel: 'agentMessage', delta: 'ignored',
    })).toBe(turns);
  });

  it('preserves streamed items when turn/completed omits its item snapshot', () => {
    const active = [turn('turn-1', 'inProgress', [tool('tool-1', 'project_read'), message('message-1', 'Gate B complete')])];
    const completed = applyAgentEvent(active, 'thread-1', {
      type: 'turn.completed',
      threadId: 'thread-1',
      turn: turn('turn-1', 'completed'),
    });

    expect(completed[0]).toMatchObject({ status: 'completed', items: active[0].items });
  });

  it('reduces reasoning, command output, patch, MCP progress and turn metadata', () => {
    let turns = [turn('turn-1', 'inProgress')];
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'item.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'reason-1', channel: 'reasoningSummary', index: 1, delta: '检查类型',
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'item.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'command-1', channel: 'commandOutput', delta: 'ok\n',
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'item.patch.updated', threadId: 'thread-1', turnId: 'turn-1', itemId: 'file-1', changes: [{ path: 'src/App.tsx', kind: 'update', diff: '+done' }],
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'item.progress', threadId: 'thread-1', turnId: 'turn-1', itemId: 'mcp-1', message: '读取资源',
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'turn.plan.updated', threadId: 'thread-1', turnId: 'turn-1', steps: [{ step: '实现', status: 'inProgress' }],
    });
    turns = applyAgentEvent(turns, 'thread-1', {
      type: 'turn.diff.updated', threadId: 'thread-1', turnId: 'turn-1', diff: '+all',
    });

    expect(turns[0]?.items.map((item) => item.type)).toEqual(['reasoning', 'commandExecution', 'fileChange', 'mcpToolCall']);
    expect(turns[0]?.items[0]).toMatchObject({ summary: ['', '检查类型'] });
    expect(turns[0]?.items[1]).toMatchObject({ output: 'ok\n' });
    expect(turns[0]?.items[2]).toMatchObject({ changes: [{ diff: '+done' }] });
    expect(turns[0]?.items[3]).toMatchObject({ progress: ['读取资源'] });
    expect(turns[0]).toMatchObject({ plan: { steps: [{ step: '实现', status: 'inProgress' }] }, diff: '+all' });
  });
});
