import type { AgentEvent, AgentItemProjection, AgentTurnProjection } from '../../shared/desktop';

export function applyAgentEvent(
  turns: AgentTurnProjection[],
  threadId: string,
  event: AgentEvent,
): AgentTurnProjection[] {
  if (event.type === 'agent.error' || event.threadId !== threadId) return turns;
  if (event.type === 'turn.started' || event.type === 'turn.completed') {
    return upsertTurn(turns, event.turn);
  }
  if (event.type === 'item.updated') {
    return updateTurn(turns, event.turnId, (turn) => ({ ...turn, items: upsertItem(turn.items, event.item) }));
  }
  return updateTurn(turns, event.turnId, (turn) => {
    const existing = turn.items.find((item) => item.id === event.itemId);
    const item: AgentItemProjection = existing
      ? { ...existing, kind: 'assistant', text: `${existing.text}${event.delta}` }
      : { id: event.itemId, kind: 'assistant', text: event.delta };
    return { ...turn, items: upsertItem(turn.items, item) };
  });
}

export function runningTurn(turns: AgentTurnProjection[]): AgentTurnProjection | undefined {
  return [...turns].reverse().find((turn) => turn.status === 'inProgress');
}

function updateTurn(
  turns: AgentTurnProjection[],
  turnId: string,
  update: (turn: AgentTurnProjection) => AgentTurnProjection,
): AgentTurnProjection[] {
  const existing = turns.find((turn) => turn.id === turnId);
  if (!existing) return [...turns, update({ id: turnId, status: 'inProgress', items: [] })];
  return turns.map((turn) => turn.id === turnId ? update(turn) : turn);
}

function upsertTurn(turns: AgentTurnProjection[], next: AgentTurnProjection): AgentTurnProjection[] {
  return turns.some((turn) => turn.id === next.id)
    ? turns.map((turn) => turn.id === next.id
      ? { ...turn, ...next, items: mergeItems(turn.items, next.items) }
      : turn)
    : [...turns, next];
}

function upsertItem(items: AgentItemProjection[], next: AgentItemProjection): AgentItemProjection[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => item.id === next.id ? next : item)
    : [...items, next];
}

function mergeItems(current: AgentItemProjection[], next: AgentItemProjection[]): AgentItemProjection[] {
  return next.reduce(upsertItem, current);
}
