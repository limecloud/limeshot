import type {
  AgentCommandExecutionProjection,
  AgentEvent,
  AgentFileChangeItemProjection,
  AgentItemProjection,
  AgentMcpToolCallProjection,
  AgentMessageProjection,
  AgentPlanItemProjection,
  AgentReasoningProjection,
  AgentTurnProjection,
} from '../../shared/desktop';

const MAX_STREAM_LENGTH = 200_000;
const MAX_PROGRESS_ENTRIES = 50;

export function applyAgentEvent(
  turns: AgentTurnProjection[],
  threadId: string,
  event: AgentEvent,
): AgentTurnProjection[] {
  if (event.type === 'notice.updated' || event.type === 'catalog.updated' || event.type === 'composer.search.updated'
    || event.type === 'diagnostic.recorded' || event.type === 'agent.error'
    || event.type === 'thread.context.updated' || event.type === 'thread.realtime.updated'
    || event.type === 'thread.status.updated' || event.type === 'hook.updated' || event.type === 'review.updated'
    || event.type === 'interaction.updated' || event.type === 'interaction.resolved'
    || event.threadId !== threadId) return turns;
  if (event.type === 'turn.started') return upsertTurn(turns, event.turn, false);
  if (event.type === 'turn.completed') return upsertTurn(turns, event.turn, true);
  if (event.type === 'item.updated') {
    return updateTurn(turns, event.turnId, (turn) => ({ ...turn, items: upsertItem(turn.items, event.item) }));
  }
  if (event.type === 'item.patch.updated') {
    return updateTurn(turns, event.turnId, (turn) => ({
      ...turn,
      items: updateOrAppend(turn.items, event.itemId, (item) => {
        const current = item?.type === 'fileChange' ? item : fileChangePlaceholder(event.itemId);
        return { ...current, changes: event.changes, text: event.changes.map((change) => `${change.kind} ${change.path}`).join('\n') };
      }),
    }));
  }
  if (event.type === 'item.progress') {
    return updateTurn(turns, event.turnId, (turn) => ({
      ...turn,
      items: updateOrAppend(turn.items, event.itemId, (item) => {
        const current = item?.type === 'mcpToolCall' ? item : mcpPlaceholder(event.itemId);
        return { ...current, progress: [...current.progress, event.message].slice(-MAX_PROGRESS_ENTRIES) };
      }),
    }));
  }
  if (event.type === 'turn.plan.updated') {
    return updateTurn(turns, event.turnId, (turn) => ({
      ...turn,
      plan: { ...(event.explanation ? { explanation: event.explanation } : {}), steps: event.steps },
    }));
  }
  if (event.type === 'turn.diff.updated') {
    return updateTurn(turns, event.turnId, (turn) => ({ ...turn, diff: event.diff }));
  }
  if (event.type === 'thread.usage.updated') {
    return updateTurn(turns, event.turnId, (turn) => ({ ...turn, usage: event.usage }));
  }
  if (event.type !== 'item.delta') return turns;
  return updateTurn(turns, event.turnId, (turn) => ({
    ...turn,
    items: updateOrAppend(turn.items, event.itemId, (item) => applyDelta(item, event)),
  }));
}

export function runningTurn(turns: AgentTurnProjection[]): AgentTurnProjection | undefined {
  return [...turns].reverse().find((turn) => turn.status === 'inProgress');
}

function applyDelta(item: AgentItemProjection | undefined, event: Extract<AgentEvent, { type: 'item.delta' }>): AgentItemProjection {
  if (event.channel === 'agentMessage' || event.channel === 'realtimeTranscript') {
    const current: AgentMessageProjection = item?.type === 'agentMessage'
      ? item
      : { id: event.itemId, type: 'agentMessage', kind: 'assistant', text: '' };
    return { ...current, text: append(current.text, event.delta) };
  }
  if (event.channel === 'plan') {
    const current: AgentPlanItemProjection = item?.type === 'plan'
      ? item
      : { id: event.itemId, type: 'plan', kind: 'plan', title: 'Proposed plan', text: '' };
    return { ...current, text: append(current.text, event.delta) };
  }
  if (event.channel === 'reasoningSummary' || event.channel === 'reasoningContent') {
    const current: AgentReasoningProjection = item?.type === 'reasoning'
      ? item
      : { id: event.itemId, type: 'reasoning', kind: 'activity', title: 'Reasoning', text: '', status: 'inProgress', summary: [], content: [] };
    const index = Math.max(0, event.index ?? 0);
    const field = event.channel === 'reasoningSummary' ? 'summary' : 'content';
    const parts = [...current[field]];
    while (parts.length <= index) parts.push('');
    parts[index] = append(parts[index] ?? '', event.delta);
    return { ...current, [field]: parts, ...(field === 'summary' ? { text: parts.join('\n') } : {}) };
  }
  if (event.channel === 'commandOutput' || event.channel === 'terminalInteraction') {
    const current: AgentCommandExecutionProjection = item?.type === 'commandExecution'
      ? item
      : commandPlaceholder(event.itemId);
    if (event.channel === 'terminalInteraction') {
      return { ...current, terminalInteractions: [...current.terminalInteractions, event.delta].slice(-MAX_PROGRESS_ENTRIES) };
    }
    return { ...current, output: append(current.output, event.delta) };
  }
  const current = item?.type === 'fileChange' ? item : fileChangePlaceholder(event.itemId);
  return { ...current, text: append(current.text, event.delta) };
}

function updateTurn(
  turns: AgentTurnProjection[],
  turnId: string,
  update: (turn: AgentTurnProjection) => AgentTurnProjection,
): AgentTurnProjection[] {
  const existing = turns.find((turn) => turn.id === turnId);
  if (!existing) return [...turns, update({ id: turnId, status: 'inProgress', itemsView: 'full', items: [] })];
  return turns.map((turn) => turn.id === turnId ? update(turn) : turn);
}

function upsertTurn(turns: AgentTurnProjection[], next: AgentTurnProjection, authoritative: boolean): AgentTurnProjection[] {
  const existing = turns.find((turn) => turn.id === next.id);
  if (!existing) return [...turns, next];
  const items = authoritative && next.items.length > 0 ? next.items : mergeItems(existing.items, next.items);
  return turns.map((turn) => turn.id === next.id ? { ...turn, ...next, items } : turn);
}

function upsertItem(items: AgentItemProjection[], next: AgentItemProjection): AgentItemProjection[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => item.id === next.id ? next : item)
    : [...items, next];
}

function updateOrAppend(
  items: AgentItemProjection[],
  itemId: string,
  update: (item: AgentItemProjection | undefined) => AgentItemProjection,
): AgentItemProjection[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return [...items, update(undefined)];
  return items.map((item, itemIndex) => itemIndex === index ? update(item) : item);
}

function mergeItems(current: AgentItemProjection[], next: AgentItemProjection[]): AgentItemProjection[] {
  return next.reduce(upsertItem, current);
}

function append(current: string, delta: string): string {
  return `${current}${delta}`.slice(-MAX_STREAM_LENGTH);
}

function commandPlaceholder(id: string): AgentCommandExecutionProjection {
  return {
    id,
    type: 'commandExecution',
    kind: 'activity',
    title: 'Command',
    text: '',
    status: 'inProgress',
    command: '',
    cwd: '',
    source: 'agent',
    actions: [],
    output: '',
    terminalInteractions: [],
  };
}

function fileChangePlaceholder(id: string): AgentFileChangeItemProjection {
  return { id, type: 'fileChange', kind: 'activity', title: 'File changes', text: '', status: 'inProgress', changes: [] };
}

function mcpPlaceholder(id: string): AgentMcpToolCallProjection {
  return {
    id,
    type: 'mcpToolCall',
    kind: 'tool',
    title: 'MCP tool',
    text: '',
    status: 'inProgress',
    server: 'MCP',
    tool: 'tool',
    arguments: null,
    progress: [],
    content: [],
  };
}
