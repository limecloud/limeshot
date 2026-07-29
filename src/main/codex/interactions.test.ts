import { describe, expect, it, vi } from 'vitest';

import { InteractionCoordinator } from './interactions';

describe('InteractionCoordinator', () => {
  it('deduplicates v2 and legacy command prompts and maps one semantic response to both protocols', async () => {
    const coordinator = new InteractionCoordinator();
    const listener = vi.fn();
    coordinator.subscribe(listener);
    const current = coordinator.request('item/commandExecution/requestApproval', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'command-1',
      environmentId: null,
      startedAtMs: 10,
      command: 'npm test',
      cwd: '/workspace/project',
      commandActions: [],
      availableDecisions: ['accept', 'decline'],
    }, { id: 7, method: 'item/commandExecution/requestApproval' });
    const legacy = coordinator.request('execCommandApproval', {
      conversationId: 'thread-1',
      callId: 'command-1',
      approvalId: null,
      command: ['npm', 'test'],
      cwd: '/workspace/project',
      reason: null,
      parsedCmd: [],
    }, { id: 'legacy-7', method: 'execCommandApproval' });

    const [interaction] = coordinator.list();
    expect(coordinator.list()).toHaveLength(1);
    expect(interaction).toMatchObject({
      kind: 'commandApproval',
      threadId: 'thread-1',
      itemId: 'command-1',
      command: 'npm test',
      cwd: 'workspace/project',
    });
    expect(JSON.stringify(interaction)).not.toContain('legacy-7');
    expect(JSON.stringify(interaction)).not.toContain('"id":7');

    coordinator.submit({
      interactionId: interaction!.interactionId,
      actionToken: interaction!.actionToken,
      kind: 'commandApproval',
      decision: 'decline',
    });
    await expect(current).resolves.toEqual({ decision: 'decline' });
    await expect(legacy).resolves.toEqual({ decision: 'denied' });
    expect(coordinator.list()).toEqual([]);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'interaction.resolved', interactionId: interaction!.interactionId }));
    expect(() => coordinator.submit({
      interactionId: interaction!.interactionId,
      actionToken: interaction!.actionToken,
      kind: 'commandApproval',
      decision: 'accept',
    })).toThrow('该交互已失效');
  });

  it('keeps secret answers out of the projection and returns them only to Codex', async () => {
    const coordinator = new InteractionCoordinator();
    const response = coordinator.request('item/tool/requestUserInput', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'input-1',
      autoResolutionMs: null,
      questions: [{ id: 'api-key', header: 'Token', question: 'Enter token', isOther: false, isSecret: true, options: null }],
    }, { id: 8, method: 'item/tool/requestUserInput' });
    const [interaction] = coordinator.list();
    expect(interaction).toMatchObject({ kind: 'userInput', risks: ['secret'] });
    expect(JSON.stringify(interaction)).not.toContain('sk-live');

    coordinator.submit({
      interactionId: interaction!.interactionId,
      actionToken: interaction!.actionToken,
      kind: 'userInput',
      answers: { 'api-key': ['sk-live'] },
    });
    await expect(response).resolves.toEqual({ answers: { 'api-key': { answers: ['sk-live'] } } });
  });

  it('fails closed and clears pending interactions when a turn ends', async () => {
    const coordinator = new InteractionCoordinator();
    const response = coordinator.request('item/fileChange/requestApproval', {
      threadId: 'thread-1', turnId: 'turn-1', itemId: 'file-1', startedAtMs: 1,
    }, { id: 9, method: 'item/fileChange/requestApproval' });
    const rejected = expect(response).rejects.toThrow('Turn 已结束');
    coordinator.completeTurn('thread-1', 'turn-1');
    await rejected;
    expect(coordinator.list()).toEqual([]);
  });

  it('keeps an MCP URL in main and opens a validated HTTPS URL without resolving the request', async () => {
    const openUrl = vi.fn(async () => undefined);
    const coordinator = new InteractionCoordinator(openUrl);
    const events: unknown[] = [];
    coordinator.subscribe((event) => events.push(event));
    const response = coordinator.request('mcpServer/elicitation/request', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      serverName: 'accounts',
      mode: 'url',
      _meta: null,
      message: 'Authorize the account',
      url: 'https://accounts.example.com/oauth/start?token=super-secret',
      elicitationId: 'elicitation-1',
    }, { id: 10, method: 'mcpServer/elicitation/request' });
    const [interaction] = coordinator.list();
    const serialized = JSON.stringify(interaction);

    expect(interaction).toMatchObject({
      kind: 'mcpElicitation',
      mode: 'url',
      urlLabel: 'accounts.example.com/oauth/start',
    });
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('super-secret');

    await expect(coordinator.openExternal({
      interactionId: interaction!.interactionId,
      actionToken: interaction!.actionToken,
    })).resolves.toEqual({ interactionId: interaction!.interactionId, opened: true });
    expect(openUrl).toHaveBeenCalledWith('https://accounts.example.com/oauth/start?token=super-secret');
    expect(coordinator.list()).toHaveLength(1);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'interaction.resolved' }));

    coordinator.submit({
      interactionId: interaction!.interactionId,
      actionToken: interaction!.actionToken,
      kind: 'mcpElicitation',
      action: 'cancel',
    });
    await expect(response).resolves.toEqual({ action: 'cancel', content: null, _meta: null });
  });

  it.each([
    'http://accounts.example.com/oauth/start',
    'https://user:password@accounts.example.com/oauth/start',
  ])('fails closed for unsafe MCP URL %s', async (url) => {
    const openUrl = vi.fn(async () => undefined);
    const coordinator = new InteractionCoordinator(openUrl);
    const response = coordinator.request('mcpServer/elicitation/request', {
      threadId: 'thread-1',
      turnId: null,
      serverName: 'accounts',
      mode: 'url',
      _meta: null,
      message: 'Authorize the account',
      url,
      elicitationId: 'elicitation-unsafe',
    }, { id: 11, method: 'mcpServer/elicitation/request' });
    const [interaction] = coordinator.list();

    await expect(coordinator.openExternal({
      interactionId: interaction!.interactionId,
      actionToken: interaction!.actionToken,
    })).rejects.toThrow('外部链接不符合安全要求');
    expect(openUrl).not.toHaveBeenCalled();
    expect(coordinator.list()).toHaveLength(1);

    coordinator.closeThread('thread-1');
    await expect(response).rejects.toThrow('Thread 已关闭');
  });
});
