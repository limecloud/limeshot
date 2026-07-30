// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentComposerAttachment,
  AgentComposerCapability,
  AgentComposerMode,
  DesktopApi,
} from '../../shared/desktop';
import { ConversationComposer } from './ConversationComposer';
import { createTranslator } from './i18n';

const t = createTranslator('zh-CN');
const catalog = {
  capabilities: [
    { id: 'record', kind: 'plugin' as const, label: 'Recorder', description: 'Record workflow', defaultPrompt: '记录这个工作流', recordSkill: true },
    { id: 'docs', kind: 'plugin' as const, label: 'Docs', description: 'Document tools', recordSkill: false },
  ],
  planModeAvailable: true,
  pluginLoadFailed: false,
};

beforeEach(() => {
  window.limeShot = {
    agent: {
      composerCatalog: vi.fn(async () => catalog),
      pickAttachments: vi.fn(async () => [{ id: 'file-1', label: 'brief.md', kind: 'file' as const }]),
      listCaptureSources: vi.fn(async () => [{ id: 'window-1', label: 'Wave', previewUrl: 'data:image/png;base64,AA==' }]),
      captureSource: vi.fn(async () => ({ id: 'capture-1', label: 'Wave', kind: 'appScreenshot' as const, previewUrl: 'data:image/png;base64,AA==' })),
      listModels: vi.fn(async () => ({ models: [{
        id: 'model-54', model: 'gpt-5.4', displayName: '5.4', description: '',
        supportedReasoningEfforts: [{ effort: 'medium', description: '' }],
        defaultReasoningEffort: 'medium', isDefault: true,
      }] })),
    },
  } as unknown as DesktopApi;
});

afterEach(() => cleanup());

describe('ConversationComposer', () => {
  it('adds files and app-window captures, and allows an attachment-only turn', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '文件和文件夹' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '文件' }));
    await screen.findByText('brief.md');
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '截取应用窗口' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Wave' }));
    await waitFor(() => expect(window.limeShot.agent.captureSource).toHaveBeenCalledWith({ id: 'window-1' }));
    expect(screen.getAllByText('Wave').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('supports Goal, Plan mode, plugins, and Record a skill from the live catalog', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Goal/ }));
    expect(screen.getByPlaceholderText('描述这个会话要持续达成的目标')).toBeTruthy();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Plan mode/ }));
    expect(screen.getByText('Plan mode')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Docs/ }));
    expect(screen.getByText('Docs')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Record a skill' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('记录这个工作流');
    expect(screen.getByText('Recorder')).toBeTruthy();
  });

  it('opens the project submenu and closes menus with Escape', async () => {
    const onProjectOpen = vi.fn();
    render(<Harness onProjectOpen={onProjectOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^项目 / }));
    fireEvent.click(screen.getByRole('menuitem', { name: /选择或新建文件夹/ }));
    expect(onProjectOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(await screen.findByRole('menu', { name: '添加到消息' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: '添加到消息' })).toBeNull();
  });
});

function Harness({ onSubmit = vi.fn(), onProjectOpen }: { onSubmit?: () => void; onProjectOpen?: () => void }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AgentComposerAttachment[]>([]);
  const [capabilities, setCapabilities] = useState<AgentComposerCapability[]>([]);
  const [mode, setMode] = useState<AgentComposerMode>('default');
  const canSubmit = Boolean((text.trim() || attachments.length > 0 || capabilities.length > 0) && (mode !== 'goal' || text.trim()));
  return (
    <ConversationComposer
      surface="home"
      context={{ projectId: null }}
      text={text}
      attachments={attachments}
      capabilities={capabilities}
      mode={mode}
      disabled={false}
      canSubmit={canSubmit}
      placeholder="输入消息"
      inputLabel="Composer"
      projects={[]}
      onTextChange={setText}
      onAttachmentsChange={setAttachments}
      onCapabilitiesChange={setCapabilities}
      onModeChange={setMode}
      onProjectSelect={onProjectOpen ? () => undefined : undefined}
      onProjectOpen={onProjectOpen}
      onSubmit={onSubmit}
      onError={vi.fn()}
      t={t}
    />
  );
}
