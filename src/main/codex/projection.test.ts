import { describe, expect, it } from 'vitest';

import {
  CODEX_NOTIFICATION_METHODS,
  type CodexNotificationMethod,
} from '../../../packages/codex-client/src/index';
import type { AgentEvent } from '../../shared/desktop';
import { projectItem } from './itemProjection';
import { projectNotification, projectThread } from './projection';

const ALL_ITEM_FIXTURES: unknown[] = [
  { id: 'user', type: 'userMessage', content: [{ type: 'text', text: 'hello', text_elements: [] }] },
  { id: 'hook-prompt', type: 'hookPrompt', fragments: [{ text: 'context', hookRunId: 'hook-1' }] },
  { id: 'agent', type: 'agentMessage', text: 'answer' },
  { id: 'plan', type: 'plan', text: 'step' },
  { id: 'reasoning', type: 'reasoning', summary: ['checking'], content: [] },
  { id: 'command', type: 'commandExecution', command: 'pwd', cwd: '/workspace', commandActions: [], status: 'completed', aggregatedOutput: '/workspace' },
  { id: 'file', type: 'fileChange', changes: [{ path: '/workspace/a.ts', kind: 'update', diff: '+ok' }], status: 'completed' },
  { id: 'mcp', type: 'mcpToolCall', server: 'docs', tool: 'search', arguments: {}, status: 'completed' },
  { id: 'dynamic', type: 'dynamicToolCall', tool: 'project_read', arguments: {}, status: 'completed', contentItems: [] },
  { id: 'collab', type: 'collabAgentToolCall', tool: 'wait', senderThreadId: 'thread-1', receiverThreadIds: [], agentsStates: {}, status: 'completed' },
  { id: 'subagent', type: 'subAgentActivity', kind: 'started', agentThreadId: 'thread-2', agentPath: 'worker' },
  { id: 'search', type: 'webSearch', query: 'Codex', action: { type: 'search', query: 'Codex', queries: null }, results: [{ title: 'Codex docs', rank: 1, token: 'secret' }] },
  { id: 'image-view', type: 'imageView', path: '/workspace/image.png' },
  { id: 'sleep', type: 'sleep', durationMs: 100 },
  { id: 'image-generation', type: 'imageGeneration', status: 'completed', result: 'done' },
  { id: 'review-enter', type: 'enteredReviewMode', review: 'review' },
  { id: 'review-exit', type: 'exitedReviewMode', review: 'done' },
  { id: 'compaction', type: 'contextCompaction' },
];

const TURN_FIXTURE = {
  id: 'turn-1', status: 'inProgress', error: null, itemsView: 'full',
  startedAt: null, completedAt: null, durationMs: null, items: [],
};

const ITEM_FIXTURE = {
  id: 'item-1', type: 'agentMessage', text: 'hello', phase: null, memoryCitation: null,
};

const NOTIFICATION_PARAMS = {
  error: { threadId: 'thread-1', turnId: 'turn-1', message: 'failed', willRetry: false },
  'thread/started': { thread: { id: 'thread-1', name: 'Render', preview: '', cwd: '/workspace/project', modelProvider: 'openai', status: { type: 'idle' } } },
  'thread/status/changed': { threadId: 'thread-1', status: { type: 'active', activeFlags: [] } },
  'thread/archived': { threadId: 'thread-1' },
  'thread/deleted': { threadId: 'thread-1' },
  'thread/unarchived': { threadId: 'thread-1' },
  'thread/closed': { threadId: 'thread-1' },
  'skills/changed': {},
  'thread/name/updated': { threadId: 'thread-1', threadName: 'Render' },
  'thread/goal/updated': { threadId: 'thread-1', goal: { objective: 'Finish', status: 'active', tokenBudget: 1_000 } },
  'thread/goal/cleared': { threadId: 'thread-1' },
  'thread/environment/connected': { threadId: 'thread-1', environmentId: 'remote-build' },
  'thread/environment/disconnected': { threadId: 'thread-1', environmentId: 'remote-build' },
  'thread/settings/updated': { threadId: 'thread-1', threadSettings: { cwd: '/workspace/project', model: 'gpt-5', modelProvider: 'openai' } },
  'thread/tokenUsage/updated': { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: {} },
  'turn/started': { threadId: 'thread-1', turn: TURN_FIXTURE },
  'hook/started': { threadId: 'thread-1', turnId: 'turn-1', run: { id: 'hook-1', eventName: 'afterTurn', status: 'running', entries: [] } },
  'turn/completed': { threadId: 'thread-1', turn: { ...TURN_FIXTURE, status: 'completed' } },
  'hook/completed': { threadId: 'thread-1', turnId: 'turn-1', run: { id: 'hook-1', eventName: 'afterTurn', status: 'completed', entries: [] } },
  'turn/diff/updated': { threadId: 'thread-1', turnId: 'turn-1', diff: '+done' },
  'turn/plan/updated': { threadId: 'thread-1', turnId: 'turn-1', plan: [{ step: 'Test', status: 'inProgress' }] },
  'item/started': { threadId: 'thread-1', turnId: 'turn-1', item: ITEM_FIXTURE },
  'item/autoApprovalReview/started': { threadId: 'thread-1', turnId: 'turn-1', reviewId: 'review-1', action: { type: 'command', command: 'npm test' } },
  'item/autoApprovalReview/completed': { threadId: 'thread-1', turnId: 'turn-1', reviewId: 'review-1', action: { type: 'command', command: 'npm test' }, review: { status: 'approved' } },
  'item/completed': { threadId: 'thread-1', turnId: 'turn-1', item: ITEM_FIXTURE },
  'rawResponseItem/completed': { threadId: 'thread-1', turnId: 'turn-1', item: {} },
  'rawResponse/completed': { threadId: 'thread-1', turnId: 'turn-1', responseId: 'response-1' },
  'item/agentMessage/delta': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'a' },
  'item/plan/delta': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'a' },
  'command/exec/outputDelta': { processId: 'process-1', delta: 'a' },
  'process/outputDelta': { processId: 'process-1', delta: 'YQ==' },
  'process/exited': { processId: 'process-1', exitCode: 0 },
  'item/commandExecution/outputDelta': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'a' },
  'item/commandExecution/terminalInteraction': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1' },
  'item/fileChange/outputDelta': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'a' },
  'item/fileChange/patchUpdated': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', changes: [] },
  'serverRequest/resolved': { threadId: 'thread-1', requestId: 'request-1' },
  'item/mcpToolCall/progress': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', message: 'working' },
  'mcpServer/oauthLogin/completed': { name: 'docs', success: true },
  'mcpServer/startupStatus/updated': { name: 'docs', status: 'ready' },
  'account/updated': { authMode: 'chatgpt', planType: 'pro' },
  'account/rateLimits/updated': { rateLimits: { primary: { usedPercent: 10 } } },
  'app/list/updated': { data: [] },
  'remoteControl/status/changed': { status: 'connected', serverName: 'desktop' },
  'externalAgentConfig/import/progress': { importId: 'import-1', status: 'running' },
  'externalAgentConfig/import/completed': { importId: 'import-1', itemTypeResults: [] },
  'fs/changed': { changedPaths: ['/workspace/project/src/App.tsx'] },
  'item/reasoning/summaryTextDelta': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', summaryIndex: 0, delta: 'a' },
  'item/reasoning/summaryPartAdded': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', summaryIndex: 0 },
  'item/reasoning/textDelta': { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', contentIndex: 0, delta: 'a' },
  'thread/compacted': { threadId: 'thread-1', turnId: 'turn-1' },
  'model/rerouted': { threadId: 'thread-1', fromModel: 'gpt-5', toModel: 'gpt-5-mini', reason: 'capacity' },
  'model/verification': { threadId: 'thread-1', verifications: [] },
  'turn/moderationMetadata': { threadId: 'thread-1', turnId: 'turn-1' },
  'model/safetyBuffering/updated': { threadId: 'thread-1', showBufferingUi: true, fasterModel: 'gpt-5-mini' },
  warning: { threadId: 'thread-1', message: 'Check settings' },
  guardianWarning: { threadId: 'thread-1', message: 'Blocked by policy' },
  deprecationNotice: { summary: 'Deprecated', details: 'Use the replacement' },
  configWarning: { summary: 'Invalid config', details: 'Check value', path: '/workspace/project/.codex/config.toml' },
  'fuzzyFileSearch/sessionUpdated': { sessionId: 'search-1', query: 'App', files: [{ path: '/workspace/project/src/App.tsx', file_name: 'App.tsx' }] },
  'fuzzyFileSearch/sessionCompleted': { sessionId: 'search-1' },
  'thread/realtime/started': { threadId: 'thread-1', realtimeSessionId: 'realtime-1', version: 'v2' },
  'thread/realtime/itemAdded': { threadId: 'thread-1', turnId: 'turn-1', item: ITEM_FIXTURE },
  'thread/realtime/transcript/delta': { threadId: 'thread-1', role: 'user', delta: 'hello' },
  'thread/realtime/transcript/done': { threadId: 'thread-1', role: 'user', text: 'hello' },
  'thread/realtime/outputAudio/delta': { threadId: 'thread-1', delta: 'YQ==' },
  'thread/realtime/sdp': { threadId: 'thread-1', sdp: 'redacted in renderer' },
  'thread/realtime/error': { threadId: 'thread-1', message: 'session failed' },
  'thread/realtime/closed': { threadId: 'thread-1', reason: 'completed' },
  'windows/worldWritableWarning': { samplePaths: ['C:/workspace/project'], extraCount: 0 },
  'windowsSandbox/setupCompleted': { success: true, mode: 'elevated' },
  'account/login/completed': { success: true },
} satisfies Record<CodexNotificationMethod, unknown>;

const EXPECTED_NOTIFICATION_EVENTS = {
  error: 'agent.error',
  'thread/started': 'thread.context.updated',
  'thread/status/changed': 'thread.status.updated',
  'thread/archived': 'thread.context.updated',
  'thread/deleted': 'thread.context.updated',
  'thread/unarchived': 'thread.context.updated',
  'thread/closed': 'thread.context.updated',
  'skills/changed': 'catalog.updated',
  'thread/name/updated': 'thread.context.updated',
  'thread/goal/updated': 'thread.context.updated',
  'thread/goal/cleared': 'thread.context.updated',
  'thread/environment/connected': 'thread.context.updated',
  'thread/environment/disconnected': 'thread.context.updated',
  'thread/settings/updated': 'thread.context.updated',
  'thread/tokenUsage/updated': 'thread.usage.updated',
  'turn/started': 'turn.started',
  'hook/started': 'hook.updated',
  'turn/completed': 'turn.completed',
  'hook/completed': 'hook.updated',
  'turn/diff/updated': 'turn.diff.updated',
  'turn/plan/updated': 'turn.plan.updated',
  'item/started': 'item.updated',
  'item/autoApprovalReview/started': 'review.updated',
  'item/autoApprovalReview/completed': 'review.updated',
  'item/completed': 'item.updated',
  'rawResponseItem/completed': 'diagnostic.recorded',
  'rawResponse/completed': 'diagnostic.recorded',
  'item/agentMessage/delta': 'item.delta',
  'item/plan/delta': 'item.delta',
  'command/exec/outputDelta': 'diagnostic.recorded',
  'process/outputDelta': 'diagnostic.recorded',
  'process/exited': 'diagnostic.recorded',
  'item/commandExecution/outputDelta': 'item.delta',
  'item/commandExecution/terminalInteraction': 'item.delta',
  'item/fileChange/outputDelta': 'diagnostic.recorded',
  'item/fileChange/patchUpdated': 'item.patch.updated',
  'serverRequest/resolved': 'diagnostic.recorded',
  'item/mcpToolCall/progress': 'item.progress',
  'mcpServer/oauthLogin/completed': 'catalog.updated',
  'mcpServer/startupStatus/updated': 'catalog.updated',
  'account/updated': 'catalog.updated',
  'account/rateLimits/updated': 'catalog.updated',
  'app/list/updated': 'catalog.updated',
  'remoteControl/status/changed': 'catalog.updated',
  'externalAgentConfig/import/progress': 'catalog.updated',
  'externalAgentConfig/import/completed': 'catalog.updated',
  'fs/changed': 'catalog.updated',
  'item/reasoning/summaryTextDelta': 'item.delta',
  'item/reasoning/summaryPartAdded': 'item.delta',
  'item/reasoning/textDelta': 'item.delta',
  'thread/compacted': 'item.updated',
  'model/rerouted': 'thread.context.updated',
  'model/verification': 'thread.context.updated',
  'turn/moderationMetadata': 'diagnostic.recorded',
  'model/safetyBuffering/updated': 'thread.context.updated',
  warning: 'notice.updated',
  guardianWarning: 'notice.updated',
  deprecationNotice: 'notice.updated',
  configWarning: 'notice.updated',
  'fuzzyFileSearch/sessionUpdated': 'composer.search.updated',
  'fuzzyFileSearch/sessionCompleted': 'composer.search.updated',
  'thread/realtime/started': 'thread.realtime.updated',
  'thread/realtime/itemAdded': 'item.updated',
  'thread/realtime/transcript/delta': 'thread.realtime.updated',
  'thread/realtime/transcript/done': 'thread.realtime.updated',
  'thread/realtime/outputAudio/delta': 'thread.realtime.updated',
  'thread/realtime/sdp': 'diagnostic.recorded',
  'thread/realtime/error': 'thread.realtime.updated',
  'thread/realtime/closed': 'thread.realtime.updated',
  'windows/worldWritableWarning': 'notice.updated',
  'windowsSandbox/setupCompleted': 'catalog.updated',
  'account/login/completed': 'catalog.updated',
} satisfies Record<CodexNotificationMethod, AgentEvent['type']>;

describe('Codex semantic projection', () => {
  it('projects canonical history without creating a second agent state model', () => {
    expect(projectThread({
      turns: [{
        id: 'turn-1', status: 'completed', error: null, itemsView: 'full', startedAt: null, completedAt: null, durationMs: null,
        items: [
          { type: 'userMessage', id: 'user-1', clientId: null, content: [{ type: 'text', text: '生成方案', text_elements: [] }] },
          { type: 'agentMessage', id: 'agent-1', text: '先补充目标平台。', phase: null, memoryCitation: null },
        ],
      }],
    })).toMatchObject([{
      id: 'turn-1', status: 'completed', itemsView: 'full',
      items: [
        { id: 'user-1', type: 'userMessage', kind: 'user', text: '生成方案' },
        { id: 'agent-1', type: 'agentMessage', kind: 'assistant', text: '先补充目标平台。' },
      ],
    }]);
  });

  it('maps every allowlisted notification into a semantic renderer event', () => {
    expect(projectNotification({ method: 'item/agentMessage/delta', params: {
      threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', delta: '片段',
    } })).toEqual({
      type: 'item.delta', threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', channel: 'agentMessage', delta: '片段',
    });
    expect(projectNotification({ method: 'account/updated', params: {} })).toMatchObject({
      type: 'catalog.updated', update: { domain: 'account', status: 'updated' },
    });
  });

  it('projects all 18 ThreadItem variants without falling back to unknown', () => {
    const projected = ALL_ITEM_FIXTURES.map((item) => projectItem(item));
    expect(projected).toHaveLength(18);
    expect(projected.map((item) => item.type)).toEqual(ALL_ITEM_FIXTURES.map((item) => (item as { type: string }).type));
    expect(projected.find((item) => item.type === 'webSearch')).toMatchObject({
      results: [{ title: 'Codex docs', details: { rank: 1, token: '[redacted]' } }],
    });
    expect(projected.find((item) => item.type === 'hookPrompt')).toMatchObject({ kind: 'user', title: 'Hook feedback' });
    expect(projected.find((item) => item.type === 'contextCompaction')).toMatchObject({ status: 'completed', source: 'automatic' });
  });

  it('projects context compaction lifecycle without synthesizing a second runtime state', () => {
    expect(projectNotification({ method: 'item/started', params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      item: { id: 'compact-1', type: 'contextCompaction' },
    } })).toMatchObject({
      type: 'item.updated',
      item: { type: 'contextCompaction', status: 'inProgress', source: 'automatic' },
    });
    expect(projectNotification({ method: 'item/completed', params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      item: { id: 'compact-1', type: 'contextCompaction' },
    } })).toMatchObject({
      type: 'item.updated',
      item: { type: 'contextCompaction', status: 'completed', source: 'automatic' },
    });
    expect(projectItem({ id: 'compact-manual', type: 'contextCompaction', status: 'inProgress', source: 'manual' })).toMatchObject({
      status: 'inProgress',
      source: 'manual',
    });
  });

  it('projects MCP resource links from the upstream snake-case wire shape', () => {
    expect(projectItem({
      id: 'mcp-resource',
      type: 'mcpToolCall',
      server: 'assets',
      tool: 'lookup',
      arguments: {},
      status: 'completed',
      result: {
        content: [{ type: 'resource_link', uri: 'mcp://assets/logo', name: 'Logo resource' }],
      },
    })).toMatchObject({
      type: 'mcpToolCall',
      content: [{ type: 'resourceLink', uri: 'mcp://assets/logo', name: 'Logo resource' }],
    });
  });

  it('routes all 72 allowlisted notifications to their dedicated semantic event', () => {
    expect(CODEX_NOTIFICATION_METHODS).toHaveLength(72);
    for (const method of CODEX_NOTIFICATION_METHODS) {
      const event = projectNotification({ method, params: NOTIFICATION_PARAMS[method] });
      expect(event.type, method).toBe(EXPECTED_NOTIFICATION_EVENTS[method]);
    }
  });

  it('records unknown notification drift without exposing its raw method or payload', () => {
    const rawMethod = 'future/privateNotification';
    const event = projectNotification({
      method: 'unknown',
      sourceMethod: rawMethod,
      params: { token: 'secret-value', path: '/Users/private/project/file.ts' },
    });

    expect(event).toMatchObject({
      type: 'diagnostic.recorded',
      diagnostic: { domain: 'protocol', level: 'warning' },
    });
    expect(JSON.stringify(event)).not.toContain(rawMethod);
    expect(JSON.stringify(event)).not.toContain('secret-value');
    expect(JSON.stringify(event)).not.toContain('/Users/private');
  });
});
