export const CODEX_VERSION = '0.141.0' as const;

export type CodexTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';

export interface CodexTurn {
  id: string;
  items: unknown[];
  status: CodexTurnStatus;
  error: { message: string; additionalDetails: string | null } | null;
}

export interface CodexThread {
  id: string;
  turns: CodexTurn[];
}

export type CodexUserInput = {
  type: 'text';
  text: string;
  text_elements: unknown[];
};

export interface CodexRequestMap {
  'thread/start': {
    params: {
      cwd: string;
      approvalPolicy: 'on-request';
      sandbox: 'read-only';
      dynamicTools?: CodexDynamicTool[];
    };
    result: { thread: CodexThread };
  };
  'thread/resume': { params: { threadId: string }; result: { thread: CodexThread } };
  'thread/read': { params: { threadId: string; includeTurns: boolean }; result: { thread: CodexThread } };
  'turn/start': {
    params: { threadId: string; input: CodexUserInput[] };
    result: { turn: CodexTurn };
  };
  'turn/interrupt': { params: { threadId: string; turnId: string }; result: Record<string, never> };
  'skills/extraRoots/set': { params: { extraRoots: string[] }; result: Record<string, never> };
}

export interface CodexDynamicTool {
  type: 'function';
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  deferLoading?: boolean;
}

export interface CodexToolCallRequest {
  threadId: string;
  turnId: string;
  callId: string;
  namespace: string | null;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface CodexToolCallResponse {
  success: boolean;
  contentItems: Array<{ type: 'inputText'; text: string }>;
}

export type CodexRequestMethod = keyof CodexRequestMap;
export type CodexRequestParams<M extends CodexRequestMethod> = CodexRequestMap[M]['params'];
export type CodexRequestResult<M extends CodexRequestMethod> = CodexRequestMap[M]['result'];
export type CodexNotification = { method: string; params: unknown };
