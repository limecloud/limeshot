// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentTurnProjection } from '../../shared/desktop';
import { createTranslator } from './i18n';
import {
  WorkspaceChromeProvider,
  WorkspacePanelSurface,
  WorkspacePanelTabs,
  useWorkspacePanelTitle,
} from './WorkspaceChrome';

vi.mock('./WorkspaceTerminal', () => ({
  WorkspaceTerminal: ({ projectId, target }: { projectId?: string; target: string }) => <div data-testid={`workspace-${target}-terminal`}>terminal:{projectId}</div>,
}));
vi.mock('./WorkspaceBrowser', () => ({
  WorkspaceBrowser: ({ target }: { target: string }) => <div data-testid={`workspace-${target}-browser`}>browser</div>,
}));
vi.mock('./WorkspaceFiles', () => ({
  WorkspaceFiles: ({ projectId, target }: { projectId?: string; target: string }) => <div data-testid={`workspace-${target}-files`}>files:{projectId}</div>,
}));

const t = createTranslator('zh-CN');

const turns: AgentTurnProjection[] = [{
  id: 'turn-1',
  status: 'completed',
  itemsView: 'full',
  items: [
    {
      id: 'command-1', type: 'commandExecution', kind: 'activity', text: 'rg workspace', status: 'completed',
      command: 'rg workspace', cwd: '/workspace', source: 'agent', actions: [], output: 'src/App.tsx', exitCode: 0, terminalInteractions: [],
    },
    {
      id: 'browser-1', type: 'webSearch', kind: 'activity', text: 'Codex docs', status: 'completed', query: 'Codex docs',
      action: { type: 'openPage', url: 'https://example.com/codex' }, results: [],
    },
    {
      id: 'file-1', type: 'fileChange', kind: 'activity', text: 'update file', status: 'completed',
      changes: [{ path: 'src/App.tsx', kind: 'update', diff: '--- a/src/App.tsx\n+++ b/src/App.tsx\n-old\n+new' }],
    },
    {
      id: 'task-1', type: 'subAgentActivity', kind: 'activity', text: 'reviewer',
      activity: 'started', agentThreadId: 'thread-child', agentPath: 'reviewer',
    },
  ],
}];

afterEach(cleanup);

describe('WorkspaceChrome', () => {
  it('matches the Codex panel tab menu order and exposes panel controls', () => {
    const onAdd = vi.fn();
    const onExpandedChange = vi.fn();
    render(
      <WorkspacePanelTabs
        target="right"
        tabs={['review']}
        activeTab="review"
        onActivate={vi.fn()}
        onAdd={onAdd}
        onCloseTab={vi.fn()}
        onClosePanel={vi.fn()}
        onExpandedChange={onExpandedChange}
        t={t}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开新标签页' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.replace(/(Ctrl|Cmd).*$/, ''))).toEqual([
      '审阅', '终端', '浏览器', '文件', '侧边任务',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: /终端/ }));
    expect(onAdd).toHaveBeenCalledWith('terminal');
    fireEvent.click(screen.getByRole('button', { name: '展开为全宽' }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it.each([
    ['terminal', 'workspace-right-terminal', 'terminal:project-1'],
    ['browser', 'workspace-right-browser', 'browser'],
    ['files', 'workspace-right-files', 'files:project-1'],
    ['tasks', 'workspace-right-tasks', 'reviewer'],
  ] as const)('renders the %s workspace surface', (tab, testId, expectedText) => {
    render(
      <WorkspacePanelSurface
        tab={tab}
        target="right"
        turns={turns}
        projectId="project-1"
        onSelectedChangePathChange={vi.fn()}
        onOpenReview={vi.fn()}
        onOpenThread={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByTestId(testId).textContent).toContain(expectedText);
  });

  it('uses live tool titles in the unified tab strip', () => {
    function BrowserTitle() {
      useWorkspacePanelTitle('right', 'browser', 'Codex docs');
      return null;
    }
    render(
      <WorkspaceChromeProvider>
        <BrowserTitle />
        <WorkspacePanelTabs
          target="right"
          tabs={['browser']}
          activeTab="browser"
          onActivate={vi.fn()}
          onAdd={vi.fn()}
          onCloseTab={vi.fn()}
          onClosePanel={vi.fn()}
          t={t}
        />
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByRole('tab').textContent).toContain('Codex docs');
  });
});
