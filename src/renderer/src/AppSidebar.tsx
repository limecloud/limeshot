import {
  ChevronDown,
  Folder,
  FolderPlus,
  Layers3,
  LoaderCircle,
  MessageSquare,
  MessageSquarePlus,
  PlusSquare,
  Search,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { ProjectSummary } from '@business/generated';
import type { TranslationKey } from './i18n';

interface AppSidebarProps {
  projects: ProjectSummary[];
  selectedProjectId?: string;
  conversationTitle: string;
  creatingProject: boolean;
  creatingConversation: boolean;
  searchOpen: boolean;
  searchQuery: string;
  footer: ReactNode;
  onHome: () => void;
  onNewConversation: () => void;
  onNewProject: () => void;
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onProjectSelect: (projectId: string) => void;
  t: (key: TranslationKey) => string;
}

export function AppSidebar({
  projects,
  selectedProjectId,
  conversationTitle,
  creatingProject,
  creatingConversation,
  searchOpen,
  searchQuery,
  footer,
  onHome,
  onNewConversation,
  onNewProject,
  onSearchOpenChange,
  onSearchQueryChange,
  onProjectSelect,
  t,
}: AppSidebarProps) {
  const query = searchQuery.trim().toLocaleLowerCase();
  const visibleProjects = query
    ? projects.filter((project) => `${project.name} ${project.workspaceName}`.toLocaleLowerCase().includes(query))
    : projects;

  return (
    <aside className="sidebar" aria-label={t('nav.projects')}>
      <button className="brand-row" type="button" onClick={onHome} title={t('home.title')}>
        <span className="brand-mark" aria-hidden="true"><Layers3 size={15} /></span>
        <strong>{t('app.name')}</strong>
        <small>v0.1.0</small>
      </button>

      <nav className="sidebar-actions" aria-label={t('nav.primary')}>
        <button type="button" disabled={creatingConversation} aria-busy={creatingConversation} onClick={onNewConversation}>
          {creatingConversation ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <MessageSquarePlus size={15} aria-hidden="true" />}<span>{t('nav.newConversation')}</span>
        </button>
        <button type="button" disabled={creatingProject} onClick={onNewProject}>
          {creatingProject ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <FolderPlus size={15} aria-hidden="true" />}<span>{t('nav.newProject')}</span>
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
        <header><span>{t('nav.projects')}</span><small>{visibleProjects.length}</small></header>
        <div className="project-nav-list" data-testid="project-list">
          {visibleProjects.map((project) => {
            const selected = project.projectId === selectedProjectId;
            return (
              <div className="project-nav-group" data-selected={selected ? 'true' : 'false'} key={project.projectId}>
                <div className="project-nav-row">
                  <button className="project-nav-item" data-testid={`project-${project.projectId}`} type="button" onClick={() => onProjectSelect(project.projectId)}>
                    {selected ? <ChevronDown size={13} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
                    <span><strong>{project.name}</strong></span>
                  </button>
                  {selected ? (
                    <>
                      <button className="project-row-command" type="button" disabled={creatingConversation} aria-busy={creatingConversation} onClick={onNewConversation} title={t('nav.newConversation')}>
                        {creatingConversation ? <LoaderCircle className="spin" size={13} aria-hidden="true" /> : <PlusSquare size={13} aria-hidden="true" />}
                      </button>
                    </>
                  ) : null}
                </div>
                {selected ? (
                  <button className="conversation-nav-item" type="button" aria-current="page" onClick={() => onProjectSelect(project.projectId)}>
                    <MessageSquare size={13} aria-hidden="true" />
                    <span>{conversationTitle}</span>
                  </button>
                ) : null}
              </div>
            );
          })}
          {projects.length === 0 ? <p className="project-nav-empty">{t('nav.emptyProjects')}</p> : null}
          {projects.length > 0 && visibleProjects.length === 0 ? <p className="project-nav-empty">{t('nav.noSearchResults')}</p> : null}
        </div>
      </section>

      <div className="sidebar-footer">{footer}</div>
    </aside>
  );
}
