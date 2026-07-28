import { Clapperboard, Mic2, Send, ShoppingBag, Sparkles, WandSparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { BusinessProfile, ProjectSummary } from '@business/generated';
import type { TranslationKey } from './i18n';

interface WorkspaceHomeProps {
  profiles: BusinessProfile[];
  projects: ProjectSummary[];
  selectedProfileId: string;
  composerText: string;
  submitting: boolean;
  onProfileSelect: (profileId: string) => void;
  onComposerTextChange: (text: string) => void;
  onProjectSelect: (projectId: string) => void;
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

const profileAccent: Record<string, string> = {
  general: 'blue',
  short_form: 'coral',
  visual_transform: 'cyan',
  talking_video: 'green',
  commerce_video: 'amber',
};

const cueKeys: Record<string, TranslationKey[]> = {
  general: ['home.cue.general.1', 'home.cue.general.2', 'home.cue.general.3'],
  short_form: ['home.cue.shortForm.1', 'home.cue.shortForm.2', 'home.cue.shortForm.3'],
  visual_transform: ['home.cue.visualTransform.1', 'home.cue.visualTransform.2', 'home.cue.visualTransform.3'],
  talking_video: ['home.cue.talkingVideo.1', 'home.cue.talkingVideo.2', 'home.cue.talkingVideo.3'],
  commerce_video: ['home.cue.commerceVideo.1', 'home.cue.commerceVideo.2', 'home.cue.commerceVideo.3'],
};

export function WorkspaceHome({
  profiles,
  projects,
  selectedProfileId,
  composerText,
  submitting,
  onProfileSelect,
  onComposerTextChange,
  onProjectSelect,
  onSubmit,
  text,
  t,
}: WorkspaceHomeProps) {
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId) ?? profiles[0];
  const cues = selectedProfile ? cueKeys[selectedProfile.profileId] ?? cueKeys.general : cueKeys.general;
  const canSubmit = composerText.trim().length > 0 && !submitting;

  return (
    <section className="home-workspace" data-testid="home-workspace">
      <div className="home-content">
        <section className="workspace-banner" aria-labelledby="workspace-banner-title">
          <span>{t('home.bannerEyebrow')}</span>
          <h1 id="workspace-banner-title">{t('home.bannerTitle')}</h1>
          <div className="banner-features" aria-label={t('home.bannerTitle')}>
            <span><Sparkles size={13} aria-hidden="true" />{t('home.feature.free')}</span>
            <span><Clapperboard size={13} aria-hidden="true" />{t('home.feature.batch')}</span>
            <span><WandSparkles size={13} aria-hidden="true" />{t('home.feature.skills')}</span>
          </div>
        </section>

        <section className="profile-workspace" aria-labelledby="profile-picker-title">
          <h2 id="profile-picker-title">{t('home.profilePrompt')}</h2>
          <div className="profile-tabs" data-testid="profiles-grid">
            {profiles.map((profile) => {
              const Icon = profileIcons[profile.profileId] ?? Sparkles;
              const selected = selectedProfileId === profile.profileId;
              return (
                <button
                  key={profile.profileId}
                  type="button"
                  className="profile-tab"
                  data-selected={selected ? 'true' : 'false'}
                  data-accent={profileAccent[profile.profileId] ?? 'blue'}
                  data-testid={`profile-${profile.profileId}`}
                  onClick={() => onProfileSelect(profile.profileId)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{text(profile.nameKey, profile.profileId)}</span>
                </button>
              );
            })}
          </div>
          {selectedProfile ? (
            <div className="profile-summary" data-profile={selectedProfile.profileId}>
              <p>{text(selectedProfile.descriptionKey, selectedProfile.descriptionKey)}</p>
              <div>{cues.map((key) => <span key={key}>{t(key)}</span>)}</div>
            </div>
          ) : null}
        </section>

        <section className="home-composer">
          <textarea
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
            <div className="composer-selectors">
              <select value={selectedProfileId} onChange={(event) => onProfileSelect(event.target.value)} aria-label={t('project.profile')}>
                {profiles.map((profile) => <option key={profile.profileId} value={profile.profileId}>{text(profile.nameKey, profile.profileId)}</option>)}
              </select>
              <select value="" onChange={(event) => event.target.value && onProjectSelect(event.target.value)} aria-label={t('nav.projects')}>
                <option value="">{t('home.newProjectTarget')}</option>
                {projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.name}</option>)}
              </select>
            </div>
            <button type="button" disabled={!canSubmit} onClick={onSubmit} title={t('agent.send')}>
              <Send size={17} aria-hidden="true" />
            </button>
          </footer>
        </section>
      </div>
    </section>
  );
}
