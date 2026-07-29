// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentCommandApprovalProjection,
  AgentFileApprovalProjection,
  AgentMcpElicitationProjection,
  AgentPendingInteractionProjection,
  AgentPermissionApprovalProjection,
  AgentTurnProjection,
  AgentUserInputRequestProjection,
} from '../../shared/desktop';
import { createTranslator } from './i18n';
import { PendingInteractions } from './PendingInteractions';

const t = createTranslator('zh-CN');
const noopOpen = vi.fn(async () => undefined);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PendingInteractions', () => {
  it('keeps same-thread approvals FIFO and submits typed command, file, and permission decisions', () => {
    const onSubmit = vi.fn(async () => undefined);
    const command = commandApproval({ createdAt: 1 });
    const file = fileApproval({ createdAt: 2 });
    const permission = permissionApproval({ createdAt: 3 });
    const turns: AgentTurnProjection[] = [{
      id: 'turn-1',
      status: 'inProgress',
      itemsView: 'full',
      items: [{
        id: 'file-1', type: 'fileChange', kind: 'activity', text: '', status: 'inProgress',
        changes: [{ path: 'src/App.tsx', kind: 'update', diff: '@@ -1 +1 @@\n-old\n+new' }],
      }],
    }];
    const view = render(surface([permission, file, command], onSubmit, turns));

    expect(screen.getByText('npm test')).toBeTruthy();
    expect(screen.getByText('队列 1/3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '允许一次' }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      interactionId: 'command-1', actionToken: 'token-command', kind: 'commandApproval', decision: 'accept',
    });

    view.rerender(surface([{ ...command, status: 'resolved' }, permission, file], onSubmit, turns));
    expect(screen.getByText('src/App.tsx')).toBeTruthy();
    expect(screen.getByText(/\+new/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '本次会话允许' }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      interactionId: 'file-1', actionToken: 'token-file', kind: 'fileApproval', decision: 'acceptForSession',
    });

    view.rerender(surface([{ ...command, status: 'resolved' }, { ...file, status: 'resolved' }, permission], onSubmit, turns));
    expect(screen.getByText('读取路径').parentElement?.textContent).toContain('2');
    expect(screen.getByText('写入路径').parentElement?.textContent).toContain('1');
    fireEvent.click(screen.getByRole('button', { name: '本轮授权' }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      interactionId: 'permission-1', actionToken: 'token-permission', kind: 'permissionApproval', decision: 'grantTurn',
    });
  });

  it('switches tabs by pointer and keyboard and removes settled requests from the blocking surface', async () => {
    const current = commandApproval({ status: 'submitting' });
    const other = permissionApproval({ interactionId: 'permission-other', threadId: 'thread-2', createdAt: 2 });
    const view = render(surface([current, other]));

    expect(screen.getByText('正在提交')).toBeTruthy();
    expect((screen.getByRole('button', { name: '允许一次' }) as HTMLButtonElement).disabled).toBe(true);
    const currentTab = screen.getByRole('tab', { name: /当前对话/ });
    fireEvent.keyDown(currentTab, { key: 'ArrowRight' });
    const otherTab = screen.getByRole('tab', { name: /其他对话/ });
    await waitFor(() => expect(document.activeElement).toBe(otherTab));
    expect(otherTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('interaction-tab-other');
    expect(screen.getByText('environment-1')).toBeTruthy();

    for (const status of ['resolved', 'expired', 'disconnected'] as const) {
      view.rerender(surface([{ ...other, status } as AgentPendingInteractionProjection]));
      expect(screen.queryByRole('region', { name: '需要确认' })).toBeNull();
      expect(screen.queryByRole('button', { name: '允许一次' })).toBeNull();
    }
  });

  it('submits single, multiple, Other, freeform, and secret user input without exposing the secret in DOM attributes', () => {
    const onSubmit = vi.fn(async () => undefined);
    const interaction: AgentUserInputRequestProjection = {
      ...base('input-1', 'token-input'),
      kind: 'userInput',
      autoResolutionAt: Date.now() + 5_000,
      risks: ['secret'],
      questions: [
        { id: 'channel', header: '渠道', question: '发布到哪里？', allowsOther: true, multiple: false, secret: false, options: [{ label: '网站', description: '官网' }] },
        { id: 'formats', header: '格式', question: '选择格式', allowsOther: false, multiple: true, secret: false, options: [{ label: 'MP4', description: '' }, { label: 'MOV', description: '' }] },
        { id: 'api-key', header: '密钥', question: '输入密钥', allowsOther: false, multiple: false, secret: true, options: [] },
      ],
    };
    const { container } = render(surface([interaction], onSubmit));

    expect(screen.getByText(/自动处理倒计时/)).toBeTruthy();
    expect(screen.getByRole('timer').getAttribute('aria-live')).toBe('off');
    expect(screen.getByText('1/3')).toBeTruthy();
    const channel = screen.getByText('发布到哪里？').closest('fieldset')!;
    fireEvent.click(within(channel).getByText('网站'));
    expect((within(channel).getByRole('radio', { name: /网站/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(channel).getByText('其他'));
    fireEvent.change(within(channel).getByLabelText('补充说明'), { target: { value: '线下屏幕' } });

    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(screen.getByText('2/3')).toBeTruthy();
    const formats = screen.getByText('选择格式').closest('fieldset')!;
    fireEvent.click(within(formats).getByText('MP4'));
    fireEvent.click(within(formats).getByText('MOV'));
    fireEvent.click(screen.getByRole('button', { name: '上一题' }));
    expect((within(screen.getByText('发布到哪里？').closest('fieldset')!).getByLabelText('补充说明') as HTMLInputElement).value).toBe('线下屏幕');
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(screen.getByText('3/3')).toBeTruthy();
    const secret = screen.getByText('输入密钥').closest('fieldset')!;
    fireEvent.change(within(secret).getByLabelText('回答'), { target: { value: 'sk-test-secret' } });
    expect(container.innerHTML).not.toContain('sk-test-secret');

    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmit).toHaveBeenCalledWith({
      interactionId: 'input-1',
      actionToken: 'token-input',
      kind: 'userInput',
      answers: { channel: ['线下屏幕'], formats: ['MP4', 'MOV'], 'api-key': ['sk-test-secret'] },
    });
  });

  it.each(['form', 'openaiForm'] as const)('validates and submits MCP %s primitive and enum fields', async (mode) => {
    const onSubmit = vi.fn(async () => undefined);
    const interaction: AgentMcpElicitationProjection = {
      ...base(`mcp-${mode}`, `token-${mode}`),
      kind: 'mcpElicitation',
      server: 'render-server',
      mode,
      message: 'Configure render',
      risks: [],
      schema: {
        type: 'object',
        required: ['name', 'count', 'preset'],
        properties: {
          name: { type: 'string', title: '名称', minLength: 2 },
          count: { type: 'integer', title: '数量', minimum: 1, maximum: 5 },
          enabled: { type: 'boolean', title: '启用' },
          preset: { type: 'string', title: '预设', enum: ['fast', 'quality'] },
          outputs: { type: 'array', title: '输出', items: { type: 'string', enum: ['mp4', 'mov'] } },
        },
      },
    };
    render(surface([interaction], onSubmit));

    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect((await screen.findByRole('alert')).textContent).toContain('name: 此字段为必填项');
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: '成片' } });
    fireEvent.change(screen.getByLabelText(/数量/), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText(/启用/));
    fireEvent.change(screen.getByLabelText(/预设/), { target: { value: 'quality' } });
    fireEvent.click(screen.getByLabelText('mp4'));
    fireEvent.click(screen.getByLabelText('mov'));
    fireEvent.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      interactionId: `mcp-${mode}`,
      actionToken: `token-${mode}`,
      kind: 'mcpElicitation',
      action: 'accept',
      content: { name: '成片', count: 3, enabled: true, preset: 'quality', outputs: ['mp4', 'mov'] },
    }));
  });

  it('opens an MCP URL before allowing completion and does not resolve on open', async () => {
    const onSubmit = vi.fn(async () => undefined);
    const onOpenExternal = vi.fn(async () => undefined);
    const interaction: AgentMcpElicitationProjection = {
      ...base('mcp-url', 'token-url'),
      kind: 'mcpElicitation',
      server: 'accounts',
      mode: 'url',
      message: 'Authorize account',
      urlLabel: 'accounts.example.com/oauth',
      risks: ['external'],
    };
    render(surface([interaction], onSubmit, [], onOpenExternal));

    expect(screen.queryByRole('button', { name: '我已完成' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '在浏览器中打开' }));
    await waitFor(() => expect(onOpenExternal).toHaveBeenCalledWith({ interactionId: 'mcp-url', actionToken: 'token-url' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '我已完成' }));
    expect(onSubmit).toHaveBeenCalledWith({
      interactionId: 'mcp-url', actionToken: 'token-url', kind: 'mcpElicitation', action: 'accept',
    });
  });
});

function surface(
  interactions: AgentPendingInteractionProjection[],
  onSubmit = vi.fn(async () => undefined),
  turns: AgentTurnProjection[] = [],
  onOpenExternal = noopOpen,
) {
  return <PendingInteractions interactions={interactions} currentThreadId="thread-1" turns={turns} onSubmit={onSubmit} onOpenExternal={onOpenExternal} t={t} />;
}

function base(interactionId: string, actionToken: string) {
  return {
    interactionId,
    actionToken,
    threadId: 'thread-1',
    turnId: 'turn-1',
    createdAt: 1,
    status: 'pending' as const,
  };
}

function commandApproval(overrides: Partial<AgentCommandApprovalProjection> = {}): AgentCommandApprovalProjection {
  return {
    ...base('command-1', 'token-command'),
    kind: 'commandApproval',
    command: 'npm test',
    cwd: 'workspace/project',
    actions: [],
    decisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
    risks: ['shell'],
    ...overrides,
  };
}

function fileApproval(overrides: Partial<AgentFileApprovalProjection> = {}): AgentFileApprovalProjection {
  return {
    ...base('file-1', 'token-file'),
    itemId: 'file-1',
    kind: 'fileApproval',
    changes: [],
    decisions: ['accept', 'acceptForSession', 'decline', 'cancel'],
    risks: ['filesystem'],
    ...overrides,
  };
}

function permissionApproval(overrides: Partial<AgentPermissionApprovalProjection> = {}): AgentPermissionApprovalProjection {
  return {
    ...base('permission-1', 'token-permission'),
    kind: 'permissionApproval',
    cwd: 'workspace/project',
    environmentLabel: 'environment-1',
    networkRequested: true,
    readPathCount: 2,
    writePathCount: 1,
    decisions: ['grantTurn', 'grantSession', 'grantTurnStrict', 'deny'],
    risks: ['network', 'filesystem', 'session'],
    ...overrides,
  };
}
