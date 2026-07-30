import { describe, expect, it } from 'vitest';

import type { AgentTurnProjection } from '../../shared/desktop';
import { fileChangeKind, summarizeConversationChanges } from './conversationChanges';

describe('conversationChanges', () => {
  it('uses the latest structured snapshot per path and counts changed lines', () => {
    const turns: AgentTurnProjection[] = [{
      id: 'turn-1', status: 'completed', itemsView: 'full', items: [{
        id: 'change-1', type: 'fileChange', kind: 'activity', text: '', status: 'completed',
        changes: [{ path: 'src/App.tsx', kind: 'update', diff: '--- a/src/App.tsx\n+++ b/src/App.tsx\n-old\n+new' }],
      }],
    }, {
      id: 'turn-2', status: 'completed', itemsView: 'full', items: [{
        id: 'change-2', type: 'fileChange', kind: 'activity', text: '', status: 'completed',
        changes: [
          { path: 'src/App.tsx', kind: 'update', diff: '--- a/src/App.tsx\n+++ b/src/App.tsx\n-old\n+new\n+next' },
          { path: 'src/New.ts', kind: 'add', diff: '--- /dev/null\n+++ b/src/New.ts\n+export {}' },
        ],
      }],
    }];

    expect(summarizeConversationChanges(turns)).toMatchObject({
      additions: 3,
      deletions: 1,
      files: [
        { path: 'src/App.tsx', normalizedKind: 'updated', additions: 2, deletions: 1 },
        { path: 'src/New.ts', normalizedKind: 'added', additions: 1, deletions: 0 },
      ],
    });
  });

  it('falls back to the latest aggregate diff when no structured file snapshot exists', () => {
    const summary = summarizeConversationChanges([{
      id: 'turn-1', status: 'completed', itemsView: 'full', items: [],
      diff: '--- a/file\n+++ b/file\n-before\n+after',
    }]);

    expect(summary).toMatchObject({ files: [], additions: 1, deletions: 1, aggregateDiff: expect.stringContaining('+after') });
  });

  it('normalizes upstream change kinds without inferring them from diff text', () => {
    expect(fileChangeKind('create')).toBe('added');
    expect(fileChangeKind('remove')).toBe('deleted');
    expect(fileChangeKind('rename')).toBe('moved');
    expect(fileChangeKind('patch')).toBe('updated');
  });
});
