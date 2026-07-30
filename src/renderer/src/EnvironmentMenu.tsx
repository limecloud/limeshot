import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  File,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  Globe2,
  Laptop,
  MessageCircle,
  Plus,
  Share2,
} from 'lucide-react';

import type { AgentTurnProjection, WorkspaceContextResult } from '../../shared/desktop';
import type { ConversationChangeSummary } from './conversationChanges';
import type { TranslationKey } from './i18n';
import { useWorkspacePanelTitles } from './WorkspaceChrome';

type Translate = (key: TranslationKey) => string;

interface EnvironmentMenuProps {
  projectId?: string;
  workspaceLabel?: string;
  turns: AgentTurnProjection[];
  changes: ConversationChangeSummary;
  onOpenReview: () => void;
  onOpenTerminal: () => void;
  onOpenTasks: () => void;
  onOpenBrowser: () => void;
  onOpenFiles: () => void;
  onClose: () => void;
  t: Translate;
}

export function EnvironmentMenu({
  projectId,
  workspaceLabel,
  turns,
  changes,
  onOpenReview,
  onOpenTerminal,
  onOpenTasks,
  onOpenBrowser,
  onOpenFiles,
  onClose,
  t,
}: EnvironmentMenuProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [context, setContext] = useState<WorkspaceContextResult>();
  const titles = useWorkspacePanelTitles();
  const sources = useMemo(() => conversationSources(turns), [turns]);
  const sideTask = useMemo(() => latestSideTask(turns), [turns]);
  const browserTitle = titles['right:browser'] ?? titles['bottom:browser'] ?? t('workspace.browser.newTab');

  useEffect(() => {
    let disposed = false;
    setContext(undefined);
    if (!projectId) return () => { disposed = true; };
    void window.limeShot.workspace.context.read({ projectId })
      .then((result) => {
        if (!disposed) setContext(result);
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, [projectId]);

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !(target instanceof Element && target.closest('.workspace-environment-toggle'))) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <aside className="environment-menu" aria-label={t('environment.title')} data-testid="environment-menu" ref={rootRef}>
      <MenuHeading label={t('environment.title')} actionLabel={t('environment.add')} onAction={() => run(onOpenFiles)} />
      <MenuAction icon={<FileDiff />} label={t('environment.changes')} onClick={() => run(onOpenReview)}>
        <span className="environment-change-stats"><ins>+{changes.additions.toLocaleString()}</ins><del>-{changes.deletions.toLocaleString()}</del></span>
      </MenuAction>
      <MenuValue icon={<Laptop />} label={t('environment.local')} value={context?.rootName ?? workspaceLabel} />
      <MenuValue icon={<GitBranch />} label={context?.branch ?? t('environment.noBranch')} trailing={<ChevronDown />} />
      <MenuAction icon={<GitCommitHorizontal />} label={t('environment.commitOrPush')} onClick={() => run(onOpenTerminal)} />
      <MenuAction icon={<GitCompareArrows />} label={t('environment.compareBranch')} trailing={<ArrowUpRight />} onClick={() => run(onOpenReview)} />

      <MenuSection label={t('environment.sideTasks')}>
        <MenuAction icon={<MessageCircle />} label={sideTask ?? t('environment.sideTask')} onClick={() => run(onOpenTasks)} />
      </MenuSection>

      <MenuSection label={t('environment.browser')}>
        <MenuAction icon={<Globe2 />} label={browserTitle} onClick={() => run(onOpenBrowser)} />
      </MenuSection>

      <MenuSection
        label={t('environment.sources')}
        actionLabel={t('environment.addSource')}
        onAction={() => run(onOpenFiles)}
      >
        {sources.slice(0, 3).map((source) => (
          <MenuAction icon={<File />} label={source} onClick={() => run(onOpenFiles)} key={source} />
        ))}
        {sources.length === 0 ? <MenuValue icon={<File />} label={t('environment.noSources')} /> : null}
        <MenuAction muted icon={<Share2 />} label={t('environment.viewAll')} onClick={() => run(onOpenFiles)} />
      </MenuSection>
    </aside>
  );
}

function MenuHeading({ label, actionLabel, onAction }: { label: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <header className="environment-menu-heading">
      <span>{label}</span>
      {onAction ? <button type="button" aria-label={actionLabel} title={actionLabel} onClick={onAction}><Plus size={15} /></button> : null}
    </header>
  );
}

function MenuSection({
  label,
  actionLabel,
  onAction,
  children,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="environment-menu-section">
      <MenuHeading label={label} actionLabel={actionLabel} onAction={onAction} />
      {children}
    </section>
  );
}

function MenuAction({
  icon,
  label,
  trailing,
  muted,
  children,
  onClick,
}: {
  icon: ReactElement;
  label: string;
  trailing?: ReactElement;
  muted?: boolean;
  children?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="environment-menu-row" data-muted={muted ? 'true' : 'false'} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
      {children ?? trailing ?? null}
    </button>
  );
}

function MenuValue({ icon, label, value, trailing }: { icon: ReactElement; label: string; value?: string; trailing?: ReactElement }) {
  return (
    <div className="environment-menu-row" role="presentation">
      {icon}
      <span>{label}</span>
      {value ? <small>{value}</small> : trailing ?? null}
    </div>
  );
}

function conversationSources(turns: AgentTurnProjection[]): string[] {
  const labels = turns.flatMap((turn) => turn.items.flatMap((item) => {
    if (item.type !== 'userMessage') return [];
    return item.content.flatMap((part) => part.type === 'image' || part.type === 'audio' ? [part.label.trim()] : []);
  })).filter(Boolean);
  return [...new Set(labels)].reverse();
}

function latestSideTask(turns: AgentTurnProjection[]): string | undefined {
  const tasks = turns.flatMap((turn) => turn.items.flatMap((item) => {
    if (item.type === 'subAgentActivity') return [item.agentPath || item.text];
    if (item.type === 'collabAgentToolCall') return [item.prompt || item.text];
    return [];
  })).filter(Boolean);
  return tasks.at(-1);
}
