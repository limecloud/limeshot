import type {
  ArtifactContractDescriptor,
  ApprovalDecideParams,
  ApprovalDecideResult,
  BriefUpdateParams,
  BriefUpdateResult,
  BusinessProfile,
  BusinessStatusResult,
  CapabilityDescriptor,
  ManagedResourceDescriptor,
  PlanListResult,
  PlanReadResult,
  ProjectCreateResult,
  ProjectReadResult,
  ProjectSummary,
  ServiceDescriptor,
  SkillDescriptor,
  ToolDescriptor,
} from '@business/generated';

export const DESKTOP_IPC = {
  foundationRead: 'foundation:read',
  projectCreate: 'project:create',
  projectList: 'project:list',
  projectRead: 'project:read',
  briefUpdate: 'brief:update',
  conversationStart: 'conversation:start',
  turnStart: 'turn:start',
  turnInterrupt: 'turn:interrupt',
  agentEvent: 'agent:event',
  planList: 'plan:list',
  planRead: 'plan:read',
  approvalDecide: 'approval:decide',
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

export interface ProjectCreateInput {
  profileId: string;
  language: string;
  initialSubject?: string;
}
export type AgentTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';
export type AgentItemKind = 'user' | 'assistant' | 'plan' | 'tool' | 'activity';
export interface AgentItemProjection {
  id: string;
  kind: AgentItemKind;
  text: string;
  title?: string;
  status?: string;
}
export interface AgentTurnProjection {
  id: string;
  status: AgentTurnStatus;
  items: AgentItemProjection[];
  errorMessage?: string;
}
export interface ConversationStartInput { projectId: string; conversationId: string; }
export interface ConversationStartResult {
  conversationId: string;
  threadId: string;
  turns: AgentTurnProjection[];
  access: 'active' | 'readOnly';
}
export interface TurnStartInput { projectId: string; conversationId: string; text: string; }
export interface TurnStartResult { threadId: string; turnId: string; }
export interface TurnInterruptInput { threadId: string; turnId: string; }
export type AgentEvent =
  | { type: 'turn.started'; threadId: string; turn: AgentTurnProjection }
  | { type: 'message.delta'; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: 'item.updated'; threadId: string; turnId: string; item: AgentItemProjection }
  | { type: 'turn.completed'; threadId: string; turn: AgentTurnProjection }
  | { type: 'agent.error'; threadId?: string; message: string };

export interface DesktopApi {
  foundation: { read(): Promise<FoundationProjection> };
  project: {
    create(input: ProjectCreateInput): Promise<ProjectCreateResult>;
    list(): Promise<ProjectSummary[]>;
    read(projectId: string): Promise<ProjectReadResult>;
    updateBrief(params: BriefUpdateParams): Promise<BriefUpdateResult>;
  };
  agent: {
    startConversation(input: ConversationStartInput): Promise<ConversationStartResult>;
    startTurn(input: TurnStartInput): Promise<TurnStartResult>;
    interrupt(input: TurnInterruptInput): Promise<void>;
    subscribe(listener: (event: AgentEvent) => void): () => void;
  };
  plan: {
    list(projectId: string): Promise<PlanListResult>;
    read(projectId: string, planId: string): Promise<PlanReadResult>;
  };
  approval: { decide(params: ApprovalDecideParams): Promise<ApprovalDecideResult> };
}
