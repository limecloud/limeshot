import type { CodexThread, CodexTurn } from '@codex/index';
import type {
  AgentCollabStateProjection,
  AgentCommandActionProjection,
  AgentFileChangeProjection,
  AgentInputProjection,
  AgentItemProjection,
  AgentJsonValue,
  AgentTokenUsageProjection,
  AgentToolContentProjection,
  AgentTurnProjection,
} from '../../shared/agent';

export type JsonObject = Record<string, unknown>;

const MAX_TEXT_LENGTH = 200_000;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_ITEMS = 200;
const SENSITIVE_KEY = /authorization|cookie|credential|password|secret|token/i;

export function projectThread(thread: CodexThread): AgentTurnProjection[] {
  return Array.isArray(thread.turns) ? thread.turns.map(projectTurn) : [];
}

export function projectTurn(turn: CodexTurn | unknown): AgentTurnProjection {
  const raw = object(turn) ?? {};
  const items = Array.isArray(raw.items)
    ? raw.items.map((item, index) => projectItem(item, `unknown-item-${index}`))
    : [];
  const error = object(raw.error);
  const status = turnStatus(raw.status);
  const result: AgentTurnProjection = {
    id: stringValue(raw.id) ?? 'unknown-turn',
    status,
    itemsView: itemsView(raw.itemsView),
    items,
  };
  const startedAt = numberValue(raw.startedAt);
  const completedAt = numberValue(raw.completedAt);
  const durationMs = numberValue(raw.durationMs);
  const errorMessage = stringValue(error?.message);
  if (startedAt !== undefined) result.startedAt = startedAt;
  if (completedAt !== undefined) result.completedAt = completedAt;
  if (durationMs !== undefined) result.durationMs = durationMs;
  if (errorMessage) result.errorMessage = sanitizeText(errorMessage);
  return result;
}

export function projectItem(value: unknown, fallbackId = 'unknown-item'): AgentItemProjection {
  const item = object(value);
  const id = stringValue(item?.id) ?? fallbackId;
  const type = stringValue(item?.type) ?? 'invalid';
  if (!item) return unknownItem(id, type, []);

  switch (type) {
    case 'userMessage': {
      const content = array(item.content).map(projectInput).filter(isDefined);
      const text = content.filter((part): part is Extract<AgentInputProjection, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text).join('\n');
      const projected: AgentItemProjection = { id, type, kind: 'user', text, content };
      const clientId = stringValue(item.clientId);
      if (clientId) projected.clientId = clientId;
      return projected;
    }
    case 'hookPrompt': {
      const fragments = array(item.fragments).map((entry) => {
        const fragment = object(entry);
        return fragment ? { text: sanitizeText(stringValue(fragment.text) ?? ''), hookRunId: stringValue(fragment.hookRunId) ?? '' } : undefined;
      }).filter(isDefined);
      return { id, type, kind: 'user', title: 'Hook feedback', text: fragments.map((entry) => entry.text).join('\n'), fragments };
    }
    case 'agentMessage': {
      const text = sanitizeText(stringValue(item.text) ?? '');
      const projected: AgentItemProjection = { id, type, kind: 'assistant', text };
      const phase = stringValue(item.phase);
      if (phase) projected.phase = phase;
      const citation = projectMemoryCitation(item.memoryCitation);
      if (citation) projected.memoryCitation = citation;
      return projected;
    }
    case 'plan':
      return { id, type, kind: 'plan', title: 'Proposed plan', text: sanitizeText(stringValue(item.text) ?? '') };
    case 'reasoning': {
      const summary = stringArray(item.summary).map(sanitizeText);
      const content = stringArray(item.content).map(sanitizeText);
      return { id, type, kind: 'activity', title: 'Reasoning', text: summary.join('\n'), status: inferredStatus(item), summary, content };
    }
    case 'commandExecution': {
      const command = sanitizeText(stringValue(item.command) ?? '');
      const output = sanitizeText(stringValue(item.aggregatedOutput) ?? '');
      const projected: AgentItemProjection = {
        id,
        type,
        kind: 'activity',
        title: commandTitle(item.commandActions),
        text: command,
        command,
        cwd: displayPath(stringValue(item.cwd)),
        source: stringValue(item.source) ?? 'agent',
        status: itemStatus(item.status),
        actions: array(item.commandActions).map(projectCommandAction).filter(isDefined),
        output,
        terminalInteractions: [],
      };
      const processId = stringValue(item.processId);
      const exitCode = numberValue(item.exitCode);
      const durationMs = numberValue(item.durationMs);
      if (processId) projected.processId = processId;
      if (exitCode !== undefined) projected.exitCode = exitCode;
      if (durationMs !== undefined) projected.durationMs = durationMs;
      return projected;
    }
    case 'fileChange': {
      const changes = projectFileChanges(item.changes);
      return {
        id,
        type,
        kind: 'activity',
        title: 'File changes',
        text: changes.map((change) => `${change.kind} ${change.path}`).join('\n'),
        status: itemStatus(item.status),
        changes,
      };
    }
    case 'mcpToolCall': {
      const server = stringValue(item.server) ?? 'MCP';
      const tool = stringValue(item.tool) ?? 'tool';
      const result = object(item.result);
      const projected: AgentItemProjection = {
        id,
        type,
        kind: 'tool',
        title: `${server}/${tool}`,
        text: '',
        status: itemStatus(item.status),
        server,
        tool,
        arguments: projectJson(item.arguments),
        progress: [],
        content: array(result?.content).map(projectToolContent),
      };
      const pluginId = stringValue(item.pluginId);
      const resourceUri = stringValue(object(item.appContext)?.resourceUri) ?? stringValue(item.mcpAppResourceUri);
      const structuredContent = result?.structuredContent === undefined || result?.structuredContent === null
        ? undefined
        : projectJson(result.structuredContent);
      const error = stringValue(object(item.error)?.message);
      const durationMs = numberValue(item.durationMs);
      if (pluginId) projected.pluginId = pluginId;
      if (resourceUri) projected.resourceUri = sanitizeUri(resourceUri);
      if (structuredContent !== undefined) projected.structuredContent = structuredContent;
      if (error) projected.error = sanitizeText(error);
      if (durationMs !== undefined) projected.durationMs = durationMs;
      return projected;
    }
    case 'dynamicToolCall': {
      const namespace = stringValue(item.namespace);
      const tool = stringValue(item.tool) ?? 'tool';
      const content = array(item.contentItems).map(projectDynamicContent).filter(isDefined);
      const projected: AgentItemProjection = {
        id,
        type,
        kind: 'tool',
        title: namespace ? `${namespace}/${tool}` : tool,
        text: content.filter((part) => part.type === 'text').map((part) => part.type === 'text' ? part.text : '').join('\n'),
        status: itemStatus(item.status),
        tool,
        arguments: projectJson(item.arguments),
        content,
      };
      const durationMs = numberValue(item.durationMs);
      if (namespace) projected.namespace = namespace;
      if (typeof item.success === 'boolean') projected.success = item.success;
      if (durationMs !== undefined) projected.durationMs = durationMs;
      return projected;
    }
    case 'collabAgentToolCall': {
      const tool = collabTool(item.tool);
      const states = object(item.agentsStates) ?? {};
      const agents: AgentCollabStateProjection[] = Object.entries(states).map(([threadId, value]) => {
        const state = object(value);
        const message = stringValue(state?.message);
        return { threadId, status: collabStatus(state?.status), ...(message ? { message: sanitizeText(message) } : {}) };
      });
      const projected: AgentItemProjection = {
        id,
        type,
        kind: 'activity',
        title: collabTitle(tool),
        text: sanitizeText(stringValue(item.prompt) ?? ''),
        status: itemStatus(item.status),
        tool,
        senderThreadId: stringValue(item.senderThreadId) ?? '',
        receiverThreadIds: stringArray(item.receiverThreadIds),
        agents,
      };
      const prompt = stringValue(item.prompt);
      const model = stringValue(item.model);
      const reasoningEffort = stringValue(item.reasoningEffort);
      if (prompt) projected.prompt = sanitizeText(prompt);
      if (model) projected.model = model;
      if (reasoningEffort) projected.reasoningEffort = reasoningEffort;
      return projected;
    }
    case 'subAgentActivity': {
      const activity = subAgentActivity(item.kind);
      const agentPath = sanitizeText(stringValue(item.agentPath) ?? 'agent');
      return {
        id,
        type,
        kind: 'activity',
        title: subAgentTitle(activity),
        text: agentPath,
        activity,
        agentThreadId: stringValue(item.agentThreadId) ?? '',
        agentPath,
      };
    }
    case 'webSearch': {
      const query = sanitizeText(stringValue(item.query) ?? '');
      return {
        id,
        type,
        kind: 'activity',
        title: 'Web search',
        text: query,
        status: inferredStatus(item),
        query,
        action: projectSearchAction(item.action),
        results: array(item.results).map(projectSearchResult).filter(isDefined),
      };
    }
    case 'imageView': {
      const path = displayPath(stringValue(item.path));
      return { id, type, kind: 'activity', title: 'Viewed image', text: path, status: 'completed', path };
    }
    case 'sleep': {
      const waitMs = nonNegativeNumber(item.durationMs);
      return { id, type, kind: 'activity', title: 'Waiting', text: `${waitMs} ms`, status: inferredStatus(item), waitMs };
    }
    case 'imageGeneration': {
      const result = sanitizeText(stringValue(item.result) ?? '');
      const projected: AgentItemProjection = {
        id,
        type,
        kind: 'activity',
        title: 'Image generation',
        text: sanitizeText(stringValue(item.revisedPrompt) ?? ''),
        status: itemStatus(item.status),
        result,
      };
      const revisedPrompt = stringValue(item.revisedPrompt);
      const savedPath = stringValue(item.savedPath);
      if (revisedPrompt) projected.revisedPrompt = sanitizeText(revisedPrompt);
      if (savedPath) projected.savedPath = displayPath(savedPath);
      return projected;
    }
    case 'enteredReviewMode':
    case 'exitedReviewMode': {
      const review = sanitizeText(stringValue(item.review) ?? '');
      return { id, type, kind: 'system', title: type === 'enteredReviewMode' ? 'Entered review mode' : 'Exited review mode', text: review, review };
    }
    case 'contextCompaction': {
      const source = item.source === 'manual' ? 'manual' : 'automatic';
      return { id, type, kind: 'system', title: 'Context compacted', text: '', status: item.status === 'inProgress' ? 'inProgress' : 'completed', source };
    }
    default:
      return unknownItem(id, type, Object.keys(item));
  }
}

export function projectFileChanges(value: unknown): AgentFileChangeProjection[] {
  return array(value).map((entry) => {
    const change = object(entry);
    if (!change) return undefined;
    return {
      path: displayPath(stringValue(change.path)),
      kind: stringValue(change.kind) ?? 'update',
      diff: sanitizeText(stringValue(change.diff) ?? ''),
    };
  }).filter(isDefined);
}

export function projectTokenUsage(value: unknown): AgentTokenUsageProjection {
  const usage = object(value) ?? {};
  const total = object(usage.total) ?? usage;
  return {
    totalTokens: nonNegativeNumber(total.totalTokens),
    inputTokens: nonNegativeNumber(total.inputTokens),
    cachedInputTokens: nonNegativeNumber(total.cachedInputTokens),
    cacheWriteInputTokens: nonNegativeNumber(total.cacheWriteInputTokens),
    outputTokens: nonNegativeNumber(total.outputTokens),
    reasoningOutputTokens: nonNegativeNumber(total.reasoningOutputTokens),
    ...(numberValue(usage.modelContextWindow) !== undefined ? { modelContextWindow: nonNegativeNumber(usage.modelContextWindow) } : {}),
  };
}

function projectInput(value: unknown): AgentInputProjection | undefined {
  const input = object(value);
  const type = stringValue(input?.type);
  if (!input || !type) return undefined;
  if (type === 'text') {
    return {
      type,
      text: sanitizeText(stringValue(input.text) ?? ''),
      elements: array(input.text_elements).map((entry) => {
        const element = object(entry);
        const range = object(element?.byteRange) ?? object(element?.byte_range);
        if (!element || !range) return undefined;
        return { start: nonNegativeNumber(range.start), end: nonNegativeNumber(range.end), kind: stringValue(element.type) ?? 'element' };
      }).filter(isDefined),
    };
  }
  if (type === 'image' || type === 'localImage') {
    const remote = type === 'image';
    const source = remote ? stringValue(input.url) : stringValue(input.path);
    return {
      type: 'image',
      source: remote ? 'remote' : 'local',
      ...(remote && source ? { url: sanitizeUri(source) } : {}),
      label: remote ? displayUri(source) : displayPath(source),
      ...(stringValue(input.detail) ? { detail: stringValue(input.detail) } : {}),
    };
  }
  if (type === 'audio' || type === 'localAudio') {
    const remote = type === 'audio';
    const source = remote ? stringValue(input.url) : stringValue(input.path);
    return { type: 'audio', source: remote ? 'remote' : 'local', ...(remote && source ? { url: sanitizeUri(source) } : {}), label: remote ? displayUri(source) : displayPath(source) };
  }
  if (type === 'skill' || type === 'mention') {
    const name = sanitizeText(stringValue(input.name) ?? type);
    return { type, name, label: displayPath(stringValue(input.path)) || name };
  }
  return undefined;
}

function projectMemoryCitation(value: unknown) {
  const citation = object(value);
  if (!citation) return undefined;
  return {
    entries: array(citation.entries).map((entry) => {
      const item = object(entry);
      if (!item) return undefined;
      return {
        path: displayPath(stringValue(item.path)),
        lineStart: nonNegativeNumber(item.lineStart),
        lineEnd: nonNegativeNumber(item.lineEnd),
        note: sanitizeText(stringValue(item.note) ?? ''),
      };
    }).filter(isDefined),
    threadIds: stringArray(citation.threadIds),
  };
}

function projectCommandAction(value: unknown): AgentCommandActionProjection | undefined {
  const action = object(value);
  const type = stringValue(action?.type);
  if (!action || !type || !['read', 'listFiles', 'search', 'unknown'].includes(type)) return undefined;
  const projected: AgentCommandActionProjection = { type: type as AgentCommandActionProjection['type'], command: sanitizeText(stringValue(action.command) ?? '') };
  const name = stringValue(action.name);
  const path = stringValue(action.path);
  const query = stringValue(action.query);
  if (name) projected.name = sanitizeText(name);
  if (path) projected.path = displayPath(path);
  if (query) projected.query = sanitizeText(query);
  return projected;
}

function projectToolContent(value: unknown): AgentToolContentProjection {
  const content = object(value);
  if (!content) return { type: 'json', value: projectJson(value) };
  const type = stringValue(content.type);
  if (type === 'text') return { type: 'text', text: sanitizeText(stringValue(object(content.text)?.text) ?? stringValue(content.text) ?? '') };
  if (type === 'image') return { type: 'image', url: sanitizeUri(stringValue(object(content.image)?.data) ?? stringValue(content.data) ?? '') };
  if (type === 'audio') return { type: 'audio', url: sanitizeUri(stringValue(object(content.audio)?.data) ?? stringValue(content.data) ?? '') };
  if (type === 'resource') {
    const resource = object(content.resource);
    const nested = object(resource?.resource);
    return { type: 'resource', uri: sanitizeUri(stringValue(nested?.uri) ?? stringValue(resource?.uri) ?? ''), ...(stringValue(nested?.text) ? { text: sanitizeText(stringValue(nested?.text) ?? '') } : {}) };
  }
  if (type === 'resourceLink' || type === 'resource_link') {
    const link = object(content.resourceLink) ?? content;
    return { type: 'resourceLink', uri: sanitizeUri(stringValue(link.uri) ?? ''), ...(stringValue(link.name) ? { name: sanitizeText(stringValue(link.name) ?? '') } : {}) };
  }
  return { type: 'json', value: projectJson(value) };
}

function projectDynamicContent(value: unknown): AgentToolContentProjection | undefined {
  const content = object(value);
  const type = stringValue(content?.type);
  if (!content || !type) return undefined;
  if (type === 'inputText') return { type: 'text', text: sanitizeText(stringValue(content.text) ?? '') };
  if (type === 'inputImage') return { type: 'image', url: sanitizeUri(stringValue(content.imageUrl) ?? '') };
  if (type === 'inputAudio') return { type: 'audio', url: sanitizeUri(stringValue(content.audioUrl) ?? '') };
  return { type: 'json', value: projectJson(content) };
}

function projectSearchAction(value: unknown): Extract<AgentItemProjection, { type: 'webSearch' }>['action'] {
  const action = object(value);
  const rawType = stringValue(action?.type);
  if (!action || !rawType) return undefined;
  const type = rawType === 'search' || rawType === 'openPage' || rawType === 'findInPage' ? rawType : 'other';
  const query = stringValue(action.query);
  const queries = stringArray(action.queries);
  const url = stringValue(action.url);
  const pattern = stringValue(action.pattern);
  return {
    type,
    ...(query ? { query: sanitizeText(query) } : {}),
    ...(queries.length ? { queries: queries.map(sanitizeText) } : {}),
    ...(url ? { url: sanitizeUri(url) } : {}),
    ...(pattern ? { pattern: sanitizeText(pattern) } : {}),
  };
}

function projectSearchResult(value: unknown) {
  const result = object(value);
  if (!result) return undefined;
  const title = stringValue(result.title);
  const url = stringValue(result.url);
  const snippet = stringValue(result.snippet) ?? stringValue(result.text);
  const source = stringValue(result.source);
  const extra = Object.fromEntries(Object.entries(result).filter(([key]) => !['title', 'url', 'snippet', 'text', 'source'].includes(key)));
  if (!title && !url && !snippet && !source && Object.keys(extra).length === 0) return undefined;
  return {
    ...(title ? { title: sanitizeText(title) } : {}),
    ...(url ? { url: sanitizeUri(url) } : {}),
    ...(snippet ? { snippet: sanitizeText(snippet) } : {}),
    ...(source ? { source: sanitizeText(source) } : {}),
    ...(Object.keys(extra).length > 0 ? { details: projectJson(extra) } : {}),
  };
}

function projectJson(value: unknown, depth = 0, key = ''): AgentJsonValue {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return sanitizeText(value);
  if (depth >= MAX_JSON_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_JSON_ITEMS).map((entry) => projectJson(entry, depth + 1));
  const record = object(value);
  if (!record) return String(value);
  return Object.fromEntries(Object.entries(record).slice(0, MAX_JSON_ITEMS).map(([name, entry]) => [name, projectJson(entry, depth + 1, name)]));
}

function unknownItem(id: string, sourceType: string, fields: string[]): AgentItemProjection {
  return { id, type: 'unknown', kind: 'system', title: `Unsupported activity: ${sourceType}`, text: '', sourceType, fields: fields.slice(0, 50) };
}

function commandTitle(actions: unknown): string {
  const types = array(actions).map((entry) => stringValue(object(entry)?.type));
  if (types.includes('search')) return 'Search';
  if (types.includes('read')) return 'Read';
  if (types.includes('listFiles')) return 'List files';
  return 'Command';
}

function itemStatus(value: unknown) {
  return value === 'inProgress' || value === 'completed' || value === 'failed' || value === 'declined' || value === 'interrupted'
    ? value
    : undefined;
}

function inferredStatus(item: JsonObject) {
  return itemStatus(item.status) ?? 'completed' as const;
}

function turnStatus(value: unknown) {
  return value === 'completed' || value === 'interrupted' || value === 'failed' || value === 'inProgress' ? value : 'inProgress';
}

function itemsView(value: unknown) {
  return value === 'notLoaded' || value === 'summary' || value === 'full' ? value : 'full';
}

function collabTool(value: unknown) {
  return value === 'spawnAgent' || value === 'sendInput' || value === 'resumeAgent' || value === 'wait' || value === 'closeAgent' ? value : 'unknown';
}

function collabStatus(value: unknown): AgentCollabStateProjection['status'] {
  return value === 'pendingInit' || value === 'running' || value === 'interrupted' || value === 'completed' || value === 'errored' || value === 'shutdown' || value === 'notFound'
    ? value
    : 'unknown';
}

function collabTitle(tool: ReturnType<typeof collabTool>): string {
  return ({ spawnAgent: 'Spawn agent', sendInput: 'Send to agent', resumeAgent: 'Resume agent', wait: 'Wait for agents', closeAgent: 'Close agent', unknown: 'Agent activity' })[tool];
}

function subAgentActivity(value: unknown) {
  return value === 'started' || value === 'interacted' || value === 'interrupted' ? value : 'unknown';
}

function subAgentTitle(activity: ReturnType<typeof subAgentActivity>): string {
  return ({ started: 'Started agent', interacted: 'Interacted with agent', interrupted: 'Interrupted agent', unknown: 'Agent activity' })[activity];
}

function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_TEXT_LENGTH);
}

function sanitizeUri(value: string): string {
  const sanitized = sanitizeText(value);
  if (/^(https?:|data:image\/|data:audio\/|file:)/i.test(sanitized)) return sanitized.slice(0, MAX_TEXT_LENGTH);
  return sanitized.slice(0, 2_048);
}

function displayUri(value: string | undefined): string {
  if (!value) return 'media';
  try { return new URL(value).host || 'media'; }
  catch { return 'media'; }
}

function displayPath(value: string | undefined): string {
  if (!value) return '';
  const normalized = sanitizeText(value).replaceAll('\\', '/').replace(/\/$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

export function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonNegativeNumber(value: unknown): number {
  return Math.max(0, numberValue(value) ?? 0);
}

function stringArray(value: unknown): string[] {
  return array(value).filter((entry): entry is string => typeof entry === 'string');
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
