import type { AgentFileChangeProjection, AgentTurnProjection } from '../../shared/desktop';

export type FileChangeKind = 'added' | 'updated' | 'deleted' | 'moved';

export interface ConversationFileChange extends AgentFileChangeProjection {
  normalizedKind: FileChangeKind;
  additions: number;
  deletions: number;
}

export interface ConversationChangeSummary {
  files: ConversationFileChange[];
  additions: number;
  deletions: number;
  aggregateDiff?: string;
}

export function summarizeConversationChanges(turns: AgentTurnProjection[]): ConversationChangeSummary {
  const changesByPath = new Map<string, AgentFileChangeProjection>();
  let aggregateDiff: string | undefined;

  for (const turn of turns) {
    if (turn.diff?.trim()) aggregateDiff = turn.diff;
    for (const item of turn.items) {
      if (item.type !== 'fileChange') continue;
      for (const change of item.changes) changesByPath.set(change.path, change);
    }
  }

  const files = [...changesByPath.values()].map((change) => {
    const stats = diffLineStats(change.diff);
    return { ...change, normalizedKind: fileChangeKind(change.kind), ...stats };
  });
  const structuredStats = files.reduce(
    (result, file) => ({ additions: result.additions + file.additions, deletions: result.deletions + file.deletions }),
    { additions: 0, deletions: 0 },
  );
  const stats = files.length > 0 ? structuredStats : diffLineStats(aggregateDiff ?? '');

  return { files, ...stats, ...(aggregateDiff ? { aggregateDiff } : {}) };
}

export function fileChangeKind(kind: string): FileChangeKind {
  const normalized = kind.toLowerCase();
  if (normalized.includes('add') || normalized.includes('create')) return 'added';
  if (normalized.includes('delete') || normalized.includes('remove')) return 'deleted';
  if (normalized.includes('move') || normalized.includes('rename')) return 'moved';
  return 'updated';
}

function diffLineStats(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}
