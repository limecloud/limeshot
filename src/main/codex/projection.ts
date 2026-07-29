import type { CodexNotification, CodexThread } from '@codex/index';
import type {
  AgentCatalogUpdateProjection,
  AgentDiagnosticProjection,
  AgentEvent,
  AgentHookProjection,
  AgentNoticeProjection,
  AgentSafetyReviewProjection,
  AgentThreadContextPatch,
  AgentThreadGoalProjection,
  AgentThreadSettingsProjection,
  AgentThreadStatusProjection,
  AgentTurnPlanStepProjection,
  AgentTurnProjection,
} from '../../shared/desktop';
import {
  array,
  numberValue,
  object,
  projectFileChanges,
  projectItem,
  projectThread as projectCanonicalThread,
  projectTokenUsage,
  projectTurn,
  stringValue,
  type JsonObject,
} from './itemProjection';

const MAX_NOTICE_LENGTH = 2_000;

export function projectThread(thread: Pick<CodexThread, 'turns'>): AgentTurnProjection[] {
  return projectCanonicalThread(thread as CodexThread);
}

export function projectNotification(notification: CodexNotification): AgentEvent {
  const params = object(notification.params) ?? {};
  if (notification.method === 'unknown') {
    return diagnostic('protocol', 'unknownNotification', params, 'warning');
  }
  const thread = object(params.thread);
  const threadId = stringValue(params.threadId) ?? stringValue(thread?.id);
  const turnId = stringValue(params.turnId);
  const itemId = stringValue(params.itemId);

  switch (notification.method) {
    case 'error': {
      const message = stringValue(object(params.error)?.message) ?? stringValue(params.message) ?? 'Codex reported an error';
      return { type: 'agent.error', ...(threadId ? { threadId } : {}), ...(turnId ? { turnId } : {}), message: clean(message), willRetry: params.willRetry === true };
    }
    case 'turn/started':
      return threadId && object(params.turn)
        ? { type: 'turn.started', threadId, turn: projectTurn(params.turn) }
        : invalidNotice(notification.method, params);
    case 'turn/completed':
      return threadId && object(params.turn)
        ? { type: 'turn.completed', threadId, turn: projectTurn(params.turn) }
        : invalidNotice(notification.method, params);
    case 'item/started':
    case 'item/completed':
      return threadId && turnId && object(params.item)
        ? { type: 'item.updated', threadId, turnId, item: projectItem(params.item) }
        : invalidNotice(notification.method, params);
    case 'item/agentMessage/delta':
      return deltaEvent(params, 'agentMessage');
    case 'item/plan/delta':
      return deltaEvent(params, 'plan');
    case 'item/commandExecution/outputDelta':
      return deltaEvent(params, 'commandOutput');
    case 'item/reasoning/summaryTextDelta':
      return deltaEvent(params, 'reasoningSummary', numberValue(params.summaryIndex));
    case 'item/reasoning/summaryPartAdded':
      return threadId && turnId && itemId
        ? { type: 'item.delta', threadId, turnId, itemId, channel: 'reasoningSummary', delta: '', index: numberValue(params.summaryIndex) ?? 0 }
        : invalidNotice(notification.method, params);
    case 'item/reasoning/textDelta':
      return deltaEvent(params, 'reasoningContent', numberValue(params.contentIndex));
    case 'item/commandExecution/terminalInteraction':
      return threadId && turnId && itemId
        ? { type: 'item.delta', threadId, turnId, itemId, channel: 'terminalInteraction', delta: '' }
        : invalidNotice(notification.method, params);
    case 'item/fileChange/patchUpdated':
      return threadId && turnId && itemId
        ? { type: 'item.patch.updated', threadId, turnId, itemId, changes: projectFileChanges(params.changes) }
        : invalidNotice(notification.method, params);
    case 'item/mcpToolCall/progress':
      return threadId && turnId && itemId
        ? { type: 'item.progress', threadId, turnId, itemId, message: clean(stringValue(params.message) ?? '') }
        : invalidNotice(notification.method, params);
    case 'turn/diff/updated':
      return threadId && turnId
        ? { type: 'turn.diff.updated', threadId, turnId, diff: clean(stringValue(params.diff) ?? '') }
        : invalidNotice(notification.method, params);
    case 'turn/plan/updated': {
      if (!threadId || !turnId) return invalidNotice(notification.method, params);
      const steps: AgentTurnPlanStepProjection[] = array(params.plan).map((entry) => {
        const step = object(entry);
        const status = step?.status === 'inProgress' || step?.status === 'completed' ? step.status : 'pending';
        return { step: clean(stringValue(step?.step) ?? ''), status };
      });
      const explanation = stringValue(params.explanation);
      return { type: 'turn.plan.updated', threadId, turnId, ...(explanation ? { explanation: clean(explanation) } : {}), steps };
    }
    case 'thread/tokenUsage/updated':
      return threadId && turnId
        ? { type: 'thread.usage.updated', threadId, turnId, usage: projectTokenUsage(params.tokenUsage) }
        : invalidNotice(notification.method, params);
    case 'thread/status/changed':
      return threadId
        ? { type: 'thread.status.updated', threadId, status: projectThreadStatus(params.status) }
        : invalidNotice(notification.method, params);
    case 'hook/started':
    case 'hook/completed': {
      const hook = projectHook(params.run, turnId);
      return threadId && hook
        ? { type: 'hook.updated', threadId, hook }
        : invalidNotice(notification.method, params);
    }
    case 'serverRequest/resolved':
      return diagnostic('interaction', 'interactionResolved', params, 'info', 'resolved');
    case 'thread/compacted': {
      if (!threadId || !turnId) return invalidNotice(notification.method, params);
      return {
        type: 'item.updated',
        threadId,
        turnId,
        item: { id: `compaction-${turnId}`, type: 'contextCompaction', kind: 'system', title: 'Context compacted', text: '' },
      };
    }
    case 'thread/realtime/itemAdded': {
      const item = object(params.item);
      const realtimeTurnId = turnId ?? stringValue(item?.turnId);
      return threadId && realtimeTurnId && item
        ? { type: 'item.updated', threadId, turnId: realtimeTurnId, item: projectItem(item, `realtime-${realtimeTurnId}`) }
        : diagnostic('compatibility', 'realtimeItemDetached', params, 'warning');
    }
    case 'item/autoApprovalReview/started':
      return threadId && turnId
        ? { type: 'review.updated', threadId, review: projectSafetyReview(params, turnId, false) }
        : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'item/autoApprovalReview/completed':
      return threadId && turnId
        ? { type: 'review.updated', threadId, review: projectSafetyReview(params, turnId, true) }
        : diagnostic('protocol', 'invalidEvent', params, 'warning');

    case 'thread/started': {
      if (!threadId || !thread) return diagnostic('protocol', 'invalidEvent', params, 'warning');
      const name = stringValue(thread.name);
      return context(threadId, {
        lifecycle: 'active',
        name: thread.name === null ? null : name ? clean(name) : null,
        preview: clean(stringValue(thread.preview) ?? ''),
        cwd: displayPath(stringValue(thread.cwd)),
        modelProvider: clean(stringValue(thread.modelProvider) ?? ''),
        status: projectThreadStatus(thread.status),
      });
    }
    case 'thread/archived':
      return threadId ? context(threadId, { lifecycle: 'archived' }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/deleted':
      return threadId ? context(threadId, { lifecycle: 'deleted' }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/unarchived':
      return threadId ? context(threadId, { lifecycle: 'active' }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/closed':
      return threadId ? context(threadId, { lifecycle: 'closed' }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/name/updated': {
      if (!threadId) return diagnostic('protocol', 'invalidEvent', params, 'warning');
      const name = stringValue(params.threadName);
      return context(threadId, { name: params.threadName === null ? null : name ? clean(name) : null });
    }
    case 'thread/goal/updated':
      return threadId ? context(threadId, { goal: projectGoal(params.goal) }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/goal/cleared':
      return threadId ? context(threadId, { goal: null }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/environment/connected':
    case 'thread/environment/disconnected':
      return threadId
        ? context(threadId, { environment: { state: notification.method.endsWith('/connected') ? 'connected' : 'disconnected', label: environmentLabel(params) } })
        : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/settings/updated':
      return threadId ? context(threadId, { settings: projectSettings(params.threadSettings) }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'model/rerouted': {
      if (!threadId) return diagnostic('protocol', 'invalidEvent', params, 'warning');
      const current = clean(stringValue(params.toModel) ?? 'model');
      const previous = stringValue(params.fromModel);
      const reason = semanticLabel(params.reason);
      return context(threadId, { model: { current, ...(previous ? { previous: clean(previous) } : {}), ...(reason ? { reason } : {}) } });
    }
    case 'model/verification':
      return threadId ? context(threadId, { verificationCount: array(params.verifications).length }) : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'model/safetyBuffering/updated': {
      if (!threadId) return diagnostic('protocol', 'invalidEvent', params, 'warning');
      const fasterModel = stringValue(params.fasterModel);
      return context(threadId, { safetyBuffering: { active: params.showBufferingUi === true || params.active === true, ...(fasterModel ? { fasterModel: clean(fasterModel) } : {}) } });
    }
    case 'warning':
      return userNotice('warning', params, threadId ? 'thread' : 'global', safeMessage(stringValue(params.message)), 'warning');
    case 'guardianWarning':
      return userNotice('guardian', params, 'thread', safeMessage(stringValue(params.message)), 'error');
    case 'thread/realtime/started': {
      if (!threadId) return diagnostic('protocol', 'invalidEvent', params, 'warning');
      const version = semanticLabel(params.version);
      return { type: 'thread.realtime.updated', threadId, update: { kind: 'started', sessionActive: Boolean(stringValue(params.realtimeSessionId)), ...(version ? { version } : {}) } };
    }
    case 'thread/realtime/transcript/delta':
      return threadId
        ? { type: 'thread.realtime.updated', threadId, update: { kind: 'transcriptDelta', role: clean(stringValue(params.role) ?? 'speaker'), text: clean(stringValue(params.delta) ?? '') } }
        : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/realtime/transcript/done':
      return threadId
        ? { type: 'thread.realtime.updated', threadId, update: { kind: 'transcriptDone', role: clean(stringValue(params.role) ?? 'speaker'), text: clean(stringValue(params.text) ?? '') } }
        : diagnostic('protocol', 'invalidEvent', params, 'warning');
    case 'thread/realtime/outputAudio/delta':
      return threadId ? { type: 'thread.realtime.updated', threadId, update: { kind: 'audioQueued' } } : diagnostic('media', 'invalidEvent', params, 'warning');
    case 'thread/realtime/error':
      return threadId
        ? { type: 'thread.realtime.updated', threadId, update: { kind: 'error', ...(safeMessage(stringValue(params.message)) ? { message: safeMessage(stringValue(params.message)) } : {}) } }
        : diagnostic('media', 'invalidEvent', params, 'warning');
    case 'thread/realtime/closed': {
      if (!threadId) return diagnostic('protocol', 'invalidEvent', params, 'warning');
      const message = safeMessage(stringValue(params.reason));
      return { type: 'thread.realtime.updated', threadId, update: { kind: 'closed', ...(message ? { message } : {}) } };
    }

    case 'skills/changed':
      return catalog('skills', 'updated', params);
    case 'mcpServer/oauthLogin/completed':
      return catalog('mcp', params.success === true ? 'ready' : 'failed', params, stringValue(params.name), safeMessage(stringValue(params.error)));
    case 'mcpServer/startupStatus/updated':
      return catalog('mcp', semanticLabel(params.status) || 'updated', params, stringValue(params.name), safeMessage(stringValue(params.error)), threadId);
    case 'account/updated':
      return catalog('account', semanticLabel(params.authMode) || 'updated', params, semanticLabel(params.planType));
    case 'account/rateLimits/updated': {
      const rateLimits = object(params.rateLimits) ?? {};
      const primary = object(rateLimits.primary);
      return catalog('account', rateLimits.rateLimitReachedType ? 'limited' : 'updated', params, undefined, undefined, undefined, numberValue(primary?.usedPercent));
    }
    case 'app/list/updated':
      return catalog('apps', 'updated', params, undefined, undefined, undefined, array(params.data).length);
    case 'remoteControl/status/changed':
      return catalog('remoteControl', semanticLabel(params.status) || 'updated', params, stringValue(params.serverName));
    case 'externalAgentConfig/import/progress':
      return catalog('import', semanticLabel(params.status) || 'running', params, stringValue(params.importId));
    case 'externalAgentConfig/import/completed':
      return catalog('import', 'completed', params, stringValue(params.importId), undefined, undefined, array(params.itemTypeResults).length);
    case 'fs/changed':
      return catalog('filesystem', 'changed', params, undefined, undefined, undefined, array(params.changedPaths).length);
    case 'deprecationNotice':
      return userNotice('deprecation', params, 'global', joinMessage(params.summary, params.details), 'warning');
    case 'configWarning': {
      const path = stringValue(params.path);
      const message = [joinMessage(params.summary, params.details), path ? displayPath(path) : undefined].filter(Boolean).join(' · ');
      return userNotice('config', params, 'global', message, 'warning');
    }
    case 'fuzzyFileSearch/sessionUpdated':
      return {
        type: 'composer.search.updated',
        search: {
          sessionId: clean(stringValue(params.sessionId) ?? 'search'),
          query: clean(stringValue(params.query) ?? ''),
          status: 'searching',
          files: array(params.files).slice(0, 50).map((entry) => {
            const file = object(entry) ?? {};
            const path = displayPath(stringValue(file.path));
            return { path, name: clean(stringValue(file.file_name) ?? path.split('/').at(-1) ?? '') };
          }),
        },
      };
    case 'fuzzyFileSearch/sessionCompleted':
      return { type: 'composer.search.updated', search: { sessionId: clean(stringValue(params.sessionId) ?? 'search'), query: '', status: 'completed', files: [] } };
    case 'windows/worldWritableWarning': {
      const samples = array(params.samplePaths).slice(0, 3).map((path) => displayPath(stringValue(path))).filter(Boolean);
      const extra = numberValue(params.extraCount) ?? 0;
      return userNotice('windows', params, 'global', `${samples.join(', ')}${extra > 0 ? ` (+${extra})` : ''}` || 'World-writable paths detected', 'warning');
    }
    case 'windowsSandbox/setupCompleted':
      return catalog('sandbox', params.success === true ? 'ready' : 'failed', params, semanticLabel(params.mode), safeMessage(stringValue(params.error)));
    case 'account/login/completed':
      return catalog('authentication', params.success === true ? 'ready' : 'failed', params, undefined, safeMessage(stringValue(params.error)));

    case 'rawResponseItem/completed':
    case 'rawResponse/completed':
      return diagnostic('compatibility', 'rawResponse', params);
    case 'command/exec/outputDelta':
      return diagnostic('output', params.capReached === true ? 'commandOutputCapped' : 'commandOutput', params);
    case 'process/outputDelta':
      return diagnostic('process', params.capReached === true ? 'processOutputCapped' : 'processOutput', params);
    case 'process/exited': {
      const exitCode = numberValue(params.exitCode);
      return diagnostic('process', 'processExited', params, exitCode === undefined || exitCode === 0 ? 'info' : 'warning', 'completed', exitCode === undefined ? undefined : String(exitCode));
    }
    case 'item/fileChange/outputDelta':
      return diagnostic('compatibility', 'deprecatedFileOutput', params);
    case 'turn/moderationMetadata':
      return diagnostic('moderation', 'moderationUpdated', params);
    case 'thread/realtime/sdp':
      return diagnostic('media', 'realtimeTransportHandled', params);
  }
}

function deltaEvent(params: JsonObject, channel: 'agentMessage' | 'plan' | 'commandOutput' | 'reasoningSummary' | 'reasoningContent', index?: number): AgentEvent {
  const threadId = stringValue(params.threadId);
  const turnId = stringValue(params.turnId);
  const itemId = stringValue(params.itemId);
  const delta = stringValue(params.delta);
  if (!threadId || !turnId || !itemId || delta === undefined) return invalidNotice('item/delta', params);
  return { type: 'item.delta', threadId, turnId, itemId, channel, delta: clean(delta), ...(index !== undefined ? { index } : {}) };
}

function projectThreadStatus(value: unknown): AgentThreadStatusProjection {
  const status = object(value) ?? {};
  const type = status.type === 'idle' || status.type === 'systemError' || status.type === 'active' ? status.type : 'notLoaded';
  const flags = array(status.activeFlags).map((flag) => typeof flag === 'string' ? flag : stringValue(object(flag)?.type) ?? '');
  return {
    type,
    waitingOnApproval: flags.some((flag) => /approval/i.test(flag)),
    waitingOnUserInput: flags.some((flag) => /user.?input/i.test(flag)),
  };
}

function projectHook(value: unknown, turnId?: string): AgentHookProjection | undefined {
  const run = object(value);
  const id = stringValue(run?.id);
  if (!run || !id) return undefined;
  const statusMessage = stringValue(run.statusMessage);
  const durationMs = numeric(run.durationMs);
  return {
    id,
    ...(turnId ? { turnId } : {}),
    eventName: clean(stringValue(run.eventName) ?? 'hook'),
    status: clean(stringValue(run.status) ?? 'running'),
    ...(statusMessage ? { statusMessage: clean(statusMessage) } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    entries: array(run.entries).map((entry) => {
      const item = object(entry);
      return { kind: clean(stringValue(item?.type) ?? stringValue(item?.kind) ?? 'output'), text: clean(stringValue(item?.text) ?? stringValue(item?.message) ?? '') };
    }),
  };
}

function context(threadId: string, patch: AgentThreadContextPatch): AgentEvent {
  return { type: 'thread.context.updated', threadId, patch };
}

function projectGoal(value: unknown): AgentThreadGoalProjection {
  const goal = object(value) ?? {};
  const tokenBudget = numberValue(goal.tokenBudget);
  return {
    objective: clean(stringValue(goal.objective) ?? ''),
    status: semanticLabel(goal.status) || 'active',
    ...(tokenBudget !== undefined ? { tokenBudget } : {}),
    tokensUsed: numberValue(goal.tokensUsed) ?? 0,
    timeUsedSeconds: numberValue(goal.timeUsedSeconds) ?? 0,
  };
}

function projectSettings(value: unknown): AgentThreadSettingsProjection {
  const settings = object(value) ?? {};
  const serviceTier = stringValue(settings.serviceTier);
  const effort = semanticLabel(settings.effort);
  const permissionProfile = semanticLabel(settings.activePermissionProfile);
  return {
    cwd: displayPath(stringValue(settings.cwd)),
    model: clean(stringValue(settings.model) ?? ''),
    modelProvider: clean(stringValue(settings.modelProvider) ?? ''),
    ...(serviceTier ? { serviceTier: clean(serviceTier) } : {}),
    ...(effort ? { effort } : {}),
    approvalPolicy: semanticLabel(settings.approvalPolicy) || 'default',
    sandboxPolicy: semanticLabel(settings.sandboxPolicy) || 'default',
    ...(permissionProfile ? { permissionProfile } : {}),
  };
}

function projectSafetyReview(params: JsonObject, turnId: string, completed: boolean): AgentSafetyReviewProjection {
  const review = object(params.review) ?? {};
  const action = object(params.action) ?? {};
  const actionType = safetyAction(stringValue(action.type));
  const itemId = stringValue(params.targetItemId);
  const rationale = safeMessage(stringValue(review.rationale));
  const risk = safetyRisk(stringValue(review.riskLevel));
  const authorization = safetyAuthorization(stringValue(review.userAuthorization));
  const startedAt = numberValue(params.startedAtMs);
  const completedAt = numberValue(params.completedAtMs);
  return {
    id: clean(stringValue(params.reviewId) ?? `review-${turnId}`),
    turnId,
    ...(itemId ? { itemId: clean(itemId) } : {}),
    status: safetyStatus(stringValue(review.status), completed),
    action: actionType,
    summary: safetyActionSummary(actionType, action),
    ...(risk ? { risk } : {}),
    ...(authorization ? { authorization } : {}),
    ...(rationale ? { rationale } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
  };
}

function userNotice(
  kind: AgentNoticeProjection['kind'],
  params: JsonObject,
  scope: AgentNoticeProjection['scope'],
  message: string | undefined,
  level: AgentNoticeProjection['level'],
): AgentEvent {
  const threadId = stringValue(params.threadId);
  const turnId = stringValue(params.turnId);
  const stable = stringValue(params.id) ?? stringValue(params.sessionId) ?? turnId ?? threadId ?? 'global';
  return {
    type: 'notice.updated',
    notice: {
      id: `${kind}:${clean(stable)}`,
      scope,
      level,
      kind,
      ...(message ? { message } : {}),
      ...(threadId ? { threadId } : {}),
      ...(turnId ? { turnId } : {}),
    },
  };
}

function invalidNotice(method: string, params: JsonObject): AgentEvent {
  void method;
  return diagnostic('protocol', 'invalidEvent', params, 'warning');
}

function catalog(
  domain: AgentCatalogUpdateProjection['domain'],
  status: string,
  params: JsonObject,
  label?: string,
  message?: string,
  threadId?: string,
  count?: number,
): AgentEvent {
  const stable = stringValue(params.id) ?? stringValue(params.importId) ?? stringValue(params.loginId) ?? label ?? domain;
  return {
    type: 'catalog.updated',
    update: {
      id: `${domain}:${clean(stable)}`,
      domain,
      status: clean(status),
      ...(label ? { label: clean(label) } : {}),
      ...(message ? { message } : {}),
      ...(count !== undefined ? { count } : {}),
      ...(threadId ? { threadId } : {}),
    },
  };
}

function diagnostic(
  domain: AgentDiagnosticProjection['domain'],
  code: AgentDiagnosticProjection['code'],
  params: JsonObject,
  level: AgentDiagnosticProjection['level'] = 'info',
  status?: string,
  detail?: string,
): AgentEvent {
  const threadId = stringValue(params.threadId);
  const turnId = stringValue(params.turnId);
  const stable = stringValue(params.id) ?? stringValue(params.processId) ?? stringValue(params.processHandle) ?? turnId ?? threadId ?? 'global';
  return {
    type: 'diagnostic.recorded',
    diagnostic: {
      id: `${domain}:${clean(stable)}`,
      domain,
      code,
      level,
      ...(detail ? { detail: clean(detail) } : {}),
      ...(threadId ? { threadId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(status ? { status } : {}),
    },
  };
}

function environmentLabel(params: JsonObject): string {
  const environment = object(params.environment) ?? {};
  return clean(stringValue(params.environmentId) ?? stringValue(params.id) ?? stringValue(environment.id) ?? 'environment').slice(0, 80);
}

function semanticLabel(value: unknown): string {
  if (typeof value === 'string') return clean(value);
  const record = object(value);
  if (!record) return '';
  return clean(stringValue(record.type) ?? stringValue(record.mode) ?? stringValue(record.name) ?? '');
}

function safetyAction(value: string | undefined): AgentSafetyReviewProjection['action'] {
  return value === 'command' || value === 'execve' || value === 'applyPatch' || value === 'networkAccess' || value === 'mcpToolCall' || value === 'requestPermissions' ? value : 'unknown';
}

function safetyStatus(value: string | undefined, completed: boolean): AgentSafetyReviewProjection['status'] {
  if (value === 'approved' || value === 'denied' || value === 'timedOut' || value === 'aborted') return value;
  return completed ? 'aborted' : 'inProgress';
}

function safetyRisk(value: string | undefined): AgentSafetyReviewProjection['risk'] | undefined {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical' ? value : undefined;
}

function safetyAuthorization(value: string | undefined): AgentSafetyReviewProjection['authorization'] | undefined {
  return value === 'unknown' || value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function safetyActionSummary(action: AgentSafetyReviewProjection['action'], value: JsonObject): string {
  if (action === 'command') return clean(stringValue(value.command) ?? 'Command');
  if (action === 'execve') return clean([stringValue(value.program), ...array(value.argv).filter((entry): entry is string => typeof entry === 'string')].filter(Boolean).join(' '));
  if (action === 'applyPatch') return `${array(value.files).length} file(s)`;
  if (action === 'networkAccess') return [stringValue(value.protocol), stringValue(value.host), numberValue(value.port)].filter((entry) => entry !== undefined).join(' ');
  if (action === 'mcpToolCall') return [stringValue(value.server), stringValue(value.toolName)].filter(Boolean).join(' / ');
  if (action === 'requestPermissions') return safeMessage(stringValue(value.reason)) ?? 'Permissions requested';
  return 'Safety review';
}

function joinMessage(summary: unknown, details: unknown): string | undefined {
  const values = [safeMessage(stringValue(summary)), safeMessage(stringValue(details))].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(' · ') : undefined;
}

function safeMessage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return clean(value)
    .replace(/\b(token|password|secret|credential)=([^\s&]+)/gi, '$1=[redacted]')
    .replace(/https:\/\/[^\s]+/gi, (candidate) => safeUrl(candidate))
    .replace(/(?:\/[A-Za-z0-9._-]+){3,}/g, (candidate) => displayPath(candidate));
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`;
  } catch {
    return 'external link';
  }
}

function displayPath(value: string | undefined): string {
  if (!value) return '';
  const normalized = clean(value).replaceAll('\\', '/').replace(/\/$/, '');
  return normalized.split('/').filter(Boolean).slice(-2).join('/');
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'bigint' ? Number(value) : numberValue(value);
}

function clean(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_NOTICE_LENGTH);
}
