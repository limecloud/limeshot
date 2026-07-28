import { rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';

import { BusinessRpcError } from '@business/index';
import type { ApprovalDecideParams, BriefUpdateParams, ProjectCreateParams } from '@business/generated';
import { CodexRpcError, type CodexDynamicTool } from '@codex/index';
import {
  DESKTOP_IPC,
  type ConversationStartInput,
  type ConversationStartResult,
  type FoundationProjection,
  type ProjectCreateInput,
  type TurnInterruptInput,
  type TurnStartInput,
  type TurnStartResult,
} from '../shared/desktop';
import { BusinessSupervisor } from './business/supervisor';
import { CodexSupervisor } from './codex/supervisor';
import { projectNotification, projectThread } from './codex/projection';
import { ConversationBindings } from './conversationBindings';
import { reserveManagedWorkspace } from './managedWorkspace';

export function registerIpc(business: BusinessSupervisor, codex: CodexSupervisor, bindings: ConversationBindings): () => void {
  const conversationStarts = new Map<string, Promise<ConversationStartResult>>();
  ipcMain.handle(DESKTOP_IPC.foundationRead, async (): Promise<FoundationProjection> => {
    const [status, profiles, skills, tools, contracts, capabilities, services, resources] = await Promise.all([
      business.request('business/status/read', {}),
      business.request('business-profile/list', {}),
      business.request('skill/list', {}),
      business.request('tool/catalog/list', {}),
      business.request('artifact/contract/list', {}),
      business.request('provider/capability/list', {}),
      business.request('service/list', {}),
      business.request('resource/list', {}),
    ]);
    return { business: status, profiles: profiles.profiles, skills: skills.skills, tools: tools.tools, contracts: contracts.contracts, capabilities: capabilities.capabilities, services: services.services, resources: resources.resources };
  });

  ipcMain.handle(DESKTOP_IPC.projectList, async () => (await business.request('project/list', { state: null })).projects);
  ipcMain.handle(DESKTOP_IPC.projectRead, (_event, projectId: string) => business.request('project/read', { projectId }));
  ipcMain.handle(DESKTOP_IPC.briefUpdate, (_event, params: BriefUpdateParams) => business.request('brief/update', params));
  ipcMain.handle(DESKTOP_IPC.planList, (_event, projectId: string) => business.request('plan/list', { projectId }));
  ipcMain.handle(DESKTOP_IPC.planRead, (_event, projectId: string, planId: string) => business.request('plan/read', { projectId, planId }));
  ipcMain.handle(DESKTOP_IPC.approvalDecide, (_event, params: ApprovalDecideParams) => business.request('approval/decide', params));
  ipcMain.handle(DESKTOP_IPC.projectCreate, async (_event, input: ProjectCreateInput) => {
    if (!input || typeof input.profileId !== 'string' || typeof input.language !== 'string') throw new Error('无效的项目创建参数');
    const workspace = await reserveManagedWorkspace(
      join(app.getPath('userData'), 'projects'),
      input.language,
      input.initialSubject,
    );
    const params: ProjectCreateParams = {
      name: workspace.name,
      profileId: input.profileId,
      workspacePath: workspace.path,
      brief: {
        subject: input.initialSubject?.trim() ?? '',
        audience: '',
        platform: '',
        targetDurationSeconds: null,
        aspectRatio: '',
        language: input.language,
        style: '',
        mustInclude: [],
        prohibited: [],
        deliveryFormat: 'mp4',
      },
    };
    try {
      return business.request('project/create', params);
    } catch (error) {
      await rmdir(workspace.path).catch(() => undefined);
      throw error;
    }
  });

  ipcMain.handle(DESKTOP_IPC.conversationStart, (_event, input: ConversationStartInput): Promise<ConversationStartResult> => {
    const key = `${input.projectId}\0${input.conversationId}`;
    const pending = conversationStarts.get(key);
    if (pending) return pending;
    const started = startConversation(business, codex, bindings, input);
    conversationStarts.set(key, started);
    void started.finally(() => {
      if (conversationStarts.get(key) === started) conversationStarts.delete(key);
    }).catch(() => undefined);
    return started;
  });

  async function startConversation(
    businessSupervisor: BusinessSupervisor,
    codexSupervisor: CodexSupervisor,
    conversationBindings: ConversationBindings,
    input: ConversationStartInput,
  ): Promise<ConversationStartResult> {
    try {
      const binding = await businessSupervisor.request('conversation/binding/read', input);
      const threadId = binding.binding.codexThreadId;
      conversationBindings.remember(threadId, { projectId: input.projectId, conversationId: input.conversationId });
      if (codexSupervisor.isThreadUnmaterialized(threadId)) {
        return { conversationId: input.conversationId, threadId, turns: [], access: 'active' };
      }
      try {
        const resumed = await codexSupervisor.request('thread/resume', { threadId });
        return { conversationId: input.conversationId, threadId, turns: projectThread(resumed.thread), access: 'active' };
      } catch (resumeError) {
        if (isUnmaterializedThreadError(resumeError)) {
          return createConversationThread(businessSupervisor, codexSupervisor, conversationBindings, input, threadId);
        }
        try {
          const read = await codexSupervisor.request('thread/read', { threadId, includeTurns: true });
          return { conversationId: input.conversationId, threadId, turns: projectThread(read.thread), access: 'readOnly' };
        } catch (readError) {
          if (isUnmaterializedThreadError(readError)) {
            return createConversationThread(businessSupervisor, codexSupervisor, conversationBindings, input, threadId);
          }
          throw readError;
        }
      }
    } catch (error) {
      if (!(error instanceof BusinessRpcError) || error.domainCode !== 'CONVERSATION_BINDING_NOT_FOUND') throw error;
    }
    return createConversationThread(businessSupervisor, codexSupervisor, conversationBindings, input, null);
  }

  ipcMain.handle(DESKTOP_IPC.turnStart, async (_event, input: TurnStartInput): Promise<TurnStartResult> => {
    const text = input.text.trim();
    if (!text) throw new Error('消息不能为空');
    const binding = await business.request('conversation/binding/read', { projectId: input.projectId, conversationId: input.conversationId });
    const threadId = binding.binding.codexThreadId;
    bindings.remember(threadId, { projectId: input.projectId, conversationId: input.conversationId });
    if (!codex.isThreadActive(threadId)) await codex.request('thread/resume', { threadId });
    const result = await codex.request('turn/start', { threadId, input: [{ type: 'text', text, text_elements: [] }] });
    return { threadId, turnId: result.turn.id };
  });

  ipcMain.handle(DESKTOP_IPC.turnInterrupt, async (_event, input: TurnInterruptInput) => {
    await codex.request('turn/interrupt', input);
  });

  const unsubscribe = codex.subscribe((notification) => {
    const event = projectNotification(notification);
    if (!event) return;
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(DESKTOP_IPC.agentEvent, event);
  });
  return () => {
    unsubscribe();
    for (const channel of Object.values(DESKTOP_IPC).filter((channel) => channel !== DESKTOP_IPC.agentEvent)) ipcMain.removeHandler(channel);
  };
}

async function createConversationThread(
  business: BusinessSupervisor,
  codex: CodexSupervisor,
  bindings: ConversationBindings,
  input: ConversationStartInput,
  expectedCodexThreadId: string | null,
): Promise<ConversationStartResult> {
  const [context, catalog] = await Promise.all([
    business.request('project/context/read', { projectId: input.projectId }),
    business.request('tool/catalog/list', {}),
  ]);
  const dynamicTools: CodexDynamicTool[] = catalog.tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
  const started = await codex.request('thread/start', {
    cwd: context.workspacePath,
    approvalPolicy: 'on-request',
    sandbox: 'read-only',
    dynamicTools,
  });
  const threadId = started.thread.id;
  await business.request('conversation/bind', {
    projectId: input.projectId,
    conversationId: input.conversationId,
    codexThreadId: threadId,
    expectedCodexThreadId,
  });
  if (expectedCodexThreadId) bindings.forget(expectedCodexThreadId);
  bindings.remember(threadId, { projectId: input.projectId, conversationId: input.conversationId });
  return { conversationId: input.conversationId, threadId, turns: projectThread(started.thread), access: 'active' };
}

function isUnmaterializedThreadError(error: unknown): boolean {
  return error instanceof CodexRpcError
    && error.code === -32600
    && (
      error.message.includes('no rollout found for thread id')
      || error.message.includes('not materialized yet; includeTurns is unavailable before first user message')
    );
}
