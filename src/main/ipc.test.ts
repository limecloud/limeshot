import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_IPC, type ConversationTargetInput } from '../shared/desktop';
import type { BusinessSupervisor } from './business/supervisor';
import type { CodexSupervisor } from './codex/supervisor';
import { ConversationBindings } from './conversationBindings';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    clipboard: { writeText: vi.fn() },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    },
    shell: { openExternal: vi.fn(), openPath: vi.fn(async () => '') },
  };
});

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/tmp/limeshot'),
    getPath: vi.fn(() => '/tmp/limeshot'),
    getVersion: vi.fn(() => '0.4.0'),
    isPackaged: false,
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  dialog: { showOpenDialog: vi.fn() },
  clipboard: electron.clipboard,
  ipcMain: electron.ipcMain,
  shell: electron.shell,
}));

import { registerIpc } from './ipc';

interface SupervisorMocks {
  business: BusinessSupervisor;
  businessRequest: ReturnType<typeof vi.fn>;
  codex: CodexSupervisor;
  codexIsThreadUnmaterialized: ReturnType<typeof vi.fn>;
  codexRequest: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  electron.handlers.clear();
  vi.clearAllMocks();
});

describe('sidebar conversation IPC', () => {
  it('rejects project and standalone targets that are not owned by the caller context', async () => {
    const { business, businessRequest, codex, codexRequest } = supervisors();
    businessRequest.mockResolvedValueOnce({
      binding: { projectId: 'project-1', conversationId: 'conversation-1', codexThreadId: 'thread-other' },
    });
    registerIpc(business, codex, new ConversationBindings());

    await expect(invoke(DESKTOP_IPC.conversationRename, target(), '名称')).rejects.toThrow('会话与 Codex Thread 不匹配');
    await expect(invoke(DESKTOP_IPC.conversationArchive, {
      projectId: null,
      conversationId: 'thread-unknown',
      threadId: 'thread-unknown',
    })).rejects.toThrow('无效的独立会话标识');
    expect(codexRequest).not.toHaveBeenCalled();
  });

  it('maps rename to thread/name/set after validating the project binding', async () => {
    const { business, businessRequest, codex, codexRequest } = supervisors();
    businessRequest.mockResolvedValueOnce({
      binding: { projectId: 'project-1', conversationId: 'conversation-1', codexThreadId: 'thread-1' },
    });
    registerIpc(business, codex, new ConversationBindings());

    await invoke(DESKTOP_IPC.conversationRename, { ...target(), title: '  新名称  ' });

    expect(codexRequest).toHaveBeenCalledWith('thread/name/set', { threadId: 'thread-1', name: '新名称' });
  });

  it.each([
    [DESKTOP_IPC.conversationArchive, 'thread/archive'],
    [DESKTOP_IPC.conversationDelete, 'thread/delete'],
  ] as const)('unbinds a project conversation after %s succeeds', async (channel, method) => {
    const { business, businessRequest, codex, codexRequest } = supervisors();
    businessRequest.mockImplementation(async (requestMethod: string) => {
      if (requestMethod === 'conversation/binding/read') {
        return { binding: { projectId: 'project-1', conversationId: 'conversation-1', codexThreadId: 'thread-1' } };
      }
      if (requestMethod === 'conversation/unbind') return { removed: true };
      throw new Error(`unexpected business method: ${requestMethod}`);
    });
    const bindings = new ConversationBindings();
    bindings.remember('thread-1', { projectId: 'project-1', conversationId: 'conversation-1' });
    registerIpc(business, codex, bindings);

    await invoke(channel, target());

    expect(codexRequest).toHaveBeenCalledWith(method, { threadId: 'thread-1' });
    expect(businessRequest).toHaveBeenCalledWith('conversation/unbind', {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      expectedCodexThreadId: 'thread-1',
    });
    expect(bindings.read('thread-1')).toBeUndefined();
  });

  it('returns partial project archive results and forgets only fully archived bindings', async () => {
    const { business, businessRequest, codex, codexRequest } = supervisors();
    const projectBindings = ['thread-1', 'thread-2', 'thread-3'].map((threadId, index) => ({
      projectId: 'project-1',
      conversationId: `conversation-${index + 1}`,
      codexThreadId: threadId,
      updatedAtEpochMs: index + 1,
    }));
    businessRequest.mockImplementation(async (method: string, params: { expectedCodexThreadId?: string }) => {
      if (method === 'conversation/binding/list') return { bindings: projectBindings };
      if (method === 'conversation/unbind' && params.expectedCodexThreadId === 'thread-3') throw new Error('unbind failed');
      if (method === 'conversation/unbind') return { removed: true };
      throw new Error(`unexpected business method: ${method}`);
    });
    codexRequest.mockImplementation(async (method: string, params: { threadId?: string }) => {
      if (method === 'thread/archive' && params.threadId === 'thread-2') throw new Error('archive failed');
      return {};
    });
    const bindings = new ConversationBindings();
    for (const binding of projectBindings) {
      bindings.remember(binding.codexThreadId, {
        projectId: binding.projectId,
        conversationId: binding.conversationId,
      });
    }
    registerIpc(business, codex, bindings);

    await expect(invoke(DESKTOP_IPC.projectConversationsArchive, { projectId: 'project-1' })).resolves.toEqual({
      archivedThreadIds: ['thread-1'],
      failedThreadIds: ['thread-2', 'thread-3'],
    });
    expect(bindings.read('thread-1')).toBeUndefined();
    expect(bindings.read('thread-2')).toBeDefined();
    expect(bindings.read('thread-3')).toBeDefined();
  });

  it('reveals owned directories, copies values, and lists project thread ids through semantic handlers', async () => {
    const { business, businessRequest, codex, codexRequest } = supervisors();
    businessRequest.mockImplementation(async (method: string) => {
      if (method === 'conversation/binding/read') {
        return { binding: { projectId: 'project-1', conversationId: 'conversation-1', codexThreadId: 'thread-1' } };
      }
      if (method === 'conversation/binding/list') {
        return { bindings: [
          { projectId: 'project-1', conversationId: 'conversation-1', codexThreadId: 'thread-1', updatedAtEpochMs: 1 },
          { projectId: 'project-1', conversationId: 'conversation-2', codexThreadId: 'thread-2', updatedAtEpochMs: 2 },
        ] };
      }
      if (method === 'project/context/read') return { workspacePath: '/workspace/project-1' };
      throw new Error(`unexpected business method: ${method}`);
    });
    registerIpc(business, codex, new ConversationBindings());

    await invoke(DESKTOP_IPC.projectReveal, 'project-1');
    await invoke(DESKTOP_IPC.conversationReveal, target());
    await invoke(DESKTOP_IPC.conversationCopyWorkingDirectory, target());
    await invoke(DESKTOP_IPC.conversationCopySessionId, target());

    expect(electron.shell.openPath).toHaveBeenNthCalledWith(1, '/workspace/project-1');
    expect(electron.shell.openPath).toHaveBeenNthCalledWith(2, '/workspace/project-1');
    expect(electron.clipboard.writeText).toHaveBeenNthCalledWith(1, '/workspace/project-1');
    expect(electron.clipboard.writeText).toHaveBeenNthCalledWith(2, 'thread-1');
    codexRequest.mockImplementation(async (method: string, params: { threadId?: string }) => {
      if (method === 'thread/list') return { data: [], nextCursor: null };
      if (method === 'thread/read') {
        return { thread: {
          id: params.threadId,
          name: `Conversation ${params.threadId}`,
          preview: '',
          cwd: '/workspace/project-1',
          source: 'appServer',
          parentThreadId: null,
          ephemeral: false,
          createdAt: 1,
          updatedAt: 2,
        } };
      }
      return {};
    });
    await expect(invoke(DESKTOP_IPC.projectConversationList, { projectId: 'project-1' })).resolves.toEqual({
      conversations: [
        expect.objectContaining({ projectId: 'project-1', conversationId: 'conversation-1', threadId: 'thread-1', title: 'Conversation thread-1' }),
        expect.objectContaining({ projectId: 'project-1', conversationId: 'conversation-2', threadId: 'thread-2', title: 'Conversation thread-2' }),
      ],
    });
  });

  it('keeps an unmaterialized project binding visible without synthesizing Codex history', async () => {
    const { business, businessRequest, codex, codexIsThreadUnmaterialized, codexRequest } = supervisors();
    businessRequest.mockImplementation(async (method: string) => {
      if (method === 'conversation/binding/list') return {
        bindings: [{
          projectId: 'project-1',
          conversationId: 'conversation-new',
          codexThreadId: 'thread-new',
          updatedAtEpochMs: 42,
        }],
      };
      if (method === 'project/context/read') return { workspacePath: '/workspace/project-1' };
      throw new Error(`unexpected business method: ${method}`);
    });
    codexRequest.mockImplementation(async (method: string) => {
      if (method === 'thread/list') return { data: [], nextCursor: null };
      if (method === 'thread/read') throw new Error('thread is not materialized yet');
      return {};
    });
    codexIsThreadUnmaterialized.mockReturnValueOnce(true);
    registerIpc(business, codex, new ConversationBindings());

    await expect(invoke(DESKTOP_IPC.projectConversationList, { projectId: 'project-1' })).resolves.toEqual({
      conversations: [{
        projectId: 'project-1',
        conversationId: 'conversation-new',
        threadId: 'thread-new',
        title: '',
        updatedAtEpochMs: 42,
        origin: 'limeshot',
        client: 'appServer',
      }],
    });
  });

  it('groups all root Codex history from the project directory and its descendants while excluding siblings', async () => {
    const { business, businessRequest, codex, codexRequest } = supervisors();
    businessRequest.mockImplementation(async (method: string) => {
      if (method === 'conversation/binding/list') return { bindings: [] };
      if (method === 'project/context/read') return { workspacePath: '/workspace/project-1' };
      throw new Error(`unexpected business method: ${method}`);
    });
    codexRequest.mockImplementation(async (method: string, params: { cursor?: string | null }) => {
      if (method === 'thread/list' && !params.cursor) return {
        data: [
          codexThread('thread-project', '/workspace/project-1', 'Project history'),
          codexThread('thread-sibling', '/workspace/project-10', 'Sibling history'),
        ],
        nextCursor: 'page-2',
      };
      if (method === 'thread/list' && params.cursor === 'page-2') return {
        data: [
          codexThread('thread-child', '/workspace/project-1/packages/app', 'Nested exec history', 'exec'),
          codexThread('thread-other', '/workspace/other', 'Other history'),
        ],
        nextCursor: null,
      };
      return {};
    });
    registerIpc(business, codex, new ConversationBindings());

    await expect(invoke(DESKTOP_IPC.projectConversationList, { projectId: 'project-1' })).resolves.toEqual({
      conversations: [
        expect.objectContaining({
          projectId: 'project-1',
          conversationId: 'thread-project',
          threadId: 'thread-project',
          title: 'Project history',
          origin: 'codex',
        }),
        expect.objectContaining({
          projectId: 'project-1',
          conversationId: 'thread-child',
          threadId: 'thread-child',
          title: 'Nested exec history',
          origin: 'codex',
        }),
      ],
    });
    await expect(invoke(DESKTOP_IPC.turnStart, {
      projectId: 'project-1',
      conversationId: 'thread-project',
      threadId: 'thread-project',
      text: 'should stay read only',
    })).rejects.toThrow('导入的 Codex 会话为只读');
  });

  it('opens an imported unmaterialized Codex thread as read only with empty history', async () => {
    const { business, codex, codexIsThreadUnmaterialized, codexRequest } = supervisors();
    codexRequest.mockResolvedValueOnce({
      thread: {
        id: 'thread-imported-new',
        name: 'Imported draft',
        preview: '',
        cwd: '/workspace/imported',
        source: 'appServer',
        parentThreadId: null,
        ephemeral: false,
        createdAt: 1,
        updatedAt: 1,
      },
    });
    registerIpc(business, codex, new ConversationBindings());

    await invoke(DESKTOP_IPC.conversationImport, { threadId: 'thread-imported-new' });
    codexIsThreadUnmaterialized.mockReturnValue(true);

    await expect(invoke(DESKTOP_IPC.conversationStart, {
      projectId: null,
      conversationId: 'thread-imported-new',
      threadId: 'thread-imported-new',
    })).resolves.toEqual({
      conversationId: 'thread-imported-new',
      threadId: 'thread-imported-new',
      turns: [],
      access: 'readOnly',
    });
    expect(codexRequest).toHaveBeenCalledTimes(1);
  });
});

function supervisors(): SupervisorMocks {
  const businessRequest = vi.fn();
  const codexRequest = vi.fn().mockResolvedValue({});
  const codexIsThreadUnmaterialized = vi.fn(() => false);
  return {
    business: { request: businessRequest } as unknown as BusinessSupervisor,
    businessRequest,
    codex: {
      defaultCwd: vi.fn(() => '/workspace/limeshot'),
      isThreadUnmaterialized: codexIsThreadUnmaterialized,
      request: codexRequest,
      subscribe: vi.fn(() => vi.fn()),
      subscribeInteractions: vi.fn(() => vi.fn()),
    } as unknown as CodexSupervisor,
    codexIsThreadUnmaterialized,
    codexRequest,
  };
}

function codexThread(id: string, cwd: string, name: string, source: 'cli' | 'exec' = 'cli') {
  return {
    id,
    name,
    preview: '',
    cwd,
    source,
    parentThreadId: null,
    ephemeral: false,
    createdAt: 1,
    updatedAt: 2,
    recencyAt: 2,
  };
}

function target(): ConversationTargetInput {
  return { projectId: 'project-1', conversationId: 'conversation-1', threadId: 'thread-1' };
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = electron.handlers.get(channel);
  if (!handler) throw new Error(`missing IPC handler: ${channel}`);
  return handler({ sender: {} }, ...args);
}
