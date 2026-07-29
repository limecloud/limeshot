import { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  BadgeCheck,
  Check,
  ChevronDown,
  Clapperboard,
  Folder,
  FolderPlus,
  ListChecks,
  MessageSquare,
  Mic2,
  Plus,
  SearchCode,
  Send,
  ShoppingBag,
  Sparkles,
  WandSparkles,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { BusinessProfile, ProjectSummary } from '@business/generated';
import type { TranslationKey } from './i18n';

interface WorkspaceHomeProps {
  profiles: BusinessProfile[];
  projects: ProjectSummary[];
  selectedProfileId: string;
  selectedProjectId?: string;
  composerText: string;
  submitting: boolean;
  onProfileSelect: (profileId: string) => void;
  onComposerTextChange: (text: string) => void;
  onProjectSelect: (projectId: string | undefined) => void;
  onProjectBrowse: () => void;
  onSubmit: () => void;
  text: (key: string, fallback: string) => string;
  t: (key: TranslationKey) => string;
}

const profileIcons: Record<string, LucideIcon> = {
  general: Sparkles,
  short_form: Clapperboard,
  visual_transform: WandSparkles,
  talking_video: Mic2,
  commerce_video: ShoppingBag,
};

const suggestions: Array<{
  label: TranslationKey;
  prompt: TranslationKey;
  icon: LucideIcon;
  tone: 'blue' | 'violet' | 'green' | 'orange';
}> = [
  { label: 'home.suggestion.explore', prompt: 'home.suggestion.explorePrompt', icon: SearchCode, tone: 'blue' },
  { label: 'home.suggestion.plan', prompt: 'home.suggestion.planPrompt', icon: ListChecks, tone: 'violet' },
  { label: 'home.suggestion.review', prompt: 'home.suggestion.reviewPrompt', icon: BadgeCheck, tone: 'green' },
  { label: 'home.suggestion.repair', prompt: 'home.suggestion.repairPrompt', icon: Wrench, tone: 'orange' },
];

export function WorkspaceHome({
  profiles,
  projects,
  selectedProfileId,
  selectedProjectId,
  composerText,
  submitting,
  onProfileSelect,
  onComposerTextChange,
  onProjectSelect,
  onProjectBrowse,
  onSubmit,
  text,
  t,
}: WorkspaceHomeProps) {
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId) ?? profiles[0];
  const selectedProject = projects.find((project) => project.projectId === selectedProjectId);
  const canSubmit = composerText.trim().length > 0 && !submitting;
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const composerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const homeTitle = selectedProject
    ? t('home.projectTitle').replace('{project}', selectedProject.name)
    : t('home.title');

  useEffect(() => {
    if (!addMenuOpen && !profileMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) {
        setAddMenuOpen(false);
        setProfileMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddMenuOpen(false);
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [addMenuOpen, profileMenuOpen]);

  const selectProject = (projectId: string | undefined) => {
    onProjectSelect(projectId);
    setAddMenuOpen(false);
  };

  return (
    <section className="home-workspace" data-testid="home-workspace">
      <div className="home-content">
        <div className="home-intro">
          <header className="home-heading">
            <span aria-hidden="true"><Aperture size={38} strokeWidth={1.5} /></span>
            <h1>{homeTitle}</h1>
          </header>
          <div className="home-suggestions" aria-label={t('home.suggestions')}>
            {suggestions.map(({ label, prompt, icon: Icon, tone }) => (
              <button
                className="home-suggestion"
                type="button"
                data-tone={tone}
                onClick={() => {
                  onComposerTextChange(t(prompt));
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                key={label}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
        </div>

        <section className="home-composer" ref={composerRef}>
          {addMenuOpen ? (
            <div className="composer-add-popover" role="menu" aria-label={t('home.add')} data-testid="composer-add-menu">
              <span className="composer-menu-label">{t('home.add')}</span>
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); onProjectBrowse(); }}>
                <FolderPlus size={15} aria-hidden="true" />
                <span><strong>{t('home.openFolder')}</strong><small>{t('home.openFolderHint')}</small></span>
              </button>
              <span className="composer-menu-label">{t('nav.projects')}</span>
              <button type="button" role="menuitem" data-selected={!selectedProjectId ? 'true' : 'false'} onClick={() => selectProject(undefined)}>
                <MessageSquare size={15} aria-hidden="true" />
                <span><strong>{t('home.noProject')}</strong><small>{t('home.noProjectHint')}</small></span>
                {!selectedProjectId ? <Check size={14} aria-hidden="true" /> : null}
              </button>
              {projects.map((project) => (
                <button
                  type="button"
                  role="menuitem"
                  data-selected={selectedProjectId === project.projectId ? 'true' : 'false'}
                  onClick={() => selectProject(project.projectId)}
                  key={project.projectId}
                >
                  <Folder size={15} aria-hidden="true" />
                  <span><strong>{project.name}</strong><small>{project.workspaceName}</small></span>
                  {selectedProjectId === project.projectId ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          ) : null}
          {profileMenuOpen ? (
            <div className="composer-profile-popover" role="menu" aria-label={t('home.sectionTitle')} data-testid="profiles-menu">
              <span className="composer-menu-label">{t('home.sectionTitle')}</span>
              {profiles.map((profile) => {
                const Icon = profileIcons[profile.profileId] ?? Sparkles;
                const selected = selectedProfileId === profile.profileId;
                return (
                  <button
                    key={profile.profileId}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    data-selected={selected ? 'true' : 'false'}
                    data-testid={`profile-${profile.profileId}`}
                    onClick={() => {
                      onProfileSelect(profile.profileId);
                      setProfileMenuOpen(false);
                    }}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span><strong>{text(profile.nameKey, profile.profileId)}</strong></span>
                    {selected ? <Check size={14} aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <button
            className="home-composer-project-strip"
            type="button"
            data-testid="home-project-context"
            title={t('home.selectProject')}
            onClick={() => {
              setProfileMenuOpen(false);
              setAddMenuOpen((current) => !current);
            }}
          >
            {selectedProject ? <Folder size={14} aria-hidden="true" /> : <MessageSquare size={14} aria-hidden="true" />}
            <span>{selectedProject?.name ?? t('home.noProject')}</span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          <div className="home-composer-field">
            <textarea
              ref={inputRef}
              autoFocus
              value={composerText}
              onChange={(event) => onComposerTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && canSubmit) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder={t('home.composerPlaceholder')}
              aria-label={t('home.composerLabel')}
            />
            <footer>
              <div className="composer-tools">
                <button
                  className="composer-add-button"
                  type="button"
                  aria-expanded={addMenuOpen}
                  aria-label={t('home.add')}
                  title={t('home.add')}
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setAddMenuOpen((current) => !current);
                  }}
                >
                  <Plus size={17} aria-hidden="true" />
                </button>
                {selectedProfile ? (
                  <button
                    className="home-profile-context"
                    type="button"
                    aria-expanded={profileMenuOpen}
                    onClick={() => {
                      setAddMenuOpen(false);
                      setProfileMenuOpen((current) => !current);
                    }}
                  >
                    <Sparkles size={14} aria-hidden="true" />
                    <span>{text(selectedProfile.nameKey, selectedProfile.profileId)}</span>
                    <ChevronDown size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="composer-actions">
                <button className="home-send-button" type="button" disabled={!canSubmit} onClick={onSubmit} title={t('agent.send')}>
                  <Send size={17} aria-hidden="true" />
                </button>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </section>
  );
}
