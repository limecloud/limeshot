import { useEffect, useState } from 'react';

import type { BriefInput, ProductionPlan, ProjectReadResult } from '@business/generated';
import { ExecutionPanel } from './ExecutionPanel';
import type { TranslationKey } from './i18n';
import { PlanPanel } from './PlanPanel';

interface ProductionProjectProps {
  detail: ProjectReadResult;
  plans: ProductionPlan[];
  mediaProbeReady: boolean;
  mediaTranscodeReady: boolean;
  onBriefUpdated: (brief: ProjectReadResult['brief']) => void;
  onPlanUpdated: (plan: ProductionPlan) => void;
  t: (key: TranslationKey) => string;
}

export function ProductionProject({ detail, plans, mediaProbeReady, mediaTranscodeReady, onBriefUpdated, onPlanUpdated, t }: ProductionProjectProps) {
  const statusKey = `brief.${detail.brief.completeness}` as TranslationKey;
  return (
    <section className="project-overview" data-testid="project-overview">
      <div className="section-heading">
        <h2>{t('project.overview')}</h2>
        <span data-state={detail.brief.completeness}>{t(statusKey)}</span>
      </div>
      <div className="project-overview-facts">
        <div><span>{t('project.profile')}</span><strong>{detail.project.profileId}</strong></div>
        <div><span>{t('project.briefVersion')}</span><strong>v{detail.brief.version}</strong></div>
        <div><span>{t('project.missingFields')}</span><strong>{detail.brief.missingFields.length}</strong></div>
        <div><span>{t('project.conflicts')}</span><strong>{detail.brief.conflicts.length}</strong></div>
      </div>
      <BriefEditor brief={detail.brief} onUpdated={onBriefUpdated} t={t} />
      <PlanPanel plans={plans} onPlanUpdated={onPlanUpdated} t={t} />
      <ExecutionPanel
        projectId={detail.project.projectId}
        plans={plans}
        mediaProbeReady={mediaProbeReady}
        mediaTranscodeReady={mediaTranscodeReady}
        t={t}
      />
    </section>
  );
}

interface BriefEditorProps {
  brief: ProjectReadResult['brief'];
  onUpdated: (brief: ProjectReadResult['brief']) => void;
  t: (key: TranslationKey) => string;
}

function BriefEditor({ brief, onUpdated, t }: BriefEditorProps) {
  const [content, setContent] = useState<BriefInput>(brief.content);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    setContent(brief.content);
    setErrorMessage(undefined);
  }, [brief]);

  const update = <K extends keyof BriefInput>(key: K, value: BriefInput[K]) => {
    setContent((current) => ({ ...current, [key]: value }) as BriefInput);
  };

  const save = async () => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const result = await window.limeShot.project.updateBrief({
        projectId: brief.projectId,
        expectedVersion: brief.version,
        brief: content,
      });
      onUpdated(result.brief);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('project.briefSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="brief-editor" onSubmit={(event) => {
      event.preventDefault();
      void save();
    }}>
      <h3>{t('project.brief')}</h3>
      <div className="brief-fields">
        <label><span>{t('project.subject')}</span><input value={content.subject} onChange={(event) => update('subject', event.target.value)} /></label>
        <label><span>{t('project.audience')}</span><input value={content.audience} onChange={(event) => update('audience', event.target.value)} /></label>
        <label><span>{t('project.platform')}</span><input value={content.platform} onChange={(event) => update('platform', event.target.value)} /></label>
        <label><span>{t('project.duration')}</span><input type="number" min="1" value={content.targetDurationSeconds ?? ''} onChange={(event) => update('targetDurationSeconds', event.target.value ? Number(event.target.value) : null)} /></label>
        <label><span>{t('project.aspectRatio')}</span><select value={content.aspectRatio} onChange={(event) => update('aspectRatio', event.target.value)}><option value="">{t('project.notSet')}</option><option value="9:16">9:16</option><option value="16:9">16:9</option><option value="1:1">1:1</option><option value="4:3">4:3</option></select></label>
        <label><span>{t('project.language')}</span><input value={content.language} onChange={(event) => update('language', event.target.value)} /></label>
        <label className="brief-field-wide"><span>{t('project.style')}</span><input value={content.style} onChange={(event) => update('style', event.target.value)} /></label>
      </div>
      {errorMessage ? <p className="inline-error" role="alert">{errorMessage}</p> : null}
      <div className="brief-editor-actions"><button className="primary-command" type="submit" disabled={saving}>{saving ? t('project.savingBrief') : t('project.saveBrief')}</button></div>
    </form>
  );
}
