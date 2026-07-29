import {
  Check,
  ChevronDown,
  Ellipsis,
  Folder,
  FolderPen,
  Layers3,
  MessageSquare,
  MessageSquarePlus,
  Pin,
  PinOff,
  PlusSquare,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { ProjectSummary } from '@business/generated';
import type { AgentConversationSummary } from '../../shared/desktop';
import type { TranslationKey } from './i18n';

interface AppSidebarProps {
  projects: ProjectSummary[];
  conversations: AgentConversationSummary[];
  selectedProjectId?: string;
  selectedThreadId?: string;
  conversationTitle: string;
  searchOpen: boolean;
  searchQuery: string;
  footer: ReactNode;
  onHome: () => void;
  onNewConversation: () => void;
  onConversationSelect: (threadId: string) => void;
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onProjectSelect: (projectId: string) => void;
  onProjectEdit: (projectId: string) => void;
  t: (key: TranslationKey) => string;
}

type RecentLayout = 'grouped' | 'flat';
type RecentSort = 'priority' | 'updated' | 'manual';
const PINNED_PROJECTS_KEY = 'limeshot.sidebar.pinnedProjects';
const RECENT_LAYOUT_KEY = 'limeshot.sidebar.recentLayout';
const RECENT_SORT_KEY = 'limeshot.sidebar.recentSort';

export function AppSidebar({
  projects,
  conversations,
  selectedProjectId,
  selectedThreadId,
  conversationTitle,
  searchOpen,
  searchQuery,
  footer,
  onHome,
  onNewConversation,
  onConversationSelect,
  onSearchOpenChange,
  onSearchQueryChange,
  onProjectSelect,
  onProjectEdit,
  t,
}: AppSidebarProps) {
  const [openMenu, setOpenMenu] = useState<string>();
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>(readPinnedProjects);
  const [recentLayout, setRecentLayout] = useState<RecentLayout>(() => readChoice(RECENT_LAYOUT_KEY, ['grouped', 'flat'], 'grouped'));
  const [recentSort, setRecentSort] = useState<RecentSort>(() => readChoice(RECENT_SORT_KEY, ['priority', 'updated', 'manual'], 'priority'));
  const [projectMenuPosition, setProjectMenuPosition] = useState<{ left: number; top: number }>();
  const query = searchQuery.trim().toLocaleLowerCase();
  const filteredProjects = query
    ? projects.filter((project) => `${project.name} ${project.workspaceName}`.toLocaleLowerCase().includes(query))
    : projects;
  const visibleConversations = query
    ? conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(query))
    : conversations;
  const visibleProjects = useMemo(() => {
    if (recentSort === 'manual') return filteredProjects;
    return [...filteredProjects].sort((left, right) => {
      if (recentSort === 'priority') {
        const leftPinned = pinnedProjectIds.includes(left.projectId);
        const rightPinned = pinnedProjectIds.includes(right.projectId);
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      }
      return right.updatedAtEpochMs - left.updatedAtEpochMs;
    });
  }, [filteredProjects, pinnedProjectIds, recentSort]);
  const sortedConversations = useMemo(() => recentSort === 'manual'
    ? visibleConversations
    : [...visibleConversations].sort((left, right) => right.updatedAtEpochMs - left.updatedAtEpochMs), [recentSort, visibleConversations]);

  useEffect(() => {
    if (!openMenu) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const insidePopover = target instanceof Element && target.closest('[data-sidebar-popover="true"]');
      const insideTrigger = target instanceof Element && target.closest('[data-sidebar-menu-trigger="true"]');
      if (!insidePopover && !insideTrigger) setOpenMenu(undefined);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(undefined);
    };
    const onResize = () => setOpenMenu(undefined);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [openMenu]);

  useEffect(() => writeStorage(PINNED_PROJECTS_KEY, pinnedProjectIds), [pinnedProjectIds]);
  useEffect(() => writeStorage(RECENT_LAYOUT_KEY, recentLayout), [recentLayout]);
  useEffect(() => writeStorage(RECENT_SORT_KEY, recentSort), [recentSort]);

  const togglePinned = (projectId: string) => {
    setPinnedProjectIds((current) => current.includes(projectId)
      ? current.filter((candidate) => candidate !== projectId)
      : [...current, projectId]);
    setOpenMenu(undefined);
  };

  return (
    <aside className="sidebar" aria-label={t('nav.projects')}>
      <button className="brand-row" type="button" onClick={onHome} title={t('home.title')}>
        <span className="brand-mark" aria-hidden="true"><Layers3 size={15} /></span>
        <strong>{t('app.name')}</strong>
        <small>v0.3.0</small>
      </button>

      <nav className="sidebar-actions" aria-label={t('nav.primary')}>
        <button type="button" onClick={onNewConversation}>
          <MessageSquarePlus size={15} aria-hidden="true" /><span>{t('nav.newConversation')}</span>
        </button>
        <button type="button" aria-expanded={searchOpen} onClick={() => onSearchOpenChange(!searchOpen)}>
          <Search size={15} aria-hidden="true" /><span>{t('nav.search')}</span>
        </button>
      </nav>

      {searchOpen ? (
        <label className="project-search">
          <Search size={13} aria-hidden="true" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={t('nav.searchPlaceholder')}
          />
          {searchQuery ? (
            <button type="button" onClick={() => onSearchQueryChange('')} title={t('nav.clearSearch')}>
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      ) : null}

      <section className="sidebar-projects">
        <header className="sidebar-recent-header">
          <span>{t('nav.recent')}</span>
          <div className="sidebar-menu-anchor">
            <small>{visibleProjects.length + sortedConversations.length}</small>
            <button
              className="sidebar-menu-trigger"
              type="button"
              aria-expanded={openMenu === 'recent'}
              aria-label={t('nav.recentMenu')}
              data-sidebar-menu-trigger="true"
              title={t('nav.recentMenu')}
              onClick={() => setOpenMenu((current) => current === 'recent' ? undefined : 'recent')}
            >
              <Ellipsis size={14} aria-hidden="true" />
            </button>
            {openMenu === 'recent' ? (
              <div className="sidebar-popover recent-popover" role="menu" data-sidebar-popover="true" data-testid="recent-menu">
                <span>{t('nav.organize')}</span>
                <MenuChoice checked={recentLayout === 'grouped'} label={t('nav.groupByProject')} onSelect={() => { setRecentLayout('grouped'); setOpenMenu(undefined); }} />
                <MenuChoice checked={recentLayout === 'flat'} label={t('nav.singleList')} onSelect={() => { setRecentLayout('flat'); setOpenMenu(undefined); }} />
                <span>{t('nav.sortBy')}</span>
                <MenuChoice checked={recentSort === 'priority'} label={t('nav.priority')} onSelect={() => { setRecentSort('priority'); setOpenMenu(undefined); }} />
                <MenuChoice checked={recentSort === 'updated'} label={t('nav.updated')} onSelect={() => { setRecentSort('updated'); setOpenMenu(undefined); }} />
                <MenuChoice checked={recentSort === 'manual'} label={t('nav.manual')} onSelect={() => { setRecentSort('manual'); setOpenMenu(undefined); }} />
              </div>
            ) : null}
          </div>
        </header>
        <div className="project-nav-list" data-testid="project-list" data-layout={recentLayout} onScroll={() => setOpenMenu(undefined)}>
          {visibleProjects.map((project) => {
            const selected = project.projectId === selectedProjectId;
            const pinned = pinnedProjectIds.includes(project.projectId);
            return (
              <div className="project-nav-group" data-selected={selected ? 'true' : 'false'} key={project.projectId}>
                <div className="project-nav-row">
                  <button className="project-nav-item" data-testid={`project-${project.projectId}`} type="button" onClick={() => onProjectSelect(project.projectId)}>
                    {selected ? <ChevronDown size={13} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
                    <span><strong>{project.name}</strong></span>
                  </button>
                  <div className="project-row-actions">
                    {pinned ? <Pin className="project-pin-indicator" size={11} aria-label={t('project.pinned')} /> : null}
                    {selected ? <button className="project-row-command" type="button" onClick={onNewConversation} title={t('nav.newConversation')}><PlusSquare size={13} aria-hidden="true" /></button> : null}
                    <div className="sidebar-menu-anchor">
                      <button
                        className="project-row-command project-menu-trigger"
                        type="button"
                        aria-expanded={openMenu === project.projectId}
                        aria-label={`${project.name} ${t('project.menu')}`}
                        data-sidebar-menu-trigger="true"
                        title={t('project.menu')}
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setProjectMenuPosition({ left: Math.max(8, rect.right - 156), top: rect.bottom + 4 });
                          setOpenMenu((current) => current === project.projectId ? undefined : project.projectId);
                        }}
                      >
                        <Ellipsis size={13} aria-hidden="true" />
                      </button>
                      {openMenu === project.projectId && projectMenuPosition ? createPortal(
                        <div
                          className="sidebar-popover project-popover"
                          role="menu"
                          data-sidebar-popover="true"
                          data-testid={`project-menu-${project.projectId}`}
                          style={projectMenuPosition}
                        >
                          <button type="button" role="menuitem" onClick={() => togglePinned(project.projectId)}>
                            {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
                            <span>{pinned ? t('project.unpin') : t('project.pin')}</span>
                          </button>
                          <button type="button" role="menuitem" onClick={() => { setOpenMenu(undefined); onProjectEdit(project.projectId); }}>
                            <FolderPen size={14} aria-hidden="true" /><span>{t('project.edit')}</span>
                          </button>
                        </div>,
                        document.body,
                      ) : null}
                    </div>
                  </div>
                </div>
                {selected && recentLayout === 'grouped' ? (
                  <button className="conversation-nav-item" type="button" aria-current="page" onClick={() => onProjectSelect(project.projectId)}>
                    <MessageSquare size={13} aria-hidden="true" />
                    <span>{conversationTitle}</span>
                  </button>
                ) : null}
              </div>
            );
          })}
          {sortedConversations.map((conversation) => (
            <button
              className="conversation-nav-item standalone-nav-item"
              type="button"
              data-testid={`standalone-${conversation.threadId}`}
              aria-current={selectedThreadId === conversation.threadId ? 'page' : undefined}
              onClick={() => onConversationSelect(conversation.threadId)}
              key={conversation.threadId}
            >
              <MessageSquare size={13} aria-hidden="true" />
              <span>{conversation.title || t('agent.newConversation')}</span>
            </button>
          ))}
          {projects.length === 0 && conversations.length === 0 ? <p className="project-nav-empty">{t('nav.emptyProjects')}</p> : null}
          {(projects.length > 0 || conversations.length > 0) && visibleProjects.length === 0 && sortedConversations.length === 0 ? <p className="project-nav-empty">{t('nav.noSearchResults')}</p> : null}
        </div>
      </section>

      <div className="sidebar-footer">{footer}</div>
    </aside>
  );
}

function MenuChoice({ checked, label, onSelect }: { checked: boolean; label: string; onSelect: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} onClick={onSelect}>
      <span className="menu-check">{checked ? <Check size={13} aria-hidden="true" /> : null}</span>
      <span>{label}</span>
    </button>
  );
}

function readPinnedProjects(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(PINNED_PROJECTS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((candidate): candidate is string => typeof candidate === 'string') : [];
  } catch {
    return [];
  }
}

function readChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return choices.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // Preferences remain session-local when storage is unavailable.
  }
}
