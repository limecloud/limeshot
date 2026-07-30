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
  ProjectArchiveParams,
  ProjectArchiveResult,
  ProjectCreateResult,
  ProjectExecutionReadResult,
  ProjectReadResult,
  ProjectRenameParams,
  ProjectRenameResult,
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
  projectRename: 'project:rename',
  projectArchive: 'project:archive',
  projectReveal: 'project:reveal',
  briefUpdate: 'brief:update',
  conversationList: 'conversation:list',
  conversationImportList: 'conversation:import-list',
  conversationImport: 'conversation:import',
  conversationStart: 'conversation:start',
  conversationRename: 'conversation:rename',
  conversationArchive: 'conversation:archive',
  conversationDelete: 'conversation:delete',
  conversationReveal: 'conversation:reveal',
  conversationCopyWorkingDirectory: 'conversation:copy-working-directory',
  conversationCopySessionId: 'conversation:copy-session-id',
  projectConversationList: 'conversation:project-list',
  projectConversationsArchive: 'conversation:archive-project',
  threadInspect: 'agent:thread-inspect',
  turnStart: 'turn:start',
  turnInterrupt: 'turn:interrupt',
  agentComposerCatalog: 'agent:composer-catalog',
  agentAttachmentPick: 'agent:attachment-pick',
  agentCaptureSourceList: 'agent:capture-source-list',
  agentCaptureSource: 'agent:capture-source',
  agentModelList: 'agent:model-list',
  agentThreadSettingsUpdate: 'agent:thread-settings-update',
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
  workspaceFilesList: 'workspace:files-list',
  workspaceContextRead: 'workspace:context-read',
  workspaceFileRead: 'workspace:file-read',
  workspaceFileReveal: 'workspace:file-reveal',
  workspaceTerminalStart: 'workspace:terminal-start',
  workspaceTerminalWrite: 'workspace:terminal-write',
  workspaceTerminalResize: 'workspace:terminal-resize',
  workspaceTerminalClose: 'workspace:terminal-close',
  workspaceTerminalEvent: 'workspace:terminal-event',
  workspaceBrowserOpen: 'workspace:browser-open',
  workspaceBrowserNavigate: 'workspace:browser-navigate',
  workspaceBrowserBack: 'workspace:browser-back',
  workspaceBrowserForward: 'workspace:browser-forward',
  workspaceBrowserReload: 'workspace:browser-reload',
  workspaceBrowserBounds: 'workspace:browser-bounds',
  workspaceBrowserClose: 'workspace:browser-close',
  workspaceBrowserEvent: 'workspace:browser-event',
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
  origin: 'limeshot' | 'codex';
  client: 'cli' | 'vscode' | 'appServer' | 'unknown';
  workspaceLabel?: string;
}
export interface AgentProjectConversationSummary extends AgentConversationSummary {
  projectId: string;
  conversationId: string;
}
export interface ConversationImportInput { threadId: string; }
export interface ConversationStartInput {
  projectId: string | null;
  conversationId: string;
  threadId?: string;
  initialModelSettings?: AgentModelSettings;
}
export interface ConversationStartResult {
  conversationId: string;
  threadId: string;
  turns: AgentTurnProjection[];
  access: 'active' | 'readOnly';
  modelSettings?: { model: string; effort?: string };
}
export interface ConversationTargetInput {
  projectId: string | null;
  conversationId: string;
  threadId: string;
}
export interface ConversationRenameInput extends ConversationTargetInput { title: string; }
export interface ProjectConversationsArchiveInput { projectId: string; }
export interface ProjectConversationsArchiveResult {
  archivedThreadIds: string[];
  failedThreadIds: string[];
}
export interface ProjectConversationListResult { conversations: AgentProjectConversationSummary[]; }
export interface AgentThreadInspectInput { parentThreadId: string; threadId: string; }
export interface AgentThreadInspectResult {
  threadId: string;
  parentThreadId: string;
  name?: string;
  agentNickname?: string;
  agentRole?: string;
  turns: AgentTurnProjection[];
}
export type AgentComposerMode = 'default' | 'plan' | 'goal';
export interface TurnStartInput {
  projectId: string | null;
  conversationId: string;
  threadId: string;
  text: string;
  attachmentIds?: string[];
  capabilityIds?: string[];
  mode?: AgentComposerMode;
  modelSettings?: AgentModelSettings;
}
export interface TurnStartResult { threadId: string; turnId: string; }
export interface TurnInterruptInput { threadId: string; turnId: string; }
export type AgentComposerAttachmentKind = 'file' | 'folder' | 'image' | 'audio' | 'appScreenshot';
export interface AgentComposerAttachment {
  id: string;
  label: string;
  kind: AgentComposerAttachmentKind;
  previewUrl?: string;
}
export interface AgentAttachmentPickInput { selection: 'files' | 'folder'; }
export interface AgentCaptureSourceOption {
  id: string;
  label: string;
  previewUrl: string;
}
export interface AgentCaptureSourceInput { id: string; }
export interface AgentComposerCatalogInput {
  projectId: string | null;
  conversationId?: string;
  threadId?: string;
}
export interface AgentComposerCapability {
  id: string;
  kind: 'plugin';
  label: string;
  description: string;
  defaultPrompt?: string;
  recordSkill: boolean;
}
export interface AgentComposerCatalogResult {
  capabilities: AgentComposerCapability[];
  planModeAvailable: boolean;
  pluginLoadFailed: boolean;
}
export interface AgentModelReasoningEffort {
  effort: string;
  description: string;
}
export interface AgentModelOption {
  id: string;
  model: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts: AgentModelReasoningEffort[];
  defaultReasoningEffort: string;
  isDefault: boolean;
}
export interface AgentModelListResult { models: AgentModelOption[]; }
export interface AgentModelSettings {
  model: string;
  effort: string;
}
export interface AgentThreadSettingsUpdateInput extends ConversationTargetInput, AgentModelSettings {}

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  size: number | null;
}
export interface WorkspaceFilesListInput { projectId: string; directory?: string; }
export interface WorkspaceFilesListResult {
  rootName: string;
  directory: string;
  entries: WorkspaceFileEntry[];
  truncated: boolean;
}
export interface WorkspaceFileReadInput { projectId: string; path: string; }
export interface WorkspaceFileReadResult {
  path: string;
  content: string;
  language: string;
  kind: 'markdown' | 'text';
  truncated: boolean;
}
export interface WorkspaceFileRevealInput { projectId: string; path: string; }
export interface WorkspaceContextReadInput { projectId: string; }
export interface WorkspaceContextResult {
  rootName: string;
  location: 'local';
  branch?: string;
}

export interface WorkspaceTerminalStartInput { projectId: string; cols?: number; rows?: number; }
export interface WorkspaceTerminalStartResult {
  sessionId: string;
  title: string;
  cwdLabel: string;
  branch?: string;
}
export interface WorkspaceTerminalWriteInput { sessionId: string; data: string; }
export interface WorkspaceTerminalResizeInput { sessionId: string; cols: number; rows: number; }
export interface WorkspaceTerminalCloseInput { sessionId: string; }
export type WorkspaceTerminalEvent =
  | { sessionId: string; type: 'output'; data: string }
  | { sessionId: string; type: 'cwd'; cwdLabel: string }
  | { sessionId: string; type: 'exit'; exitCode: number | null };

export interface WorkspaceBrowserState {
  viewId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  error?: string;
}
export interface WorkspaceBrowserTargetInput { viewId: string; }
export interface WorkspaceBrowserNavigateInput extends WorkspaceBrowserTargetInput { url: string; }
export interface WorkspaceBrowserBoundsInput extends WorkspaceBrowserTargetInput {
  bounds: { x: number; y: number; width: number; height: number };
  visible: boolean;
}
export type WorkspaceBrowserEvent = WorkspaceBrowserState;

export interface DesktopApi {
  foundation: { read(): Promise<FoundationProjection> };
  project: {
    open(input: ProjectOpenInput): Promise<ProjectCreateResult | null>;
    list(): Promise<ProjectSummary[]>;
    read(projectId: string): Promise<ProjectReadResult>;
    rename(params: ProjectRenameParams): Promise<ProjectRenameResult>;
    archive(params: ProjectArchiveParams): Promise<ProjectArchiveResult>;
    reveal(projectId: string): Promise<void>;
    updateBrief(params: BriefUpdateParams): Promise<BriefUpdateResult>;
  };
  agent: {
    listConversations(): Promise<AgentConversationSummary[]>;
    listImportCandidates(): Promise<AgentConversationSummary[]>;
    importConversation(input: ConversationImportInput): Promise<AgentConversationSummary>;
    startConversation(input: ConversationStartInput): Promise<ConversationStartResult>;
    renameConversation(input: ConversationRenameInput): Promise<void>;
    archiveConversation(input: ConversationTargetInput): Promise<void>;
    deleteConversation(input: ConversationTargetInput): Promise<void>;
    revealConversation(input: ConversationTargetInput): Promise<void>;
    copyConversationWorkingDirectory(input: ConversationTargetInput): Promise<void>;
    copyConversationSessionId(input: ConversationTargetInput): Promise<void>;
    listProjectConversations(input: ProjectConversationsArchiveInput): Promise<ProjectConversationListResult>;
    archiveProjectConversations(input: ProjectConversationsArchiveInput): Promise<ProjectConversationsArchiveResult>;
    inspectSubThread(input: AgentThreadInspectInput): Promise<AgentThreadInspectResult>;
    composerCatalog(input: AgentComposerCatalogInput): Promise<AgentComposerCatalogResult>;
    pickAttachments(input: AgentAttachmentPickInput): Promise<AgentComposerAttachment[]>;
    listCaptureSources(): Promise<AgentCaptureSourceOption[]>;
    captureSource(input: AgentCaptureSourceInput): Promise<AgentComposerAttachment>;
    listModels(): Promise<AgentModelListResult>;
    updateThreadSettings(input: AgentThreadSettingsUpdateInput): Promise<void>;
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
  workspace: {
    context: {
      read(input: WorkspaceContextReadInput): Promise<WorkspaceContextResult>;
    };
    files: {
      list(input: WorkspaceFilesListInput): Promise<WorkspaceFilesListResult>;
      read(input: WorkspaceFileReadInput): Promise<WorkspaceFileReadResult>;
      reveal(input: WorkspaceFileRevealInput): Promise<void>;
    };
    terminal: {
      start(input: WorkspaceTerminalStartInput): Promise<WorkspaceTerminalStartResult>;
      write(input: WorkspaceTerminalWriteInput): Promise<void>;
      resize(input: WorkspaceTerminalResizeInput): Promise<void>;
      close(input: WorkspaceTerminalCloseInput): Promise<void>;
      subscribe(listener: (event: WorkspaceTerminalEvent) => void): () => void;
    };
    browser: {
      open(): Promise<WorkspaceBrowserState>;
      navigate(input: WorkspaceBrowserNavigateInput): Promise<WorkspaceBrowserState>;
      back(input: WorkspaceBrowserTargetInput): Promise<WorkspaceBrowserState>;
      forward(input: WorkspaceBrowserTargetInput): Promise<WorkspaceBrowserState>;
      reload(input: WorkspaceBrowserTargetInput): Promise<WorkspaceBrowserState>;
      setBounds(input: WorkspaceBrowserBoundsInput): Promise<void>;
      close(input: WorkspaceBrowserTargetInput): Promise<void>;
      subscribe(listener: (event: WorkspaceBrowserEvent) => void): () => void;
    };
  };
}
