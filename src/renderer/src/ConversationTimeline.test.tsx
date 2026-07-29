// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentItemProjection, AgentTurnProjection } from '../../shared/desktop';
import { ConversationTimeline } from './ConversationTimeline';
import { createTranslator } from './i18n';

const t = createTranslator('zh-CN');

const items: AgentItemProjection[] = [
  { id: '01', type: 'userMessage', kind: 'user', text: '用户输入', content: [
    { type: 'text', text: '用户输入', elements: [] },
    { type: 'image', source: 'remote', url: 'https://example.com/input.png', label: '输入图片' },
    { type: 'audio', source: 'remote', url: 'https://example.com/input.mp3', label: '输入音频' },
    { type: 'skill', name: 'video', label: '视频技能' },
    { type: 'mention', name: 'brief', label: 'Brief' },
  ] },
  { id: '02', type: 'hookPrompt', kind: 'user', text: 'Hook 内容', fragments: [{ text: 'Hook 内容', hookRunId: 'hook-1' }] },
  { id: '03', type: 'agentMessage', kind: 'assistant', text: 'Agent 回复', phase: 'commentary', memoryCitation: { entries: [{ path: 'src/main.ts', lineStart: 1, lineEnd: 2, note: '入口' }], threadIds: ['thread-related'] } },
  { id: '04', type: 'plan', kind: 'plan', text: '计划内容', status: 'completed' },
  { id: '05', type: 'reasoning', kind: 'activity', text: '推理摘要', status: 'completed', summary: ['推理摘要'], content: ['推理细节'] },
  { id: '06', type: 'commandExecution', kind: 'activity', text: 'rg needle', status: 'completed', command: 'rg needle', cwd: 'workspace', source: 'agent', actions: [{ type: 'search', command: 'rg needle', query: 'needle' }], output: '搜索输出', exitCode: 0, durationMs: 12, terminalInteractions: ['terminal input'] },
  { id: '07', type: 'fileChange', kind: 'activity', text: '修改文件', status: 'completed', changes: [{ path: 'src/main.ts', kind: 'update', diff: '@@ -1 +1 @@' }] },
  { id: '08', type: 'mcpToolCall', kind: 'tool', text: 'MCP', status: 'completed', server: 'assets', tool: 'lookup', arguments: { query: 'logo' }, progress: ['正在检索'], content: [{ type: 'text', text: 'MCP 文本结果' }, { type: 'resource', uri: 'mcp://asset/1', text: '资源正文' }, { type: 'json', value: { found: true } }], structuredContent: { count: 1 }, durationMs: 31 },
  { id: '09', type: 'dynamicToolCall', kind: 'tool', text: '动态结果', status: 'completed', namespace: 'business', tool: 'render', arguments: { projectId: 'safe-project' }, content: [{ type: 'text', text: '动态结果' }, { type: 'image', url: 'data:image/png;base64,AAAA' }, { type: 'audio', url: 'data:audio/mpeg;base64,AAAA' }], success: true, durationMs: 48 },
  { id: '10', type: 'collabAgentToolCall', kind: 'activity', text: '检查素材', status: 'completed', tool: 'spawnAgent', senderThreadId: 'thread-main', receiverThreadIds: ['thread-child'], prompt: '检查素材', model: 'gpt-5', reasoningEffort: 'medium', agents: [{ threadId: 'thread-child', status: 'completed', message: '检查完成' }] },
  { id: '11', type: 'subAgentActivity', kind: 'activity', text: 'reviewer', activity: 'started', agentThreadId: 'thread-child', agentPath: 'reviewer' },
  { id: '12', type: 'webSearch', kind: 'activity', text: '官方文档', status: 'completed', query: '官方文档', action: { type: 'openPage', url: 'https://example.com/docs' }, results: Array.from({ length: 5 }, (_, index) => ({ title: `文档结果 ${index + 1}`, url: `https://example.com/docs/${index + 1}`, snippet: '结果摘要', source: 'example', details: { rank: index + 1 } })) },
  { id: '13', type: 'imageView', kind: 'activity', text: 'assets/input.png', status: 'completed', path: 'assets/input.png' },
  { id: '14', type: 'sleep', kind: 'activity', text: '250 ms', status: 'completed', waitMs: 250 },
  { id: '15', type: 'imageGeneration', kind: 'activity', text: '生成封面', status: 'completed', revisedPrompt: '生成封面', result: 'data:image/png;base64,AAAA', savedPath: 'artifacts/cover.png' },
  { id: '16', type: 'enteredReviewMode', kind: 'system', text: '审查当前修改', review: '审查当前修改' },
  { id: '17', type: 'exitedReviewMode', kind: 'system', text: '审查结束', review: '审查结束' },
  { id: '18', type: 'contextCompaction', kind: 'system', text: '', status: 'completed', source: 'automatic' },
  { id: '19', type: 'unknown', kind: 'system', text: '', sourceType: 'futureItem', fields: ['futureField'] },
];

function turn(overrides: Partial<AgentTurnProjection> = {}): AgentTurnProjection {
  return {
    id: 'turn-1',
    status: 'completed',
    itemsView: 'full',
    items,
    plan: { explanation: '按顺序执行', steps: [{ step: '第一步', status: 'completed' }, { step: '第二步', status: 'pending' }] },
    diff: '@@ turn diff @@',
    usage: { totalTokens: 1234, inputTokens: 1000, cachedInputTokens: 100, cacheWriteInputTokens: 0, outputTokens: 234, reasoningOutputTokens: 34 },
    ...overrides,
  };
}

afterEach(cleanup);

describe('ConversationTimeline', () => {
  it('keeps conversation loading out of the middle of the message stream', () => {
    const { container } = render(<ConversationTimeline turns={[]} loadState="loading" t={t} />);

    expect(screen.getByRole('status', { name: '正在恢复对话' })).toBeTruthy();
    expect(container.querySelector('.agent-loading-state')).toBeTruthy();
    expect(container.textContent).not.toContain('正在恢复对话');
    expect(container.querySelector('.agent-empty')).toBeNull();
  });

  it('renders visible item discriminators in their original interleaved order', () => {
    const { container } = render(<ConversationTimeline turns={[turn()]} loadState="ready" t={t} />);
    const renderedTypes = Array.from(container.querySelectorAll('[data-item-type]'), (node) => node.getAttribute('data-item-type'));

    expect(renderedTypes).toEqual(items
      .filter((item) => !['sleep', 'enteredReviewMode', 'exitedReviewMode', 'unknown'].includes(item.type))
      .map((item) => item.type));
    expect(container.textContent).toContain('用户输入');
    expect(container.textContent).toContain('Hook 反馈');
    expect(container.textContent).toContain('Agent 回复');
    expect(container.textContent).toContain('MCP 工具 · assets/lookup');
    expect(container.textContent).toContain('动态工具 · business/render');
    expect(container.textContent).toContain('已创建');
    expect(container.textContent).toContain('reviewer 开始工作');
    expect(container.textContent).toContain('上下文已自动压缩');
    expect(container.textContent).toContain('打开网页');
    expect(container.querySelector('[data-item-type="commandExecution"] .agent-item-summary')?.textContent).toContain('needle');
    expect(container.querySelector('[data-item-type="fileChange"] .agent-item-summary')?.textContent).toContain('src/main.ts');
    expect(container.querySelector('[data-item-type="webSearch"] .agent-item-summary')?.textContent).toContain('example.com/docs');
    expect(container.querySelector('.agent-search-results .agent-json')?.textContent).toContain('rank');
    expect(container.textContent).not.toContain('futureItem');
    expect(container.querySelector('[data-panel="plan"]')?.textContent).toContain('第一步');
    expect(container.querySelector('[data-panel="diff"]')?.textContent).toContain('@@ turn diff @@');
    expect(container.querySelector('.agent-turn-usage')?.textContent).toContain('1,234');
    expect(screen.getByRole('log').getAttribute('aria-relevant')).toBe('additions text');
    expect(screen.getByRole('log').getAttribute('aria-atomic')).toBe('false');
  });

  it('matches Codex visibility rules for hook, wait, review, sleep, compaction, and unknown items', () => {
    const waitItem = {
      ...items[9],
      id: 'wait',
      tool: 'wait',
    } as AgentItemProjection;
    const manualRunning = {
      ...items[17],
      id: 'compact-manual-running',
      source: 'manual',
      status: 'inProgress',
    } as AgentItemProjection;
    const manualCompleted = {
      ...items[17],
      id: 'compact-manual-completed',
      source: 'manual',
    } as AgentItemProjection;
    const automaticRunning = {
      ...items[17],
      id: 'compact-automatic-running',
      status: 'inProgress',
    } as AgentItemProjection;
    const emptyHook = { ...items[1]!, id: 'empty-hook', text: '', fragments: [] } as AgentItemProjection;
    const boundaryItems = [items[1]!, emptyHook, waitItem, items[13]!, items[15]!, items[16]!, manualRunning, manualCompleted, automaticRunning, items[17]!, items[18]!];
    const { container } = render(<ConversationTimeline turns={[turn({ items: boundaryItems })]} loadState="ready" t={t} />);

    expect(Array.from(container.querySelectorAll('[data-item-type]'), (node) => node.getAttribute('data-item-type'))).toEqual([
      'hookPrompt',
      'contextCompaction',
      'contextCompaction',
      'contextCompaction',
      'contextCompaction',
    ]);
    expect(container.querySelector('[data-item-type="hookPrompt"]')?.getAttribute('data-kind')).toBe('user');
    expect(container.textContent).toContain('正在压缩上下文');
    expect(container.textContent).toContain('上下文已压缩');
    expect(container.textContent).toContain('正在自动压缩上下文');
    expect(container.textContent).toContain('上下文已自动压缩');
    expect(container.textContent).not.toContain('审查当前修改');
    expect(container.textContent).not.toContain('futureItem');
  });

  it('uses action-aware Multi-Agent summaries and agent state details', () => {
    const spawn = items[9]!;
    const send = { ...spawn, id: 'send', tool: 'sendInput', status: 'inProgress' } as AgentItemProjection;
    const resume = { ...spawn, id: 'resume', tool: 'resumeAgent', status: 'failed', agents: [], receiverThreadIds: ['thread-pending'] } as AgentItemProjection;
    const close = { ...spawn, id: 'close', tool: 'closeAgent', status: 'completed' } as AgentItemProjection;
    const { container } = render(<ConversationTimeline turns={[turn({ items: [spawn, send, resume, close] })]} loadState="ready" t={t} />);

    expect(container.querySelector('[data-item-id="10"] > summary')?.textContent).toContain('已创建');
    expect(container.querySelector('[data-item-id="send"] > summary')?.textContent).toContain('正在发送消息');
    expect(container.querySelector('[data-item-id="resume"] > summary')?.textContent).toContain('恢复失败');
    expect(container.querySelector('[data-item-id="close"] > summary')?.textContent).toContain('已关闭');
    expect(container.textContent).toContain('thread-child');
    expect(container.textContent).toContain('thread-pending');
    expect(container.textContent).toContain('状态未知');
    expect(container.textContent).toContain('已完成: 检查完成');
  });

  it('keeps raw reasoning and sensitive JSON values out of the DOM', () => {
    const secretItems = [
      items[4]!,
      { ...items[7], arguments: { apiKey: 'api-secret-value', nested: { authorization: 'Bearer secret-token', visible: 'safe-value' } }, structuredContent: { cookie: 'session-cookie', count: 1 } },
    ] as AgentItemProjection[];
    const { container } = render(<ConversationTimeline turns={[turn({ items: secretItems })]} loadState="ready" t={t} />);

    expect(container.textContent).toContain('推理摘要');
    expect(container.textContent).not.toContain('推理细节');
    expect(container.textContent).not.toContain('api-secret-value');
    expect(container.textContent).not.toContain('Bearer secret-token');
    expect(container.textContent).not.toContain('session-cookie');
    expect(container.textContent).toContain('[REDACTED]');
    expect(container.textContent).toContain('safe-value');
  });

  it('does not expose internal message phases from restored history', () => {
    const restoredMessage = { ...items[2]!, phase: 'final_answer' } as AgentItemProjection;
    const { container } = render(<ConversationTimeline turns={[turn({ items: [restoredMessage] })]} loadState="ready" t={t} />);

    expect(container.textContent).toContain('Agent 回复');
    expect(container.textContent).not.toContain('final_answer');
    expect(container.querySelector('.agent-phase')).toBeNull();
  });

  it('shows three web results by default and expands the remainder on demand', () => {
    const { container } = render(<ConversationTimeline turns={[turn({ items: [items[11]!] })]} loadState="ready" t={t} />);

    expect(container.querySelectorAll('.agent-search-results > li')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '显示更多 · 2' }));
    expect(container.querySelectorAll('.agent-search-results > li')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(container.querySelectorAll('.agent-search-results > li')).toHaveLength(3);
  });

  it('assigns semantic change kinds without deriving file state from diff text', () => {
    const fileItem = {
      ...items[6],
      changes: [
        { path: 'added.ts', kind: 'create', diff: '' },
        { path: 'updated.ts', kind: 'update', diff: '' },
        { path: 'deleted.ts', kind: 'delete', diff: '' },
        { path: 'moved.ts', kind: 'rename', diff: '' },
      ],
    } as AgentItemProjection;
    const { container } = render(<ConversationTimeline turns={[turn({ items: [fileItem] })]} loadState="ready" t={t} />);

    expect(Array.from(container.querySelectorAll('[data-change-kind]'), (node) => node.getAttribute('data-change-kind'))).toEqual(['added', 'updated', 'deleted', 'moved']);
  });

  it('bounds MCP progress and content while preserving source metadata and both text ends', () => {
    const longText = `MCP-TEXT-START-${'x'.repeat(10_000)}-MCP-TEXT-END`;
    const mcpItem = {
      ...items[7],
      pluginId: 'plugin-assets',
      resourceUri: 'mcp://assets/logo',
      progress: Array.from({ length: 10 }, (_, index) => `progress-${index + 1}`),
      content: [
        { type: 'text', text: longText },
        { type: 'resourceLink', uri: 'mcp://assets/logo', name: 'Logo resource' },
      ],
    } as AgentItemProjection;
    const { container } = render(<ConversationTimeline turns={[turn({ items: [mcpItem] })]} loadState="ready" t={t} />);
    const text = container.querySelector('.agent-tool-text')?.textContent ?? '';
    const progress = Array.from(
      container.querySelectorAll('.agent-progress-list > li'),
      (node) => node.textContent,
    );

    expect(progress).toEqual([
      'progress-3',
      'progress-4',
      'progress-5',
      'progress-6',
      'progress-7',
      'progress-8',
      'progress-9',
      'progress-10',
    ]);
    expect(container.querySelector('.agent-resource')?.textContent).toContain('Logo resource');
    expect(container.querySelector('.agent-meta')?.textContent).toContain('plugin-assets');
    expect(container.querySelector('.agent-meta')?.textContent).toContain('mcp://assets/logo');
    expect(text).toContain('MCP-TEXT-START');
    expect(text).toContain('MCP-TEXT-END');
    expect(text.length).toBeLessThan(longText.length);
  });

  it('promotes business tool failures and image generation loading to the activity header', () => {
    const failedTool = { ...items[8], success: false } as AgentItemProjection;
    const pendingImage = { ...items[14], status: 'inProgress', result: '', savedPath: undefined } as AgentItemProjection;
    const { container } = render(<ConversationTimeline turns={[turn({ items: [failedTool, pendingImage] })]} loadState="ready" t={t} />);

    expect(container.querySelector('[data-item-type="dynamicToolCall"]')?.getAttribute('data-status')).toBe('failed');
    expect(container.querySelector('[data-item-type="dynamicToolCall"] > summary')?.textContent).toContain('工具执行失败');
    expect(container.querySelector('.agent-media-loading')?.textContent).toContain('进行中');
  });

  it('bounds long output and diff previews while preserving both ends', () => {
    const longOutput = `OUTPUT-START-${'x'.repeat(20_000)}-OUTPUT-END`;
    const longDiff = `DIFF-START-${'y'.repeat(30_000)}-DIFF-END`;
    const command = { ...items[5], output: longOutput } as AgentItemProjection;
    const { container } = render(<ConversationTimeline turns={[turn({ items: [command], diff: longDiff })]} loadState="ready" t={t} />);
    const output = container.querySelector('.agent-output pre')?.textContent ?? '';
    const diff = container.querySelector('[data-panel="diff"] pre')?.textContent ?? '';

    expect(output).toContain('OUTPUT-START');
    expect(output).toContain('OUTPUT-END');
    expect(output.length).toBeLessThan(longOutput.length);
    expect(diff).toContain('DIFF-START');
    expect(diff).toContain('DIFF-END');
    expect(diff.length).toBeLessThan(longDiff.length);
  });

  it('does not expose file media URLs to image or audio elements', () => {
    const unsafeItems = [
      { ...items[0], content: [{ type: 'image', source: 'local', url: 'file:///Users/example/secret.png', label: '本地图片' }] },
      { ...items[8], content: [{ type: 'audio', url: 'file:///Users/example/secret.mp3' }] },
    ] as AgentItemProjection[];
    const { container } = render(<ConversationTimeline turns={[turn({ items: unsafeItems })]} loadState="ready" t={t} />);

    expect(container.querySelector('img[src^="file:"]')).toBeNull();
    expect(container.querySelector('audio[src^="file:"]')).toBeNull();
    expect(container.textContent).toContain('不支持的媒体地址');
  });

  it('emits semantic sub-thread navigation and returns to the parent view', () => {
    const onOpenThread = vi.fn();
    const onBackThread = vi.fn();
    render(<ConversationTimeline
      turns={[turn({ items: [items[9]!, items[10]!] })]}
      loadState="readOnly"
      t={t}
      threadContext={{ title: 'reviewer', subtitle: 'review' }}
      onOpenThread={onOpenThread}
      onBackThread={onBackThread}
    />);

    fireEvent.click(screen.getByRole('button', { name: '查看子 Agent 对话: 检查完成' }));
    fireEvent.click(screen.getByRole('button', { name: '查看子 Agent 对话: reviewer' }));
    fireEvent.click(screen.getByRole('button', { name: '返回上级 Agent' }));

    expect(onOpenThread).toHaveBeenNthCalledWith(1, 'thread-child');
    expect(onOpenThread).toHaveBeenNthCalledWith(2, 'thread-child');
    expect(onBackThread).toHaveBeenCalledTimes(1);
    expect(screen.getByText('正在查看子 Agent，对话为只读')).toBeTruthy();
  });

  it('shows immediate progress until the first assistant delta arrives', () => {
    const pending = turn({ status: 'inProgress', items: [items[0]!] });
    const { rerender } = render(<ConversationTimeline turns={[pending]} loadState="ready" t={t} />);

    expect(screen.getByRole('status').textContent).toContain('进行中');

    rerender(<ConversationTimeline turns={[{ ...pending, items: [items[0]!, { id: 'stream', type: 'agentMessage', kind: 'assistant', text: '首个增量' }] }]} loadState="ready" t={t} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('首个增量')).toBeTruthy();
  });
});
