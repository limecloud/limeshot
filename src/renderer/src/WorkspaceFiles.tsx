import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  File,
  FileText,
  Folder,
  FolderOpen,
  Search,
} from 'lucide-react';

import type { WorkspaceFileEntry, WorkspaceFileReadResult, WorkspaceFilesListResult } from '../../shared/desktop';
import { useWorkspacePanelTitle, type WorkspacePanelTarget } from './WorkspaceChrome';
import type { TranslationKey } from './i18n';

type Translate = (key: TranslationKey) => string;

interface WorkspaceFilesProps {
  projectId?: string;
  target: WorkspacePanelTarget;
  t: Translate;
}

export function WorkspaceFiles({ projectId, target, t }: WorkspaceFilesProps) {
  const [directories, setDirectories] = useState<Record<string, WorkspaceFilesListResult>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string>();
  const [preview, setPreview] = useState<WorkspaceFileReadResult>();
  const [sourceMode, setSourceMode] = useState(false);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const root = directories[''];

  useWorkspacePanelTitle(target, 'files', selectedPath?.split('/').at(-1) || t('workspace.files.openFile'));

  const loadDirectory = useCallback(async (directory: string) => {
    if (!projectId) return;
    const result = await window.limeShot.workspace.files.list({ projectId, directory });
    setDirectories((current) => ({ ...current, [directory]: result }));
    return result;
  }, [projectId]);

  const openFile = useCallback(async (path: string) => {
    if (!projectId) return;
    setSelectedPath(path);
    setLoading(true);
    setError(undefined);
    try {
      setPreview(await window.limeShot.workspace.files.read({ projectId, path }));
      setSourceMode(false);
    } catch (cause) {
      setPreview(undefined);
      setError(cause instanceof Error ? cause.message : t('workspace.files.failed'));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    setDirectories({});
    setExpanded(new Set());
    setSelectedPath(undefined);
    setPreview(undefined);
    setError(undefined);
    if (!projectId) return;
    let disposed = false;
    setLoading(true);
    void loadDirectory('')
      .then((result) => {
        if (disposed || !result) return;
        const preferred = ['AGENTS.md', 'README.md'].map((name) => result.entries.find((entry) => entry.name === name)).find(Boolean)
          ?? result.entries.find((entry) => entry.kind === 'file' && /\.(?:md|mdx|txt)$/iu.test(entry.name));
        if (preferred) void openFile(preferred.path);
      })
      .catch((cause: unknown) => { if (!disposed) setError(cause instanceof Error ? cause.message : t('workspace.files.failed')); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [loadDirectory, openFile, projectId, t]);

  const toggleDirectory = async (path: string) => {
    if (expanded.has(path)) {
      setExpanded((current) => new Set([...current].filter((item) => item !== path)));
      return;
    }
    setExpanded((current) => new Set(current).add(path));
    if (!directories[path]) {
      try {
        await loadDirectory(path);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('workspace.files.failed'));
      }
    }
  };

  const visibleRootEntries = useMemo(() => {
    if (!root || !filter.trim()) return root?.entries ?? [];
    const query = filter.trim().toLocaleLowerCase();
    return root.entries.filter((entry) => entry.name.toLocaleLowerCase().includes(query));
  }, [filter, root]);

  if (!projectId) return <div className="workspace-tool-message"><span>{t('workspace.projectRequired')}</span></div>;

  return (
    <section className="workspace-files" data-testid={`workspace-${target}-files`}>
      <div className="workspace-files-document">
        <header className="workspace-files-document-toolbar">
          <span>{root?.rootName ?? t('workspace.tab.files')}<ChevronRight size={12} />{selectedPath ?? t('workspace.files.openFile')}</span>
          <button type="button" data-active={sourceMode ? 'true' : 'false'} disabled={!preview} onClick={() => setSourceMode((current) => !current)}>
            {sourceMode ? <Eye size={14} /> : <Code2 size={14} />}
            {sourceMode ? t('workspace.files.preview') : t('workspace.files.viewSource')}
          </button>
          <button type="button" disabled={!selectedPath} onClick={() => selectedPath && window.limeShot.workspace.files.reveal({ projectId, path: selectedPath })}>
            {t('workspace.files.open')}
          </button>
        </header>
        <div className="workspace-files-preview">
          {loading && !preview ? <div className="workspace-tool-message"><span>{t('workspace.files.loading')}</span></div> : null}
          {error ? <div className="workspace-tool-message" data-error="true"><span>{error}</span></div> : null}
          {preview ? sourceMode || preview.kind === 'text'
            ? <pre className="workspace-source-preview"><code>{preview.content}</code></pre>
            : <MarkdownPreview source={preview.content} /> : null}
          {preview?.truncated ? <div className="workspace-file-truncated">{t('workspace.files.truncated')}</div> : null}
        </div>
      </div>
      <aside className="workspace-files-tree" aria-label={t('workspace.files.tree')}>
        <label><Search size={13} /><input value={filter} aria-label={t('workspace.files.filter')} placeholder={t('workspace.files.filter')} onChange={(event) => setFilter(event.target.value)} /></label>
        <div role="tree">
          <FileTreeRows
            entries={visibleRootEntries}
            directories={directories}
            expanded={expanded}
            selectedPath={selectedPath}
            depth={0}
            onDirectoryToggle={(path) => void toggleDirectory(path)}
            onFileOpen={(path) => void openFile(path)}
          />
          {root?.truncated ? <small>{t('workspace.files.directoryTruncated')}</small> : null}
        </div>
      </aside>
    </section>
  );
}

interface FileTreeRowsProps {
  entries: WorkspaceFileEntry[];
  directories: Record<string, WorkspaceFilesListResult>;
  expanded: Set<string>;
  selectedPath?: string;
  depth: number;
  onDirectoryToggle: (path: string) => void;
  onFileOpen: (path: string) => void;
}

function FileTreeRows(props: FileTreeRowsProps) {
  return props.entries.map((entry) => {
    const isDirectory = entry.kind === 'directory';
    const isExpanded = props.expanded.has(entry.path);
    return (
      <Fragment key={entry.path}>
        <button
          type="button"
          role="treeitem"
          aria-expanded={isDirectory ? isExpanded : undefined}
          data-selected={props.selectedPath === entry.path ? 'true' : 'false'}
          data-kind={entry.kind}
          style={{ paddingLeft: 8 + props.depth * 16 }}
          title={entry.path}
          onClick={() => isDirectory ? props.onDirectoryToggle(entry.path) : entry.kind === 'file' && props.onFileOpen(entry.path)}
        >
          {isDirectory ? isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span />}
          {isDirectory ? isExpanded ? <FolderOpen size={14} /> : <Folder size={14} /> : /\.(?:md|mdx)$/iu.test(entry.name) ? <FileText size={14} /> : <File size={14} />}
          <span>{entry.name}</span>
        </button>
        {isDirectory && isExpanded && props.directories[entry.path] ? (
          <FileTreeRows
            {...props}
            entries={props.directories[entry.path].entries}
            depth={props.depth + 1}
          />
        ) : null}
      </Fragment>
    );
  });
}

function MarkdownPreview({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(source), [source]);
  return <article className="workspace-markdown-preview">{blocks}</article>;
}

function parseMarkdownBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^```([^\s]*)\s*$/u);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/u.test(lines[index])) code.push(lines[index++]);
      index += 1;
      blocks.push(<pre className="workspace-markdown-code" key={`code-${index}`} data-language={fence[1] || 'text'}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/u);
    if (heading) {
      const level = heading[1].length;
      const Heading = `h${level}` as keyof React.JSX.IntrinsicElements;
      blocks.push(<Heading key={`heading-${index}`}>{renderInlineMarkdown(heading[2], index)}</Heading>);
      index += 1;
      continue;
    }
    if (/^---+\s*$/u.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }
    const listMatch = line.match(/^\s*(?:[-*+]|(\d+)\.)\s+(.+)$/u);
    if (listMatch) {
      const ordered = Boolean(listMatch[1]);
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:[-*+]|(\d+)\.)\s+(.+)$/u);
        if (!item || Boolean(item[1]) !== ordered) break;
        items.push(<li key={`item-${index}`}>{renderInlineMarkdown(item[2], index)}</li>);
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={`list-${index}`}>{items}</List>);
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push(<blockquote key={`quote-${index}`}>{renderInlineMarkdown(line.slice(2), index)}</blockquote>);
      index += 1;
      continue;
    }
    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|```|\s*(?:[-*+] |\d+\. )|> |---)/u.test(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push(<p key={`paragraph-${index}`}>{renderInlineMarkdown(paragraph.join(' '), index)}</p>);
  }
  return blocks;
}

function renderInlineMarkdown(source: string, keyPrefix: number): ReactNode[] {
  return source.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/gu).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
    if (link) return <span className="workspace-markdown-link" key={`${keyPrefix}-${index}`} title={link[2]}>{link[1]}</span>;
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>;
  });
}
