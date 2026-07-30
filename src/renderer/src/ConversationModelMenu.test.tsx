// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentModelListResult } from '../../shared/desktop';
import { ConversationModelMenu } from './ConversationModelMenu';
import { createTranslator } from './i18n';

const t = createTranslator('zh-CN');
const catalog: AgentModelListResult = {
  models: [
    {
      id: 'model-sol', model: 'gpt-5.6', displayName: '5.6 Sol', description: '', isDefault: true,
      supportedReasoningEfforts: [
        { effort: 'medium', description: '' },
        { effort: 'high', description: '' },
        { effort: 'xhigh', description: '' },
      ],
      defaultReasoningEffort: 'medium',
    },
    {
      id: 'model-terra', model: 'gpt-5.6-terra', displayName: '5.6 Terra', description: '', isDefault: false,
      supportedReasoningEfforts: [
        { effort: 'low', description: '' },
        { effort: 'medium', description: '' },
      ],
      defaultReasoningEffort: 'medium',
    },
  ],
};

afterEach(cleanup);

describe('ConversationModelMenu', () => {
  it('uses the live catalog and combines model selection with a supported effort', async () => {
    const listModels = vi.fn(async () => catalog);
    const updateThreadSettings = vi.fn(async () => undefined);
    installAgentApi(listModels, updateThreadSettings);

    render(<ConversationModelMenu
      target={{ projectId: 'project-1', conversationId: 'main', threadId: 'thread-1' }}
      currentModel="gpt-5.6"
      currentEffort="xhigh"
      disabled={false}
      onError={vi.fn()}
      t={t}
    />);

    await waitFor(() => expect(screen.getByTestId('composer-model-trigger').textContent).toContain('5.6 Sol'));
    fireEvent.click(screen.getByTestId('composer-model-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }));
    expect(screen.getByRole('menu', { name: '模型' }).textContent).toContain('5.6 Terra');

    fireEvent.click(screen.getByRole('menuitemradio', { name: '5.6 Terra' }));
    await waitFor(() => expect(updateThreadSettings).toHaveBeenCalledWith({
      projectId: 'project-1', conversationId: 'main', threadId: 'thread-1',
      model: 'gpt-5.6-terra', effort: 'medium',
    }));
  });

  it('lists only the selected model efforts and sends model plus effort together', async () => {
    const updateThreadSettings = vi.fn(async () => undefined);
    installAgentApi(vi.fn(async () => catalog), updateThreadSettings);

    render(<ConversationModelMenu
      target={{ projectId: null, conversationId: 'standalone-1', threadId: 'thread-1' }}
      currentModel="gpt-5.6-terra"
      currentEffort="medium"
      disabled={false}
      onError={vi.fn()}
      t={t}
    />);

    await waitFor(() => expect(screen.getByTestId('composer-model-trigger').textContent).toContain('5.6 Terra'));
    fireEvent.click(screen.getByTestId('composer-model-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: /推理强度/ }));
    const effortMenu = screen.getByRole('menu', { name: '推理强度' });
    expect(effortMenu.textContent).toContain('轻度');
    expect(effortMenu.textContent).not.toContain('极高');

    fireEvent.click(screen.getByRole('menuitemradio', { name: '轻度' }));
    await waitFor(() => expect(updateThreadSettings).toHaveBeenCalledWith({
      projectId: null, conversationId: 'standalone-1', threadId: 'thread-1',
      model: 'gpt-5.6-terra', effort: 'low',
    }));
  });

  it('keeps an active model visible when it is absent from the current catalog', async () => {
    installAgentApi(vi.fn(async () => catalog), vi.fn());

    render(<ConversationModelMenu
      target={{ projectId: null, conversationId: 'standalone-1', threadId: 'thread-1' }}
      currentModel="gpt-5.4"
      disabled={false}
      onError={vi.fn()}
      t={t}
    />);

    await waitFor(() => expect(screen.getByTestId('composer-model-trigger').textContent).toContain('gpt-5.4默认'));
    fireEvent.click(screen.getByTestId('composer-model-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }));
    expect(screen.getByRole('menu', { name: '模型' })).toBeDefined();
  });

  it('owns draft selection without sending a thread settings update', async () => {
    const updateThreadSettings = vi.fn(async () => undefined);
    const onSettingsChange = vi.fn();
    installAgentApi(vi.fn(async () => catalog), updateThreadSettings);

    const { rerender } = render(<ConversationModelMenu
      disabled={false}
      onSettingsChange={onSettingsChange}
      onError={vi.fn()}
      t={t}
    />);

    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledWith({ model: 'gpt-5.6', effort: 'medium' }));
    rerender(<ConversationModelMenu
      currentModel="gpt-5.6"
      currentEffort="medium"
      disabled={false}
      onSettingsChange={onSettingsChange}
      onError={vi.fn()}
      t={t}
    />);
    fireEvent.click(screen.getByTestId('composer-model-trigger'));
    fireEvent.click(screen.getByRole('menuitem', { name: /推理强度/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '极高' }));

    expect(onSettingsChange).toHaveBeenLastCalledWith({ model: 'gpt-5.6', effort: 'xhigh' });
    expect(updateThreadSettings).not.toHaveBeenCalled();
  });

  it('stays inert for read-only or active-turn states', () => {
    const listModels = vi.fn(async () => catalog);
    installAgentApi(listModels, vi.fn());

    render(<ConversationModelMenu
      target={{ projectId: null, conversationId: 'standalone-1', threadId: 'thread-1' }}
      currentModel="gpt-5.6"
      currentEffort="high"
      disabled
      onError={vi.fn()}
      t={t}
    />);

    expect((screen.getByTestId('composer-model-trigger') as HTMLButtonElement).disabled).toBe(true);
    expect(listModels).not.toHaveBeenCalled();
  });
});

function installAgentApi(listModels: ReturnType<typeof vi.fn>, updateThreadSettings: ReturnType<typeof vi.fn>) {
  window.limeShot = {
    agent: { listModels, updateThreadSettings },
  } as unknown as typeof window.limeShot;
}
