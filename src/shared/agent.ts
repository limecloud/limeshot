export type AgentTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';
export type AgentItemsView = 'notLoaded' | 'summary' | 'full';
export type AgentItemStatus = 'inProgress' | 'completed' | 'failed' | 'declined' | 'interrupted';
export type AgentItemKind = 'user' | 'assistant' | 'plan' | 'tool' | 'activity' | 'system';
export type AgentJsonValue = null | boolean | number | string | AgentJsonValue[] | { [key: string]: AgentJsonValue };

export interface AgentTextElementProjection {
  start: number;
  end: number;
  kind: string;
}

export type AgentInputProjection =
  | { type: 'text'; text: string; elements: AgentTextElementProjection[] }
  | { type: 'image'; source: 'remote' | 'local'; url?: string; label: string; detail?: string }
  | { type: 'audio'; source: 'remote' | 'local'; url?: string; label: string }
  | { type: 'skill'; name: string; label: string }
  | { type: 'mention'; name: string; label: string };

export interface AgentMemoryCitationProjection {
  entries: Array<{ path: string; lineStart: number; lineEnd: number; note: string }>;
  threadIds: string[];
}

export interface AgentCommandActionProjection {
  type: 'read' | 'listFiles' | 'search' | 'unknown';
  command: string;
  name?: string;
  path?: string;
  query?: string;
}

export interface AgentFileChangeProjection {
  path: string;
  kind: string;
  diff: string;
}

export type AgentToolContentProjection =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'audio'; url: string }
  | { type: 'resource'; uri: string; text?: string }
  | { type: 'resourceLink'; uri: string; name?: string }
  | { type: 'json'; value: AgentJsonValue };

interface AgentItemBase {
  id: string;
  type: string;
  kind: AgentItemKind;
  text: string;
  title?: string;
  status?: AgentItemStatus;
  durationMs?: number;
}

export interface AgentUserMessageProjection extends AgentItemBase {
  type: 'userMessage';
  kind: 'user';
  content: AgentInputProjection[];
  clientId?: string;
}

export interface AgentHookPromptProjection extends AgentItemBase {
  type: 'hookPrompt';
  kind: 'system';
  fragments: Array<{ text: string; hookRunId: string }>;
}

export interface AgentMessageProjection extends AgentItemBase {
  type: 'agentMessage';
  kind: 'assistant';
  phase?: string;
  memoryCitation?: AgentMemoryCitationProjection;
}

export interface AgentPlanItemProjection extends AgentItemBase {
  type: 'plan';
  kind: 'plan';
}

export interface AgentReasoningProjection extends AgentItemBase {
  type: 'reasoning';
  kind: 'activity';
  summary: string[];
  content: string[];
}

export interface AgentCommandExecutionProjection extends AgentItemBase {
  type: 'commandExecution';
  kind: 'activity';
  command: string;
  cwd: string;
  processId?: string;
  source: string;
  actions: AgentCommandActionProjection[];
  output: string;
  exitCode?: number;
  terminalInteractions: string[];
}

export interface AgentFileChangeItemProjection extends AgentItemBase {
  type: 'fileChange';
  kind: 'activity';
  changes: AgentFileChangeProjection[];
}

export interface AgentMcpToolCallProjection extends AgentItemBase {
  type: 'mcpToolCall';
  kind: 'tool';
  server: string;
  tool: string;
  arguments: AgentJsonValue;
  pluginId?: string;
  resourceUri?: string;
  progress: string[];
  content: AgentToolContentProjection[];
  structuredContent?: AgentJsonValue;
  error?: string;
}

export interface AgentDynamicToolCallProjection extends AgentItemBase {
  type: 'dynamicToolCall';
  kind: 'tool';
  namespace?: string;
  tool: string;
  arguments: AgentJsonValue;
  content: AgentToolContentProjection[];
  success?: boolean;
}

export interface AgentCollabStateProjection {
  threadId: string;
  status: 'pendingInit' | 'running' | 'interrupted' | 'completed' | 'errored' | 'shutdown' | 'notFound' | 'unknown';
  message?: string;
}

export interface AgentCollabToolCallProjection extends AgentItemBase {
  type: 'collabAgentToolCall';
  kind: 'activity';
  tool: 'spawnAgent' | 'sendInput' | 'resumeAgent' | 'wait' | 'closeAgent' | 'unknown';
  senderThreadId: string;
  receiverThreadIds: string[];
  prompt?: string;
  model?: string;
  reasoningEffort?: string;
  agents: AgentCollabStateProjection[];
}

export interface AgentSubAgentActivityProjection extends AgentItemBase {
  type: 'subAgentActivity';
  kind: 'activity';
  activity: 'started' | 'interacted' | 'interrupted' | 'unknown';
  agentThreadId: string;
  agentPath: string;
}

export interface AgentWebSearchProjection extends AgentItemBase {
  type: 'webSearch';
  kind: 'activity';
  query: string;
  action?: { type: 'search' | 'openPage' | 'findInPage' | 'other'; query?: string; queries?: string[]; url?: string; pattern?: string };
  results: Array<{ title?: string; url?: string; snippet?: string; source?: string; details?: AgentJsonValue }>;
}

export interface AgentImageViewProjection extends AgentItemBase {
  type: 'imageView';
  kind: 'activity';
  path: string;
}

export interface AgentSleepProjection extends AgentItemBase {
  type: 'sleep';
  kind: 'activity';
  waitMs: number;
}

export interface AgentImageGenerationProjection extends AgentItemBase {
  type: 'imageGeneration';
  kind: 'activity';
  revisedPrompt?: string;
  result: string;
  savedPath?: string;
}

export interface AgentReviewBoundaryProjection extends AgentItemBase {
  type: 'enteredReviewMode' | 'exitedReviewMode';
  kind: 'system';
  review: string;
}

export interface AgentContextCompactionProjection extends AgentItemBase {
  type: 'contextCompaction';
  kind: 'system';
}

export interface AgentUnknownItemProjection extends AgentItemBase {
  type: 'unknown';
  kind: 'system';
  sourceType: string;
  fields: string[];
}

export type AgentItemProjection =
  | AgentUserMessageProjection
  | AgentHookPromptProjection
  | AgentMessageProjection
  | AgentPlanItemProjection
  | AgentReasoningProjection
  | AgentCommandExecutionProjection
  | AgentFileChangeItemProjection
  | AgentMcpToolCallProjection
  | AgentDynamicToolCallProjection
  | AgentCollabToolCallProjection
  | AgentSubAgentActivityProjection
  | AgentWebSearchProjection
  | AgentImageViewProjection
  | AgentSleepProjection
  | AgentImageGenerationProjection
  | AgentReviewBoundaryProjection
  | AgentContextCompactionProjection
  | AgentUnknownItemProjection;

export interface AgentTurnPlanStepProjection {
  step: string;
  status: 'pending' | 'inProgress' | 'completed';
}

export interface AgentTokenUsageProjection {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  modelContextWindow?: number;
}

export interface AgentTurnProjection {
  id: string;
  status: AgentTurnStatus;
  itemsView: AgentItemsView;
  items: AgentItemProjection[];
  plan?: { explanation?: string; steps: AgentTurnPlanStepProjection[] };
  diff?: string;
  usage?: AgentTokenUsageProjection;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  errorMessage?: string;
}

export interface AgentHookProjection {
  id: string;
  turnId?: string;
  eventName: string;
  status: string;
  statusMessage?: string;
  durationMs?: number;
  entries: Array<{ kind: string; text: string }>;
}

export interface AgentThreadStatusProjection {
  type: 'notLoaded' | 'idle' | 'systemError' | 'active';
  waitingOnApproval: boolean;
  waitingOnUserInput: boolean;
}

export interface AgentThreadGoalProjection {
  objective: string;
  status: string;
  tokenBudget?: number;
  tokensUsed: number;
  timeUsedSeconds: number;
}

export interface AgentThreadSettingsProjection {
  cwd: string;
  model: string;
  modelProvider: string;
  serviceTier?: string;
  effort?: string;
  approvalPolicy: string;
  sandboxPolicy: string;
  permissionProfile?: string;
}

export interface AgentThreadContextPatch {
  lifecycle?: 'active' | 'archived' | 'deleted' | 'closed';
  name?: string | null;
  preview?: string;
  cwd?: string;
  modelProvider?: string;
  status?: AgentThreadStatusProjection;
  goal?: AgentThreadGoalProjection | null;
  settings?: AgentThreadSettingsProjection;
  environment?: { state: 'connected' | 'disconnected'; label: string };
  model?: { current: string; previous?: string; reason?: string };
  verificationCount?: number;
  safetyBuffering?: { active: boolean; fasterModel?: string };
}

export interface AgentSafetyReviewProjection {
  id: string;
  turnId: string;
  itemId?: string;
  status: 'inProgress' | 'approved' | 'denied' | 'timedOut' | 'aborted';
  action: 'command' | 'execve' | 'applyPatch' | 'networkAccess' | 'mcpToolCall' | 'requestPermissions' | 'unknown';
  summary: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  authorization?: 'unknown' | 'low' | 'medium' | 'high';
  rationale?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentNoticeProjection {
  id: string;
  scope: 'turn' | 'thread' | 'global' | 'diagnostic';
  level: 'info' | 'warning' | 'error';
  kind: 'warning' | 'guardian' | 'deprecation' | 'config' | 'windows' | 'error';
  message?: string;
  threadId?: string;
  turnId?: string;
  status?: string;
}

export interface AgentCatalogUpdateProjection {
  id: string;
  domain: 'skills' | 'mcp' | 'account' | 'apps' | 'remoteControl' | 'import' | 'filesystem' | 'sandbox' | 'authentication';
  status: string;
  label?: string;
  message?: string;
  count?: number;
  threadId?: string;
}

export interface AgentComposerSearchProjection {
  sessionId: string;
  query: string;
  status: 'searching' | 'completed';
  files: Array<{ path: string; name: string }>;
}

export type AgentRealtimeUpdateProjection =
  | { kind: 'started'; sessionActive: boolean; version?: string }
  | { kind: 'transcriptDelta'; role: string; text: string }
  | { kind: 'transcriptDone'; role: string; text: string }
  | { kind: 'audioQueued' }
  | { kind: 'error'; message?: string }
  | { kind: 'closed'; message?: string };

export interface AgentDiagnosticProjection {
  id: string;
  domain: 'protocol' | 'output' | 'process' | 'filesystem' | 'moderation' | 'media' | 'interaction' | 'compatibility';
  code: 'unknownNotification' | 'invalidEvent' | 'interactionResolved' | 'realtimeItemDetached'
    | 'rawResponse' | 'commandOutput' | 'commandOutputCapped' | 'processOutput'
    | 'processOutputCapped' | 'processExited' | 'deprecatedFileOutput'
    | 'moderationUpdated' | 'realtimeTransportHandled';
  level: 'info' | 'warning';
  detail?: string;
  threadId?: string;
  turnId?: string;
  status?: string;
}

export type AgentInteractionStatus = 'pending' | 'submitting' | 'resolved' | 'expired' | 'disconnected';
export type AgentInteractionRisk = 'shell' | 'filesystem' | 'network' | 'session' | 'secret' | 'external';

interface AgentInteractionBase {
  interactionId: string;
  actionToken: string;
  threadId: string;
  turnId?: string;
  itemId?: string;
  createdAt: number;
  status: AgentInteractionStatus;
  reason?: string;
  risks: AgentInteractionRisk[];
}

export interface AgentCommandApprovalProjection extends AgentInteractionBase {
  kind: 'commandApproval';
  command: string;
  cwd: string;
  actions: AgentCommandActionProjection[];
  decisions: Array<'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'applyNetworkPolicyAmendment' | 'decline' | 'cancel'>;
}

export interface AgentFileApprovalProjection extends AgentInteractionBase {
  kind: 'fileApproval';
  grantRoot?: string;
  changes: AgentFileChangeProjection[];
  decisions: Array<'accept' | 'acceptForSession' | 'decline' | 'cancel'>;
}

export interface AgentPermissionApprovalProjection extends AgentInteractionBase {
  kind: 'permissionApproval';
  cwd: string;
  environmentLabel?: string;
  networkRequested: boolean;
  readPathCount: number;
  writePathCount: number;
  decisions: Array<'grantTurn' | 'grantSession' | 'grantTurnStrict' | 'deny'>;
}

export interface AgentUserInputQuestionProjection {
  id: string;
  header: string;
  question: string;
  allowsOther: boolean;
  multiple: boolean;
  secret: boolean;
  options: Array<{ label: string; description: string }>;
}

export interface AgentUserInputRequestProjection extends AgentInteractionBase {
  kind: 'userInput';
  questions: AgentUserInputQuestionProjection[];
  autoResolutionAt?: number;
}

export interface AgentMcpElicitationProjection extends AgentInteractionBase {
  kind: 'mcpElicitation';
  server: string;
  mode: 'form' | 'openaiForm' | 'url';
  message: string;
  schema?: AgentJsonValue;
  urlLabel?: string;
}

export type AgentPendingInteractionProjection =
  | AgentCommandApprovalProjection
  | AgentFileApprovalProjection
  | AgentPermissionApprovalProjection
  | AgentUserInputRequestProjection
  | AgentMcpElicitationProjection;

export type AgentInteractionSubmitInput =
  | { interactionId: string; actionToken: string; kind: 'commandApproval'; decision: AgentCommandApprovalProjection['decisions'][number] }
  | { interactionId: string; actionToken: string; kind: 'fileApproval'; decision: AgentFileApprovalProjection['decisions'][number] }
  | { interactionId: string; actionToken: string; kind: 'permissionApproval'; decision: AgentPermissionApprovalProjection['decisions'][number] }
  | { interactionId: string; actionToken: string; kind: 'userInput'; answers: Record<string, string[]> }
  | { interactionId: string; actionToken: string; kind: 'mcpElicitation'; action: 'accept' | 'decline' | 'cancel'; content?: AgentJsonValue };

export interface AgentInteractionSubmitResult {
  interactionId: string;
  accepted: true;
}

export interface AgentInteractionExternalOpenInput { interactionId: string; actionToken: string; }
export interface AgentInteractionExternalOpenResult { interactionId: string; opened: true; }

export type AgentDeltaChannel =
  | 'agentMessage'
  | 'plan'
  | 'reasoningSummary'
  | 'reasoningContent'
  | 'commandOutput'
  | 'fileOutput'
  | 'terminalInteraction'
  | 'realtimeTranscript';

export type AgentEvent =
  | { type: 'turn.started'; threadId: string; turn: AgentTurnProjection }
  | { type: 'turn.completed'; threadId: string; turn: AgentTurnProjection }
  | { type: 'item.updated'; threadId: string; turnId: string; item: AgentItemProjection }
  | { type: 'item.delta'; threadId: string; turnId: string; itemId: string; channel: AgentDeltaChannel; delta: string; index?: number }
  | { type: 'item.patch.updated'; threadId: string; turnId: string; itemId: string; changes: AgentFileChangeProjection[] }
  | { type: 'item.progress'; threadId: string; turnId: string; itemId: string; message: string }
  | { type: 'turn.plan.updated'; threadId: string; turnId: string; explanation?: string; steps: AgentTurnPlanStepProjection[] }
  | { type: 'turn.diff.updated'; threadId: string; turnId: string; diff: string }
  | { type: 'thread.usage.updated'; threadId: string; turnId: string; usage: AgentTokenUsageProjection }
  | { type: 'thread.status.updated'; threadId: string; status: AgentThreadStatusProjection }
  | { type: 'thread.context.updated'; threadId: string; patch: AgentThreadContextPatch }
  | { type: 'thread.realtime.updated'; threadId: string; update: AgentRealtimeUpdateProjection }
  | { type: 'hook.updated'; threadId: string; hook: AgentHookProjection }
  | { type: 'review.updated'; threadId: string; review: AgentSafetyReviewProjection }
  | { type: 'notice.updated'; notice: AgentNoticeProjection }
  | { type: 'catalog.updated'; update: AgentCatalogUpdateProjection }
  | { type: 'composer.search.updated'; search: AgentComposerSearchProjection }
  | { type: 'diagnostic.recorded'; diagnostic: AgentDiagnosticProjection }
  | { type: 'interaction.updated'; threadId: string; interaction: AgentPendingInteractionProjection }
  | { type: 'interaction.resolved'; threadId: string; interactionId: string }
  | { type: 'agent.error'; threadId?: string; turnId?: string; message: string; willRetry: boolean };
