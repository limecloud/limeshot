// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import type { AgentEvent, AgentInteractionSubmitResult, AgentPendingInteractionProjection, AgentProjectConversationSummary } from '../../shared/desktop';

const profiles = [
  ['general', 'profile.general.name', 'profile.general.description'],
  ['short_form', 'profile.shortForm.name', 'profile.shortForm.description'],
  ['visual_transform', 'profile.visualTransform.name', 'profile.visualTransform.description'],
  ['talking_video', 'profile.talkingVideo.name', 'profile.talkingVideo.description'],
  ['commerce_video', 'profile.commerceVideo.name', 'profile.commerceVideo.description'],
].map(([profileId, nameKey, descriptionKey]) => ({ profileId, nameKey, descriptionKey, executionState: 'preparing' as const }));

const foundation = {
  business: { status: 'ready', serverPid: 4321, protocolVersion: 5, startedAtEpochMs: 1 },
  profiles,
  skills: [{ skillId: 'core', profileId: 'all', nameKey: 'core', descriptionKey: 'core', instructionPath: 'core' }],
  tools: [{ name: 'project_read', description: 'read project', inputSchema: {} }],
  contracts: Array.from({ length: 14 }, (_, index) => ({ artifactType: `artifact-${index}`, schemaVersion: 1, nameKey: `artifact-${index}` })),
  capabilities: [{ capabilityId: 'image.generate', nameKey: 'image', inputModalities: [], outputModalities: [], availability: 'unavailable' as const, reasonKey: 'provider' }],
  services: [
    { serviceId: 'media.probe', nameKey: 'probe', kind: 'local' as const, state: 'blocked' as const, reasonKey: 'ffmpeg', capabilityIds: [] },
    { serviceId: 'media.assemble', nameKey: 'assemble', kind: 'local' as const, state: 'blocked' as const, reasonKey: 'ffmpeg', capabilityIds: [] },
  ],
  resources: [{ resourceId: 'ffmpeg', kind: 'media_runtime' as const, required: true, platformKey: 'darwin-arm64', version: null, state: 'blocked' as const, detailCode: 'missing', executableNames: [] }],
};

const executionApi = {
  sourceAsset: { import: vi.fn(async () => null) },
  execution: { read: vi.fn(async () => ({ sourceAssets: [], taskRuns: [], mediaJobs: [], artifacts: [], deliverables: [] })) },
  task: { start: vi.fn(), cancel: vi.fn(), retry: vi.fn() },
  deliverable: { confirm: vi.fn() },
};

const projectManagementApi = () => ({
  rename: vi.fn(),
  archive: vi.fn(),
  reveal: vi.fn(),
});

const conversationImportApi = () => ({
  listImportCandidates: vi.fn(async () => []),
  importConversation: vi.fn(),
  renameConversation: vi.fn(),
  archiveConversation: vi.fn(),
  deleteConversation: vi.fn(),
  revealConversation: vi.fn(),
  copyConversationWorkingDirectory: vi.fn(),
  copyConversationSessionId: vi.fn(),
  listProjectConversations: vi.fn(async () => ({ conversations: [] })),
  archiveProjectConversations: vi.fn(async () => ({ archivedThreadIds: [], failedThreadIds: [] })),
});

const boundConversation = (projectId: string, threadId: string, title: string): AgentProjectConversationSummary => ({
  projectId,
  conversationId: 'main',
  threadId,
  title,
  updatedAtEpochMs: 1,
  origin: 'limeshot',
  client: 'appServer',
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('projects the business foundation and selects a local folder from the composer', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-new', name: '新项目', profileId: 'general', state: 'draft' as const,
      workspaceName: '新项目', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-new', projectId: project.projectId, version: 1, completeness: 'incomplete' as const,
      missingFields: ['subject'], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    const openProject = vi.fn(async () => ({ project, brief }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: openProject, list: vi.fn(async () => []), read: vi.fn(), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listConversations: vi.fn(async () => []),
        inspectSubThread: vi.fn(),
        listInteractions: vi.fn(async () => []),
        submitInteraction: vi.fn(),
        openInteractionExternal: vi.fn(),
        startConversation: vi.fn(async () => ({ conversationId: 'main', threadId: 'thread-1', turns: [], access: 'active' as const })),
        startTurn: vi.fn(async () => ({ threadId: 'thread-1', turnId: 'turn-1' })),
        interrupt: vi.fn(async () => undefined),
        subscribe: vi.fn(() => () => undefined),
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };
    render(React.createElement(App));
    await screen.findByTestId('home-workspace');
    fireEvent.click(screen.getByRole('button', { name: /全能模式/ }));
    expect(await screen.findByTestId('profile-general')).toBeTruthy();
    expect(screen.getAllByTestId(/^profile-/)).toHaveLength(5);
    fireEvent.click(screen.getByTestId('profile-general'));
    expect(screen.getByTestId('runtime-status').getAttribute('data-runtime-source')).toBe('business-service');
    expect(screen.getByTestId('runtime-status').getAttribute('title')).toContain('4321');
    expect(screen.getByTestId('home-workspace')).toBeTruthy();
    expect(screen.getByText('还没有项目')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '新建项目' })).toBeNull();
    expect(screen.getByTestId('home-project-context').textContent).toContain('无项目');
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /选择或新建文件夹/ }));
    await waitFor(() => expect(openProject).toHaveBeenCalledWith({ profileId: 'general', language: 'zh-CN' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('home-workspace')).toBeTruthy();
    expect(screen.queryByTestId('agent-panel')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('home-project-context').textContent).toContain(project.name));
    fireEvent.click(screen.getByRole('button', { name: '整理最近对话' }));
    expect(screen.getByTestId('recent-menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '最近更新' }));
    expect(localStorage.getItem('limeshot.sidebar.recentSort')).toBe('updated');
    fireEvent.click(screen.getByRole('button', { name: `${project.name} 项目菜单` }));
    expect(screen.getByTestId(`project-menu-${project.projectId}`).parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶项目' }));
    expect(localStorage.getItem('limeshot.sidebar.pinnedProjects')).toContain(project.projectId);
    fireEvent.click(screen.getByRole('button', { name: `${project.name} 项目菜单` }));
    expect(screen.getByRole('menuitem', { name: '取消置顶' })).toBeTruthy();
  });

  it('keeps the creation workspace unchanged when opening a project is canceled', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const openProject = vi.fn(async () => null);
    const startConversation = vi.fn();
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: openProject, list: vi.fn(async () => []), read: vi.fn(), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listConversations: vi.fn(async () => []),
        inspectSubThread: vi.fn(),
        listInteractions: vi.fn(async () => []),
        submitInteraction: vi.fn(),
        openInteractionExternal: vi.fn(),
        startConversation,
        startTurn: vi.fn(),
        interrupt: vi.fn(async () => undefined),
        subscribe: vi.fn(() => () => undefined),
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    await screen.findByTestId('home-workspace');
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /选择或新建文件夹/ }));

    await waitFor(() => expect(openProject).toHaveBeenCalledWith({ profileId: 'general', language: 'zh-CN' }));
    expect(screen.getByTestId('home-workspace')).toBeTruthy();
    expect(screen.queryByTestId('agent-panel')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('home-project-context').textContent).toContain('无项目');
    expect(startConversation).not.toHaveBeenCalled();
  });

  it('starts a new conversation in the local folder selected from the composer menu', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-folder', name: '本地视频', profileId: 'general', state: 'draft' as const,
      workspaceName: '本地视频', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-folder', projectId: project.projectId, version: 1, completeness: 'incomplete' as const,
      missingFields: ['subject'], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    const openProject = vi.fn(async () => ({ project, brief }));
    const startConversation = vi.fn(async (input: { conversationId: string }) => ({
      conversationId: input.conversationId,
      threadId: 'thread-folder',
      turns: [],
      access: 'active' as const,
    }));
    const startTurn = vi.fn(async () => ({ threadId: 'thread-folder', turnId: 'turn-folder' }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: openProject, list: vi.fn(async () => []), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: { ...conversationImportApi(), listConversations: vi.fn(async () => []), inspectSubThread: vi.fn(), listInteractions: vi.fn(async () => []), submitInteraction: vi.fn(), openInteractionExternal: vi.fn(), startConversation, startTurn, interrupt: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined) },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    await screen.findByTestId('home-workspace');
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /选择或新建文件夹/ }));
    await waitFor(() => expect(screen.getByTestId('home-project-context').textContent).toContain(project.name));
    const composer = screen.getByLabelText('描述制作需求');
    fireEvent.change(composer, { target: { value: '为这个目录生成制作计划' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false });

    await waitFor(() => expect(startConversation).toHaveBeenCalledWith({
      projectId: project.projectId,
      conversationId: expect.stringMatching(/^conversation-/),
    }));
    await waitFor(() => expect(startTurn).toHaveBeenCalledWith({
      projectId: project.projectId,
      conversationId: expect.stringMatching(/^conversation-/),
      threadId: 'thread-folder',
      text: '为这个目录生成制作计划',
    }));
  });

  it('edits a project from its home without creating a Codex thread', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-1', name: '口播项目', profileId: 'talking_video', state: 'draft' as const,
      workspaceName: 'workspace', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-1', projectId: 'project-1', version: 1, completeness: 'incomplete' as const,
      missingFields: ['audience'], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '产品介绍', audience: '', platform: '短视频', targetDurationSeconds: 30, aspectRatio: '9:16', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    const updateBrief = vi.fn(async () => ({ brief: { ...brief, version: 2, completeness: 'workable' as const } }));
    const startConversation = vi.fn(async () => ({ conversationId: 'main', threadId: 'thread-1', turns: [], access: 'active' as const }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief },
      agent: { ...conversationImportApi(), listConversations: vi.fn(async () => []), inspectSubThread: vi.fn(), listInteractions: vi.fn(async () => []), submitInteraction: vi.fn(), openInteractionExternal: vi.fn(), startConversation, startTurn: vi.fn(), interrupt: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined) },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };
    render(React.createElement(App));
    await screen.findByTestId('project-project-1');
    fireEvent.click(screen.getByRole('button', { name: '口播项目 项目菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑项目' }));
    expect(await screen.findByTestId('home-workspace')).toBeTruthy();
    expect(screen.queryByTestId('agent-panel')).toBeNull();
    expect(await screen.findByTestId('project-overview')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('目标受众'), { target: { value: '创作者' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 Brief' }));
    expect(await screen.findByText('可生成计划')).toBeTruthy();
    expect(updateBrief).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1 }));
    expect(startConversation).not.toHaveBeenCalled();
  });

  it('keeps project selection on Project Home and opens nested history through its owner target', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-conversation', name: '会话项目', profileId: 'general', state: 'draft' as const,
      workspaceName: 'workspace', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-conversation', projectId: project.projectId, version: 1, completeness: 'incomplete' as const,
      missingFields: ['subject'], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    const projectConversation = {
      projectId: project.projectId,
      conversationId: 'conversation-history',
      threadId: 'thread-history',
      title: '历史项目会话',
      updatedAtEpochMs: 2,
      origin: 'limeshot' as const,
      client: 'appServer' as const,
    };
    const startConversation = vi.fn(async (input: { conversationId: string }) => ({
      conversationId: input.conversationId,
      threadId: projectConversation.threadId,
      turns: [{
        id: 'turn-history',
        status: 'completed' as const,
        itemsView: 'full' as const,
        items: [{ id: 'item-history', type: 'userMessage' as const, kind: 'user' as const, text: '旧会话内容', content: [{ type: 'text' as const, text: '旧会话内容', elements: [] }] }],
      }],
      access: 'active' as const,
    }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listProjectConversations: vi.fn(async () => ({ conversations: [projectConversation] })),
        listConversations: vi.fn(async () => [projectConversation]),
        inspectSubThread: vi.fn(), listInteractions: vi.fn(async () => []), submitInteraction: vi.fn(), openInteractionExternal: vi.fn(),
        startConversation, startTurn: vi.fn(), interrupt: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined),
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    await screen.findByTestId(`project-conversation-${projectConversation.threadId}`);
    expect(screen.queryByTestId(`standalone-${projectConversation.threadId}`)).toBeNull();

    fireEvent.click(screen.getByTestId(`project-${project.projectId}`));
    expect(await screen.findByTestId('home-workspace')).toBeTruthy();
    expect(screen.getByTestId('home-project-context').textContent).toContain(project.name);
    expect(startConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId(`project-conversation-${projectConversation.threadId}`));
    await waitFor(() => expect(startConversation).toHaveBeenCalledWith({
      projectId: project.projectId,
      conversationId: projectConversation.conversationId,
    }));
    await waitFor(() => expect(document.querySelector('.agent-timeline')?.textContent).toContain('旧会话内容'));

    const newConversationButton = screen.getAllByRole('button', { name: '新建任务' })[0];
    fireEvent.click(newConversationButton);

    const home = await screen.findByTestId('home-workspace');
    const composer = screen.getByLabelText('描述制作需求') as HTMLTextAreaElement;
    expect(home).toBeTruthy();
    expect(screen.queryByTestId('agent-panel')).toBeNull();
    expect(composer.value).toBe('');
    expect(document.activeElement).toBe(composer);
    expect(screen.getByTestId('home-project-context').textContent).toContain(project.name);
    expect(startConversation).toHaveBeenCalledTimes(1);
  });

  it('starts a standalone conversation and sends the home request as its first Codex turn', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const startConversation = vi.fn(async (input: { conversationId: string }) => ({
      conversationId: input.conversationId,
      threadId: 'thread-new',
      turns: [],
      access: 'active' as const,
    }));
    const startTurn = vi.fn(async () => ({ threadId: 'thread-new', turnId: 'turn-new' }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => []), read: vi.fn(), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listConversations: vi.fn(async () => []),
        inspectSubThread: vi.fn(),
        listInteractions: vi.fn(async () => []),
        submitInteraction: vi.fn(),
        openInteractionExternal: vi.fn(),
        startConversation,
        startTurn,
        interrupt: vi.fn(async () => undefined),
        subscribe: vi.fn(() => () => undefined),
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };
    render(React.createElement(App));
    const composer = await screen.findByLabelText('描述制作需求');
    fireEvent.change(composer, { target: { value: '帮我生成一个视频脚本' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false });
    await waitFor(() => expect(startConversation).toHaveBeenCalledWith(expect.objectContaining({
      projectId: null,
      conversationId: expect.stringMatching(/^standalone-/),
    })));
    await waitFor(() => expect(startTurn).toHaveBeenCalledWith({
      projectId: null,
      conversationId: expect.stringMatching(/^standalone-/),
      threadId: 'thread-new',
      text: '帮我生成一个视频脚本',
    }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a semantic sub-thread as read only and returns to the parent conversation', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-agents', name: '协作项目', profileId: 'general', state: 'draft' as const,
      workspaceName: 'workspace', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-agents', projectId: project.projectId, version: 1, completeness: 'workable' as const,
      missingFields: [], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '协作任务', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    const inspectSubThread = vi.fn(async () => ({
      threadId: 'thread-child', parentThreadId: 'thread-parent', agentNickname: 'reviewer', agentRole: 'review',
      turns: [{ id: 'turn-child', status: 'completed' as const, itemsView: 'full' as const, items: [{ id: 'child-message', type: 'agentMessage' as const, kind: 'assistant' as const, text: '子线程检查完成' }] }],
    }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listProjectConversations: vi.fn(async () => ({ conversations: [boundConversation(project.projectId, 'thread-parent', '协作任务')] })),
        listConversations: vi.fn(async () => []), inspectSubThread, listInteractions: vi.fn(async () => []), submitInteraction: vi.fn(), openInteractionExternal: vi.fn(),
        startConversation: vi.fn(async () => ({
          conversationId: 'main', threadId: 'thread-parent', access: 'active' as const,
          turns: [{ id: 'turn-parent', status: 'completed' as const, itemsView: 'full' as const, items: [{
            id: 'collab', type: 'collabAgentToolCall' as const, kind: 'activity' as const, text: '检查素材', status: 'completed' as const,
            tool: 'spawnAgent' as const, senderThreadId: 'thread-parent', receiverThreadIds: ['thread-child'],
            agents: [{ threadId: 'thread-child', status: 'completed' as const, message: '素材检查完成' }],
          }] }],
        })),
        startTurn: vi.fn(), interrupt: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined),
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    fireEvent.click(await screen.findByTestId('project-conversation-thread-parent'));
    fireEvent.click(await screen.findByText('已创建'));
    fireEvent.click(await screen.findByRole('button', { name: '查看子 Agent 对话: 素材检查完成' }));

    expect(await screen.findByText('子线程检查完成')).toBeTruthy();
    expect(inspectSubThread).toHaveBeenCalledWith({ parentThreadId: 'thread-parent', threadId: 'thread-child' });
    expect((screen.getByLabelText('正在查看子 Agent，对话为只读') as HTMLTextAreaElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '返回上级 Agent' }));
    expect(await screen.findByText('已创建')).toBeTruthy();
    expect(screen.getByLabelText('描述要求或补充制作信息')).toBeTruthy();
  });

  it('does not expose upstream Codex error details in the conversation', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-error', name: '异常项目', profileId: 'general', state: 'draft' as const,
      workspaceName: 'workspace', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-error', projectId: project.projectId, version: 1, completeness: 'incomplete' as const,
      missingFields: ['subject'], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listProjectConversations: vi.fn(async () => ({ conversations: [boundConversation(project.projectId, 'thread-error', '异常会话')] })),
        listConversations: vi.fn(async () => []),
        inspectSubThread: vi.fn(),
        listInteractions: vi.fn(async () => []),
        submitInteraction: vi.fn(),
        openInteractionExternal: vi.fn(),
        startConversation: vi.fn(async () => ({
          conversationId: 'main',
          threadId: 'thread-error',
          turns: [{ id: 'turn-error', status: 'failed' as const, itemsView: 'full' as const, items: [], errorMessage: 'provider failed with internal credential details' }],
          access: 'active' as const,
        })),
        startTurn: vi.fn(),
        interrupt: vi.fn(async () => undefined),
        subscribe: vi.fn(() => () => undefined),
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };
    render(React.createElement(App));
    fireEvent.click(await screen.findByTestId('project-conversation-thread-error'));
    expect(await screen.findByText('消息发送失败')).toBeTruthy();
    expect(screen.queryByText(/credential details/)).toBeNull();
  });

  it('restores pending interactions, prevents duplicate submit, and receives other-thread requests', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-interactions', name: '交互项目', profileId: 'general', state: 'draft' as const,
      workspaceName: 'workspace', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-interactions', projectId: project.projectId, version: 1, completeness: 'workable' as const,
      missingFields: [], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '审批交互', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    const restored: AgentPendingInteractionProjection = {
      interactionId: 'command-restored', actionToken: 'token-restored', threadId: 'thread-interactions', turnId: 'turn-1', itemId: 'command-1',
      createdAt: 1, status: 'pending', kind: 'commandApproval', command: 'npm test', cwd: 'workspace/project', actions: [], decisions: ['accept', 'decline'], risks: ['shell'],
    };
    const other: AgentPendingInteractionProjection = {
      interactionId: 'permission-other', actionToken: 'token-other', threadId: 'thread-other', turnId: 'turn-other',
      createdAt: 2, status: 'pending', kind: 'permissionApproval', cwd: 'workspace/other', environmentLabel: 'remote-build', networkRequested: true,
      readPathCount: 1, writePathCount: 0, decisions: ['grantTurn', 'deny'], risks: ['network'],
    };
    const listInteractions = vi.fn(async () => [restored]);
    let eventListener: ((event: AgentEvent) => void) | undefined;
    const subscribe = vi.fn((listener: (event: AgentEvent) => void) => {
      eventListener = listener;
      return () => undefined;
    });
    let resolveSubmit: ((result: AgentInteractionSubmitResult) => void) | undefined;
    const submitInteraction = vi.fn(() => new Promise<AgentInteractionSubmitResult>((resolve) => {
      resolveSubmit = resolve;
    }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listProjectConversations: vi.fn(async () => ({ conversations: [boundConversation(project.projectId, restored.threadId, '审批交互')] })),
        listConversations: vi.fn(async () => []), inspectSubThread: vi.fn(), listInteractions, submitInteraction, openInteractionExternal: vi.fn(),
        startConversation: vi.fn(async () => ({ conversationId: 'main', threadId: 'thread-interactions', turns: [], access: 'active' as const })),
        startTurn: vi.fn(), interrupt: vi.fn(async () => undefined), subscribe,
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    fireEvent.click(await screen.findByTestId(`project-conversation-${restored.threadId}`));
    expect(await screen.findByText('npm test')).toBeTruthy();
    expect(listInteractions).toHaveBeenCalledTimes(1);

    const allow = await screen.findByRole('button', { name: '允许一次' });
    fireEvent.click(allow);
    fireEvent.click(allow);
    await waitFor(() => expect(submitInteraction).toHaveBeenCalledTimes(1));
    expect(screen.getByText('正在提交')).toBeTruthy();
    expect((allow as HTMLButtonElement).disabled).toBe(true);

    await act(async () => resolveSubmit?.({ interactionId: restored.interactionId, accepted: true }));
    await waitFor(() => expect(screen.queryByRole('region', { name: '需要确认' })).toBeNull());

    await act(async () => eventListener?.({ type: 'interaction.updated', threadId: other.threadId, interaction: other }));
    fireEvent.click(screen.getByRole('tab', { name: /其他对话/ }));
    expect(await screen.findByText('remote-build')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '本轮授权' }));
    expect(submitInteraction).toHaveBeenLastCalledWith({
      interactionId: 'permission-other', actionToken: 'token-other', kind: 'permissionApproval', decision: 'grantTurn',
    });
  });

  it('shows native Codex history in Recent automatically and opens it read only', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const candidate = {
      threadId: 'thread-imported', title: '外部 Codex 对话', updatedAtEpochMs: 1_785_000_000_000,
      origin: 'codex' as const, client: 'cli' as const, workspaceLabel: 'workspace',
    };
    const importConversation = vi.fn(async () => candidate);
    const startConversation = vi.fn(async () => ({
      conversationId: candidate.threadId,
      threadId: candidate.threadId,
      access: 'readOnly' as const,
      turns: [{
        id: 'turn-imported', status: 'completed' as const, itemsView: 'full' as const,
        items: [
          { id: 'user-imported', type: 'userMessage' as const, kind: 'user' as const, text: '历史问题', content: [{ type: 'text' as const, text: '历史问题', elements: [] }] },
          { id: 'agent-imported', type: 'agentMessage' as const, kind: 'assistant' as const, text: '历史回答', phase: 'final_answer' },
        ],
      }],
    }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => []), read: vi.fn(), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(), listConversations: vi.fn(async () => [candidate]), importConversation,
        inspectSubThread: vi.fn(), listInteractions: vi.fn(async () => []), submitInteraction: vi.fn(), openInteractionExternal: vi.fn(),
        startConversation, startTurn: vi.fn(), interrupt: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined),
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    await screen.findByTestId('home-workspace');
    fireEvent.click(await screen.findByTestId(`standalone-${candidate.threadId}`));

    await waitFor(() => expect(startConversation).toHaveBeenCalledWith({ projectId: null, conversationId: candidate.threadId, threadId: candidate.threadId }));
    expect(await screen.findByText('历史回答')).toBeTruthy();
    expect(screen.queryByText('final_answer')).toBeNull();
    expect(screen.getByTestId('agent-panel').getAttribute('data-agent-state')).toBe('readOnly');
    expect(screen.getByTestId(`standalone-${candidate.threadId}`)).toBeTruthy();
    expect(importConversation).not.toHaveBeenCalled();
    expect(localStorage.getItem('limeshot.conversations.imported')).toBeNull();
  });

  it('connects semantic activity events to the conversation header and composer', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-activity', name: '状态项目', profileId: 'general', state: 'draft' as const,
      workspaceName: 'workspace', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-activity', projectId: project.projectId, version: 1, completeness: 'workable' as const,
      missingFields: [], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '状态投影', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    let eventListener: ((event: AgentEvent) => void) | undefined;
    const subscribe = vi.fn((listener: (event: AgentEvent) => void) => {
      eventListener = listener;
      return () => undefined;
    });
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { ...projectManagementApi(), open: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: {
        ...conversationImportApi(),
        listProjectConversations: vi.fn(async () => ({ conversations: [boundConversation(project.projectId, 'thread-activity', '状态投影')] })),
        listConversations: vi.fn(async () => []), inspectSubThread: vi.fn(), listInteractions: vi.fn(async () => []), submitInteraction: vi.fn(), openInteractionExternal: vi.fn(),
        startConversation: vi.fn(async () => ({ conversationId: 'main', threadId: 'thread-activity', turns: [], access: 'active' as const })),
        startTurn: vi.fn(), interrupt: vi.fn(async () => undefined), subscribe,
      },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    fireEvent.click(await screen.findByTestId('project-conversation-thread-activity'));
    const composer = await screen.findByLabelText('描述要求或补充制作信息') as HTMLTextAreaElement;

    await act(async () => eventListener?.({
      type: 'thread.context.updated',
      threadId: 'thread-activity',
      patch: { lifecycle: 'active', model: { current: 'gpt-5.4' }, environment: { state: 'connected', label: 'remote-build' } },
    }));
    expect(screen.queryByText(/gpt-5\.4/)).toBeNull();
    expect(document.querySelector('.conversation-workspace > .conversation-status-surface')).toBeNull();
    fireEvent.click(screen.getByTitle('打开对话运行状态'));
    expect(await screen.findByText(/gpt-5\.4/)).toBeTruthy();
    expect(screen.getByText(/remote-build/)).toBeTruthy();
    expect(screen.getByRole('complementary', { name: '对话运行状态' }).querySelector('.conversation-status-surface')).toBeTruthy();

    await act(async () => eventListener?.({
      type: 'notice.updated',
      notice: { id: 'warning-1', scope: 'thread', threadId: 'thread-activity', level: 'warning', kind: 'warning', message: 'Check settings' },
    }));
    expect(await screen.findByText('Check settings')).toBeTruthy();
    fireEvent.click(screen.getByTitle('关闭通知'));
    expect(screen.queryByText('Check settings')).toBeNull();

    await act(async () => eventListener?.({
      type: 'composer.search.updated',
      search: { sessionId: 'search-1', query: 'App', status: 'searching', files: [{ path: 'src/App.tsx', name: 'App.tsx' }] },
    }));
    fireEvent.click(await screen.findByRole('button', { name: /App\.tsx/ }));
    expect(composer.value).toBe('@src/App.tsx ');

    await act(async () => eventListener?.({
      type: 'diagnostic.recorded',
      diagnostic: { id: 'protocol:global', domain: 'protocol', level: 'warning', code: 'unknownNotification' },
    }));
    fireEvent.click(await screen.findByText('运行诊断'));
    expect(screen.getByText('收到未知 Codex 事件')).toBeTruthy();
    expect(screen.queryByText('future/privateNotification')).toBeNull();

    await act(async () => eventListener?.({
      type: 'thread.context.updated', threadId: 'thread-activity', patch: { lifecycle: 'archived' },
    }));
    await waitFor(() => expect(composer.disabled).toBe(true));
  });
});
