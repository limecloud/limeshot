import { randomBytes, randomUUID } from 'node:crypto';

import type {
  CodexServerRequestMeta,
  CodexServerRequestParams,
  CodexServerRequestResult,
} from '@codex/index';
import type {
  AgentCommandActionProjection,
  AgentCommandApprovalProjection,
  AgentEvent,
  AgentFileChangeProjection,
  AgentInteractionExternalOpenInput,
  AgentInteractionExternalOpenResult,
  AgentInteractionStatus,
  AgentInteractionSubmitInput,
  AgentInteractionSubmitResult,
  AgentJsonValue,
  AgentPendingInteractionProjection,
} from '../../shared/agent';

type InteractiveMethod =
  | 'item/commandExecution/requestApproval'
  | 'item/fileChange/requestApproval'
  | 'item/tool/requestUserInput'
  | 'mcpServer/elicitation/request'
  | 'item/permissions/requestApproval'
  | 'applyPatchApproval'
  | 'execCommandApproval';

interface PendingWaiter {
  method: InteractiveMethod;
  params: unknown;
  rawId: string | number;
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface PendingGroup {
  projection: AgentPendingInteractionProjection;
  dedupeKey: string;
  waiters: PendingWaiter[];
}

const MAX_TEXT_LENGTH = 20_000;
const MAX_JSON_DEPTH = 6;
const MAX_JSON_ITEMS = 100;
const SENSITIVE_KEY = /authorization|cookie|credential|password|secret|token/i;

export class InteractionCoordinator {
  private readonly groups = new Map<string, PendingGroup>();
  private readonly interactionByRawId = new Map<string, string>();
  private readonly listeners = new Set<(event: AgentEvent) => void>();

  constructor(private readonly openUrl: (url: string) => Promise<void> = async () => { throw new Error('Desktop host 未配置外部链接能力'); }) {}

  request<M extends InteractiveMethod>(
    method: M,
    params: CodexServerRequestParams<M>,
    meta: CodexServerRequestMeta<M>,
  ): Promise<CodexServerRequestResult<M>> {
    return new Promise((resolve, reject) => {
      const projection = projectInteraction(method, params);
      const dedupeKey = interactionDedupeKey(projection);
      const existing = [...this.groups.values()].find((group) => group.dedupeKey === dedupeKey && group.projection.status === 'pending');
      const waiter: PendingWaiter = {
        method,
        params,
        rawId: meta.id,
        resolve: resolve as (value: unknown) => void,
        reject,
      };
      if (existing) {
        existing.waiters.push(waiter);
        this.interactionByRawId.set(rawKey(meta.id), existing.projection.interactionId);
        return;
      }
      const group: PendingGroup = { projection, dedupeKey, waiters: [waiter] };
      this.groups.set(projection.interactionId, group);
      this.interactionByRawId.set(rawKey(meta.id), projection.interactionId);
      this.emit({ type: 'interaction.updated', threadId: projection.threadId, interaction: projection });
    });
  }

  list(): AgentPendingInteractionProjection[] {
    return [...this.groups.values()]
      .map((group) => group.projection)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  submit(input: AgentInteractionSubmitInput): AgentInteractionSubmitResult {
    const group = this.groups.get(input.interactionId);
    if (!group || group.projection.status !== 'pending') throw new Error('该交互已失效');
    if (group.projection.actionToken !== input.actionToken) throw new Error('无效的交互令牌');
    if (group.projection.kind !== input.kind) throw new Error('交互响应类型不匹配');

    const responses = group.waiters.map((waiter) => buildResponse(waiter.method, waiter.params, input));
    group.projection = { ...group.projection, status: 'submitting' } as AgentPendingInteractionProjection;
    this.emit({ type: 'interaction.updated', threadId: group.projection.threadId, interaction: group.projection });
    this.groups.delete(input.interactionId);
    group.waiters.forEach((waiter, index) => {
      this.interactionByRawId.delete(rawKey(waiter.rawId));
      waiter.resolve(responses[index]);
    });
    this.emit({ type: 'interaction.resolved', threadId: group.projection.threadId, interactionId: input.interactionId });
    return { interactionId: input.interactionId, accepted: true };
  }

  async openExternal(input: AgentInteractionExternalOpenInput): Promise<AgentInteractionExternalOpenResult> {
    const group = this.groups.get(input.interactionId);
    if (!group || group.projection.status !== 'pending') throw new Error('该交互已失效');
    if (group.projection.actionToken !== input.actionToken) throw new Error('无效的交互令牌');
    if (group.projection.kind !== 'mcpElicitation' || group.projection.mode !== 'url') throw new Error('该交互不包含外部链接');
    const params = object(group.waiters[0]?.params) ?? {};
    const url = validatedExternalUrl(string(params.url));
    if (!url) throw new Error('外部链接不符合安全要求');
    await this.openUrl(url);
    return { interactionId: input.interactionId, opened: true };
  }

  resolveRaw(rawId: unknown): void {
    if (typeof rawId !== 'string' && typeof rawId !== 'number') return;
    const interactionId = this.interactionByRawId.get(rawKey(rawId));
    if (!interactionId) return;
    this.finish(interactionId, 'resolved', new Error('该交互已由其他客户端处理'));
  }

  completeTurn(threadId: string, turnId: string): void {
    for (const group of [...this.groups.values()]) {
      if (group.projection.threadId === threadId && group.projection.turnId === turnId) {
        this.finish(group.projection.interactionId, 'expired', new Error('Turn 已结束'));
      }
    }
  }

  closeThread(threadId: string): void {
    for (const group of [...this.groups.values()]) {
      if (group.projection.threadId === threadId) this.finish(group.projection.interactionId, 'disconnected', new Error('Thread 已关闭'));
    }
  }

  disconnectAll(): void {
    for (const interactionId of [...this.groups.keys()]) this.finish(interactionId, 'disconnected', new Error('Codex App Server 已断开'));
  }

  private finish(interactionId: string, status: AgentInteractionStatus, error: Error): void {
    const group = this.groups.get(interactionId);
    if (!group) return;
    this.groups.delete(interactionId);
    const projection = { ...group.projection, status } as AgentPendingInteractionProjection;
    this.emit({ type: 'interaction.updated', threadId: projection.threadId, interaction: projection });
    this.emit({ type: 'interaction.resolved', threadId: projection.threadId, interactionId });
    for (const waiter of group.waiters) {
      this.interactionByRawId.delete(rawKey(waiter.rawId));
      waiter.reject(error);
    }
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function projectInteraction<M extends InteractiveMethod>(method: M, paramsValue: CodexServerRequestParams<M>): AgentPendingInteractionProjection {
  const params = object(paramsValue) ?? {};
  const threadId = string(params.threadId) ?? string(params.conversationId) ?? 'unknown-thread';
  const turnId = string(params.turnId);
  const itemId = string(params.itemId) ?? string(params.callId);
  const createdAt = number(params.startedAtMs) ?? Date.now();
  const base = {
    interactionId: randomUUID(),
    actionToken: randomBytes(24).toString('base64url'),
    threadId,
    ...(turnId ? { turnId } : {}),
    ...(itemId ? { itemId } : {}),
    createdAt,
    status: 'pending' as const,
    ...(string(params.reason) ? { reason: clean(string(params.reason) ?? '') } : {}),
  };

  if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') {
    const command = method === 'execCommandApproval'
      ? array(params.command).filter((value): value is string => typeof value === 'string').join(' ')
      : string(params.command) ?? '';
    const actions = array(params.commandActions ?? params.parsedCmd).map(projectCommandAction).filter(isDefined);
    const available = array(params.availableDecisions).filter(isCommandDecision);
    const decisions: AgentCommandApprovalProjection['decisions'] = available.length > 0
      ? [...available]
      : ['accept', 'acceptForSession', 'decline', 'cancel'];
    if (method === 'item/commandExecution/requestApproval' && params.proposedExecpolicyAmendment) decisions.splice(Math.max(0, decisions.length - 2), 0, 'acceptWithExecpolicyAmendment');
    if (method === 'item/commandExecution/requestApproval' && array(params.proposedNetworkPolicyAmendments).length > 0) decisions.splice(Math.max(0, decisions.length - 2), 0, 'applyNetworkPolicyAmendment');
    return {
      ...base,
      kind: 'commandApproval',
      command: clean(command),
      cwd: displayPath(string(params.cwd)),
      actions,
      decisions,
      risks: commandRisks(params),
    };
  }
  if (method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval') {
    const grantRoot = string(params.grantRoot);
    return {
      ...base,
      kind: 'fileApproval',
      ...(grantRoot ? { grantRoot: displayPath(grantRoot) } : {}),
      changes: projectLegacyFileChanges(params.fileChanges),
      decisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
      risks: grantRoot ? ['filesystem', 'session'] : ['filesystem'],
    };
  }
  if (method === 'item/permissions/requestApproval') {
    const permissions = object(params.permissions) ?? {};
    const fileSystem = object(permissions.fileSystem) ?? {};
    const environmentId = string(params.environmentId);
    return {
      ...base,
      kind: 'permissionApproval',
      cwd: displayPath(string(params.cwd)),
      ...(environmentId ? { environmentLabel: clean(environmentId).slice(0, 80) } : {}),
      networkRequested: permissions.network !== null && permissions.network !== undefined,
      readPathCount: pathCount(fileSystem.read) + entryAccessCount(fileSystem.entries, 'read'),
      writePathCount: pathCount(fileSystem.write) + entryAccessCount(fileSystem.entries, 'write'),
      decisions: ['grantTurn', 'grantSession', 'grantTurnStrict', 'deny'],
      risks: permissionRisks(permissions),
    };
  }
  if (method === 'item/tool/requestUserInput') {
    const autoResolutionMs = number(params.autoResolutionMs);
    const questions = array(params.questions).map((value) => {
      const question = object(value) ?? {};
      return {
        id: clean(string(question.id) ?? ''),
        header: clean(string(question.header) ?? ''),
        question: clean(string(question.question) ?? ''),
        allowsOther: question.isOther === true,
        multiple: question.isMultiSelect === true || question.multiple === true,
        secret: question.isSecret === true,
        options: array(question.options).map((optionValue) => {
          const option = object(optionValue) ?? {};
          return { label: clean(string(option.label) ?? ''), description: clean(string(option.description) ?? '') };
        }),
      };
    });
    return {
      ...base,
      kind: 'userInput',
      questions,
      ...(autoResolutionMs !== undefined ? { autoResolutionAt: Date.now() + Math.max(0, autoResolutionMs) } : {}),
      risks: questions.some((question) => question.secret) ? ['secret'] : [],
    };
  }
  const mode = params.mode === 'url' ? 'url' : params.mode === 'openai/form' ? 'openaiForm' : 'form';
  const url = string(params.url);
  return {
    ...base,
    kind: 'mcpElicitation',
    server: clean(string(params.serverName) ?? 'MCP'),
    mode,
    message: clean(string(params.message) ?? ''),
    ...(mode !== 'url' ? { schema: safeJson(params.requestedSchema) } : {}),
    ...(mode === 'url' && url ? { urlLabel: displayUrl(url) } : {}),
    risks: mode === 'url' ? ['external'] : [],
  };
}

function buildResponse(method: InteractiveMethod, paramsValue: unknown, input: AgentInteractionSubmitInput): unknown {
  const params = object(paramsValue) ?? {};
  if (method === 'item/commandExecution/requestApproval' && input.kind === 'commandApproval') {
    if (input.decision === 'acceptWithExecpolicyAmendment') {
      const amendment = params.proposedExecpolicyAmendment;
      if (!amendment) throw new Error('没有可应用的命令策略');
      return { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } } };
    }
    if (input.decision === 'applyNetworkPolicyAmendment') {
      const amendment = array(params.proposedNetworkPolicyAmendments)[0];
      if (!amendment) throw new Error('没有可应用的网络策略');
      return { decision: { applyNetworkPolicyAmendment: { network_policy_amendment: amendment } } };
    }
    return { decision: input.decision };
  }
  if (method === 'execCommandApproval' && input.kind === 'commandApproval') {
    return { decision: legacyDecision(input.decision) };
  }
  if (method === 'item/fileChange/requestApproval' && input.kind === 'fileApproval') return { decision: input.decision };
  if (method === 'applyPatchApproval' && input.kind === 'fileApproval') return { decision: legacyDecision(input.decision) };
  if (method === 'item/permissions/requestApproval' && input.kind === 'permissionApproval') {
    const requested = object(params.permissions) ?? {};
    const granted = input.decision === 'deny'
      ? {}
      : {
          ...(requested.network ? { network: requested.network } : {}),
          ...(requested.fileSystem ? { fileSystem: requested.fileSystem } : {}),
        };
    return {
      permissions: granted,
      scope: input.decision === 'grantSession' ? 'session' : 'turn',
      ...(input.decision === 'grantTurnStrict' ? { strictAutoReview: true } : {}),
    };
  }
  if (method === 'item/tool/requestUserInput' && input.kind === 'userInput') {
    return { answers: Object.fromEntries(Object.entries(input.answers).map(([id, answers]) => [id, { answers }])) };
  }
  if (method === 'mcpServer/elicitation/request' && input.kind === 'mcpElicitation') {
    return { action: input.action, content: input.action === 'accept' ? input.content ?? {} : null, _meta: null };
  }
  throw new Error('交互响应与请求不匹配');
}

function legacyDecision(value: string): unknown {
  if (value === 'accept') return 'approved';
  if (value === 'acceptForSession') return 'approved_for_session';
  if (value === 'decline') return 'denied';
  if (value === 'cancel') return 'abort';
  throw new Error('旧版审批不支持该决定');
}

function interactionDedupeKey(projection: AgentPendingInteractionProjection): string {
  const family = projection.kind === 'commandApproval' ? 'command' : projection.kind === 'fileApproval' ? 'file' : projection.kind;
  return `${family}:${projection.threadId}:${projection.itemId ?? projection.interactionId}`;
}

function rawKey(value: string | number): string {
  return `${typeof value === 'number' ? 'n' : 's'}:${value}`;
}

function projectCommandAction(value: unknown): AgentCommandActionProjection | undefined {
  const action = object(value);
  if (!action) return undefined;
  const typeValue = string(action.type);
  const type = typeValue === 'read' || typeValue === 'listFiles' || typeValue === 'search' ? typeValue : 'unknown';
  const path = string(action.path);
  const query = string(action.query);
  const name = string(action.name);
  return {
    type,
    command: clean(string(action.command) ?? ''),
    ...(name ? { name: clean(name) } : {}),
    ...(path ? { path: displayPath(path) } : {}),
    ...(query ? { query: clean(query) } : {}),
  };
}

function projectLegacyFileChanges(value: unknown): AgentFileChangeProjection[] {
  const changes = object(value);
  if (!changes) return [];
  return Object.entries(changes).slice(0, MAX_JSON_ITEMS).map(([path, changeValue]) => {
    const change = object(changeValue) ?? {};
    return { path: displayPath(path), kind: string(change.type) ?? 'update', diff: '' };
  });
}

function commandRisks(params: Record<string, unknown>): AgentPendingInteractionProjection['risks'] {
  const risks: AgentPendingInteractionProjection['risks'] = ['shell'];
  if (params.networkApprovalContext || array(params.proposedNetworkPolicyAmendments).length > 0) risks.push('network');
  if (params.additionalPermissions) risks.push('filesystem');
  if (array(params.availableDecisions).includes('acceptForSession')) risks.push('session');
  return risks;
}

function permissionRisks(permissions: Record<string, unknown>): AgentPendingInteractionProjection['risks'] {
  const risks: AgentPendingInteractionProjection['risks'] = [];
  if (permissions.network) risks.push('network');
  if (permissions.fileSystem) risks.push('filesystem');
  risks.push('session');
  return risks;
}

function pathCount(value: unknown): number {
  return array(value).length;
}

function entryAccessCount(value: unknown, access: string): number {
  return array(value).filter((entry) => string(object(entry)?.access) === access).length;
}

function isCommandDecision(value: unknown): value is 'accept' | 'acceptForSession' | 'decline' | 'cancel' {
  return value === 'accept' || value === 'acceptForSession' || value === 'decline' || value === 'cancel';
}

function safeJson(value: unknown, depth = 0, key = ''): AgentJsonValue {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return clean(value);
  if (depth >= MAX_JSON_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_JSON_ITEMS).map((entry) => safeJson(entry, depth + 1));
  const record = object(value);
  if (!record) return String(value);
  return Object.fromEntries(Object.entries(record).slice(0, MAX_JSON_ITEMS).map(([name, entry]) => [name, safeJson(entry, depth + 1, name)]));
}

function displayPath(value: string | undefined): string {
  if (!value) return '';
  const normalized = clean(value).replaceAll('\\', '/').replace(/\/$/, '');
  return normalized.split('/').filter(Boolean).slice(-2).join('/');
}

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? `${url.host}${url.pathname}`.slice(0, 512) : 'external link';
  } catch {
    return 'external link';
  }
}

function validatedExternalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function clean(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_TEXT_LENGTH);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
