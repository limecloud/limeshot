import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_IPC,
  type AgentEvent,
  type AgentInteractionExternalOpenInput,
  type AgentInteractionExternalOpenResult,
  type AgentInteractionSubmitInput,
  type AgentInteractionSubmitResult,
  type AgentPendingInteractionProjection,
  type AgentThreadInspectInput,
  type AgentThreadInspectResult,
  type ConversationImportInput,
  type ConversationRenameInput,
  type ConversationStartInput,
  type ConversationStartResult,
  type ConversationTargetInput,
  type DesktopApi,
  type FoundationProjection,
  type ProjectConversationsArchiveInput,
  type ProjectConversationsArchiveResult,
  type ProjectConversationListResult,
  type ProjectOpenInput,
  type TurnInterruptInput,
  type TurnStartInput,
  type TurnStartResult,
} from '../shared/desktop';
import type {
  ApprovalDecideParams,
  ApprovalDecideResult,
  BriefUpdateParams,
  BriefUpdateResult,
  DeliverableConfirmParams,
  DeliverableConfirmResult,
  PlanListResult,
  PlanReadResult,
  ProjectCreateResult,
  ProjectArchiveParams,
  ProjectArchiveResult,
  ProjectExecutionReadResult,
  ProjectReadResult,
  ProjectRenameParams,
  ProjectRenameResult,
  ProjectSummary,
  SourceAssetImportResult,
  TaskCancelParams,
  TaskCancelResult,
  TaskRetryParams,
  TaskStartParams,
  TaskStartResult,
} from '@business/generated';

const api: DesktopApi = {
  foundation: { read: (): Promise<FoundationProjection> => ipcRenderer.invoke(DESKTOP_IPC.foundationRead) },
  project: {
    open: (input: ProjectOpenInput): Promise<ProjectCreateResult | null> => ipcRenderer.invoke(DESKTOP_IPC.projectOpen, input),
    list: (): Promise<ProjectSummary[]> => ipcRenderer.invoke(DESKTOP_IPC.projectList),
    read: (projectId: string): Promise<ProjectReadResult> => ipcRenderer.invoke(DESKTOP_IPC.projectRead, projectId),
    rename: (params: ProjectRenameParams): Promise<ProjectRenameResult> => ipcRenderer.invoke(DESKTOP_IPC.projectRename, params),
    archive: (params: ProjectArchiveParams): Promise<ProjectArchiveResult> => ipcRenderer.invoke(DESKTOP_IPC.projectArchive, params),
    reveal: (projectId: string): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.projectReveal, projectId),
    updateBrief: (params: BriefUpdateParams): Promise<BriefUpdateResult> => ipcRenderer.invoke(DESKTOP_IPC.briefUpdate, params),
  },
  agent: {
    listConversations: () => ipcRenderer.invoke(DESKTOP_IPC.conversationList),
    listImportCandidates: () => ipcRenderer.invoke(DESKTOP_IPC.conversationImportList),
    importConversation: (input: ConversationImportInput) => ipcRenderer.invoke(DESKTOP_IPC.conversationImport, input),
    startConversation: (input: ConversationStartInput): Promise<ConversationStartResult> => ipcRenderer.invoke(DESKTOP_IPC.conversationStart, input),
    renameConversation: (input: ConversationRenameInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.conversationRename, input),
    archiveConversation: (input: ConversationTargetInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.conversationArchive, input),
    deleteConversation: (input: ConversationTargetInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.conversationDelete, input),
    revealConversation: (input: ConversationTargetInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.conversationReveal, input),
    copyConversationWorkingDirectory: (input: ConversationTargetInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.conversationCopyWorkingDirectory, input),
    copyConversationSessionId: (input: ConversationTargetInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.conversationCopySessionId, input),
    listProjectConversations: (input: ProjectConversationsArchiveInput): Promise<ProjectConversationListResult> => ipcRenderer.invoke(DESKTOP_IPC.projectConversationList, input),
    archiveProjectConversations: (input: ProjectConversationsArchiveInput): Promise<ProjectConversationsArchiveResult> => ipcRenderer.invoke(DESKTOP_IPC.projectConversationsArchive, input),
    inspectSubThread: (input: AgentThreadInspectInput): Promise<AgentThreadInspectResult> => ipcRenderer.invoke(DESKTOP_IPC.threadInspect, input),
    startTurn: (input: TurnStartInput): Promise<TurnStartResult> => ipcRenderer.invoke(DESKTOP_IPC.turnStart, input),
    interrupt: (input: TurnInterruptInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.turnInterrupt, input),
    listInteractions: (): Promise<AgentPendingInteractionProjection[]> => ipcRenderer.invoke(DESKTOP_IPC.interactionList),
    submitInteraction: (input: AgentInteractionSubmitInput): Promise<AgentInteractionSubmitResult> => ipcRenderer.invoke(DESKTOP_IPC.interactionSubmit, input),
    openInteractionExternal: (input: AgentInteractionExternalOpenInput): Promise<AgentInteractionExternalOpenResult> => ipcRenderer.invoke(DESKTOP_IPC.interactionOpenExternal, input),
    subscribe: (listener: (event: AgentEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, value: AgentEvent) => listener(value);
      ipcRenderer.on(DESKTOP_IPC.agentEvent, handler);
      return () => ipcRenderer.removeListener(DESKTOP_IPC.agentEvent, handler);
    },
  },
  plan: {
    list: (projectId: string): Promise<PlanListResult> => ipcRenderer.invoke(DESKTOP_IPC.planList, projectId),
    read: (projectId: string, planId: string): Promise<PlanReadResult> => ipcRenderer.invoke(DESKTOP_IPC.planRead, projectId, planId),
  },
  approval: {
    decide: (params: ApprovalDecideParams): Promise<ApprovalDecideResult> => ipcRenderer.invoke(DESKTOP_IPC.approvalDecide, params),
  },
  sourceAsset: {
    import: (projectId: string): Promise<SourceAssetImportResult | null> => ipcRenderer.invoke(DESKTOP_IPC.sourceAssetImport, projectId),
  },
  execution: {
    read: (projectId: string): Promise<ProjectExecutionReadResult> => ipcRenderer.invoke(DESKTOP_IPC.executionRead, projectId),
  },
  task: {
    start: (params: TaskStartParams): Promise<TaskStartResult> => ipcRenderer.invoke(DESKTOP_IPC.taskStart, params),
    cancel: (params: TaskCancelParams): Promise<TaskCancelResult> => ipcRenderer.invoke(DESKTOP_IPC.taskCancel, params),
    retry: (params: TaskRetryParams): Promise<TaskStartResult> => ipcRenderer.invoke(DESKTOP_IPC.taskRetry, params),
  },
  deliverable: {
    confirm: (params: DeliverableConfirmParams): Promise<DeliverableConfirmResult> => ipcRenderer.invoke(DESKTOP_IPC.deliverableConfirm, params),
  },
};

contextBridge.exposeInMainWorld('limeShot', api);
