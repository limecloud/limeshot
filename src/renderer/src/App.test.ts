// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

const profiles = [
  ['general', 'profile.general.name', 'profile.general.description'],
  ['short_form', 'profile.shortForm.name', 'profile.shortForm.description'],
  ['visual_transform', 'profile.visualTransform.name', 'profile.visualTransform.description'],
  ['talking_video', 'profile.talkingVideo.name', 'profile.talkingVideo.description'],
  ['commerce_video', 'profile.commerceVideo.name', 'profile.commerceVideo.description'],
].map(([profileId, nameKey, descriptionKey]) => ({ profileId, nameKey, descriptionKey, executionState: 'preparing' as const }));

const foundation = {
  business: { status: 'ready', serverPid: 4321, protocolVersion: 4, startedAtEpochMs: 1 },
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('projects the business foundation through semantic IPC', async () => {
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
    const createProject = vi.fn(async () => ({ project, brief }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { create: createProject, list: vi.fn(async () => []), read: vi.fn(), updateBrief: vi.fn() },
      agent: {
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
    expect(await screen.findByTestId('profile-general')).toBeTruthy();
    expect(screen.getAllByTestId(/^profile-/)).toHaveLength(5);
    expect(screen.getByTestId('runtime-status').getAttribute('data-runtime-source')).toBe('business-service');
    expect(screen.getByText(/4321/)).toBeTruthy();
    expect(screen.getByTestId('home-workspace')).toBeTruthy();
    expect(screen.getByText('还没有项目')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ profileId: 'general', language: 'zh-CN', initialSubject: undefined }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByTestId('agent-panel')).toBeTruthy();
  });

  it('reads a selected project and saves a versioned Brief through semantic IPC', async () => {
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
    const startTurn = vi.fn(async () => ({ threadId: 'thread-1', turnId: 'turn-1' }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { create: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief },
      agent: { startConversation, startTurn, interrupt: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined) },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };
    render(React.createElement(App));
    fireEvent.click(await screen.findByTestId('project-project-1'));
    expect(await screen.findByTestId('agent-panel')).toBeTruthy();
    fireEvent.click(screen.getByTitle('打开项目详情'));
    expect(await screen.findByTestId('project-overview')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('目标受众'), { target: { value: '创作者' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 Brief' }));
    expect(await screen.findByText('可生成计划')).toBeTruthy();
    expect(updateBrief).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1 }));
    expect(startConversation).toHaveBeenCalledWith({ projectId: 'project-1', conversationId: 'main' });
    fireEvent.change(screen.getByLabelText('描述要求或补充制作信息'), { target: { value: '生成一个口播制作计划' } });
    fireEvent.click(screen.getByTitle('发送'));
    expect(startTurn).toHaveBeenCalledWith({ projectId: 'project-1', conversationId: 'main', text: '生成一个口播制作计划' });
  });

  it('opens a writable new-conversation draft and queues the first turn while Codex starts', async () => {
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
    let resolveNewConversation: ((result: { conversationId: string; threadId: string; turns: []; access: 'active' }) => void) | undefined;
    const startConversation = vi.fn(({ conversationId }: { conversationId: string }) => {
      if (conversationId === 'main') {
        return Promise.resolve({
          conversationId,
          threadId: 'thread-main',
          turns: [{
            id: 'turn-main',
            status: 'completed' as const,
            items: [{ id: 'item-main', kind: 'user' as const, text: '旧会话内容' }],
          }],
          access: 'active' as const,
        });
      }
      return new Promise<{ conversationId: string; threadId: string; turns: []; access: 'active' }>((resolve) => {
        resolveNewConversation = resolve;
      });
    });
    const startTurn = vi.fn(async () => ({ threadId: 'thread-new', turnId: 'turn-new' }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { create: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: { startConversation, startTurn, interrupt: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined) },
      plan: { list: vi.fn(async () => ({ plans: [] })), read: vi.fn() },
      approval: { decide: vi.fn() },
      ...executionApi,
    };

    render(React.createElement(App));
    fireEvent.click(await screen.findByTestId(`project-${project.projectId}`));
    await waitFor(() => expect(document.querySelector('.agent-timeline')?.textContent).toContain('旧会话内容'));

    const newConversationButton = screen.getAllByRole('button', { name: '新建会话' })[0];
    fireEvent.click(newConversationButton);

    const composer = screen.getByLabelText('描述要求或补充制作信息') as HTMLTextAreaElement;
    await waitFor(() => expect(screen.getByTestId('agent-panel').getAttribute('data-agent-state')).toBe('creating'));
    expect(document.querySelector('.agent-timeline')?.textContent).not.toContain('旧会话内容');
    expect(composer.disabled).toBe(false);
    expect(document.activeElement).toBe(composer);
    expect((newConversationButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(composer, { target: { value: '新会话的第一条消息' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false });
    expect(startTurn).not.toHaveBeenCalled();

    const newConversationId = startConversation.mock.calls[1]?.[0].conversationId;
    expect(newConversationId).toMatch(/^conversation-/);
    resolveNewConversation?.({ conversationId: newConversationId, threadId: 'thread-new', turns: [], access: 'active' });
    await waitFor(() => expect(startTurn).toHaveBeenCalledWith({
      projectId: project.projectId,
      conversationId: newConversationId,
      text: '新会话的第一条消息',
    }));
    await waitFor(() => expect(composer.value).toBe(''));
  });

  it('creates a managed project and sends the home request as the first Codex turn', async () => {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'zh-CN' });
    const project = {
      projectId: 'project-new', name: 'campaign', profileId: 'general', state: 'draft' as const,
      workspaceName: 'campaign', createdAtEpochMs: 1, updatedAtEpochMs: 1,
    };
    const brief = {
      briefId: 'brief-new', projectId: project.projectId, version: 1, completeness: 'incomplete' as const,
      missingFields: ['audience'], conflicts: [], createdAtEpochMs: 1,
      content: { subject: '帮我生成一个视频脚本', audience: '', platform: '', targetDurationSeconds: null, aspectRatio: '', language: 'zh-CN', style: '', mustInclude: [], prohibited: [], deliveryFormat: 'mp4' },
    };
    const createProject = vi.fn(async () => ({ project, brief }));
    const startTurn = vi.fn(async () => ({ threadId: 'thread-new', turnId: 'turn-new' }));
    window.limeShot = {
      foundation: { read: vi.fn(async () => foundation) },
      project: { create: createProject, list: vi.fn(async () => []), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: {
        startConversation: vi.fn(async () => ({ conversationId: 'main', threadId: 'thread-new', turns: [], access: 'active' as const })),
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
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({
      profileId: 'general', language: 'zh-CN', initialSubject: '帮我生成一个视频脚本',
    }));
    await waitFor(() => expect(startTurn).toHaveBeenCalledWith({
      projectId: 'project-new', conversationId: 'main', text: '帮我生成一个视频脚本',
    }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
      project: { create: vi.fn(), list: vi.fn(async () => [project]), read: vi.fn(async () => ({ project, brief })), updateBrief: vi.fn() },
      agent: {
        startConversation: vi.fn(async () => ({
          conversationId: 'main',
          threadId: 'thread-error',
          turns: [{ id: 'turn-error', status: 'failed' as const, items: [], errorMessage: 'provider failed with internal credential details' }],
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
    fireEvent.click(await screen.findByTestId('project-project-error'));
    expect(await screen.findByText('消息发送失败')).toBeTruthy();
    expect(screen.queryByText(/credential details/)).toBeNull();
  });
});
