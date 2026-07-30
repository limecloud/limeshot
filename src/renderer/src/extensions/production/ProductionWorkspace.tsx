import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ProductionPlan, ProjectReadResult } from '@business/generated';
import type { ProductWorkspaceContext } from '../types';
import { createTranslator } from './i18n';
import { ProductionProject } from './ProductionProject';

export function ProductionWorkspace({ locale, workspace }: ProductWorkspaceContext) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [detail, setDetail] = useState<ProjectReadResult>();
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [mediaProbeReady, setMediaProbeReady] = useState(false);
  const [mediaTranscodeReady, setMediaTranscodeReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const load = useCallback(async () => {
    setErrorMessage(undefined);
    try {
      const [foundation, project, planResult] = await Promise.all([
        window.limeShot.foundation.read(),
        window.limeShot.project.read(workspace.workspaceId),
        window.limeShot.plan.list(workspace.workspaceId),
      ]);
      setDetail(project);
      setPlans(planResult.plans);
      setMediaProbeReady(foundation.services.some((service) => service.serviceId === 'media.probe' && service.state === 'ready'));
      setMediaTranscodeReady(foundation.services.some((service) => service.serviceId === 'media.assemble' && service.state === 'ready'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('project.readFailed'));
    }
  }, [t, workspace.workspaceId]);

  useEffect(() => {
    setDetail(undefined);
    setPlans([]);
    void load();
  }, [load]);

  return (
    <section className="production-workspace" data-testid="production-workspace" data-extension-id="production">
      <div className="production-workspace-body">
        {detail ? (
          <ProductionProject
            detail={detail}
            plans={plans}
            mediaProbeReady={mediaProbeReady}
            mediaTranscodeReady={mediaTranscodeReady}
            onBriefUpdated={(brief) => setDetail((current) => current ? { ...current, brief } : current)}
            onPlanUpdated={(plan) => setPlans((current) => current.map((item) => item.planId === plan.planId ? plan : item))}
            t={t}
          />
        ) : errorMessage ? (
          <div className="production-workspace-state" role="alert">
            <p>{errorMessage}</p>
            <button className="secondary-command" type="button" onClick={() => void load()}>{t('project.retry')}</button>
          </div>
        ) : (
          <p className="production-workspace-state">{t('project.loading')}</p>
        )}
      </div>
    </section>
  );
}
