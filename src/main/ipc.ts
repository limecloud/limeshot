import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { BrowserWindow, clipboard, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron';

import { BusinessRpcError } from '@business/index';
import type { ApprovalDecideParams, BriefInput, BriefUpdateParams, DeliverableConfirmParams, ProjectArchiveParams, ProjectRenameParams, TaskCancelParams, TaskRetryParams, TaskStartParams } from '@business/generated';
import { CODEX_NEW_THREAD_HISTORY_MODE, CodexRpcError, type CodexDynamicTool, type CodexRequestResult, type CodexThread } from '@codex/index';
import {
  DESKTOP_IPC,
  type AgentConversationSummary,
  type AgentProjectConversationSummary,
  type AgentInteractionSubmitInput,
  type AgentInteractionExternalOpenInput,
  type AgentThreadInspectInput,
  type ConversationImportInput,
  type ConversationRenameInput,
  type ConversationStartInput,
  type ConversationStartResult,
  type ConversationTargetInput,
  type FoundationProjection,
  type ProjectConversationsArchiveInput,
  type ProjectConversationsArchiveResult,
  type ProjectConversationListResult,
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
  const importedThreadIds = new Set<string>();
  const importedProjectThreads = new Map<string, string>();
  let threadCatalog: { loadedAt: number; threads: CodexThread[] } | undefined;
  let threadCatalogRequest: Promise<CodexThread[]> | undefined;

  const readThreadCatalog = (): Promise<CodexThread[]> => {
    if (threadCatalog && Date.now() - threadCatalog.loadedAt < 2_000) return Promise.resolve(threadCatalog.threads);
    if (threadCatalogRequest) return threadCatalogRequest;
    threadCatalogRequest = listCodexThreads(codex)
      .then((threads) => {
        threadCatalog = { loadedAt: Date.now(), threads };
        return threads;
      })
      .finally(() => { threadCatalogRequest = undefined; });
    return threadCatalogRequest;
  };
  const invalidateThreadCatalog = () => { threadCatalog = undefined; };
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

  ipcMain.handle(DESKTOP_IPC.projectList, async () => (await business.request('project/list', { state: null })).projects.filter((project) => project.state !== 'archived'));
  ipcMain.handle(DESKTOP_IPC.projectRead, (_event, projectId: string) => business.request('project/read', { projectId }));
  ipcMain.handle(DESKTOP_IPC.projectRename, (_event, params: ProjectRenameParams) => business.request('project/rename', params));
  ipcMain.handle(DESKTOP_IPC.projectArchive, (_event, params: ProjectArchiveParams) => business.request('project/archive', params));
  ipcMain.handle(DESKTOP_IPC.projectReveal, async (_event, projectId: string): Promise<void> => {
    const workspacePath = await projectWorkingDirectory(business, projectId);
    await revealDirectory(workspacePath);
  });
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
    const threads = await readThreadCatalog();
    return threads.map((thread) => {
      const owned = !importedThreadIds.has(thread.id)
        && thread.source === 'vscode'
        && sameWorkspace(thread.cwd, codex.defaultCwd());
      standaloneThreadIds.add(thread.id);
      if (!owned) importedThreadIds.add(thread.id);
      return conversationSummary(thread, owned ? 'limeshot' : 'codex');
    });
  });

  ipcMain.handle(DESKTOP_IPC.conversationImportList, async () => (await readThreadCatalog()).map((thread) => conversationSummary(thread, 'codex')));
  ipcMain.handle(DESKTOP_IPC.conversationImport, async (_event, input: ConversationImportInput): Promise<AgentConversationSummary> => {
    if (!input || typeof input.threadId !== 'string' || !input.threadId) throw new Error('无效的 Codex 会话标识');
    const result = await codex.request('thread/read', { threadId: input.threadId });
    if (!isImportableConversation(result.thread)) throw new Error('该 Codex 会话不可导入');
    standaloneThreadIds.add(result.thread.id);
    importedThreadIds.add(result.thread.id);
    invalidateThreadCatalog();
    return conversationSummary(result.thread, 'codex');
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
  ipcMain.handle(DESKTOP_IPC.conversationRename, async (_event, input: ConversationRenameInput): Promise<void> => {
    await assertConversationTarget(business, standaloneThreadIds, importedProjectThreads, input);
    const title = input.title.trim();
    if (!title) throw new Error('会话名称不能为空');
    await codex.request('thread/name/set', { threadId: input.threadId, name: title });
    invalidateThreadCatalog();
  });
  ipcMain.handle(DESKTOP_IPC.conversationArchive, async (_event, input: ConversationTargetInput): Promise<void> => {
    await assertConversationTarget(business, standaloneThreadIds, importedProjectThreads, input);
    await codex.request('thread/archive', { threadId: input.threadId });
    await releaseConversationTarget(business, bindings, standaloneThreadIds, importedThreadIds, importedProjectThreads, input);
    invalidateThreadCatalog();
  });
  ipcMain.handle(DESKTOP_IPC.conversationDelete, async (_event, input: ConversationTargetInput): Promise<void> => {
    await assertConversationTarget(business, standaloneThreadIds, importedProjectThreads, input);
    await codex.request('thread/delete', { threadId: input.threadId });
    await releaseConversationTarget(business, bindings, standaloneThreadIds, importedThreadIds, importedProjectThreads, input);
    invalidateThreadCatalog();
  });
  ipcMain.handle(DESKTOP_IPC.conversationReveal, async (_event, input: ConversationTargetInput): Promise<void> => {
    const workspacePath = await conversationWorkingDirectory(business, codex, standaloneThreadIds, importedProjectThreads, input);
    await revealDirectory(workspacePath);
  });
  ipcMain.handle(DESKTOP_IPC.conversationCopyWorkingDirectory, async (_event, input: ConversationTargetInput): Promise<void> => {
    const workspacePath = await conversationWorkingDirectory(business, codex, standaloneThreadIds, importedProjectThreads, input);
    clipboard.writeText(workspacePath);
  });
  ipcMain.handle(DESKTOP_IPC.conversationCopySessionId, async (_event, input: ConversationTargetInput): Promise<void> => {
    await assertConversationTarget(business, standaloneThreadIds, importedProjectThreads, input);
    clipboard.writeText(input.threadId);
  });
  ipcMain.handle(DESKTOP_IPC.projectConversationList, async (_event, input: ProjectConversationsArchiveInput): Promise<ProjectConversationListResult> => {
    if (!input || typeof input.projectId !== 'string' || !input.projectId) throw new Error('无效的项目标识');
    const [result, context, threads] = await Promise.all([
      business.request('conversation/binding/list', { projectId: input.projectId }),
      business.request('project/context/read', { projectId: input.projectId }),
      readThreadCatalog(),
    ]);
    for (const [threadId, projectId] of importedProjectThreads) {
      if (projectId === input.projectId) importedProjectThreads.delete(threadId);
    }
    const boundThreadIds = new Set(result.bindings.map((binding) => binding.codexThreadId));
    for (const threadId of boundThreadIds) importedThreadIds.delete(threadId);
    const conversations = await Promise.all(result.bindings.map(async (binding): Promise<AgentProjectConversationSummary> => {
      try {
        const stored = await codex.request('thread/read', { threadId: binding.codexThreadId });
        const summary = conversationSummary(stored.thread, 'limeshot');
        return {
          ...summary,
          projectId: binding.projectId,
          conversationId: binding.conversationId,
          updatedAtEpochMs: Math.max(binding.updatedAtEpochMs, summary.updatedAtEpochMs),
        };
      } catch (error) {
        if (!codex.isThreadUnmaterialized(binding.codexThreadId) && !isUnmaterializedThreadError(error)) throw error;
        return {
          projectId: binding.projectId,
          conversationId: binding.conversationId,
          threadId: binding.codexThreadId,
          title: '',
          updatedAtEpochMs: binding.updatedAtEpochMs,
          origin: 'limeshot',
          client: 'appServer',
        };
      }
    }));
    const imported = threads
      .filter((thread) => workspaceContains(context.workspacePath, thread.cwd) && !boundThreadIds.has(thread.id))
      .map((thread): AgentProjectConversationSummary => {
        importedThreadIds.add(thread.id);
        importedProjectThreads.set(thread.id, input.projectId);
        return {
          ...conversationSummary(thread, 'codex'),
          projectId: input.projectId,
          conversationId: thread.id,
        };
      });
    return { conversations: [...conversations, ...imported].sort((left, right) => right.updatedAtEpochMs - left.updatedAtEpochMs) };
  });
  ipcMain.handle(DESKTOP_IPC.projectConversationsArchive, async (_event, input: ProjectConversationsArchiveInput): Promise<ProjectConversationsArchiveResult> => {
    if (!input || typeof input.projectId !== 'string' || !input.projectId) throw new Error('无效的项目标识');
    const result = await business.request('conversation/binding/list', { projectId: input.projectId });
    const archivedThreadIds: string[] = [];
    const failedThreadIds: string[] = [];
    for (const binding of result.bindings) {
      try {
        await codex.request('thread/archive', { threadId: binding.codexThreadId });
        await business.request('conversation/unbind', {
          projectId: binding.projectId,
          conversationId: binding.conversationId,
          expectedCodexThreadId: binding.codexThreadId,
        });
        bindings.forget(binding.codexThreadId);
        archivedThreadIds.push(binding.codexThreadId);
      } catch {
        failedThreadIds.push(binding.codexThreadId);
      }
    }
    for (const [threadId, projectId] of [...importedProjectThreads]) {
      if (projectId !== input.projectId) continue;
      try {
        await codex.request('thread/archive', { threadId });
        importedProjectThreads.delete(threadId);
        importedThreadIds.delete(threadId);
        standaloneThreadIds.delete(threadId);
        archivedThreadIds.push(threadId);
      } catch {
        failedThreadIds.push(threadId);
      }
    }
    invalidateThreadCatalog();
    return { archivedThreadIds, failedThreadIds };
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
        if (importedThreadIds.has(threadId)) {
          if (codexSupervisor.isThreadUnmaterialized(threadId)) {
            return { conversationId: threadId, threadId, turns: [], access: 'readOnly' };
          }
          const stored = await codexSupervisor.request('thread/read', { threadId });
          const turns = await readFullThreadTurns(codexSupervisor, threadId, stored.thread.historyMode);
          return { conversationId: threadId, threadId, turns, access: 'readOnly' };
        }
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
    const importedThreadId = input.threadId ?? input.conversationId;
    if (input.conversationId === importedThreadId && importedProjectThreads.get(importedThreadId) === input.projectId) {
      if (codexSupervisor.isThreadUnmaterialized(importedThreadId)) {
        return { conversationId: input.conversationId, threadId: importedThreadId, turns: [], access: 'readOnly' };
      }
      const stored = await codexSupervisor.request('thread/read', { threadId: importedThreadId });
      const turns = await readFullThreadTurns(codexSupervisor, importedThreadId, stored.thread.historyMode);
      return { conversationId: input.conversationId, threadId: importedThreadId, turns, access: 'readOnly' };
    }
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
    if (importedThreadIds.has(input.threadId)) throw new Error('导入的 Codex 会话为只读');
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
    if (event.type === 'turn.completed') invalidateThreadCatalog();
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

async function assertConversationTarget(
  business: BusinessSupervisor,
  standaloneThreadIds: Set<string>,
  importedProjectThreads: Map<string, string>,
  input: ConversationTargetInput,
): Promise<void> {
  if (!input || typeof input.threadId !== 'string' || !input.threadId || typeof input.conversationId !== 'string' || !input.conversationId) {
    throw new Error('无效的会话参数');
  }
  if (input.projectId === null) {
    if (!standaloneThreadIds.has(input.threadId)) throw new Error('无效的独立会话标识');
    return;
  }
  if (typeof input.projectId !== 'string' || !input.projectId) throw new Error('无效的项目标识');
  if (input.conversationId === input.threadId && importedProjectThreads.get(input.threadId) === input.projectId) return;
  const result = await business.request('conversation/binding/read', {
    projectId: input.projectId,
    conversationId: input.conversationId,
  });
  if (result.binding.codexThreadId !== input.threadId) throw new Error('会话与 Codex Thread 不匹配');
}

async function releaseConversationTarget(
  business: BusinessSupervisor,
  bindings: ConversationBindings,
  standaloneThreadIds: Set<string>,
  importedThreadIds: Set<string>,
  importedProjectThreads: Map<string, string>,
  input: ConversationTargetInput,
): Promise<void> {
  if (input.projectId === null) {
    standaloneThreadIds.delete(input.threadId);
    importedThreadIds.delete(input.threadId);
    return;
  }
  if (input.conversationId === input.threadId && importedProjectThreads.get(input.threadId) === input.projectId) {
    standaloneThreadIds.delete(input.threadId);
    importedThreadIds.delete(input.threadId);
    importedProjectThreads.delete(input.threadId);
    return;
  }
  await business.request('conversation/unbind', {
    projectId: input.projectId,
    conversationId: input.conversationId,
    expectedCodexThreadId: input.threadId,
  });
  bindings.forget(input.threadId);
}

async function projectWorkingDirectory(business: BusinessSupervisor, projectId: string): Promise<string> {
  if (typeof projectId !== 'string' || !projectId) throw new Error('无效的项目标识');
  const result = await business.request('project/context/read', { projectId });
  return result.workspacePath;
}

async function conversationWorkingDirectory(
  business: BusinessSupervisor,
  codex: CodexSupervisor,
  standaloneThreadIds: Set<string>,
  importedProjectThreads: Map<string, string>,
  input: ConversationTargetInput,
): Promise<string> {
  await assertConversationTarget(business, standaloneThreadIds, importedProjectThreads, input);
  if (input.projectId !== null && importedProjectThreads.get(input.threadId) === input.projectId) {
    const result = await codex.request('thread/read', { threadId: input.threadId });
    return result.thread.cwd;
  }
  if (input.projectId !== null) return projectWorkingDirectory(business, input.projectId);
  const result = await codex.request('thread/read', { threadId: input.threadId });
  return result.thread.cwd;
}

async function revealDirectory(workspacePath: string): Promise<void> {
  const error = await shell.openPath(workspacePath);
  if (error) throw new Error(`无法打开工作目录: ${error}`);
}

async function listCodexThreads(codex: CodexSupervisor): Promise<CodexThread[]> {
  const threads: CodexThread[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  for (;;) {
    const page: CodexRequestResult<'thread/list'> = await codex.request('thread/list', {
      cursor,
      limit: 100,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      sourceKinds: ['cli', 'vscode', 'exec', 'appServer'],
      archived: false,
    });
    threads.push(...page.data.filter(isImportableConversation));
    if (!page.nextCursor) return threads;
    if (seenCursors.has(page.nextCursor)) throw new Error('Codex 对话分页 cursor 重复');
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

function workspaceContains(workspace: string, cwd: string): boolean {
  const workspacePath = normalizedWorkspace(workspace);
  const cwdPath = normalizedWorkspace(cwd);
  const nestedPath = relative(workspacePath, cwdPath);
  return nestedPath === '' || (nestedPath !== '..' && !nestedPath.startsWith(`..${sep}`) && !isAbsolute(nestedPath));
}

function sameWorkspace(left: string, right: string): boolean {
  return normalizedWorkspace(left) === normalizedWorkspace(right);
}

function normalizedWorkspace(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

function isImportableConversation(thread: CodexThread): boolean {
  return !thread.ephemeral
    && thread.parentThreadId === null
    && (thread.source === 'cli' || thread.source === 'vscode' || thread.source === 'exec' || thread.source === 'appServer');
}

function conversationSummary(thread: CodexThread, origin: AgentConversationSummary['origin']): AgentConversationSummary {
  const workspaceLabel = basename(thread.cwd);
  return {
    threadId: thread.id,
    title: thread.name?.trim() || thread.preview?.trim() || '',
    updatedAtEpochMs: 1000 * (thread.recencyAt ?? thread.updatedAt ?? thread.createdAt ?? 0),
    origin,
    client: thread.source === 'cli' || thread.source === 'vscode' || thread.source === 'appServer' ? thread.source : 'unknown',
    ...(workspaceLabel ? { workspaceLabel } : {}),
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
