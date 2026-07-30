// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentTurnProjection } from '../../shared/desktop';
import { EnvironmentMenu } from './EnvironmentMenu';
import { WorkspaceChromeProvider, useWorkspacePanelTitle } from './WorkspaceChrome';
import { createTranslator } from './i18n';

const t = createTranslator('zh-CN');
const turns: AgentTurnProjection[] = [{
  id: 'turn-1',
  status: 'completed',
  itemsView: 'full',
  items: [
    {
      id: 'user-1',
      type: 'userMessage',
      kind: 'user',
      text: 'attachments',
      content: [
        { type: 'image', source: 'local', label: 'reference.png' },
        { type: 'audio', source: 'local', label: 'voice.wav' },
      ],
    },
    {
      id: 'task-1',
      type: 'subAgentActivity',
      kind: 'activity',
      text: 'Review task',
      activity: 'started',
      agentThreadId: 'child-1',
      agentPath: 'reviewer',
    },
  ],
}];

afterEach(cleanup);

describe('EnvironmentMenu', () => {
  it('matches the Codex environment grouping and routes actions to workspace tabs', async () => {
    const actions = {
      review: vi.fn(), terminal: vi.fn(), tasks: vi.fn(), browser: vi.fn(), files: vi.fn(), close: vi.fn(),
    };
    window.limeShot = {
      workspace: {
        context: { read: vi.fn(async () => ({ rootName: 'limeshot', location: 'local' as const, branch: 'main' })) },
      },
    } as unknown as typeof window.limeShot;

    function BrowserTitle() {
      useWorkspacePanelTitle('right', 'browser', 'New tab');
      return null;
    }

    render(
      <WorkspaceChromeProvider>
        <BrowserTitle />
        <EnvironmentMenu
          projectId="project-1"
          workspaceLabel="workspace"
          turns={turns}
          changes={{ files: [], additions: 12, deletions: 3 }}
          onOpenReview={actions.review}
          onOpenTerminal={actions.terminal}
          onOpenTasks={actions.tasks}
          onOpenBrowser={actions.browser}
          onOpenFiles={actions.files}
          onClose={actions.close}
          t={t}
        />
      </WorkspaceChromeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('environment-menu').textContent).toContain('main'));
    const text = screen.getByTestId('environment-menu').textContent ?? '';
    expect(text.indexOf('变更')).toBeLessThan(text.indexOf('侧边任务'));
    expect(text.indexOf('侧边任务')).toBeLessThan(text.indexOf('浏览器'));
    expect(text.indexOf('浏览器')).toBeLessThan(text.indexOf('来源'));
    expect(text).toContain('+12-3');
    expect(text).toContain('reviewer');
    expect(text).toContain('reference.png');
    expect(text).toContain('voice.wav');

    fireEvent.click(screen.getByRole('button', { name: /变更/ }));
    expect(actions.review).toHaveBeenCalledOnce();
    expect(actions.close).toHaveBeenCalledOnce();
  });
});
