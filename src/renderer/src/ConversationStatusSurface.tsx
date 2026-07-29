import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileSearch,
  Gauge,
  Mic2,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  X,
} from 'lucide-react';

import type { AgentCatalogUpdateProjection, AgentNoticeProjection, AgentSafetyReviewProjection } from '../../shared/desktop';
import type { AgentActivityState, AgentThreadActivityState } from './agentActivityState';
import type { TranslationKey } from './i18n';

type Translate = (key: TranslationKey) => string;

interface ConversationStatusSurfaceProps {
  state: AgentActivityState;
  threadId?: string;
  onDismissNotice: (noticeId: string) => void;
  onSelectFile: (path: string) => void;
  t: Translate;
}

export function ConversationStatusSurface({ state, threadId, onDismissNotice, onSelectFile, t }: ConversationStatusSurfaceProps) {
  const thread = threadId ? state.threads[threadId] : undefined;
  const notices = state.notices.filter((notice) => notice.scope === 'global' || notice.threadId === threadId);
  const catalog = state.catalog.filter((update) => !update.threadId || update.threadId === threadId);
  const diagnostics = state.diagnostics.filter((entry) => !entry.threadId || entry.threadId === threadId);
  const hasContent = Boolean(thread || notices.length || catalog.length || diagnostics.length || state.composerSearch);
  if (!hasContent) return null;

  return (
    <section className="conversation-status-surface" aria-label={t('activity.region')}>
      {thread ? <ThreadSummary thread={thread} t={t} /> : null}
      {notices.length > 0 ? (
        <div className="activity-notices" aria-label={t('activity.notices')}>
          {notices.map((notice) => <Notice notice={notice} onDismiss={onDismissNotice} t={t} key={notice.id} />)}
        </div>
      ) : null}
      {state.composerSearch ? (
        <section className="activity-file-search" aria-label={t('activity.fileSearch')} data-status={state.composerSearch.status}>
          <header><FileSearch size={13} aria-hidden="true" /><strong>{t('activity.fileSearch')}</strong>{state.composerSearch.status === 'searching' ? <span>{t('activity.searching')}</span> : null}</header>
          {state.composerSearch.files.length > 0 ? <div>{state.composerSearch.files.map((file) => <button type="button" onClick={() => onSelectFile(file.path)} key={file.path}><strong>{file.name}</strong><code>{file.path}</code></button>)}</div> : null}
        </section>
      ) : null}
      {catalog.length > 0 ? <CatalogUpdates updates={catalog} t={t} /> : null}
      {diagnostics.length > 0 ? (
        <details className="activity-disclosure activity-diagnostics">
          <summary><TerminalSquare size={13} aria-hidden="true" />{t('activity.diagnostics')}<span>{diagnostics.length}</span></summary>
          <ul>{diagnostics.slice(-20).map((entry) => <li data-level={entry.level} key={entry.id}><strong>{t(`activity.diagnosticDomain.${entry.domain}` as TranslationKey)}</strong><span>{t(`activity.diagnostic.${entry.code}` as TranslationKey)}</span>{entry.detail ? <code>{entry.detail}</code> : entry.status ? <code>{entry.status}</code> : null}</li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}

function ThreadSummary({ thread, t }: { thread: AgentThreadActivityState; t: Translate }) {
  const model = thread.model?.current || thread.settings?.model;
  const realtimeVisible = thread.realtime.state !== 'idle' || Boolean(thread.realtime.transcript);
  return (
    <div className="activity-thread-summary">
      <div className="activity-chips">
        {thread.lifecycle ? <span data-tone={thread.lifecycle === 'active' ? 'positive' : 'neutral'}><Activity size={11} aria-hidden="true" />{t(`activity.lifecycle.${thread.lifecycle}` as TranslationKey)}</span> : null}
        {thread.status ? <span data-tone={thread.status.type === 'systemError' ? 'danger' : 'neutral'}>{t('activity.status')}: {t(`activity.threadStatus.${thread.status.type}` as TranslationKey)}</span> : null}
        {thread.status?.waitingOnApproval ? <span data-tone="warning">{t('activity.waitingApproval')}</span> : null}
        {thread.status?.waitingOnUserInput ? <span data-tone="warning">{t('activity.waitingInput')}</span> : null}
        {model ? <span><Bot size={11} aria-hidden="true" />{t('activity.model')}: {model}</span> : null}
        {thread.environment ? <span data-tone={thread.environment.state === 'connected' ? 'positive' : 'warning'}>{t('activity.environment')}: {t(`activity.environmentState.${thread.environment.state}` as TranslationKey)} · {thread.environment.label}</span> : null}
        {thread.verificationCount ? <span data-tone="positive"><CheckCircle2 size={11} aria-hidden="true" />{t('activity.verified')}</span> : null}
        {thread.safetyBuffering?.active ? <span data-tone="warning"><ShieldCheck size={11} aria-hidden="true" />{t('activity.safetyBuffering')}</span> : null}
        {thread.usage ? <span><Gauge size={11} aria-hidden="true" />{t('activity.usage')}: {thread.usage.totalTokens.toLocaleString()}</span> : null}
      </div>
      {thread.goal ? (
        <details className="activity-disclosure">
          <summary><Bot size={13} aria-hidden="true" />{t('activity.goal')}<span>{goalStatusLabel(thread.goal.status, t)}</span></summary>
          <p>{thread.goal.objective}</p>
          <small>{t('activity.goalUsage')}: {thread.goal.tokensUsed.toLocaleString()}{thread.goal.tokenBudget ? ` / ${thread.goal.tokenBudget.toLocaleString()}` : ''} · {thread.goal.timeUsedSeconds}s</small>
        </details>
      ) : null}
      {thread.settings ? (
        <details className="activity-disclosure">
          <summary><Settings2 size={13} aria-hidden="true" />{t('activity.settings')}</summary>
          <dl>
            <div><dt>{t('activity.model')}</dt><dd>{thread.settings.model}</dd></div>
            <div><dt>{t('activity.approval')}</dt><dd>{thread.settings.approvalPolicy}</dd></div>
            <div><dt>{t('activity.sandbox')}</dt><dd>{thread.settings.sandboxPolicy}</dd></div>
            {thread.settings.cwd ? <div><dt>{t('agent.cwd')}</dt><dd>{thread.settings.cwd}</dd></div> : null}
          </dl>
        </details>
      ) : null}
      {realtimeVisible ? (
        <details className="activity-disclosure activity-realtime" open={thread.realtime.state === 'error'}>
          <summary><Mic2 size={13} aria-hidden="true" />{t('activity.realtime')}<span>{t(`activity.realtime.${thread.realtime.state}` as TranslationKey)}</span></summary>
          {thread.realtime.transcript ? <p><strong>{t('activity.transcript')}{thread.realtime.provisional ? ` · ${t('activity.provisional')}` : ''}</strong><span>{thread.realtime.transcript}</span></p> : null}
          {thread.realtime.audioChunks > 0 ? <small>{t('activity.audioQueued')}: {thread.realtime.audioChunks}</small> : null}
          {thread.realtime.state === 'error' ? <p role="status">{thread.realtime.message ?? t('activity.realtimeFailed')}</p> : thread.realtime.message ? <p role="status">{thread.realtime.message}</p> : null}
        </details>
      ) : null}
      {thread.reviews.length > 0 ? <ReviewList reviews={thread.reviews} t={t} /> : null}
      {thread.hooks.length > 0 ? (
        <details className="activity-disclosure">
          <summary><Activity size={13} aria-hidden="true" />{t('activity.hooks')}<span>{thread.hooks.length}</span></summary>
          <ul>{thread.hooks.slice(-10).map((hook) => <li key={hook.id}><strong>{hook.eventName}</strong><span>{hookStatusLabel(hook.status, t)}</span>{hook.statusMessage ? <p>{hook.statusMessage}</p> : null}{hook.entries.slice(-5).map((entry, index) => <code key={`${entry.kind}-${index}`}>{entry.kind}: {entry.text}</code>)}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function ReviewList({ reviews, t }: { reviews: AgentSafetyReviewProjection[]; t: Translate }) {
  return (
    <details className="activity-disclosure activity-reviews" open={reviews.some((review) => review.status === 'denied')}>
      <summary><ShieldCheck size={13} aria-hidden="true" />{t('activity.reviews')}<span>{reviews.length}</span></summary>
      <ul>{reviews.slice(-10).map((review) => (
        <li data-status={review.status} data-risk={review.risk} key={review.id}>
          <div><strong>{t(`activity.action.${review.action}` as TranslationKey)}</strong><span>{t(`activity.review.${review.status}` as TranslationKey)}</span></div>
          <code>{review.summary}</code>
          {review.risk ? <small>{t('activity.risk')}: {t(`activity.riskLevel.${review.risk}` as TranslationKey)}</small> : null}
          {review.rationale ? <p>{review.rationale}</p> : null}
        </li>
      ))}</ul>
    </details>
  );
}

function Notice({ notice, onDismiss, t }: { notice: AgentNoticeProjection; onDismiss: (noticeId: string) => void; t: Translate }) {
  const fallbackKey = notice.kind === 'error' && notice.status === 'retrying'
    ? 'activity.notice.errorRetrying'
    : `activity.notice.${notice.kind}` as TranslationKey;
  return (
    <article role={notice.level === 'error' ? 'alert' : 'status'} data-level={notice.level} data-kind={notice.kind}>
      <AlertTriangle size={13} aria-hidden="true" />
      <span>{notice.message ?? t(fallbackKey)}</span>
      <button type="button" title={t('activity.dismiss')} onClick={() => onDismiss(notice.id)}><X size={12} aria-hidden="true" /></button>
    </article>
  );
}

function CatalogUpdates({ updates, t }: { updates: AgentCatalogUpdateProjection[]; t: Translate }) {
  return (
    <details className="activity-disclosure activity-catalog">
      <summary><Settings2 size={13} aria-hidden="true" />{t('activity.catalog')}<span>{updates.length}</span></summary>
      <ul>{updates.slice(-20).map((update) => (
        <li key={update.id}><strong>{t(`activity.domain.${update.domain}` as TranslationKey)}</strong><span>{update.label ?? updateStatusLabel(update.status, t)}</span>{update.count !== undefined ? <small>{update.count}</small> : null}{update.message ? <p>{update.message}</p> : null}</li>
      ))}</ul>
    </details>
  );
}

function goalStatusLabel(status: string, t: Translate): string {
  const key = ({
    active: 'activity.goalStatus.active', paused: 'activity.goalStatus.paused', blocked: 'activity.goalStatus.blocked',
    usageLimited: 'activity.goalStatus.usageLimited', budgetLimited: 'activity.goalStatus.budgetLimited', complete: 'activity.goalStatus.complete',
  } as const)[status as 'active'];
  return key ? t(key) : status;
}

function hookStatusLabel(status: string, t: Translate): string {
  const key = ({
    running: 'agent.status.inProgress', completed: 'agent.status.completed', failed: 'agent.status.failed',
    blocked: 'activity.hookStatus.blocked', stopped: 'activity.hookStatus.stopped',
  } as const)[status as 'running'];
  return key ? t(key) : status;
}

function updateStatusLabel(status: string, t: Translate): string {
  const key = ({
    updated: 'activity.updateStatus.updated', ready: 'activity.updateStatus.ready', limited: 'activity.updateStatus.limited', changed: 'activity.updateStatus.changed',
    running: 'agent.status.inProgress', completed: 'agent.status.completed', failed: 'agent.status.failed',
    connected: 'activity.environmentState.connected', disconnected: 'activity.environmentState.disconnected',
  } as const)[status as 'updated'];
  return key ? t(key) : status;
}
