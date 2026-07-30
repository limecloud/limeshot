import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Files,
  GitCompareArrows,
  Globe2,
  ListTodo,
  Maximize2,
  Minimize2,
  Plus,
  SquareTerminal,
  X,
} from 'lucide-react';

import type { AgentItemProjection, AgentTurnProjection } from '../../shared/desktop';
import { AgentItemRenderer } from './ConversationTimeline';
import { ConversationReview } from './ConversationReview';
import type { TranslationKey } from './i18n';
import { WorkspaceBrowser } from './WorkspaceBrowser';
import { WorkspaceFiles } from './WorkspaceFiles';
import { WorkspaceTerminal } from './WorkspaceTerminal';

export type WorkspaceTabKind = 'review' | 'terminal' | 'browser' | 'files' | 'tasks';
export type WorkspacePanelTarget = 'right' | 'bottom';

type Translate = (key: TranslationKey) => string;

const tabKinds: WorkspaceTabKind[] = ['review', 'terminal', 'browser', 'files', 'tasks'];

interface WorkspaceChromeContextValue {
  titles: Record<string, string>;
  setTitle: (target: WorkspacePanelTarget, tab: WorkspaceTabKind, title?: string) => void;
}

const WorkspaceChromeContext = createContext<WorkspaceChromeContextValue>({ titles: {}, setTitle: () => undefined });

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const setTitle = useCallback((target: WorkspacePanelTarget, tab: WorkspaceTabKind, title?: string) => {
    const key = `${target}:${tab}`;
    setTitles((current) => {
      if (!title) {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      return current[key] === title ? current : { ...current, [key]: title };
    });
  }, []);
  const value = useMemo(() => ({ titles, setTitle }), [setTitle, titles]);
  return <WorkspaceChromeContext.Provider value={value}>{children}</WorkspaceChromeContext.Provider>;
}

export function useWorkspacePanelTitle(target: WorkspacePanelTarget, tab: WorkspaceTabKind, title?: string) {
  const { setTitle } = useContext(WorkspaceChromeContext);
  useEffect(() => {
    setTitle(target, tab, title);
    return () => setTitle(target, tab, undefined);
  }, [setTitle, tab, target, title]);
}

export function useWorkspacePanelTitles(): Readonly<Record<string, string>> {
  return useContext(WorkspaceChromeContext).titles;
}

const shortcuts: Partial<Record<WorkspaceTabKind, string>> = {
  review: 'Ctrl+Shift+G',
  terminal: 'Ctrl+`',
  browser: 'Cmd+T',
  files: 'Cmd+P',
};

interface WorkspacePanelTabsProps {
  target: WorkspacePanelTarget;
  tabs: WorkspaceTabKind[];
  activeTab?: WorkspaceTabKind;
  expanded?: boolean;
  onActivate: (tab: WorkspaceTabKind) => void;
  onAdd: (tab: WorkspaceTabKind) => void;
  onCloseTab: (tab: WorkspaceTabKind) => void;
  onClosePanel: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  t: Translate;
}

export function WorkspacePanelTabs({
  target,
  tabs,
  activeTab,
  expanded,
  onActivate,
  onAdd,
  onCloseTab,
  onClosePanel,
  onExpandedChange,
  t,
}: WorkspacePanelTabsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const { titles } = useContext(WorkspaceChromeContext);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRoot.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className="workspace-panel-tabs" data-panel-target={target} data-testid={`workspace-${target}-tabs`}>
      <div className="workspace-tab-list" role="tablist" aria-label={t(`workspace.${target}Panel`)}>
        {tabs.map((tab) => (
          <div className="workspace-tab" data-active={activeTab === tab ? 'true' : 'false'} key={tab}>
            <button
              type="button"
              role="tab"
              data-tab-kind={tab}
              aria-selected={activeTab === tab}
              onClick={() => onActivate(tab)}
            >
              <TabIcon tab={tab} />
              <span>{titles[`${target}:${tab}`] ?? t(`workspace.tab.${tab}` as TranslationKey)}</span>
            </button>
            <button
              className="workspace-tab-close"
              type="button"
              aria-label={`${t('workspace.closeTab')}: ${t(`workspace.tab.${tab}` as TranslationKey)}`}
              onClick={() => onCloseTab(tab)}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="workspace-tab-add" ref={menuRoot}>
        <button
          type="button"
          aria-label={t('workspace.openTab')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={t('workspace.openTab')}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div className="workspace-tab-menu" role="menu" data-testid={`workspace-${target}-menu`}>
            {tabKinds.map((tab) => (
              <button
                type="button"
                role="menuitem"
                key={tab}
                onClick={() => {
                  onAdd(tab);
                  setMenuOpen(false);
                }}
              >
                <TabIcon tab={tab} />
                <span>{t(`workspace.tab.${tab}` as TranslationKey)}</span>
                {shortcuts[tab] ? <kbd>{shortcuts[tab]}</kbd> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <span className="workspace-panel-tabs-spacer" />
      {target === 'right' && onExpandedChange ? (
        <button
          type="button"
          data-active={expanded ? 'true' : 'false'}
          aria-label={expanded ? t('workspace.restorePanel') : t('workspace.expandPanel')}
          title={expanded ? t('workspace.restorePanel') : t('workspace.expandPanel')}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
        </button>
      ) : null}
      <button type="button" aria-label={t('workspace.closePanel')} title={t('workspace.closePanel')} onClick={onClosePanel}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

interface WorkspacePanelSurfaceProps {
  tab?: WorkspaceTabKind;
  target: WorkspacePanelTarget;
  turns: AgentTurnProjection[];
  active?: boolean;
  projectId?: string;
  selectedChangePath?: string;
  openingThreadId?: string;
  onSelectedChangePathChange: (path: string) => void;
  onOpenReview: (path?: string) => void;
  onOpenThread: (threadId: string) => void;
  t: Translate;
}

export function WorkspacePanelSurface({
  tab,
  target,
  turns,
  active = true,
  projectId,
  selectedChangePath,
  openingThreadId,
  onSelectedChangePathChange,
  onOpenReview,
  onOpenThread,
  t,
}: WorkspacePanelSurfaceProps) {
  if (!tab) return null;
  if (tab === 'review') {
    return (
      <ConversationReview
        turns={turns}
        selectedChangePath={selectedChangePath}
        onSelectedChangePathChange={onSelectedChangePathChange}
        t={t}
      />
    );
  }

  if (tab === 'terminal') return <WorkspaceTerminal active={active} projectId={projectId} target={target} t={t} />;
  if (tab === 'browser') return <WorkspaceBrowser active={active} target={target} t={t} />;
  if (tab === 'files') return <WorkspaceFiles projectId={projectId} target={target} t={t} />;

  const items = panelItems(turns, tab);
  return (
    <section
      className="workspace-panel-surface"
      role="tabpanel"
      aria-label={t(`workspace.tab.${tab}` as TranslationKey)}
      data-panel-kind={tab}
      data-panel-target={target}
      data-testid={`workspace-${target}-${tab}`}
    >
      {items.length > 0 ? (
        <div className="workspace-projection-list">
          {items.map(({ item, key }) => (
            <AgentItemRenderer
              item={item}
              t={t}
              onOpenThread={onOpenThread}
              onOpenChanges={onOpenReview}
              openingThreadId={openingThreadId}
              key={key}
            />
          ))}
        </div>
      ) : (
        <PanelEmpty icon={<TabIcon tab={tab} />} label={t(`workspace.empty.${tab}` as TranslationKey)} />
      )}
    </section>
  );
}

interface WorkspacePanelSurfacesProps extends Omit<WorkspacePanelSurfaceProps, 'tab' | 'active'> {
  tabs: WorkspaceTabKind[];
  activeTab?: WorkspaceTabKind;
}

export function WorkspacePanelSurfaces({ tabs, activeTab, ...props }: WorkspacePanelSurfacesProps) {
  return (
    <div className="workspace-panel-stack">
      {tabs.map((tab) => (
        <div className="workspace-panel-layer" hidden={activeTab !== tab} key={tab}>
          <WorkspacePanelSurface {...props} tab={tab} active={activeTab === tab} />
        </div>
      ))}
    </div>
  );
}

function panelItems(turns: AgentTurnProjection[], tab: WorkspaceTabKind): Array<{ item: AgentItemProjection; key: string }> {
  return turns.flatMap((turn) => turn.items.flatMap((item) => {
    const visible = tab === 'tasks' ? item.type === 'collabAgentToolCall' || item.type === 'subAgentActivity' : false;
    return visible ? [{ item, key: `${turn.id}:${item.id}` }] : [];
  }));
}

function PanelEmpty({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="workspace-panel-empty">{icon}<span>{label}</span></div>;
}

function TabIcon({ tab }: { tab: WorkspaceTabKind }) {
  if (tab === 'review') return <GitCompareArrows size={14} aria-hidden="true" />;
  if (tab === 'terminal') return <SquareTerminal size={14} aria-hidden="true" />;
  if (tab === 'browser') return <Globe2 size={14} aria-hidden="true" />;
  if (tab === 'files') return <Files size={14} aria-hidden="true" />;
  return <ListTodo size={14} aria-hidden="true" />;
}
