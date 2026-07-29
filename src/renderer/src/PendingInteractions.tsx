import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleX,
  Clock3,
  FileCode2,
  FolderLock,
  Globe2,
  HelpCircle,
  KeyRound,
  LoaderCircle,
  Network,
  Plug,
  Terminal,
} from 'lucide-react';

import type {
  AgentInteractionExternalOpenInput,
  AgentInteractionSubmitInput,
  AgentFileChangeItemProjection,
  AgentPendingInteractionProjection,
  AgentTurnProjection,
  AgentUserInputRequestProjection,
} from '../../shared/desktop';
import type { TranslationKey } from './i18n';
import { McpElicitationForm } from './McpElicitationForm';

type Translate = (key: TranslationKey) => string;

interface PendingInteractionsProps {
  interactions: AgentPendingInteractionProjection[];
  currentThreadId?: string;
  turns: AgentTurnProjection[];
  onSubmit: (input: AgentInteractionSubmitInput) => Promise<void>;
  onOpenExternal: (input: AgentInteractionExternalOpenInput) => Promise<void>;
  errorMessage?: string;
  t: Translate;
}

export function PendingInteractions({ interactions, currentThreadId, turns, onSubmit, onOpenExternal, errorMessage, t }: PendingInteractionsProps) {
  const ordered = useMemo(() => [...interactions].sort((left, right) => left.createdAt - right.createdAt), [interactions]);
  const current = ordered.filter((interaction) => interaction.threadId === currentThreadId);
  const other = ordered.filter((interaction) => interaction.threadId !== currentThreadId);
  const currentPending = current.filter(isActionable);
  const otherPending = other.filter(isActionable);
  const [scope, setScope] = useState<'current' | 'other'>(currentPending.length > 0 || otherPending.length === 0 ? 'current' : 'other');
  const panelRef = useRef<HTMLElement>(null);
  const currentTabRef = useRef<HTMLButtonElement>(null);
  const otherTabRef = useRef<HTMLButtonElement>(null);
  const lastInteractionId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (scope === 'current' && currentPending.length === 0 && otherPending.length > 0) setScope('other');
    if (scope === 'other' && otherPending.length === 0 && currentPending.length > 0) setScope('current');
  }, [currentPending.length, otherPending.length, scope]);

  const scoped = scope === 'current' ? current : other;
  const actionable = scoped.filter(isActionable);
  const active = actionable[0] ?? [...scoped].reverse().find((interaction) => !isActionable(interaction));
  const selectAdjacentScope = (direction: -1 | 1) => {
    const scopes = ([current.length > 0 && 'current', other.length > 0 && 'other'] as const).filter((value): value is 'current' | 'other' => Boolean(value));
    const index = scopes.indexOf(scope);
    const next = scopes[(index + direction + scopes.length) % scopes.length];
    if (next) {
      setScope(next);
      queueMicrotask(() => (next === 'current' ? currentTabRef : otherTabRef).current?.focus());
    }
  };
  useEffect(() => {
    const isNewInteraction = active?.interactionId !== lastInteractionId.current;
    lastInteractionId.current = active?.interactionId;
    if (active?.status === 'pending' && isNewInteraction && (!document.activeElement || document.activeElement === document.body)) panelRef.current?.focus();
  }, [active?.interactionId, active?.status]);

  if (!active) return null;
  const queuePosition = actionable.findIndex((interaction) => interaction.interactionId === active.interactionId) + 1;
  const disabled = active.status !== 'pending';
  return (
    <section className="interaction-surface" role="region" aria-labelledby="pending-interaction-title" tabIndex={-1} ref={panelRef} data-kind={active.kind} data-status={active.status}>
      <header>
        <div className="interaction-heading">{interactionIcon(active)}<div><strong id="pending-interaction-title">{t('interaction.title')}</strong><span>{kindLabel(active, t)}</span></div></div>
        <div className="interaction-tabs" role="tablist" aria-label={t('interaction.scope')} onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            selectAdjacentScope(event.key === 'ArrowLeft' ? -1 : 1);
          }
        }}>
          <button ref={currentTabRef} id="interaction-tab-current" type="button" role="tab" aria-selected={scope === 'current'} aria-controls="interaction-tabpanel" tabIndex={scope === 'current' ? 0 : -1} onClick={() => setScope('current')} disabled={current.length === 0}>{t('interaction.currentThread')}<small>{currentPending.length}</small></button>
          <button ref={otherTabRef} id="interaction-tab-other" type="button" role="tab" aria-selected={scope === 'other'} aria-controls="interaction-tabpanel" tabIndex={scope === 'other' ? 0 : -1} onClick={() => setScope('other')} disabled={other.length === 0}>{t('interaction.otherThreads')}<small>{otherPending.length}</small></button>
        </div>
      </header>
      <div className="interaction-body" id="interaction-tabpanel" role="tabpanel" aria-labelledby={`interaction-tab-${scope}`} key={active.interactionId}>
        <InteractionStatus interaction={active} t={t} />
        {active.reason ? <p className="interaction-reason">{active.reason}</p> : null}
        <RiskList risks={active.risks} t={t} />
        {errorMessage ? <p className="interaction-error" role="alert">{errorMessage}</p> : null}
        {active.status === 'pending' || active.status === 'submitting' ? (
          <InteractionPrompt
            interaction={active}
            turns={scope === 'current' ? turns : []}
            disabled={disabled}
            onSubmit={onSubmit}
            onOpenExternal={onOpenExternal}
            t={t}
          />
        ) : null}
      </div>
      {actionable.length > 1 ? <footer>{t('interaction.queue')} {queuePosition}/{actionable.length}</footer> : null}
    </section>
  );
}

function InteractionPrompt({ interaction, turns, disabled, onSubmit, onOpenExternal, t }: { interaction: AgentPendingInteractionProjection; turns: AgentTurnProjection[]; disabled: boolean; onSubmit: PendingInteractionsProps['onSubmit']; onOpenExternal: PendingInteractionsProps['onOpenExternal']; t: Translate }) {
  if (interaction.kind === 'userInput') return <UserInputForm interaction={interaction} disabled={disabled} onSubmit={onSubmit} t={t} />;
  if (interaction.kind === 'mcpElicitation') {
    return <McpElicitationForm
      interaction={interaction}
      disabled={disabled}
      onSubmit={(action, content) => onSubmit({ interactionId: interaction.interactionId, actionToken: interaction.actionToken, kind: interaction.kind, action, ...(content !== undefined ? { content } : {}) })}
      onOpenExternal={() => onOpenExternal({ interactionId: interaction.interactionId, actionToken: interaction.actionToken })}
      t={t}
    />;
  }
  return <ApprovalPrompt interaction={interaction} turns={turns} disabled={disabled} onSubmit={onSubmit} t={t} />;
}

function ApprovalPrompt({ interaction, turns, disabled, onSubmit, t }: { interaction: Exclude<AgentPendingInteractionProjection, { kind: 'userInput' | 'mcpElicitation' }>; turns: AgentTurnProjection[]; disabled: boolean; onSubmit: PendingInteractionsProps['onSubmit']; t: Translate }) {
  if (interaction.kind === 'commandApproval') {
    return (
      <div className="interaction-prompt">
        {interaction.command ? <pre className="interaction-command">{interaction.command}</pre> : null}
        {interaction.cwd ? <p className="interaction-meta">{t('agent.cwd')}: {interaction.cwd}</p> : null}
        {interaction.actions.length > 0 ? <ul className="interaction-summary-list">{interaction.actions.map((action, index) => <li key={`${action.type}-${index}`}>{action.name ?? action.path ?? action.query ?? action.command}</li>)}</ul> : null}
        <DecisionButtons decisions={interaction.decisions} disabled={disabled} onSelect={(decision) => onSubmit({ interactionId: interaction.interactionId, actionToken: interaction.actionToken, kind: interaction.kind, decision })} t={t} />
      </div>
    );
  }
  if (interaction.kind === 'fileApproval') {
    const projected = turns
      .flatMap((turn) => turn.items)
      .find((item): item is AgentFileChangeItemProjection => item.id === interaction.itemId && item.type === 'fileChange');
    const changes = interaction.changes.length > 0 ? interaction.changes : projected?.changes ?? [];
    return (
      <div className="interaction-prompt">
        {interaction.grantRoot ? <p className="interaction-meta">{t('interaction.grantRoot')}: {interaction.grantRoot}</p> : null}
        {changes.length > 0 ? <div className="interaction-file-list">{changes.map((change, index) => <details key={`${change.path}-${index}`}><summary><span>{change.kind}</span><code>{change.path}</code></summary>{change.diff ? <pre>{change.diff}</pre> : null}</details>)}</div> : <p className="interaction-meta">{t('interaction.fileChangePending')}</p>}
        <DecisionButtons decisions={interaction.decisions} disabled={disabled} onSelect={(decision) => onSubmit({ interactionId: interaction.interactionId, actionToken: interaction.actionToken, kind: interaction.kind, decision })} t={t} />
      </div>
    );
  }
  return (
    <div className="interaction-prompt">
      <dl className="interaction-permissions">
        <div><dt>{t('interaction.network')}</dt><dd>{interaction.networkRequested ? t('interaction.requested') : t('interaction.notRequested')}</dd></div>
        <div><dt>{t('interaction.readPaths')}</dt><dd>{interaction.readPathCount}</dd></div>
        <div><dt>{t('interaction.writePaths')}</dt><dd>{interaction.writePathCount}</dd></div>
        {interaction.environmentLabel ? <div><dt>{t('interaction.environment')}</dt><dd>{interaction.environmentLabel}</dd></div> : null}
      </dl>
      {interaction.cwd ? <p className="interaction-meta">{t('agent.cwd')}: {interaction.cwd}</p> : null}
      <DecisionButtons decisions={interaction.decisions} disabled={disabled} onSelect={(decision) => onSubmit({ interactionId: interaction.interactionId, actionToken: interaction.actionToken, kind: interaction.kind, decision })} t={t} />
    </div>
  );
}

function UserInputForm({ interaction, disabled, onSubmit, t }: { interaction: AgentUserInputRequestProjection; disabled: boolean; onSubmit: PendingInteractionsProps['onSubmit']; t: Translate }) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [otherSelected, setOtherSelected] = useState<Record<string, boolean>>({});
  const [freeform, setFreeform] = useState<Record<string, string>>({});

  const choose = (questionId: string, label: string, multiple: boolean) => {
    setSelected((current) => {
      const values = current[questionId] ?? [];
      return { ...current, [questionId]: multiple ? values.includes(label) ? values.filter((value) => value !== label) : [...values, label] : [label] };
    });
    if (!multiple) setOtherSelected((current) => ({ ...current, [questionId]: false }));
  };

  const submit = () => {
    const answers = Object.fromEntries(interaction.questions.map((question) => {
      const values = [...(selected[question.id] ?? [])];
      const text = freeform[question.id]?.trim();
      if (text && (question.options.length === 0 || otherSelected[question.id] || values.length > 0)) values.push(text);
      return [question.id, values];
    }));
    return onSubmit({ interactionId: interaction.interactionId, actionToken: interaction.actionToken, kind: interaction.kind, answers });
  };

  return (
    <div className="interaction-form">
      {interaction.autoResolutionAt ? <AutoResolutionCountdown at={interaction.autoResolutionAt} t={t} /> : null}
      <div className="interaction-questions">{interaction.questions.map((question, index) => {
        const inputType = question.multiple ? 'checkbox' : 'radio';
        const name = `${interaction.interactionId}-${question.id || index}`;
        const values = selected[question.id] ?? [];
        const showFreeform = question.options.length === 0 || question.allowsOther || values.length > 0;
        return (
          <fieldset key={`${question.id}-${index}`}>
            <legend><span>{question.header || `${t('interaction.question')} ${index + 1}`}</span><strong>{question.question}</strong></legend>
            {question.options.length > 0 ? <div className="interaction-options">{question.options.map((option) => <label key={option.label}><input type={inputType} name={name} checked={values.includes(option.label)} disabled={disabled} onChange={() => choose(question.id, option.label, question.multiple)} /><span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span></label>)}</div> : null}
            {question.allowsOther ? <label className="interaction-other"><input type={inputType} name={name} checked={otherSelected[question.id] === true} disabled={disabled} onChange={() => { setOtherSelected((current) => ({ ...current, [question.id]: !current[question.id] })); if (!question.multiple) setSelected((current) => ({ ...current, [question.id]: [] })); }} /><span>{t('interaction.other')}</span></label> : null}
            {showFreeform ? <label className="interaction-freeform"><span>{question.options.length === 0 ? t('interaction.answer') : t('interaction.notes')}</span><input type={question.secret ? 'password' : 'text'} {...(question.secret ? { defaultValue: '' } : { value: freeform[question.id] ?? '' })} disabled={disabled} autoComplete="off" spellCheck={!question.secret} onChange={(event) => setFreeform((current) => ({ ...current, [question.id]: event.target.value }))} /></label> : null}
          </fieldset>
        );
      })}</div>
      <div className="interaction-actions"><button type="button" className="primary" disabled={disabled} onClick={() => void submit()}>{t('interaction.submit')}</button></div>
    </div>
  );
}

function DecisionButtons<Decision extends string>({ decisions, disabled, onSelect, t }: { decisions: Decision[]; disabled: boolean; onSelect: (decision: Decision) => Promise<void>; t: Translate }) {
  return <div className="interaction-actions">{decisions.map((decision) => <button type="button" className={decisionClass(decision)} disabled={disabled} onClick={() => void onSelect(decision)} key={decision}>{decisionLabel(decision, t)}</button>)}</div>;
}

function RiskList({ risks, t }: { risks: AgentPendingInteractionProjection['risks']; t: Translate }) {
  if (risks.length === 0) return null;
  return <div className="interaction-risks" aria-label={t('interaction.risks')}>{risks.map((risk) => <span data-risk={risk} key={risk}>{riskIcon(risk)}{t(`interaction.risk.${risk}` as TranslationKey)}</span>)}</div>;
}

function InteractionStatus({ interaction, t }: { interaction: AgentPendingInteractionProjection; t: Translate }) {
  if (interaction.status === 'pending') return null;
  const icon = interaction.status === 'submitting' ? <LoaderCircle className="spin" size={13} aria-hidden="true" /> : interaction.status === 'resolved' ? <CheckCircle2 size={13} aria-hidden="true" /> : interaction.status === 'expired' ? <Clock3 size={13} aria-hidden="true" /> : <CircleX size={13} aria-hidden="true" />;
  return <p className="interaction-status" role="status">{icon}{t(`interaction.status.${interaction.status}` as TranslationKey)}</p>;
}

function AutoResolutionCountdown({ at, t }: { at: number; t: Translate }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((at - now) / 1_000));
  return <p className="interaction-countdown" role="timer" aria-live="off"><Clock3 size={12} aria-hidden="true" />{seconds > 0 ? `${t('interaction.autoResolution')} ${seconds}s` : t('interaction.autoResolving')}</p>;
}

function isActionable(interaction: AgentPendingInteractionProjection): boolean {
  return interaction.status === 'pending' || interaction.status === 'submitting';
}

function kindLabel(interaction: AgentPendingInteractionProjection, t: Translate): string {
  return t(`interaction.kind.${interaction.kind}` as TranslationKey);
}

function decisionLabel(decision: string, t: Translate): string {
  return t(`interaction.decision.${decision}` as TranslationKey);
}

function decisionClass(decision: string): string | undefined {
  if (decision === 'accept' || decision === 'grantTurn') return 'primary';
  if (decision === 'decline' || decision === 'deny') return 'danger';
  return undefined;
}

function riskIcon(risk: AgentPendingInteractionProjection['risks'][number]) {
  if (risk === 'shell') return <Terminal size={11} aria-hidden="true" />;
  if (risk === 'filesystem') return <FolderLock size={11} aria-hidden="true" />;
  if (risk === 'network') return <Network size={11} aria-hidden="true" />;
  if (risk === 'session') return <Clock3 size={11} aria-hidden="true" />;
  if (risk === 'secret') return <KeyRound size={11} aria-hidden="true" />;
  return <Globe2 size={11} aria-hidden="true" />;
}

function interactionIcon(interaction: AgentPendingInteractionProjection) {
  if (interaction.kind === 'commandApproval') return <Terminal size={14} aria-hidden="true" />;
  if (interaction.kind === 'fileApproval') return <FileCode2 size={14} aria-hidden="true" />;
  if (interaction.kind === 'permissionApproval') return <KeyRound size={14} aria-hidden="true" />;
  if (interaction.kind === 'userInput') return <HelpCircle size={14} aria-hidden="true" />;
  return <Plug size={14} aria-hidden="true" />;
}
