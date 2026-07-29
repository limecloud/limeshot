// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from './AppSidebar';
import { createTranslator } from './i18n';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('AppSidebar menus', () => {
  it('closes an open menu when another sidebar action is clicked', () => {
    render(
      <AppSidebar
        projects={[]}
        conversations={[]}
        conversationTitle=""
        searchOpen={false}
        searchQuery=""
        footer={null}
        onHome={vi.fn()}
        onNewConversation={vi.fn()}
        onConversationSelect={vi.fn()}
        onSearchOpenChange={vi.fn()}
        onSearchQueryChange={vi.fn()}
        onProjectSelect={vi.fn()}
        onProjectEdit={vi.fn()}
        t={createTranslator('zh-CN')}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '整理最近项目' }));
    expect(screen.getByTestId('recent-menu')).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole('button', { name: '新建会话' }));
    expect(screen.queryByTestId('recent-menu')).toBeNull();
  });
});
