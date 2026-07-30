import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, FileCode2, FileDiff, Folder, GitCompareArrows, Search } from 'lucide-react';

import type { AgentTurnProjection } from '../../shared/desktop';
import { summarizeConversationChanges, type ConversationFileChange } from './conversationChanges';
import type { TranslationKey } from './i18n';

type Translate = (key: TranslationKey) => string;

interface ConversationReviewProps {
  turns: AgentTurnProjection[];
  selectedChangePath?: string;
  onSelectedChangePathChange: (path: string) => void;
  t: Translate;
}

interface ChangeTreeNode {
  name: string;
  path: string;
  children: ChangeTreeNode[];
  change?: ConversationFileChange;
}

export function ConversationReview({
  turns,
  selectedChangePath,
  onSelectedChangePathChange,
  t,
}: ConversationReviewProps) {
  const [filter, setFilter] = useState('');
  const changes = summarizeConversationChanges(turns);
  const selectedChange = changes.files.find((change) => change.path === selectedChangePath) ?? changes.files[0];
  const visibleChanges = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return query ? changes.files.filter((change) => change.path.toLocaleLowerCase().includes(query)) : changes.files;
  }, [changes.files, filter]);
  const tree = useMemo(() => buildChangeTree(visibleChanges), [visibleChanges]);

  return (
    <section
      className="conversation-review"
      aria-label={t('inspector.review')}
      data-selected-change-path={selectedChange?.path ?? ''}
      data-testid="conversation-review"
    >
      <div className="conversation-review-main">
        <header className="conversation-review-summary">
          <span><GitCompareArrows size={14} aria-hidden="true" /><strong>{changes.files.length} {t('inspector.changedFiles')}</strong></span>
          <DiffStats additions={changes.additions} deletions={changes.deletions} />
          {changes.files.length > 0 ? (
            <label className="conversation-review-mobile-file">
              <FileDiff size={14} aria-hidden="true" />
              <select
                aria-label={t('inspector.changedFiles')}
                value={selectedChange?.path ?? ''}
                onChange={(event) => onSelectedChangePathChange(event.target.value)}
              >
                {changes.files.map((change) => <option value={change.path} key={change.path}>{change.path}</option>)}
              </select>
            </label>
          ) : null}
        </header>

        {selectedChange ? (
          <ChangeDiff change={selectedChange} t={t} />
        ) : changes.aggregateDiff ? (
          <section className="conversation-diff-viewer conversation-aggregate-diff" data-testid="conversation-diff-viewer">
            <header><FileDiff size={14} aria-hidden="true" /><strong>{t('inspector.aggregateDiff')}</strong></header>
            <UnifiedDiff value={changes.aggregateDiff} />
          </section>
        ) : (
          <p className="conversation-review-empty">{t('inspector.noChanges')}</p>
        )}
      </div>

      <aside className="conversation-review-files" aria-label={t('inspector.changedFiles')} data-testid="conversation-review-files">
        <header><strong>{t('inspector.changedFiles')}</strong><span>{changes.files.length}</span></header>
        <label className="conversation-review-filter">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('inspector.filterFiles')}
            aria-label={t('inspector.filterFiles')}
          />
        </label>
        {tree.length > 0 ? (
          <nav className="conversation-change-tree" aria-label={t('inspector.changedFiles')}>
            <ChangeTree
              nodes={tree}
              depth={0}
              selectedPath={selectedChange?.path}
              onSelect={onSelectedChangePathChange}
              t={t}
            />
          </nav>
        ) : <p className="conversation-review-empty">{t('inspector.noChanges')}</p>}
      </aside>
    </section>
  );
}

function ChangeTree({
  nodes,
  depth,
  selectedPath,
  onSelect,
  t,
}: {
  nodes: ChangeTreeNode[];
  depth: number;
  selectedPath?: string;
  onSelect: (path: string) => void;
  t: Translate;
}) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={`${node.change ? 'file' : 'directory'}:${node.path}`}>
          {node.change ? (
            <button
              type="button"
              aria-label={node.change.path}
              title={node.change.path}
              data-change-path={node.change.path}
              data-selected={node.change.path === selectedPath ? 'true' : 'false'}
              style={{ '--tree-depth': depth } as CSSProperties}
              onClick={() => onSelect(node.change!.path)}
            >
              <FileCode2 size={13} aria-hidden="true" />
              <span>{node.name}</span>
              <ChangeKind change={node.change} t={t} />
              <DiffStats additions={node.change.additions} deletions={node.change.deletions} />
            </button>
          ) : (
            <>
              <div className="conversation-change-directory" style={{ '--tree-depth': depth } as CSSProperties}>
                <ChevronDown size={12} aria-hidden="true" />
                <Folder size={13} aria-hidden="true" />
                <span>{node.name}</span>
              </div>
              <ChangeTree nodes={node.children} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} t={t} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function ChangeKind({ change, t }: { change: ConversationFileChange; t: Translate }) {
  const labels = { added: 'A', updated: 'M', deleted: 'D', moved: 'R' } as const;
  return (
    <span
      className="conversation-change-kind"
      data-change-kind={change.normalizedKind}
      title={t(`inspector.changeKind.${change.normalizedKind}` as TranslationKey)}
    >
      {labels[change.normalizedKind]}
    </span>
  );
}

function ChangeDiff({ change, t }: { change: ConversationFileChange; t: Translate }) {
  return (
    <section className="conversation-diff-viewer" data-change-path={change.path} data-testid="conversation-diff-viewer">
      <header>
        <FileDiff size={14} aria-hidden="true" />
        <code title={change.path}>{change.path}</code>
        <span data-change-kind={change.normalizedKind}>{t(`inspector.changeKind.${change.normalizedKind}` as TranslationKey)}</span>
        <DiffStats additions={change.additions} deletions={change.deletions} />
      </header>
      {change.diff ? <UnifiedDiff value={change.diff} /> : <p className="conversation-review-empty">{t('agent.noContent')}</p>}
    </section>
  );
}

function UnifiedDiff({ value }: { value: string }) {
  return (
    <pre className="conversation-unified-diff">
      <code>{diffRows(preview(value)).map((line, index) => (
        <span data-diff-line={line.kind} key={`${index}-${line.text}`}>
          <span aria-hidden="true">{line.oldLine ?? ''}</span>
          <span aria-hidden="true">{line.newLine ?? ''}</span>
          <span>{line.text || ' '}</span>
        </span>
      ))}</code>
    </pre>
  );
}

type DiffLineKind = 'addition' | 'context' | 'deletion' | 'header' | 'hunk' | 'meta';

interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

function diffRows(value: string): DiffLine[] {
  let oldLine: number | undefined;
  let newLine: number | undefined;
  return value.split('\n').map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { kind: 'hunk', text };
    }
    if (text.startsWith('diff ') || text.startsWith('index ') || text.startsWith('---') || text.startsWith('+++')) {
      return { kind: 'header', text };
    }
    if (text.startsWith('\\ No newline')) return { kind: 'meta', text };
    if (text.startsWith('+')) {
      const row = { kind: 'addition' as const, text, ...(newLine === undefined ? {} : { newLine }) };
      if (newLine !== undefined) newLine += 1;
      return row;
    }
    if (text.startsWith('-')) {
      const row = { kind: 'deletion' as const, text, ...(oldLine === undefined ? {} : { oldLine }) };
      if (oldLine !== undefined) oldLine += 1;
      return row;
    }
    const row = {
      kind: 'context' as const,
      text,
      ...(oldLine === undefined ? {} : { oldLine }),
      ...(newLine === undefined ? {} : { newLine }),
    };
    if (oldLine !== undefined) oldLine += 1;
    if (newLine !== undefined) newLine += 1;
    return row;
  });
}

export function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  if (additions === 0 && deletions === 0) return null;
  return (
    <span className="conversation-diff-stats" aria-label={`+${additions} -${deletions}`}>
      <ins>+{additions}</ins><del>-{deletions}</del>
    </span>
  );
}

function buildChangeTree(changes: ConversationFileChange[]): ChangeTreeNode[] {
  const root: ChangeTreeNode[] = [];
  for (const change of changes) {
    const segments = change.path.replaceAll('\\', '/').split('/').filter(Boolean);
    let children = root;
    let parentPath = '';
    segments.forEach((name, index) => {
      const path = parentPath ? `${parentPath}/${name}` : name;
      const isFile = index === segments.length - 1;
      let node = children.find((candidate) => candidate.name === name && Boolean(candidate.change) === isFile);
      if (!node) {
        node = { name, path, children: [], ...(isFile ? { change } : {}) };
        children.push(node);
      }
      children = node.children;
      parentPath = path;
    });
  }
  return root;
}

function preview(value: string): string {
  const limit = 24_000;
  return value.length <= limit ? value : `${value.slice(0, limit / 2)}\n…\n${value.slice(-limit / 2)}`;
}
