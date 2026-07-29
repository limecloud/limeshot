import type { CodexRequestResult } from '@codex/index';
import type { AgentThreadInspectInput, AgentThreadInspectResult } from '../../shared/desktop';
import { projectThread } from './projection';
import type { CodexSupervisor } from './supervisor';

const MAX_TURN_PAGES = 100;
const MAX_ITEM_PAGES = 100;

export async function inspectSubThread(
  codex: Pick<CodexSupervisor, 'request'>,
  input: AgentThreadInspectInput,
): Promise<AgentThreadInspectResult> {
  if (!input || typeof input.parentThreadId !== 'string' || !input.parentThreadId || typeof input.threadId !== 'string' || !input.threadId) {
    throw new Error('无效的子线程参数');
  }
  if (input.parentThreadId === input.threadId) throw new Error('不能将当前线程作为子线程打开');

  const metadata = await codex.request('thread/read', { threadId: input.threadId });
  if (metadata.thread.parentThreadId !== input.parentThreadId) throw new Error('目标线程不属于当前 Agent');

  let turns;
  try {
    const result = await codex.request('thread/read', { threadId: input.threadId, includeTurns: true });
    turns = projectThread(result.thread);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('paginated threads')) throw error;
    turns = await readFullThreadTurns(codex, input.threadId, metadata.thread.historyMode);
  }

  return {
    threadId: metadata.thread.id,
    parentThreadId: input.parentThreadId,
    ...optionalLabel('name', metadata.thread.name),
    ...optionalLabel('agentNickname', metadata.thread.agentNickname),
    ...optionalLabel('agentRole', metadata.thread.agentRole),
    turns,
  };
}

export async function readFullThreadTurns(
  codex: Pick<CodexSupervisor, 'request'>,
  threadId: string,
  historyMode: 'legacy' | 'paginated',
) {
  const turns: CodexRequestResult<'thread/turns/list'>['data'] = [];
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < MAX_TURN_PAGES; pageIndex += 1) {
    const page: CodexRequestResult<'thread/turns/list'> = await codex.request('thread/turns/list', {
      threadId,
      cursor,
      limit: 100,
      sortDirection: 'asc',
      itemsView: historyMode === 'paginated' ? 'notLoaded' : 'full',
    });
    turns.push(...page.data);
    if (!page.nextCursor) {
      if (historyMode === 'paginated') {
        for (const turn of turns) {
          turn.items = await readFullTurnItems(codex, threadId, turn.id);
          turn.itemsView = 'full';
        }
      }
      return projectThread({ turns });
    }
    cursor = page.nextCursor;
  }
  throw new Error('线程历史超过可读取页数');
}

async function readFullTurnItems(codex: Pick<CodexSupervisor, 'request'>, threadId: string, turnId: string) {
  const items: Array<CodexRequestResult<'thread/items/list'>['data'][number]['item']> = [];
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < MAX_ITEM_PAGES; pageIndex += 1) {
    const page: CodexRequestResult<'thread/items/list'> = await codex.request('thread/items/list', {
      threadId,
      turnId,
      cursor,
      limit: 100,
      sortDirection: 'asc',
    });
    items.push(...page.data.map((entry) => entry.item));
    if (!page.nextCursor) return items;
    cursor = page.nextCursor;
  }
  throw new Error('Turn Item 历史超过可读取页数');
}

function optionalLabel<Key extends 'name' | 'agentNickname' | 'agentRole'>(key: Key, value: string | null | undefined): Partial<Record<Key, string>> {
  const label = value?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
  return label ? { [key]: label } as Record<Key, string> : {};
}
