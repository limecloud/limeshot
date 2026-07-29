import type {
  ArtifactContractDescriptor,
  ApprovalDecideParams,
  ApprovalDecideResult,
  BriefUpdateParams,
  BriefUpdateResult,
  BusinessProfile,
  BusinessStatusResult,
  CapabilityDescriptor,
  DeliverableConfirmParams,
  DeliverableConfirmResult,
  ManagedResourceDescriptor,
  PlanListResult,
  PlanReadResult,
  ProjectCreateResult,
  ProjectExecutionReadResult,
  ProjectReadResult,
  ProjectSummary,
  ServiceDescriptor,
  SkillDescriptor,
  SourceAssetImportResult,
  TaskCancelParams,
  TaskCancelResult,
  TaskRetryParams,
  TaskStartParams,
  TaskStartResult,
  ToolDescriptor,
} from '@business/generated';
import type { AgentEvent, AgentInteractionExternalOpenInput, AgentInteractionExternalOpenResult, AgentInteractionSubmitInput, AgentInteractionSubmitResult, AgentPendingInteractionProjection, AgentTurnProjection } from './agent';

export type * from './agent';

export const DESKTOP_IPC = {
  foundationRead: 'foundation:read',
  projectOpen: 'project:open',
  projectList: 'project:list',
  projectRead: 'project:read',
  briefUpdate: 'brief:update',
  conversationList: 'conversation:list',
  conversationStart: 'conversation:start',
  threadInspect: 'agent:thread-inspect',
  turnStart: 'turn:start',
  turnInterrupt: 'turn:interrupt',
  agentEvent: 'agent:event',
  interactionList: 'agent:interaction-list',
  interactionSubmit: 'agent:interaction-submit',
  interactionOpenExternal: 'agent:interaction-open-external',
  planList: 'plan:list',
  planRead: 'plan:read',
  approvalDecide: 'approval:decide',
  sourceAssetImport: 'source-asset:import',
  executionRead: 'execution:read',
  taskStart: 'task:start',
  taskCancel: 'task:cancel',
  taskRetry: 'task:retry',
  deliverableConfirm: 'deliverable:confirm',
} as const;

export interface FoundationProjection {
  business: BusinessStatusResult;
  profiles: BusinessProfile[];
  skills: SkillDescriptor[];
  tools: ToolDescriptor[];
  contracts: ArtifactContractDescriptor[];
  capabilities: CapabilityDescriptor[];
  services: ServiceDescriptor[];
  resources: ManagedResourceDescriptor[];
}

export interface ProjectOpenInput {
  profileId: string;
  language: string;
}
export interface AgentConversationSummary {
  threadId: string;
  title: string;
  updatedAtEpochMs: number;
}
export interface ConversationStartInput {
  projectId: string | null;
  conversationId: string;
  threadId?: string;
}
export interface ConversationStartResult {
  conversationId: string;
  threadId: string;
  turns: AgentTurnProjection[];
  access: 'active' | 'readOnly';
}
export interface AgentThreadInspectInput { parentThreadId: string; threadId: string; }
export interface AgentThreadInspectResult {
  threadId: string;
  parentThreadId: string;
  name?: string;
  agentNickname?: string;
  agentRole?: string;
  turns: AgentTurnProjection[];
}
export interface TurnStartInput { projectId: string | null; conversationId: string; threadId: string; text: string; }
export interface TurnStartResult { threadId: string; turnId: string; }
export interface TurnInterruptInput { threadId: string; turnId: string; }

export interface DesktopApi {
  foundation: { read(): Promise<FoundationProjection> };
  project: {
    open(input: ProjectOpenInput): Promise<ProjectCreateResult | null>;
    list(): Promise<ProjectSummary[]>;
    read(projectId: string): Promise<ProjectReadResult>;
    updateBrief(params: BriefUpdateParams): Promise<BriefUpdateResult>;
  };
  agent: {
    listConversations(): Promise<AgentConversationSummary[]>;
    startConversation(input: ConversationStartInput): Promise<ConversationStartResult>;
    inspectSubThread(input: AgentThreadInspectInput): Promise<AgentThreadInspectResult>;
    startTurn(input: TurnStartInput): Promise<TurnStartResult>;
    interrupt(input: TurnInterruptInput): Promise<void>;
    listInteractions(): Promise<AgentPendingInteractionProjection[]>;
    submitInteraction(input: AgentInteractionSubmitInput): Promise<AgentInteractionSubmitResult>;
    openInteractionExternal(input: AgentInteractionExternalOpenInput): Promise<AgentInteractionExternalOpenResult>;
    subscribe(listener: (event: AgentEvent) => void): () => void;
  };
  plan: {
    list(projectId: string): Promise<PlanListResult>;
    read(projectId: string, planId: string): Promise<PlanReadResult>;
  };
  approval: { decide(params: ApprovalDecideParams): Promise<ApprovalDecideResult> };
  sourceAsset: { import(projectId: string): Promise<SourceAssetImportResult | null> };
  execution: { read(projectId: string): Promise<ProjectExecutionReadResult> };
  task: {
    start(params: TaskStartParams): Promise<TaskStartResult>;
    cancel(params: TaskCancelParams): Promise<TaskCancelResult>;
    retry(params: TaskRetryParams): Promise<TaskStartResult>;
  };
  deliverable: {
    confirm(params: DeliverableConfirmParams): Promise<DeliverableConfirmResult>;
  };
}
