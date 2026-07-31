import { Check, ListChecks, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ApprovalReceipt, ProductionPlan } from '@business/generated';
import type { TranslationKey } from './i18n';

interface PlanPanelProps {
  plans: ProductionPlan[];
  onPlanUpdated: (plan: ProductionPlan) => void;
  t: (key: TranslationKey) => string;
}

export function PlanPanel({ plans, onPlanUpdated, t }: PlanPanelProps) {
  const plan = plans[0];
  const [deciding, setDeciding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [receipt, setReceipt] = useState<ApprovalReceipt>();
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');

  useEffect(() => {
    setChangeRequestOpen(false);
    setChangeNote('');
  }, [plan?.planId, plan?.version]);

  const decide = async (decision: 'approve' | 'request_changes', note = '') => {
    if (!plan) return;
    setDeciding(true);
    setErrorMessage(undefined);
    setReceipt(undefined);
    try {
      const result = await window.limeShot.approval.decide({
        projectId: plan.projectId,
        planId: plan.planId,
        expectedVersion: plan.version,
        decision,
        note,
      });
      onPlanUpdated(result.plan);
      setReceipt(result.receipt);
      setChangeRequestOpen(false);
      setChangeNote('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('plan.decisionFailed'));
    } finally {
      setDeciding(false);
    }
  };

  return (
    <section className="plan-panel" data-testid="plan-panel">
      <header>
        <div><ListChecks size={16} aria-hidden="true" /><h3>{t('plan.title')}</h3></div>
        {plan ? <span data-state={plan.state}>{t(`plan.state.${plan.state}` as TranslationKey)}</span> : null}
      </header>
      {!plan ? <p className="plan-empty">{t('plan.empty')}</p> : (
        <div className="plan-content">
          <div className="plan-heading"><strong>{plan.content.title}</strong><span>v{plan.version}</span></div>
          <p>{plan.content.summary}</p>
          <dl className="plan-facts">
            <div><dt>{t('plan.briefVersion')}</dt><dd>v{plan.briefVersion}</dd></div>
            <div><dt>{t('plan.deliverables')}</dt><dd>{plan.content.deliverables.length}</dd></div>
            <div><dt>{t('plan.operations')}</dt><dd>{plan.content.operations.length}</dd></div>
            <div><dt>{t('plan.gaps')}</dt><dd>{plan.content.gaps.length}</dd></div>
            <div><dt>{t('plan.risks')}</dt><dd>{plan.content.risks.length}</dd></div>
          </dl>
          <div className="plan-detail-grid">
            {plan.content.deliverables.length > 0 ? (
              <section className="plan-detail-section">
                <h4>{t('plan.deliverables')}</h4>
                <ul className="plan-list">
                  {plan.content.deliverables.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ) : null}
            {plan.content.operations.length > 0 ? (
              <section className="plan-detail-section">
                <h4>{t('plan.operations')}</h4>
                <ol className="plan-list plan-operation-list">
                  {plan.content.operations.map((operation) => <li key={operation.operationId}>{operation.title}</li>)}
                </ol>
              </section>
            ) : null}
            {plan.content.gaps.length > 0 ? (
              <section className="plan-detail-section">
                <h4>{t('plan.gaps')}</h4>
                <ul className="plan-list plan-gap-list">
                  {plan.content.gaps.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ) : null}
            {plan.content.risks.length > 0 ? (
              <section className="plan-detail-section">
                <h4>{t('plan.risks')}</h4>
                <ul className="plan-list plan-risk-list">
                  {plan.content.risks.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ) : null}
          </div>
          {plan.state === 'ready_for_review' && !changeRequestOpen ? (
            <div className="plan-actions">
              <button className="secondary-command" type="button" disabled={deciding} onClick={() => setChangeRequestOpen(true)}>
                <RotateCcw size={15} aria-hidden="true" />{t('plan.requestChanges')}
              </button>
              <button className="primary-command" type="button" disabled={deciding} onClick={() => void decide('approve')}>
                <Check size={15} aria-hidden="true" />{deciding ? t('plan.deciding') : t('plan.approve')}
              </button>
            </div>
          ) : null}
          {plan.state === 'ready_for_review' && changeRequestOpen ? (
            <form className="plan-change-request" onSubmit={(event) => {
              event.preventDefault();
              void decide('request_changes', changeNote.trim());
            }}>
              <label htmlFor="plan-change-note">{t('plan.changeNote')}</label>
              <textarea
                id="plan-change-note"
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                placeholder={t('plan.changeNotePlaceholder')}
                autoFocus
              />
              <div className="plan-actions">
                <button className="secondary-command" type="button" disabled={deciding} onClick={() => setChangeRequestOpen(false)}>{t('plan.cancelChanges')}</button>
                <button className="primary-command" type="submit" disabled={deciding || changeNote.trim().length === 0}>
                  <RotateCcw size={15} aria-hidden="true" />{deciding ? t('plan.deciding') : t('plan.submitChanges')}
                </button>
              </div>
            </form>
          ) : null}
          {receipt ? (
            <p className="approval-receipt" data-testid="approval-receipt" data-approval-id={receipt.approvalId} aria-live="polite">
              <Check size={14} aria-hidden="true" />{t('plan.approvalRecorded')}
            </p>
          ) : null}
          {errorMessage ? <p className="inline-error" role="alert">{errorMessage}</p> : null}
        </div>
      )}
    </section>
  );
}
