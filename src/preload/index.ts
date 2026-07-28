import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_IPC,
  type AgentEvent,
  type ConversationStartInput,
  type ConversationStartResult,
  type DesktopApi,
  type FoundationProjection,
  type ProjectCreateInput,
  type TurnInterruptInput,
  type TurnStartInput,
  type TurnStartResult,
} from '../shared/desktop';
import type {
  ApprovalDecideParams,
  ApprovalDecideResult,
  BriefUpdateParams,
  BriefUpdateResult,
  PlanListResult,
  PlanReadResult,
  ProjectCreateResult,
  ProjectReadResult,
  ProjectSummary,
} from '@business/generated';

const api: DesktopApi = {
  foundation: { read: (): Promise<FoundationProjection> => ipcRenderer.invoke(DESKTOP_IPC.foundationRead) },
  project: {
    create: (input: ProjectCreateInput): Promise<ProjectCreateResult> => ipcRenderer.invoke(DESKTOP_IPC.projectCreate, input),
    list: (): Promise<ProjectSummary[]> => ipcRenderer.invoke(DESKTOP_IPC.projectList),
    read: (projectId: string): Promise<ProjectReadResult> => ipcRenderer.invoke(DESKTOP_IPC.projectRead, projectId),
    updateBrief: (params: BriefUpdateParams): Promise<BriefUpdateResult> => ipcRenderer.invoke(DESKTOP_IPC.briefUpdate, params),
  },
  agent: {
    startConversation: (input: ConversationStartInput): Promise<ConversationStartResult> => ipcRenderer.invoke(DESKTOP_IPC.conversationStart, input),
    startTurn: (input: TurnStartInput): Promise<TurnStartResult> => ipcRenderer.invoke(DESKTOP_IPC.turnStart, input),
    interrupt: (input: TurnInterruptInput): Promise<void> => ipcRenderer.invoke(DESKTOP_IPC.turnInterrupt, input),
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
};

contextBridge.exposeInMainWorld('limeShot', api);
