import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture,
  BadgeCheck,
  Check,
  ChevronDown,
  Clapperboard,
  Folder,
  ListChecks,
  MessageSquare,
  Mic2,
  SearchCode,
  ShoppingBag,
  Sparkles,
  WandSparkles,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { BusinessProfile } from '@business/generated';
import { ConversationComposer } from '../../ConversationComposer';
import { createTranslator as createShellTranslator } from '../../i18n';
import { createTranslator, isTranslationKey, type TranslationKey } from './i18n';
import type { ProductHomeContext } from '../types';

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

export function ProductionHome({
  locale,
  workspaces,
  selectedWorkspaceId,
  composerText,
  composerAttachments,
  composerCapabilities,
  composerMode,
  modelSettings,
  onComposerTextChange,
  onComposerAttachmentsChange,
  onComposerCapabilitiesChange,
  onComposerModeChange,
  onModelSettingsChange,
  onWorkspaceSelect,
  onWorkspaceOpened,
  onSubmit,
}: ProductHomeContext) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const shellT = useMemo(() => createShellTranslator(locale), [locale]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('general');
  const [openingProject, setOpeningProject] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId) ?? profiles[0];
  const selectedProject = workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId);
  const hasComposerInput = composerText.trim().length > 0 || composerAttachments.length > 0 || composerCapabilities.length > 0;
  const canSubmit = hasComposerInput && (composerMode !== 'goal' || composerText.trim().length > 0) && !openingProject;
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const composerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const homeTitle = selectedProject
    ? t('home.projectTitle').replace('{project}', selectedProject.name)
    : t('home.title');

  useEffect(() => {
    let disposed = false;
    void window.limeShot.foundation.read()
      .then((foundation) => {
        if (disposed) return;
        setProfiles(foundation.profiles);
        setSelectedProfileId((current) => foundation.profiles.some((profile) => profile.profileId === current)
          ? current
          : foundation.profiles[0]?.profileId ?? 'general');
      })
      .catch((error) => {
        if (!disposed) setErrorMessage(error instanceof Error ? error.message : t('home.serviceUnavailable'));
      });
    return () => { disposed = true; };
  }, [t]);

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
    onWorkspaceSelect(projectId);
  };

  const openProjectDirectory = async () => {
    if (openingProject) return;
    setOpeningProject(true);
    setErrorMessage(undefined);
    try {
      const result = await window.limeShot.project.open({ profileId: selectedProfile?.profileId ?? 'general', language: locale });
      if (result) await onWorkspaceOpened(result.project.projectId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('project.openFailed'));
    } finally {
      setOpeningProject(false);
    }
  };

  const text = (key: string, fallback: string) => isTranslationKey(key) ? t(key) : fallback;

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
                      setSelectedProfileId(profile.profileId);
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
          <ConversationComposer
            surface="home"
            context={{ projectId: selectedWorkspaceId ?? null }}
            text={composerText}
            attachments={composerAttachments}
            capabilities={composerCapabilities}
            mode={composerMode}
            disabled={openingProject}
            canSubmit={canSubmit}
            placeholder={t('home.composerPlaceholder')}
            inputLabel={t('home.composerLabel')}
            modelSettings={modelSettings}
            projects={workspaces.map((workspace) => ({
              id: workspace.workspaceId,
              label: workspace.name,
              description: workspace.workspaceLabel,
            }))}
            selectedProjectId={selectedWorkspaceId}
            inputRef={inputRef}
            autoFocus
            addMenuOpen={addMenuOpen}
            projectOpening={openingProject}
            leadingControls={selectedProfile ? (
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
            onAddMenuOpenChange={(open) => {
              setAddMenuOpen(open);
              if (open) setProfileMenuOpen(false);
            }}
            onTextChange={onComposerTextChange}
            onAttachmentsChange={onComposerAttachmentsChange}
            onCapabilitiesChange={onComposerCapabilitiesChange}
            onModeChange={onComposerModeChange}
            onModelSettingsChange={onModelSettingsChange}
            onProjectSelect={selectProject}
            onProjectOpen={() => void openProjectDirectory()}
            onSubmit={onSubmit}
            onError={setErrorMessage}
            t={shellT}
          />
        </section>
      </div>
      {errorMessage ? <div className="production-home-error" role="alert">{errorMessage}</div> : null}
    </section>
  );
}
