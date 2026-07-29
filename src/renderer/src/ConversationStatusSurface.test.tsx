// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentActivityState, applyAgentActivityEvent } from './agentActivityState';
import { ConversationStatusSurface } from './ConversationStatusSurface';
import { createTranslator } from './i18n';

const t = createTranslator('zh-CN');

afterEach(cleanup);

describe('ConversationStatusSurface', () => {
  it('renders thread context, realtime, reviews, hooks, notices, catalog, search, and diagnostics', () => {
    let state = createAgentActivityState();
    state = applyAgentActivityEvent(state, { type: 'thread.context.updated', threadId: 'thread-1', patch: {
      lifecycle: 'active', model: { current: 'gpt-5' }, environment: { state: 'connected', label: 'remote-build' },
      goal: { objective: 'Finish the render', status: 'active', tokenBudget: 1000, tokensUsed: 200, timeUsedSeconds: 10 },
      settings: { cwd: 'workspace/project', model: 'gpt-5', modelProvider: 'openai', approvalPolicy: 'on-request', sandboxPolicy: 'workspace-write' },
    } });
    state = applyAgentActivityEvent(state, { type: 'thread.status.updated', threadId: 'thread-1', status: { type: 'systemError', waitingOnApproval: false, waitingOnUserInput: false } });
    state = applyAgentActivityEvent(state, { type: 'thread.realtime.updated', threadId: 'thread-1', update: { kind: 'transcriptDone', role: 'user', text: '生成成片' } });
    state = applyAgentActivityEvent(state, { type: 'review.updated', threadId: 'thread-1', review: { id: 'review-1', turnId: 'turn-1', status: 'approved', action: 'command', summary: 'npm test', risk: 'low' } });
    state = applyAgentActivityEvent(state, { type: 'hook.updated', threadId: 'thread-1', hook: { id: 'hook-1', eventName: 'afterTurn', status: 'completed', entries: [{ kind: 'output', text: 'ok' }] } });
    state = applyAgentActivityEvent(state, { type: 'notice.updated', notice: { id: 'notice-1', scope: 'thread', threadId: 'thread-1', level: 'warning', kind: 'warning', message: 'Check settings' } });
    state = applyAgentActivityEvent(state, { type: 'catalog.updated', update: { id: 'mcp:docs', domain: 'mcp', status: 'ready', label: 'docs' } });
    state = applyAgentActivityEvent(state, { type: 'diagnostic.recorded', diagnostic: { id: 'process:1', domain: 'process', code: 'processExited', level: 'info' } });
    state = applyAgentActivityEvent(state, { type: 'composer.search.updated', search: { sessionId: 'search-1', query: 'App', status: 'searching', files: [{ path: 'src/App.tsx', name: 'App.tsx' }] } });
    const dismiss = vi.fn();
    const selectFile = vi.fn();
    render(<ConversationStatusSurface state={state} threadId="thread-1" onDismissNotice={dismiss} onSelectFile={selectFile} t={t} />);

    expect(screen.getAllByText(/gpt-5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/系统异常/)).toBeTruthy();
    expect(screen.getByText(/已连接 · remote-build/)).toBeTruthy();
    expect(screen.getByText('Finish the render')).toBeTruthy();
    expect(screen.getByText('生成成片')).toBeTruthy();
    expect(screen.getByText('Check settings')).toBeTruthy();
    fireEvent.click(screen.getByTitle('关闭通知'));
    expect(dismiss).toHaveBeenCalledWith('notice-1');
    fireEvent.click(screen.getByRole('button', { name: /App.tsx/ }));
    expect(selectFile).toHaveBeenCalledWith('src/App.tsx');

    for (const summary of ['安全审查', 'Hooks', '系统与能力更新', '运行诊断']) fireEvent.click(screen.getByText(summary));
    expect(screen.getByText('npm test')).toBeTruthy();
    expect(screen.getByText('afterTurn')).toBeTruthy();
    expect(screen.getByText('docs')).toBeTruthy();
    expect(screen.getByText('进程已退出')).toBeTruthy();
  });

  it('localizes semantic error notices without upstream error text', () => {
    let state = createAgentActivityState();
    state = applyAgentActivityEvent(state, {
      type: 'agent.error', threadId: 'thread-1', message: 'provider credential failed', willRetry: true,
    });

    render(<ConversationStatusSurface state={state} threadId="thread-1" onDismissNotice={vi.fn()} onSelectFile={vi.fn()} t={t} />);

    expect(screen.getByText('Agent 报告了错误，正在重试')).toBeTruthy();
    expect(screen.queryByText(/credential/)).toBeNull();
  });
});
