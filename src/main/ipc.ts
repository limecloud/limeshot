import { basename } from 'node:path';
import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';

import { BusinessRpcError } from '@business/index';
import type { ApprovalDecideParams, BriefInput, BriefUpdateParams, DeliverableConfirmParams, TaskCancelParams, TaskRetryParams, TaskStartParams } from '@business/generated';
import { CODEX_NEW_THREAD_HISTORY_MODE, CodexRpcError, type CodexDynamicTool } from '@codex/index';
import {
  DESKTOP_IPC,
  type AgentConversationSummary,
  type AgentInteractionSubmitInput,
  type AgentInteractionExternalOpenInput,
  type AgentThreadInspectInput,
  type ConversationStartInput,
  type ConversationStartResult,
  type FoundationProjection,
  type ProjectOpenInput,
  type TurnInterruptInput,
  type TurnStartInput,
  type TurnStartResult,
} from '../shared/desktop';
import { BusinessSupervisor } from './business/supervisor';
import { CodexSupervisor } from './codex/supervisor';
import { projectNotification, projectThread } from './codex/projection';
import { inspectSubThread, readFullThreadTurns } from './codex/threadNavigation';
import { ConversationBindings } from './conversationBindings';

export function registerIpc(business: BusinessSupervisor, codex: CodexSupervisor, bindings: ConversationBindings): () => void {
  const conversationStarts = new Map<string, Promise<ConversationStartResult>>();
  const standaloneThreadIds = new Set<string>();
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
  ipcMain.handle(DESKTOP_IPC.executionRead, (_event, projectId: string) => {
    if (typeof projectId !== 'string' || !projectId) throw new Error('无效的项目标识');
    return business.request('project/execution/read', { projectId });
  });
  ipcMain.handle(DESKTOP_IPC.taskStart, (_event, params: TaskStartParams) => business.request('task/start', params));
  ipcMain.handle(DESKTOP_IPC.taskCancel, (_event, params: TaskCancelParams) => business.request('task/cancel', params));
  ipcMain.handle(DESKTOP_IPC.taskRetry, (_event, params: TaskRetryParams) => business.request('task/retry', params));
  ipcMain.handle(DESKTOP_IPC.deliverableConfirm, (_event, params: DeliverableConfirmParams) => business.request('deliverable/confirm', params));
  ipcMain.handle(DESKTOP_IPC.sourceAssetImport, async (event, projectId: string) => {
    if (typeof projectId !== 'string' || !projectId) throw new Error('无效的项目标识');
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'webm', 'wav', 'mp3', 'm4a', 'aac', 'flac', 'png', 'jpg', 'jpeg', 'webp'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length !== 1) return null;
    return business.request('source-asset/import', { projectId, sourcePath: result.filePaths[0] });
  });
  ipcMain.handle(DESKTOP_IPC.projectOpen, async (event, input: ProjectOpenInput) => {
    if (!input || typeof input.profileId !== 'string' || typeof input.language !== 'string') throw new Error('无效的项目打开参数');
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length !== 1) return null;
    const workspacePath = result.filePaths[0];
    return business.request('project/create', {
      name: basename(workspacePath),
      profileId: input.profileId,
      workspacePath,
      brief: createBrief(input.language),
    });
  });

  ipcMain.handle(DESKTOP_IPC.conversationList, async (): Promise<AgentConversationSummary[]> => {
    const result = await codex.request('thread/list', {
      limit: 50,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      sourceKinds: ['vscode'],
      archived: false,
      cwd: codex.defaultCwd(),
    });
    for (const thread of result.data) standaloneThreadIds.add(thread.id);
    return result.data.map((thread) => ({
      threadId: thread.id,
      title: thread.name?.trim() || thread.preview?.trim() || '',
      updatedAtEpochMs: 1000 * (('recencyAt' in thread && typeof thread.recencyAt === 'number' ? thread.recencyAt : undefined) ?? thread.updatedAt ?? thread.createdAt ?? 0),
    }));
  });

  ipcMain.handle(DESKTOP_IPC.conversationStart, (_event, input: ConversationStartInput): Promise<ConversationStartResult> => {
    if (!input || (input.projectId !== null && typeof input.projectId !== 'string') || typeof input.conversationId !== 'string') {
      throw new Error('无效的会话参数');
    }
    const key = `${input.projectId ?? 'standalone'}\0${input.threadId ?? input.conversationId}`;
    const pending = conversationStarts.get(key);
    if (pending) return pending;
    const started = startConversation(business, codex, bindings, input);
    conversationStarts.set(key, started);
    void started.finally(() => {
      if (conversationStarts.get(key) === started) conversationStarts.delete(key);
    }).catch(() => undefined);
    return started;
  });
  ipcMain.handle(DESKTOP_IPC.threadInspect, (_event, input: AgentThreadInspectInput) => inspectSubThread(codex, input));

  async function startConversation(
    businessSupervisor: BusinessSupervisor,
    codexSupervisor: CodexSupervisor,
    conversationBindings: ConversationBindings,
    input: ConversationStartInput,
  ): Promise<ConversationStartResult> {
    if (input.projectId === null) {
      if (input.threadId && !standaloneThreadIds.has(input.threadId)) throw new Error('无效的独立会话标识');
      if (input.threadId) {
        const threadId = input.threadId;
        if (codexSupervisor.isThreadUnmaterialized(threadId)) {
          return { conversationId: threadId, threadId, turns: [], access: 'active' };
        }
        try {
          const resumed = await codexSupervisor.request('thread/resume', { threadId, excludeTurns: true });
          const turns = await readFullThreadTurns(codexSupervisor, threadId, resumed.thread.historyMode);
          return { conversationId: threadId, threadId, turns, access: 'active' };
        } catch {
          const stored = await codexSupervisor.request('thread/read', { threadId });
          const turns = await readFullThreadTurns(codexSupervisor, threadId, stored.thread.historyMode);
          return { conversationId: threadId, threadId, turns, access: 'readOnly' };
        }
      }
      const started = await codexSupervisor.request('thread/start', {
        cwd: codexSupervisor.defaultCwd(),
        approvalPolicy: 'on-request',
        sandbox: 'read-only',
        historyMode: CODEX_NEW_THREAD_HISTORY_MODE,
      });
      const threadId = started.thread.id;
      standaloneThreadIds.add(threadId);
      return { conversationId: threadId, threadId, turns: projectThread(started.thread), access: 'active' };
    }
    const projectInput = { projectId: input.projectId, conversationId: input.conversationId };
    try {
      const binding = await businessSupervisor.request('conversation/binding/read', projectInput);
      const threadId = binding.binding.codexThreadId;
      conversationBindings.remember(threadId, projectInput);
      if (codexSupervisor.isThreadUnmaterialized(threadId)) {
        return { conversationId: projectInput.conversationId, threadId, turns: [], access: 'active' };
      }
      try {
        const resumed = await codexSupervisor.request('thread/resume', { threadId, excludeTurns: true });
        const turns = await readFullThreadTurns(codexSupervisor, threadId, resumed.thread.historyMode);
        return { conversationId: projectInput.conversationId, threadId, turns, access: 'active' };
      } catch (resumeError) {
        if (isUnmaterializedThreadError(resumeError)) {
          return createConversationThread(businessSupervisor, codexSupervisor, conversationBindings, projectInput, threadId);
        }
        try {
          const stored = await codexSupervisor.request('thread/read', { threadId });
          const turns = await readFullThreadTurns(codexSupervisor, threadId, stored.thread.historyMode);
          return { conversationId: projectInput.conversationId, threadId, turns, access: 'readOnly' };
        } catch (readError) {
          if (isUnmaterializedThreadError(readError)) {
            return createConversationThread(businessSupervisor, codexSupervisor, conversationBindings, projectInput, threadId);
          }
          throw readError;
        }
      }
    } catch (error) {
      if (!(error instanceof BusinessRpcError) || error.domainCode !== 'CONVERSATION_BINDING_NOT_FOUND') throw error;
    }
    return createConversationThread(businessSupervisor, codexSupervisor, conversationBindings, projectInput, null);
  }

  ipcMain.handle(DESKTOP_IPC.turnStart, async (_event, input: TurnStartInput): Promise<TurnStartResult> => {
    const text = input.text.trim();
    if (!text) throw new Error('消息不能为空');
    if (typeof input.threadId !== 'string' || !input.threadId) throw new Error('无效的 Codex Thread 标识');
    if (input.projectId === null) {
      if (!standaloneThreadIds.has(input.threadId)) throw new Error('无效的独立会话标识');
    } else {
      const binding = await business.request('conversation/binding/read', { projectId: input.projectId, conversationId: input.conversationId });
      if (binding.binding.codexThreadId !== input.threadId) throw new Error('会话与 Codex Thread 不匹配');
      bindings.remember(input.threadId, { projectId: input.projectId, conversationId: input.conversationId });
    }
    if (!codex.isThreadActive(input.threadId)) await codex.request('thread/resume', { threadId: input.threadId });
    const result = await codex.request('turn/start', { threadId: input.threadId, input: [{ type: 'text', text, text_elements: [] }] });
    return { threadId: input.threadId, turnId: result.turn.id };
  });

  ipcMain.handle(DESKTOP_IPC.turnInterrupt, async (_event, input: TurnInterruptInput) => {
    await codex.request('turn/interrupt', input);
  });
  ipcMain.handle(DESKTOP_IPC.interactionList, () => codex.listInteractions());
  ipcMain.handle(DESKTOP_IPC.interactionSubmit, (_event, input: AgentInteractionSubmitInput) => codex.submitInteraction(input));
  ipcMain.handle(DESKTOP_IPC.interactionOpenExternal, (_event, input: AgentInteractionExternalOpenInput) => codex.openInteractionExternal(input));

  const unsubscribe = codex.subscribe((notification) => {
    const event = projectNotification(notification);
    if (!event) return;
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(DESKTOP_IPC.agentEvent, event);
  });
  const unsubscribeInteractions = codex.subscribeInteractions((event) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(DESKTOP_IPC.agentEvent, event);
  });
  return () => {
    unsubscribe();
    unsubscribeInteractions();
    for (const channel of Object.values(DESKTOP_IPC).filter((channel) => channel !== DESKTOP_IPC.agentEvent)) ipcMain.removeHandler(channel);
  };
}

function createBrief(language: string, initialSubject?: string): BriefInput {
  return {
    subject: initialSubject?.trim() ?? '',
    audience: '',
    platform: '',
    targetDurationSeconds: null,
    aspectRatio: '',
    language,
    style: '',
    mustInclude: [],
    prohibited: [],
    deliveryFormat: 'mp4',
  };
}

async function createConversationThread(
  business: BusinessSupervisor,
  codex: CodexSupervisor,
  bindings: ConversationBindings,
  input: { projectId: string; conversationId: string },
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
    historyMode: CODEX_NEW_THREAD_HISTORY_MODE,
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
