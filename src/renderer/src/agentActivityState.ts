import type {
  AgentCatalogUpdateProjection,
  AgentComposerSearchProjection,
  AgentDiagnosticProjection,
  AgentEvent,
  AgentHookProjection,
  AgentNoticeProjection,
  AgentRealtimeUpdateProjection,
  AgentSafetyReviewProjection,
  AgentThreadContextPatch,
  AgentThreadStatusProjection,
  AgentTokenUsageProjection,
} from '../../shared/desktop';

const MAX_TEXT_LENGTH = 20_000;
const MAX_THREAD_ENTRIES = 50;
const MAX_GLOBAL_ENTRIES = 100;

export interface AgentRealtimeState {
  state: 'idle' | 'connected' | 'error' | 'closed';
  sessionActive: boolean;
  version?: string;
  role?: string;
  transcript: string;
  provisional: boolean;
  audioChunks: number;
  message?: string;
}

export interface AgentThreadActivityState extends AgentThreadContextPatch {
  status?: AgentThreadStatusProjection;
  usage?: AgentTokenUsageProjection;
  realtime: AgentRealtimeState;
  hooks: AgentHookProjection[];
  reviews: AgentSafetyReviewProjection[];
}

export interface AgentActivityState {
  threads: Record<string, AgentThreadActivityState>;
  notices: AgentNoticeProjection[];
  catalog: AgentCatalogUpdateProjection[];
  diagnostics: AgentDiagnosticProjection[];
  composerSearch?: AgentComposerSearchProjection;
}

export function createAgentActivityState(): AgentActivityState {
  return { threads: {}, notices: [], catalog: [], diagnostics: [] };
}

export function applyAgentActivityEvent(state: AgentActivityState, event: AgentEvent): AgentActivityState {
  if (event.type === 'thread.context.updated') {
    return updateThread(state, event.threadId, (current) => ({ ...current, ...event.patch }));
  }
  if (event.type === 'thread.status.updated') {
    return updateThread(state, event.threadId, (current) => ({ ...current, status: event.status }));
  }
  if (event.type === 'thread.usage.updated') {
    return updateThread(state, event.threadId, (current) => ({ ...current, usage: event.usage }));
  }
  if (event.type === 'thread.realtime.updated') {
    return updateThread(state, event.threadId, (current) => ({ ...current, realtime: applyRealtime(current.realtime, event.update) }));
  }
  if (event.type === 'hook.updated') {
    return updateThread(state, event.threadId, (current) => ({ ...current, hooks: upsert(current.hooks, event.hook, 'id', MAX_THREAD_ENTRIES) }));
  }
  if (event.type === 'review.updated') {
    return updateThread(state, event.threadId, (current) => ({ ...current, reviews: upsert(current.reviews, event.review, 'id', MAX_THREAD_ENTRIES) }));
  }
  if (event.type === 'notice.updated') {
    return { ...state, notices: upsert(state.notices, event.notice, 'id', MAX_GLOBAL_ENTRIES) };
  }
  if (event.type === 'catalog.updated') {
    return { ...state, catalog: upsert(state.catalog, event.update, 'id', MAX_GLOBAL_ENTRIES) };
  }
  if (event.type === 'diagnostic.recorded') {
    return { ...state, diagnostics: upsert(state.diagnostics, event.diagnostic, 'id', MAX_GLOBAL_ENTRIES) };
  }
  if (event.type === 'composer.search.updated') {
    const current = state.composerSearch;
    const search = event.search.status === 'completed' && current?.sessionId === event.search.sessionId
      ? { ...current, status: 'completed' as const }
      : event.search;
    return { ...state, composerSearch: search };
  }
  if (event.type === 'agent.error') {
    const notice: AgentNoticeProjection = {
      id: `error:${event.turnId ?? event.threadId ?? 'global'}`,
      scope: event.threadId ? 'thread' : 'global',
      level: 'error',
      kind: 'error',
      ...(event.threadId ? { threadId: event.threadId } : {}),
      ...(event.turnId ? { turnId: event.turnId } : {}),
      ...(event.willRetry ? { status: 'retrying' } : {}),
    };
    return { ...state, notices: upsert(state.notices, notice, 'id', MAX_GLOBAL_ENTRIES) };
  }
  return state;
}

export function dismissAgentNotice(state: AgentActivityState, noticeId: string): AgentActivityState {
  return { ...state, notices: state.notices.filter((notice) => notice.id !== noticeId) };
}

function updateThread(
  state: AgentActivityState,
  threadId: string,
  update: (current: AgentThreadActivityState) => AgentThreadActivityState,
): AgentActivityState {
  const current = state.threads[threadId] ?? emptyThread();
  return { ...state, threads: { ...state.threads, [threadId]: update(current) } };
}

function emptyThread(): AgentThreadActivityState {
  return {
    realtime: { state: 'idle', sessionActive: false, transcript: '', provisional: false, audioChunks: 0 },
    hooks: [],
    reviews: [],
  };
}

function applyRealtime(current: AgentRealtimeState, update: AgentRealtimeUpdateProjection): AgentRealtimeState {
  if (update.kind === 'started') {
    return { state: 'connected', sessionActive: update.sessionActive, ...(update.version ? { version: update.version } : {}), transcript: '', provisional: false, audioChunks: 0 };
  }
  if (update.kind === 'transcriptDelta') {
    return { ...current, state: 'connected', role: update.role, transcript: append(current.transcript, update.text), provisional: true };
  }
  if (update.kind === 'transcriptDone') {
    return { ...current, state: 'connected', role: update.role, transcript: update.text.slice(-MAX_TEXT_LENGTH), provisional: false };
  }
  if (update.kind === 'audioQueued') return { ...current, audioChunks: Math.min(999, current.audioChunks + 1) };
  if (update.kind === 'error') return { ...current, state: 'error', sessionActive: false, message: update.message };
  return { ...current, state: 'closed', sessionActive: false, ...(update.message ? { message: update.message } : {}) };
}

function append(current: string, delta: string): string {
  return `${current}${delta}`.slice(-MAX_TEXT_LENGTH);
}

function upsert<T extends Record<Key, string>, Key extends keyof T>(
  values: T[],
  next: T,
  key: Key,
  limit: number,
): T[] {
  const updated = values.some((value) => value[key] === next[key])
    ? values.map((value) => value[key] === next[key] ? next : value)
    : [...values, next];
  return updated.slice(-limit);
}
