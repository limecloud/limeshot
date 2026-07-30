import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCopy,
  Ellipsis,
  Folder,
  FolderOpen,
  FolderPen,
  Mail,
  MailOpen,
  MessageSquarePlus,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  PlusSquare,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { ProjectSummary } from '@business/generated';
import type { AgentConversationSummary, AgentProjectConversationSummary, ConversationTargetInput } from '../../shared/desktop';
import type { TranslationKey } from './i18n';

interface AppSidebarProps {
  projects: ProjectSummary[];
  projectConversations: Record<string, AgentProjectConversationSummary[]>;
  projectConversationFailedIds: string[];
  conversations: AgentConversationSummary[];
  selectedProjectId?: string;
  activeProjectId?: string;
  selectedThreadId?: string;
  conversationTitle: string;
  activeProjectConversation?: AgentProjectConversationSummary;
  searchOpen: boolean;
  searchQuery: string;
  footer: ReactNode;
  onCollapse: () => void;
  onNewConversation: () => void;
  onConversationSelect: (threadId: string) => void;
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onProjectSelect: (projectId: string) => void;
  onProjectConversationSelect: (projectId: string, conversationId: string) => void;
  onProjectEdit: (projectId: string) => void;
  onProjectReveal: (projectId: string) => Promise<void>;
  onProjectMarkAllRead: (projectId: string) => Promise<string[]>;
  onProjectRename: (projectId: string, name: string) => Promise<void>;
  onProjectArchiveConversations: (projectId: string) => Promise<void>;
  onProjectRemove: (projectId: string) => Promise<void>;
  onConversationRename: (target: ConversationTargetInput, title: string) => Promise<void>;
  onConversationArchive: (target: ConversationTargetInput) => Promise<void>;
  onConversationDelete: (target: ConversationTargetInput) => Promise<void>;
  onConversationReveal: (target: ConversationTargetInput) => Promise<void>;
  onConversationCopyWorkingDirectory: (target: ConversationTargetInput) => Promise<void>;
  onConversationCopySessionId: (target: ConversationTargetInput) => Promise<void>;
  t: (key: TranslationKey) => string;
}

type RecentSort = 'updated' | 'manual';
type SidebarDialog =
  | { kind: 'renameProject'; project: ProjectSummary }
  | { kind: 'archiveProjectConversations'; project: ProjectSummary }
  | { kind: 'removeProject'; project: ProjectSummary }
  | { kind: 'renameConversation'; conversation: AgentConversationSummary; target: ConversationTargetInput }
  | { kind: 'deleteConversation'; conversation: AgentConversationSummary; target: ConversationTargetInput };
const PINNED_PROJECTS_KEY = 'limeshot.sidebar.pinnedProjects';
const PINNED_CONVERSATIONS_KEY = 'limeshot.sidebar.pinnedConversations';
const UNREAD_CONVERSATIONS_KEY = 'limeshot.sidebar.unreadConversations';
const RECENT_SORT_KEY = 'limeshot.sidebar.recentSort';
const PROJECTS_INITIAL_LIMIT = 5;
const RECENT_INITIAL_LIMIT = 10;
const PROJECT_CONVERSATIONS_INITIAL_LIMIT = 5;

export function AppSidebar({
  projects,
  projectConversations,
  projectConversationFailedIds,
  conversations,
  selectedProjectId,
  activeProjectId,
  selectedThreadId,
  conversationTitle,
  activeProjectConversation,
  searchOpen,
  searchQuery,
  footer,
  onCollapse,
  onNewConversation,
  onConversationSelect,
  onSearchOpenChange,
  onSearchQueryChange,
  onProjectSelect,
  onProjectConversationSelect,
  onProjectEdit,
  onProjectReveal,
  onProjectMarkAllRead,
  onProjectRename,
  onProjectArchiveConversations,
  onProjectRemove,
  onConversationRename,
  onConversationArchive,
  onConversationDelete,
  onConversationReveal,
  onConversationCopyWorkingDirectory,
  onConversationCopySessionId,
  t,
}: AppSidebarProps) {
  const [openMenu, setOpenMenu] = useState<string>();
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>(readPinnedProjects);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>(() => readStringList(PINNED_CONVERSATIONS_KEY));
  const [unreadConversationIds, setUnreadConversationIds] = useState<string[]>(() => readStringList(UNREAD_CONVERSATIONS_KEY));
  const [recentSort, setRecentSort] = useState<RecentSort>(() => readChoice(RECENT_SORT_KEY, ['updated', 'manual'], 'updated'));
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [expandedProjectConversationIds, setExpandedProjectConversationIds] = useState<string[]>([]);
  const [recentsExpanded, setRecentsExpanded] = useState(false);
  const [rowMenuPosition, setRowMenuPosition] = useState<{ left: number; top: number }>();
  const [dialog, setDialog] = useState<SidebarDialog>();
  const [dialogValue, setDialogValue] = useState('');
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [actionNotice, setActionNotice] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();
  const query = searchQuery.trim().toLocaleLowerCase();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  const filteredProjects = useMemo(() => {
    const matchingProjects = query
      ? projects.filter((project) => `${project.name} ${project.workspaceName}`.toLocaleLowerCase().includes(query)
        || (projectConversations[project.projectId] ?? []).some((conversation) => conversation.title.toLocaleLowerCase().includes(query)))
      : projects;
    return [...matchingProjects].sort((left, right) => {
      const leftPinned = pinnedProjectIds.includes(left.projectId);
      const rightPinned = pinnedProjectIds.includes(right.projectId);
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      return right.updatedAtEpochMs - left.updatedAtEpochMs;
    });
  }, [pinnedProjectIds, projectConversations, projects, query]);

  const filteredConversations = useMemo(() => {
    const matchingConversations = query
      ? conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(query))
      : conversations;
    return [...matchingConversations].sort((left, right) => {
      const leftPinned = pinnedConversationIds.includes(left.threadId);
      const rightPinned = pinnedConversationIds.includes(right.threadId);
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      return recentSort === 'manual' ? 0 : right.updatedAtEpochMs - left.updatedAtEpochMs;
    });
  }, [conversations, pinnedConversationIds, query, recentSort]);

  const visibleProjects = query || projectsExpanded
    ? filteredProjects
    : filteredProjects.slice(0, PROJECTS_INITIAL_LIMIT);
  const visibleConversations = query || recentsExpanded
    ? filteredConversations
    : filteredConversations.slice(0, RECENT_INITIAL_LIMIT);

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

  useLayoutEffect(() => {
    if (!openMenu || !rowMenuPosition) return;
    const menu = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-menu-key]'))
      .find((candidate) => candidate.dataset.sidebarMenuKey === openMenu);
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(rowMenuPosition.left, window.innerWidth - rect.width - 8));
    const top = rect.bottom <= window.innerHeight - 8
      ? rowMenuPosition.top
      : Math.max(8, rowMenuPosition.top - rect.height - 34);
    if (left !== rowMenuPosition.left || top !== rowMenuPosition.top) setRowMenuPosition({ left, top });
  }, [openMenu, rowMenuPosition]);

  useLayoutEffect(() => {
    if (!openMenu) return;
    const menu = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-menu-key]'))
      .find((candidate) => candidate.dataset.sidebarMenuKey === openMenu);
    menu?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')?.focus();
  }, [openMenu]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialogPending) setDialog(undefined);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, dialogPending]);

  useEffect(() => writeStorage(PINNED_PROJECTS_KEY, pinnedProjectIds), [pinnedProjectIds]);
  useEffect(() => writeStorage(PINNED_CONVERSATIONS_KEY, pinnedConversationIds), [pinnedConversationIds]);
  useEffect(() => writeStorage(UNREAD_CONVERSATIONS_KEY, unreadConversationIds), [unreadConversationIds]);
  useEffect(() => writeStorage(RECENT_SORT_KEY, recentSort), [recentSort]);

  const togglePinned = (projectId: string) => {
    setPinnedProjectIds((current) => current.includes(projectId)
      ? current.filter((candidate) => candidate !== projectId)
      : [...current, projectId]);
    setOpenMenu(undefined);
  };

  const toggleConversationPinned = (threadId: string) => {
    setPinnedConversationIds((current) => toggleListValue(current, threadId));
    setOpenMenu(undefined);
  };

  const toggleConversationUnread = (threadId: string) => {
    setUnreadConversationIds((current) => toggleListValue(current, threadId));
    setOpenMenu(undefined);
  };

  const openRowMenu = (key: string, event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setRowMenuPosition({
      left: Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)),
      top: rect.bottom + 4,
    });
    setOpenMenu((current) => current === key ? undefined : key);
  };

  const openDialog = (next: SidebarDialog) => {
    setOpenMenu(undefined);
    setDialogError(undefined);
    setDialogValue(next.kind === 'renameProject'
      ? next.project.name
      : next.kind === 'renameConversation'
        ? next.conversation.title
        : '');
    setDialog(next);
  };

  const runSidebarAction = async <T,>(key: string, action: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
    setOpenMenu(undefined);
    setActionError(undefined);
    setActionNotice(undefined);
    setPendingAction(key);
    try {
      const result = await action();
      if (successMessage) setActionNotice(successMessage);
      return result;
    } catch {
      setActionError(t('sidebar.actionFailed'));
      return undefined;
    } finally {
      setPendingAction(undefined);
    }
  };

  const runConversationArchive = async (conversation: AgentConversationSummary, target: ConversationTargetInput) => {
    await runSidebarAction(`archive:${conversation.threadId}`, () => onConversationArchive(target));
  };

  const runProjectMarkAllRead = async (projectId: string) => {
    const threadIds = await runSidebarAction(`mark-read:${projectId}`, () => onProjectMarkAllRead(projectId));
    if (threadIds) setUnreadConversationIds((current) => current.filter((threadId) => !threadIds.includes(threadId)));
  };

  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || dialogPending) return;
    setDialogPending(true);
    setDialogError(undefined);
    try {
      if (dialog.kind === 'renameProject') await onProjectRename(dialog.project.projectId, dialogValue.trim());
      if (dialog.kind === 'archiveProjectConversations') await onProjectArchiveConversations(dialog.project.projectId);
      if (dialog.kind === 'removeProject') await onProjectRemove(dialog.project.projectId);
      if (dialog.kind === 'renameConversation') await onConversationRename(dialog.target, dialogValue.trim());
      if (dialog.kind === 'deleteConversation') await onConversationDelete(dialog.target);
      setDialog(undefined);
    } catch {
      setDialogError(t('sidebar.actionFailed'));
    } finally {
      setDialogPending(false);
    }
  };

  const noSearchResults = Boolean(query && filteredProjects.length === 0 && filteredConversations.length === 0);

  return (
    <aside className="sidebar app-shell-left-panel" data-platform={isMac ? 'darwin' : 'other'} aria-label={t('nav.projects')}>
      <div className="sidebar-window-toolbar">
        <div className="sidebar-window-controls">
          <button type="button" onClick={onCollapse} aria-label={t('nav.collapseSidebar')} title={t('nav.collapseSidebar')}>
            <PanelLeftClose size={14} aria-hidden="true" />
          </button>
          <button type="button" disabled aria-label={t('nav.back')} title={t('nav.back')}>
            <ArrowLeft size={14} aria-hidden="true" />
          </button>
          <button type="button" disabled aria-label={t('nav.forward')} title={t('nav.forward')}>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="sidebar-brand-row">
        <strong>{t('app.name')}</strong>
        <button
          type="button"
          aria-expanded={searchOpen}
          aria-label={t('nav.search')}
          title={t('nav.search')}
          onClick={() => onSearchOpenChange(!searchOpen)}
        >
          <Search size={14} aria-hidden="true" />
        </button>
      </div>

      <nav className="sidebar-actions" aria-label={t('nav.primary')}>
        <button type="button" onClick={onNewConversation}>
          <MessageSquarePlus size={15} aria-hidden="true" /><span>{t('nav.newConversation')}</span>
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

      <div className="sidebar-scroll-region" onScroll={() => setOpenMenu(undefined)}>
        <section className="sidebar-section sidebar-projects" aria-labelledby="sidebar-projects-title">
          <header className="sidebar-section-header">
            <span id="sidebar-projects-title">{t('nav.projects')}</span>
          </header>
          <div className="project-nav-list" data-testid="project-list">
            {visibleProjects.map((project) => {
              const selected = project.projectId === selectedProjectId;
              const pinned = pinnedProjectIds.includes(project.projectId);
              const loadedConversations = projectConversations[project.projectId] ?? [];
              const currentConversation = selected && activeProjectId === project.projectId ? activeProjectConversation : undefined;
              const mergedConversations = currentConversation
                ? [currentConversation, ...loadedConversations.filter((conversation) => conversation.threadId !== currentConversation.threadId)]
                : loadedConversations;
              const matchingConversations = query
                ? mergedConversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(query))
                : mergedConversations;
              const projectConversationsExpanded = expandedProjectConversationIds.includes(project.projectId);
              const visibleProjectConversations = query || projectConversationsExpanded
                ? matchingConversations
                : matchingConversations.slice(0, PROJECT_CONVERSATIONS_INITIAL_LIMIT);
              return (
                <div className="project-nav-group" data-selected={selected ? 'true' : 'false'} key={project.projectId}>
                  <div className="project-nav-row">
                    <button className="project-nav-item" data-testid={`project-${project.projectId}`} type="button" onClick={() => onProjectSelect(project.projectId)}>
                      <Folder size={14} aria-hidden="true" />
                      <span><strong>{project.name}</strong></span>
                    </button>
                    <div className="project-row-actions">
                      {pinned ? <Pin className="project-pin-indicator" size={11} aria-label={t('project.pinned')} /> : null}
                      {selected ? <button className="project-row-command" type="button" onClick={onNewConversation} title={t('nav.newConversation')}><PlusSquare size={13} aria-hidden="true" /></button> : null}
                      <div className="sidebar-menu-anchor">
                        <button
                          className="project-row-command project-menu-trigger"
                          type="button"
                          aria-expanded={openMenu === `project:${project.projectId}`}
                          aria-label={`${project.name} ${t('project.menu')}`}
                          data-sidebar-menu-trigger="true"
                          title={t('project.menu')}
                          onClick={(event) => openRowMenu(`project:${project.projectId}`, event)}
                        >
                          <Ellipsis size={13} aria-hidden="true" />
                        </button>
                        {openMenu === `project:${project.projectId}` && rowMenuPosition ? createPortal(
                          <div
                            className="sidebar-popover project-popover"
                            role="menu"
                            data-sidebar-popover="true"
                            data-sidebar-menu-key={`project:${project.projectId}`}
                            data-testid={`project-menu-${project.projectId}`}
                            onKeyDown={navigateMenu}
                            style={rowMenuPosition}
                            tabIndex={-1}
                          >
                            <button type="button" role="menuitem" onClick={() => togglePinned(project.projectId)}>
                              {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
                              <span>{pinned ? t('project.unpin') : t('project.pin')}</span>
                            </button>
                            <button type="button" role="menuitem" onClick={() => void runSidebarAction(`reveal-project:${project.projectId}`, () => onProjectReveal(project.projectId))}>
                              <FolderOpen size={14} aria-hidden="true" /><span>{t(isMac ? 'project.openInFinder' : 'project.openInFileManager')}</span>
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setOpenMenu(undefined); onProjectEdit(project.projectId); }}>
                              <FolderPen size={14} aria-hidden="true" /><span>{t('project.edit')}</span>
                            </button>
                            <button type="button" role="menuitem" onClick={() => openDialog({ kind: 'renameProject', project })}>
                              <Pencil size={14} aria-hidden="true" /><span>{t('project.rename')}</span>
                            </button>
                            <MenuSeparator />
                            <button type="button" role="menuitem" onClick={() => void runProjectMarkAllRead(project.projectId)}>
                              <MailOpen size={14} aria-hidden="true" /><span>{t('project.markAllRead')}</span>
                            </button>
                            <button type="button" role="menuitem" onClick={() => openDialog({ kind: 'archiveProjectConversations', project })}>
                              <Archive size={14} aria-hidden="true" /><span>{t('project.archiveChats')}</span>
                            </button>
                            <button className="danger-menu-item" type="button" role="menuitem" onClick={() => openDialog({ kind: 'removeProject', project })}>
                              <Trash2 size={14} aria-hidden="true" /><span>{t('project.remove')}</span>
                            </button>
                          </div>,
                          document.body,
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {visibleProjectConversations.map((projectConversation) => {
                    const displayConversation = currentConversation?.threadId === projectConversation.threadId
                      ? { ...projectConversation, title: conversationTitle }
                      : projectConversation;
                    const target: ConversationTargetInput = {
                      projectId: project.projectId,
                      conversationId: projectConversation.conversationId,
                      threadId: projectConversation.threadId,
                    };
                    return (
                      <ConversationRow
                        conversation={displayConversation}
                        current={currentConversation?.threadId === projectConversation.threadId}
                        project
                        key={projectConversation.threadId}
                        menuOpen={openMenu === `conversation:${projectConversation.threadId}`}
                        menuPosition={rowMenuPosition}
                        pinned={pinnedConversationIds.includes(projectConversation.threadId)}
                        unread={unreadConversationIds.includes(projectConversation.threadId)}
                        pending={pendingAction === `archive:${projectConversation.threadId}`}
                        onArchive={() => void runConversationArchive(projectConversation, target)}
                        onDelete={() => openDialog({ kind: 'deleteConversation', conversation: displayConversation, target })}
                        onReveal={() => void runSidebarAction(`reveal:${projectConversation.threadId}`, () => onConversationReveal(target))}
                        onCopyWorkingDirectory={() => void runSidebarAction(`copy-cwd:${projectConversation.threadId}`, () => onConversationCopyWorkingDirectory(target), t('conversation.copiedWorkingDirectory'))}
                        onCopySessionId={() => void runSidebarAction(`copy-session:${projectConversation.threadId}`, () => onConversationCopySessionId(target), t('conversation.copiedSessionId'))}
                        onMenuOpen={(event) => openRowMenu(`conversation:${projectConversation.threadId}`, event)}
                        onPin={() => toggleConversationPinned(projectConversation.threadId)}
                        onRename={() => openDialog({ kind: 'renameConversation', conversation: displayConversation, target })}
                        onSelect={() => onProjectConversationSelect(project.projectId, projectConversation.conversationId)}
                        onUnread={() => toggleConversationUnread(projectConversation.threadId)}
                        t={t}
                      />
                    );
                  })}
                  {projectConversationFailedIds.includes(project.projectId) ? <p className="project-conversations-error">{t('nav.projectConversationsFailed')}</p> : null}
                  {!query && matchingConversations.length > PROJECT_CONVERSATIONS_INITIAL_LIMIT ? (
                    <button
                      className="project-conversations-show-more"
                      type="button"
                      onClick={() => setExpandedProjectConversationIds((current) => toggleListValue(current, project.projectId))}
                    >
                      {projectConversationsExpanded ? t('nav.showLess') : t('nav.showMore')}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {projects.length === 0 && !query ? <p className="project-nav-empty">{t('nav.emptyProjects')}</p> : null}
            {!query && filteredProjects.length > PROJECTS_INITIAL_LIMIT ? (
              <button className="sidebar-show-more" type="button" onClick={() => setProjectsExpanded((current) => !current)}>
                {projectsExpanded ? t('nav.showLess') : t('nav.showMore')}
              </button>
            ) : null}
          </div>
        </section>

        <section className="sidebar-section sidebar-recents" aria-labelledby="sidebar-recents-title">
          <header className="sidebar-section-header">
            <span id="sidebar-recents-title">{t('nav.recent')}</span>
            <div className="sidebar-menu-anchor">
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
                <div className="sidebar-popover recent-popover" role="menu" data-sidebar-popover="true" data-sidebar-menu-key="recent" data-testid="recent-menu" onKeyDown={navigateMenu} tabIndex={-1}>
                  <span>{t('nav.sortBy')}</span>
                  <MenuChoice checked={recentSort === 'updated'} label={t('nav.updated')} onSelect={() => { setRecentSort('updated'); setOpenMenu(undefined); }} />
                  <MenuChoice checked={recentSort === 'manual'} label={t('nav.manual')} onSelect={() => { setRecentSort('manual'); setOpenMenu(undefined); }} />
                </div>
              ) : null}
            </div>
          </header>
          <div className="conversation-nav-list" data-testid="recent-list">
            {visibleConversations.map((conversation) => {
              const target: ConversationTargetInput = { projectId: null, conversationId: conversation.threadId, threadId: conversation.threadId };
              return (
                <ConversationRow
                  conversation={conversation}
                  current={selectedThreadId === conversation.threadId}
                  key={conversation.threadId}
                  menuOpen={openMenu === `conversation:${conversation.threadId}`}
                  menuPosition={rowMenuPosition}
                  pinned={pinnedConversationIds.includes(conversation.threadId)}
                  unread={unreadConversationIds.includes(conversation.threadId)}
                  pending={pendingAction === `archive:${conversation.threadId}`}
                  onArchive={() => void runConversationArchive(conversation, target)}
                  onDelete={() => openDialog({ kind: 'deleteConversation', conversation, target })}
                  onReveal={() => void runSidebarAction(`reveal:${conversation.threadId}`, () => onConversationReveal(target))}
                  onCopyWorkingDirectory={() => void runSidebarAction(`copy-cwd:${conversation.threadId}`, () => onConversationCopyWorkingDirectory(target), t('conversation.copiedWorkingDirectory'))}
                  onCopySessionId={() => void runSidebarAction(`copy-session:${conversation.threadId}`, () => onConversationCopySessionId(target), t('conversation.copiedSessionId'))}
                  onMenuOpen={(event) => openRowMenu(`conversation:${conversation.threadId}`, event)}
                  onPin={() => toggleConversationPinned(conversation.threadId)}
                  onRename={() => openDialog({ kind: 'renameConversation', conversation, target })}
                  onSelect={() => onConversationSelect(conversation.threadId)}
                  onUnread={() => toggleConversationUnread(conversation.threadId)}
                  t={t}
                />
              );
            })}
            {conversations.length === 0 && !query ? <p className="project-nav-empty">{t('nav.emptyConversations')}</p> : null}
            {!query && filteredConversations.length > RECENT_INITIAL_LIMIT ? (
              <button className="sidebar-show-more" type="button" onClick={() => setRecentsExpanded((current) => !current)}>
                {recentsExpanded ? t('nav.showLess') : t('nav.showMore')}
              </button>
            ) : null}
          </div>
        </section>

        {noSearchResults ? <p className="project-nav-empty sidebar-search-empty">{t('nav.noSearchResults')}</p> : null}
      </div>

      {actionError ? <div className="sidebar-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError(undefined)} title={t('action.close')}><X size={12} aria-hidden="true" /></button></div> : null}
      {!actionError && actionNotice ? <div className="sidebar-action-notice" role="status"><span>{actionNotice}</span><button type="button" onClick={() => setActionNotice(undefined)} title={t('action.close')}><X size={12} aria-hidden="true" /></button></div> : null}
      <div className="sidebar-footer">{footer}</div>
      {dialog ? createPortal(
        <SidebarActionDialog
          dialog={dialog}
          error={dialogError}
          pending={dialogPending}
          value={dialogValue}
          onCancel={() => { if (!dialogPending) setDialog(undefined); }}
          onSubmit={submitDialog}
          onValueChange={setDialogValue}
          t={t}
        />,
        document.body,
      ) : null}
    </aside>
  );
}

interface ConversationRowProps {
  conversation: AgentConversationSummary;
  current: boolean;
  menuOpen: boolean;
  menuPosition?: { left: number; top: number };
  pinned: boolean;
  unread: boolean;
  pending: boolean;
  project?: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onReveal: () => void;
  onCopyWorkingDirectory: () => void;
  onCopySessionId: () => void;
  onMenuOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  onPin: () => void;
  onRename: () => void;
  onSelect: () => void;
  onUnread: () => void;
  t: (key: TranslationKey) => string;
}

function ConversationRow({
  conversation,
  current,
  menuOpen,
  menuPosition,
  pinned,
  unread,
  pending,
  project,
  onArchive,
  onDelete,
  onReveal,
  onCopyWorkingDirectory,
  onCopySessionId,
  onMenuOpen,
  onPin,
  onRename,
  onSelect,
  onUnread,
  t,
}: ConversationRowProps) {
  return (
    <div className={`conversation-nav-row${project ? ' project-conversation-nav-row' : ''}`} data-current={current ? 'true' : 'false'} data-unread={unread ? 'true' : 'false'}>
      <button
        className={`conversation-nav-item${project ? ' project-conversation-nav-item' : ' standalone-nav-item'}`}
        type="button"
        data-testid={project ? `project-conversation-${conversation.threadId}` : `standalone-${conversation.threadId}`}
        aria-current={current ? 'page' : undefined}
        onClick={onSelect}
      >
        {unread ? <span className="conversation-unread-dot" aria-hidden="true" /> : null}
        <span>{conversation.title || t('agent.newConversation')}</span>
      </button>
      <div className="conversation-row-actions">
        {pinned ? <Pin className="conversation-pin-indicator" size={11} aria-label={t('conversation.pinned')} /> : null}
        <button
          className="conversation-row-command"
          type="button"
          aria-expanded={menuOpen}
          aria-label={`${conversation.title || t('agent.newConversation')} ${t('conversation.menu')}`}
          data-sidebar-menu-trigger="true"
          disabled={pending}
          title={t('conversation.menu')}
          onClick={onMenuOpen}
        >
          <Ellipsis size={13} aria-hidden="true" />
        </button>
      </div>
      {menuOpen && menuPosition ? createPortal(
        <div className="sidebar-popover conversation-popover" role="menu" data-sidebar-popover="true" data-sidebar-menu-key={`conversation:${conversation.threadId}`} data-testid={`conversation-menu-${conversation.threadId}`} style={menuPosition} onKeyDown={navigateMenu} tabIndex={-1}>
          <button type="button" role="menuitem" onClick={onPin}>
            {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
            <span>{pinned ? t('conversation.unpin') : t('conversation.pin')}</span>
          </button>
          <button type="button" role="menuitem" onClick={onRename}>
            <Pencil size={14} aria-hidden="true" /><span>{t('conversation.rename')}</span>
          </button>
          <button type="button" role="menuitem" onClick={onArchive}>
            <Archive size={14} aria-hidden="true" /><span>{t('conversation.archive')}</span>
          </button>
          <button type="button" role="menuitem" onClick={onUnread}>
            {unread ? <MailOpen size={14} aria-hidden="true" /> : <Mail size={14} aria-hidden="true" />}
            <span>{unread ? t('conversation.markRead') : t('conversation.markUnread')}</span>
          </button>
          <MenuSeparator />
          <button type="button" role="menuitem" onClick={onReveal}>
            <FolderOpen size={14} aria-hidden="true" /><span>{t(isMacPlatform() ? 'conversation.openInFinder' : 'conversation.openInFileManager')}</span>
          </button>
          <button type="button" role="menuitem" onClick={onCopyWorkingDirectory}>
            <ClipboardCopy size={14} aria-hidden="true" /><span>{t('conversation.copyWorkingDirectory')}</span>
          </button>
          <button type="button" role="menuitem" onClick={onCopySessionId}>
            <ClipboardCopy size={14} aria-hidden="true" /><span>{t('conversation.copySessionId')}</span>
          </button>
          <MenuSeparator />
          <button className="danger-menu-item" type="button" role="menuitem" onClick={onDelete}>
            <Trash2 size={14} aria-hidden="true" /><span>{t('conversation.delete')}</span>
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function SidebarActionDialog({
  dialog,
  error,
  pending,
  value,
  onCancel,
  onSubmit,
  onValueChange,
  t,
}: {
  dialog: SidebarDialog;
  error?: string;
  pending: boolean;
  value: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValueChange: (value: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const rename = dialog.kind === 'renameProject' || dialog.kind === 'renameConversation';
  const danger = dialog.kind === 'removeProject' || dialog.kind === 'deleteConversation';
  const title = dialog.kind === 'renameProject'
    ? t('project.renameTitle')
    : dialog.kind === 'archiveProjectConversations'
      ? t('project.archiveTitle')
      : dialog.kind === 'removeProject'
        ? t('project.removeTitle')
        : dialog.kind === 'renameConversation'
          ? t('conversation.renameTitle')
          : t('conversation.deleteTitle');
  const description = dialog.kind === 'renameProject'
    ? t('project.renameDescription')
    : dialog.kind === 'archiveProjectConversations'
      ? t('project.archiveDescription')
      : dialog.kind === 'removeProject'
        ? t('project.removeDescription')
        : dialog.kind === 'renameConversation'
          ? t('conversation.renameDescription')
          : t('conversation.deleteDescription');
  const confirmLabel = rename
    ? t('action.save')
    : dialog.kind === 'archiveProjectConversations'
      ? t('project.archiveChats')
      : dialog.kind === 'removeProject'
        ? t('project.remove')
        : t('conversation.delete');

  return (
    <div className="sidebar-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <form className="sidebar-dialog" role="dialog" aria-modal="true" aria-labelledby="sidebar-dialog-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <header>
          <div><strong id="sidebar-dialog-title">{title}</strong><span>{description}</span></div>
          <button type="button" disabled={pending} onClick={onCancel} title={t('action.close')}><X size={14} aria-hidden="true" /></button>
        </header>
        {rename ? (
          <label className="sidebar-dialog-field">
            <span>{title}</span>
            <input autoFocus value={value} onChange={(event) => onValueChange(event.target.value)} />
          </label>
        ) : null}
        {error ? <p className="sidebar-dialog-error" role="alert">{error}</p> : null}
        <footer>
          <button className="sidebar-dialog-cancel" type="button" disabled={pending} onClick={onCancel}>{t('action.cancel')}</button>
          <button className={danger ? 'sidebar-dialog-confirm danger' : 'sidebar-dialog-confirm'} type="submit" disabled={pending || (rename && !value.trim())}>
            {pending ? t('sidebar.actionPending') : confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

function MenuSeparator() {
  return <div className="sidebar-menu-separator" role="separator" />;
}

function navigateMenu(event: ReactKeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'))
    .filter((item) => !item.hasAttribute('disabled'));
  if (items.length === 0) return;
  event.preventDefault();
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? items.length - 1
      : event.key === 'ArrowDown'
        ? (currentIndex + 1 + items.length) % items.length
        : (currentIndex - 1 + items.length) % items.length;
  items[nextIndex]?.focus();
}

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
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
  return readStringList(PINNED_PROJECTS_KEY);
}

function readStringList(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((candidate): candidate is string => typeof candidate === 'string') : [];
  } catch {
    return [];
  }
}

function toggleListValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
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
