import type { ServerNotification, ServerRequest } from './generated';
import type { ApplyPatchApprovalResponse } from './generated/ApplyPatchApprovalResponse';
import type { ExecCommandApprovalResponse } from './generated/ExecCommandApprovalResponse';
import type { RequestId } from './generated/RequestId';
import type { JsonValue } from './generated/serde_json/JsonValue';
import type { AttestationGenerateResponse } from './generated/v2/AttestationGenerateResponse';
import type { ChatgptAuthTokensRefreshResponse } from './generated/v2/ChatgptAuthTokensRefreshResponse';
import type { CommandExecutionRequestApprovalResponse } from './generated/v2/CommandExecutionRequestApprovalResponse';
import type { CurrentTimeReadResponse } from './generated/v2/CurrentTimeReadResponse';
import type { DynamicToolCallOutputContentItem } from './generated/v2/DynamicToolCallOutputContentItem';
import type { DynamicToolCallParams } from './generated/v2/DynamicToolCallParams';
import type { DynamicToolCallResponse } from './generated/v2/DynamicToolCallResponse';
import type { FileChangeRequestApprovalResponse } from './generated/v2/FileChangeRequestApprovalResponse';
import type { McpServerElicitationRequestResponse } from './generated/v2/McpServerElicitationRequestResponse';
import type { PermissionsRequestApprovalResponse } from './generated/v2/PermissionsRequestApprovalResponse';
import type { SkillsExtraRootsSetParams } from './generated/v2/SkillsExtraRootsSetParams';
import type { SkillsExtraRootsSetResponse } from './generated/v2/SkillsExtraRootsSetResponse';
import type { Thread } from './generated/v2/Thread';
import type { ThreadItemsListParams } from './generated/v2/ThreadItemsListParams';
import type { ThreadItemsListResponse } from './generated/v2/ThreadItemsListResponse';
import type { ThreadListParams } from './generated/v2/ThreadListParams';
import type { ThreadListResponse } from './generated/v2/ThreadListResponse';
import type { ThreadReadParams } from './generated/v2/ThreadReadParams';
import type { ThreadReadResponse } from './generated/v2/ThreadReadResponse';
import type { ThreadResumeParams } from './generated/v2/ThreadResumeParams';
import type { ThreadResumeResponse } from './generated/v2/ThreadResumeResponse';
import type { ThreadStartParams } from './generated/v2/ThreadStartParams';
import type { ThreadStartResponse } from './generated/v2/ThreadStartResponse';
import type { ThreadTurnsListParams } from './generated/v2/ThreadTurnsListParams';
import type { ThreadTurnsListResponse } from './generated/v2/ThreadTurnsListResponse';
import type { Turn } from './generated/v2/Turn';
import type { TurnInterruptParams } from './generated/v2/TurnInterruptParams';
import type { TurnInterruptResponse } from './generated/v2/TurnInterruptResponse';
import type { TurnStartParams } from './generated/v2/TurnStartParams';
import type { TurnStartResponse } from './generated/v2/TurnStartResponse';
import type { ToolRequestUserInputResponse } from './generated/v2/ToolRequestUserInputResponse';
import type { UserInput } from './generated/v2/UserInput';

export const CODEX_VERSION = '0.145.0' as const;
export const CODEX_NEW_THREAD_HISTORY_MODE = 'paginated' as const;

export type CodexTurnStatus = Turn['status'];
export type CodexTurn = Turn;

// isPinned is accepted only as a forward-compatible read.
export type CodexThread = Thread & { recencyAt?: number | null; isPinned?: boolean };

export type CodexUserInput = UserInput;

export interface CodexDynamicTool {
  type: 'function';
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  deferLoading?: boolean;
}

export interface CodexRequestMap {
  'thread/start': {
    params: Omit<ThreadStartParams, 'dynamicTools'> & { dynamicTools?: CodexDynamicTool[] | null };
    result: ThreadStartResponse;
  };
  'thread/resume': { params: ThreadResumeParams; result: ThreadResumeResponse };
  'thread/read': { params: ThreadReadParams; result: ThreadReadResponse };
  'thread/turns/list': { params: ThreadTurnsListParams; result: ThreadTurnsListResponse };
  'thread/items/list': { params: ThreadItemsListParams; result: ThreadItemsListResponse };
  'thread/list': { params: ThreadListParams; result: ThreadListResponse };
  'turn/start': { params: Omit<TurnStartParams, 'input'> & { input: CodexUserInput[] }; result: TurnStartResponse };
  'turn/interrupt': { params: TurnInterruptParams; result: TurnInterruptResponse };
  'skills/extraRoots/set': { params: SkillsExtraRootsSetParams; result: SkillsExtraRootsSetResponse };
}

export type CodexToolCallRequest = Omit<DynamicToolCallParams, 'arguments'> & {
  arguments: Record<string, unknown>;
};

export interface CodexToolCallResponse {
  success: boolean;
  contentItems: DynamicToolCallOutputContentItem[];
}

export type CodexRequestMethod = keyof CodexRequestMap;
export type CodexRequestParams<M extends CodexRequestMethod> = CodexRequestMap[M]['params'];
export type CodexRequestResult<M extends CodexRequestMethod> = CodexRequestMap[M]['result'];

export const CODEX_NOTIFICATION_METHODS = [
  'error',
  'thread/started',
  'thread/status/changed',
  'thread/archived',
  'thread/deleted',
  'thread/unarchived',
  'thread/closed',
  'skills/changed',
  'thread/name/updated',
  'thread/goal/updated',
  'thread/goal/cleared',
  'thread/environment/connected',
  'thread/environment/disconnected',
  'thread/settings/updated',
  'thread/tokenUsage/updated',
  'turn/started',
  'hook/started',
  'turn/completed',
  'hook/completed',
  'turn/diff/updated',
  'turn/plan/updated',
  'item/started',
  'item/autoApprovalReview/started',
  'item/autoApprovalReview/completed',
  'item/completed',
  'rawResponseItem/completed',
  'rawResponse/completed',
  'item/agentMessage/delta',
  'item/plan/delta',
  'command/exec/outputDelta',
  'process/outputDelta',
  'process/exited',
  'item/commandExecution/outputDelta',
  'item/commandExecution/terminalInteraction',
  'item/fileChange/outputDelta',
  'item/fileChange/patchUpdated',
  'serverRequest/resolved',
  'item/mcpToolCall/progress',
  'mcpServer/oauthLogin/completed',
  'mcpServer/startupStatus/updated',
  'account/updated',
  'account/rateLimits/updated',
  'app/list/updated',
  'remoteControl/status/changed',
  'externalAgentConfig/import/progress',
  'externalAgentConfig/import/completed',
  'fs/changed',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/summaryPartAdded',
  'item/reasoning/textDelta',
  'thread/compacted',
  'model/rerouted',
  'model/verification',
  'turn/moderationMetadata',
  'model/safetyBuffering/updated',
  'warning',
  'guardianWarning',
  'deprecationNotice',
  'configWarning',
  'fuzzyFileSearch/sessionUpdated',
  'fuzzyFileSearch/sessionCompleted',
  'thread/realtime/started',
  'thread/realtime/itemAdded',
  'thread/realtime/transcript/delta',
  'thread/realtime/transcript/done',
  'thread/realtime/outputAudio/delta',
  'thread/realtime/sdp',
  'thread/realtime/error',
  'thread/realtime/closed',
  'windows/worldWritableWarning',
  'windowsSandbox/setupCompleted',
  'account/login/completed',
] as const;

export type CodexNotificationMethod = (typeof CODEX_NOTIFICATION_METHODS)[number];
export type CodexNotification =
  | { method: CodexNotificationMethod; params: unknown }
  | { method: 'unknown'; sourceMethod: string; params: unknown };

const notificationMethods = new Set<string>(CODEX_NOTIFICATION_METHODS);

export function isCodexNotificationMethod(value: string): value is CodexNotificationMethod {
  return notificationMethods.has(value);
}

export const CODEX_SERVER_REQUEST_METHODS = [
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
  'item/permissions/requestApproval',
  'item/tool/call',
  'account/chatgptAuthTokens/refresh',
  'attestation/generate',
  'currentTime/read',
  'applyPatchApproval',
  'execCommandApproval',
] as const satisfies readonly ServerRequest['method'][];

export type CodexServerRequest = ServerRequest;
export type CodexServerRequestMethod = (typeof CODEX_SERVER_REQUEST_METHODS)[number];
const serverRequestCoverage: Exclude<ServerRequest['method'], CodexServerRequestMethod> extends never ? true : never = true;
void serverRequestCoverage;
export type CodexServerRequestParams<M extends CodexServerRequestMethod> = Extract<ServerRequest, { method: M }>['params'];
export type CodexServerRequestEnvelope<M extends CodexServerRequestMethod> = Extract<ServerRequest, { method: M }>;
export interface CodexServerRequestMeta<M extends CodexServerRequestMethod> {
  id: RequestId;
  method: M;
}
export interface CodexServerResponseMap {
  'item/commandExecution/requestApproval': CommandExecutionRequestApprovalResponse;
  'item/fileChange/requestApproval': FileChangeRequestApprovalResponse;
  'item/tool/requestUserInput': ToolRequestUserInputResponse;
  'mcpServer/elicitation/request': McpServerElicitationRequestResponse;
  'item/permissions/requestApproval': PermissionsRequestApprovalResponse;
  'item/tool/call': DynamicToolCallResponse;
  'account/chatgptAuthTokens/refresh': ChatgptAuthTokensRefreshResponse;
  'attestation/generate': AttestationGenerateResponse;
  'currentTime/read': CurrentTimeReadResponse;
  applyPatchApproval: ApplyPatchApprovalResponse;
  execCommandApproval: ExecCommandApprovalResponse;
}
export type CodexServerRequestResult<M extends CodexServerRequestMethod> = CodexServerResponseMap[M];
export type CodexJsonValue = JsonValue;

export type {
  DynamicToolCallOutputContentItem,
  ServerNotification,
  ServerRequest,
  Thread,
  Turn,
  UserInput,
};
