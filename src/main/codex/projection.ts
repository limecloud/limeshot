import type { CodexNotification, CodexThread, CodexTurn } from '@codex/index';
import type { AgentEvent, AgentItemProjection, AgentTurnProjection } from '../../shared/desktop';

type JsonObject = Record<string, unknown>;

export function projectThread(thread: CodexThread): AgentTurnProjection[] {
  if (!Array.isArray(thread.turns)) return [];
  return thread.turns.map(projectTurn);
}

export function projectNotification(notification: CodexNotification): AgentEvent | undefined {
  const params = object(notification.params);
  if (!params) return undefined;
  if (notification.method === 'turn/started') {
    const threadId = string(params.threadId);
    const turn = object(params.turn);
    if (threadId && turn) return { type: 'turn.started', threadId, turn: projectTurn(turn as unknown as CodexTurn) };
  }
  if (notification.method === 'item/agentMessage/delta') {
    const threadId = string(params.threadId);
    const turnId = string(params.turnId);
    const itemId = string(params.itemId);
    const delta = string(params.delta);
    if (threadId && turnId && itemId && delta !== undefined) {
      return { type: 'message.delta', threadId, turnId, itemId, delta };
    }
  }
  if (notification.method === 'item/started' || notification.method === 'item/completed') {
    const threadId = string(params.threadId);
    const turnId = string(params.turnId);
    const item = projectItem(params.item);
    if (threadId && turnId && item) return { type: 'item.updated', threadId, turnId, item };
  }
  if (notification.method === 'turn/completed') {
    const threadId = string(params.threadId);
    const turn = object(params.turn);
    if (threadId && turn) return { type: 'turn.completed', threadId, turn: projectTurn(turn as unknown as CodexTurn) };
  }
  if (notification.method === 'error') {
    const threadId = string(params.threadId);
    const error = object(params.error);
    const message = string(error?.message) ?? string(params.message);
    if (message) return { type: 'agent.error', threadId, message };
  }
  return undefined;
}

export function projectTurn(turn: CodexTurn): AgentTurnProjection {
  const raw = turn as unknown as JsonObject;
  const id = string(raw.id) ?? 'unknown-turn';
  const status = raw.status === 'completed' || raw.status === 'interrupted' || raw.status === 'failed' || raw.status === 'inProgress'
    ? raw.status
    : 'inProgress';
  const items = Array.isArray(raw.items) ? raw.items.map(projectItem).filter((item): item is AgentItemProjection => Boolean(item)) : [];
  const error = object(raw.error);
  return { id, status, items, ...(string(error?.message) ? { errorMessage: string(error?.message) } : {}) };
}

function projectItem(value: unknown): AgentItemProjection | undefined {
  const item = object(value);
  const id = string(item?.id);
  const type = string(item?.type);
  if (!item || !id || !type) return undefined;
  if (type === 'userMessage') {
    const content = Array.isArray(item.content) ? item.content : [];
    const text = content.map((part) => {
      const input = object(part);
      return input?.type === 'text' ? string(input.text) ?? '' : '';
    }).filter(Boolean).join('\n');
    return { id, kind: 'user', text };
  }
  if (type === 'agentMessage') return { id, kind: 'assistant', text: string(item.text) ?? '' };
  if (type === 'plan') return { id, kind: 'plan', text: string(item.text) ?? '' };
  if (type === 'dynamicToolCall' || type === 'mcpToolCall') {
    const tool = string(item.tool) ?? type;
    const server = string(item.server);
    return {
      id,
      kind: 'tool',
      title: server ? `${server}/${tool}` : tool,
      text: '',
      status: string(item.status) ?? (item.success === true ? 'completed' : item.success === false ? 'failed' : 'inProgress'),
    };
  }
  if (type === 'commandExecution') {
    return { id, kind: 'activity', title: 'command', text: string(item.command) ?? '', status: string(item.status) };
  }
  if (type === 'fileChange') {
    return { id, kind: 'activity', title: 'fileChange', text: '', status: string(item.status) };
  }
  return undefined;
}

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
