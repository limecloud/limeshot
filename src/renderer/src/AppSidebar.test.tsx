// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectSummary } from '@business/generated';
import type { AgentConversationSummary } from '../../shared/desktop';
import { AppSidebar } from './AppSidebar';
import { createTranslator } from './i18n';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const project = (index: number): ProjectSummary => ({
  projectId: `project-${index}`,
  name: `项目 ${index}`,
  profileId: 'general',
  state: 'draft',
  workspaceName: `workspace-${index}`,
  createdAtEpochMs: index,
  updatedAtEpochMs: index,
});

const conversation = (index: number): AgentConversationSummary => ({
  threadId: `thread-${index}`,
  title: `最近对话 ${index}`,
  updatedAtEpochMs: index,
  origin: 'limeshot',
  client: 'vscode',
});

function renderSidebar(overrides: Partial<ComponentProps<typeof AppSidebar>> = {}) {
  return render(
    <AppSidebar
      projects={[]}
      projectConversations={{}}
      projectConversationFailedIds={[]}
      conversations={[]}
      conversationTitle=""
      searchOpen={false}
      searchQuery=""
      footer={null}
      onCollapse={vi.fn()}
      onNewConversation={vi.fn()}
      onConversationSelect={vi.fn()}
      onSearchOpenChange={vi.fn()}
      onSearchQueryChange={vi.fn()}
      onProjectSelect={vi.fn()}
      onProjectConversationSelect={vi.fn()}
      onProjectEdit={vi.fn()}
      onProjectReveal={vi.fn().mockResolvedValue(undefined)}
      onProjectMarkAllRead={vi.fn().mockResolvedValue([])}
      onProjectRename={vi.fn().mockResolvedValue(undefined)}
      onProjectArchiveConversations={vi.fn().mockResolvedValue(undefined)}
      onProjectRemove={vi.fn().mockResolvedValue(undefined)}
      onConversationRename={vi.fn().mockResolvedValue(undefined)}
      onConversationArchive={vi.fn().mockResolvedValue(undefined)}
      onConversationDelete={vi.fn().mockResolvedValue(undefined)}
      onConversationReveal={vi.fn().mockResolvedValue(undefined)}
      onConversationCopyWorkingDirectory={vi.fn().mockResolvedValue(undefined)}
      onConversationCopySessionId={vi.fn().mockResolvedValue(undefined)}
      t={createTranslator('zh-CN')}
      {...overrides}
    />,
  );
}

describe('AppSidebar', () => {
  it('closes an open recent menu when another sidebar action is pressed', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: '整理最近对话' }));
    expect(screen.getByTestId('recent-menu')).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole('button', { name: '新建任务' }));
    expect(screen.queryByTestId('recent-menu')).toBeNull();
  });

  it('moves focus through menu items with the keyboard', () => {
    renderSidebar({ projects: [project(1)] });

    fireEvent.click(screen.getByRole('button', { name: '项目 1 项目菜单' }));
    const menu = screen.getByTestId('project-menu-project-1');
    const items = within(menu).getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(document.activeElement ?? menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document.activeElement ?? menu, { key: 'End' });
    expect(document.activeElement).toBe(items.at(-1));
  });

  it('keeps project conversations nested and standalone conversations in Recent', () => {
    renderSidebar({
      projects: [project(1), project(2)],
      conversations: [conversation(1)],
      selectedProjectId: 'project-1',
      activeProjectId: 'project-1',
      conversationTitle: '项目内当前对话',
      activeProjectConversation: {
        ...conversation(9),
        projectId: 'project-1',
        conversationId: 'conversation-9',
        title: '项目内当前对话',
      },
    });

    const projectList = screen.getByTestId('project-list');
    const recentList = screen.getByTestId('recent-list');
    const selectedProject = screen.getByTestId('project-project-1').closest('.project-nav-group');

    expect(within(projectList).getByText('项目内当前对话')).toBeTruthy();
    expect(selectedProject?.querySelector('.project-conversation-nav-item')?.textContent).toContain('项目内当前对话');
    expect(within(projectList).queryByTestId('standalone-thread-1')).toBeNull();
    expect(within(recentList).getByTestId('standalone-thread-1')).toBeTruthy();
  });

  it('uses the Codex first-page limits for Projects and Recent', () => {
    renderSidebar({
      projects: Array.from({ length: 6 }, (_, index) => project(index + 1)),
      conversations: Array.from({ length: 11 }, (_, index) => conversation(index + 1)),
    });

    expect(screen.queryByTestId('project-project-1')).toBeNull();
    expect(screen.queryByTestId('standalone-thread-1')).toBeNull();

    const showMoreButtons = screen.getAllByRole('button', { name: '显示更多' });
    fireEvent.click(showMoreButtons[0]);
    expect(screen.getByTestId('project-project-1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '显示更多' }));
    expect(screen.getByTestId('standalone-thread-1')).toBeTruthy();
  });

  it('exposes the complete project menu actions backed by semantic callbacks', () => {
    renderSidebar({ projects: [project(1)], selectedProjectId: 'project-1' });

    fireEvent.click(screen.getByRole('button', { name: '项目 1 项目菜单' }));
    const menu = screen.getByTestId('project-menu-project-1');

    expect(within(menu).getByRole('menuitem', { name: '置顶项目' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: '在文件管理器中打开' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: '编辑项目' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: '重命名项目' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: '全部标为已读' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: '归档对话' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: '移除项目' })).toBeTruthy();
  });

  it('renames a conversation and requires confirmation before deleting it', async () => {
    const onConversationRename = vi.fn().mockResolvedValue(undefined);
    const onConversationDelete = vi.fn().mockResolvedValue(undefined);
    renderSidebar({
      conversations: [conversation(1)],
      onConversationRename,
      onConversationDelete,
    });

    fireEvent.click(screen.getByRole('button', { name: '最近对话 1 对话菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名对话' }));
    fireEvent.change(screen.getByRole('textbox', { name: '重命名对话' }), { target: { value: '更新后的标题' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await vi.waitFor(() => expect(onConversationRename).toHaveBeenCalledWith({
      projectId: null,
      conversationId: 'thread-1',
      threadId: 'thread-1',
    }, '更新后的标题'));

    fireEvent.click(screen.getByRole('button', { name: '最近对话 1 对话菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除对话' }));
    expect(onConversationDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '删除对话' }));
    await vi.waitFor(() => expect(onConversationDelete).toHaveBeenCalledWith({
      projectId: null,
      conversationId: 'thread-1',
      threadId: 'thread-1',
    }));
  });

  it('archives a conversation directly and keeps unread state in the row menu', async () => {
    const onConversationArchive = vi.fn().mockResolvedValue(undefined);
    renderSidebar({ conversations: [conversation(1)], onConversationArchive });

    fireEvent.click(screen.getByRole('button', { name: '最近对话 1 对话菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '标记为未读' }));
    expect(screen.getByTestId('standalone-thread-1').closest('.conversation-nav-row')?.getAttribute('data-unread')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '最近对话 1 对话菜单' }));
    expect(screen.getByRole('menuitem', { name: '在文件管理器中打开' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '复制工作目录' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '复制会话 ID' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: '归档对话' }));
    await vi.waitFor(() => expect(onConversationArchive).toHaveBeenCalledWith({
      projectId: null,
      conversationId: 'thread-1',
      threadId: 'thread-1',
    }));
  });

  it('lists project history under its owner and expands beyond the first five chats', async () => {
    const onProjectConversationSelect = vi.fn();
    const onConversationArchive = vi.fn().mockResolvedValue(undefined);
    const projectHistory = Array.from({ length: 6 }, (_, index) => ({
      ...conversation(index + 1),
      projectId: 'project-1',
      conversationId: `conversation-${index + 1}`,
      title: `项目会话 ${index + 1}`,
    }));
    renderSidebar({
      projects: [project(1)],
      projectConversations: { 'project-1': projectHistory },
      onProjectConversationSelect,
      onConversationArchive,
    });

    expect(screen.queryByText('项目会话 6')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '显示更多' }));
    fireEvent.click(screen.getByText('项目会话 6'));
    expect(onProjectConversationSelect).toHaveBeenCalledWith('project-1', 'conversation-6');

    fireEvent.click(screen.getByRole('button', { name: '项目会话 2 对话菜单' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '归档对话' }));
    await vi.waitFor(() => expect(onConversationArchive).toHaveBeenCalledWith({
      projectId: 'project-1',
      conversationId: 'conversation-2',
      threadId: 'thread-2',
    }));
  });
});
