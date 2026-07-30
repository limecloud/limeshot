import { ChevronRight, Settings2 } from 'lucide-react';

import type { BusinessStatusResult } from '@business/generated';
import type { AgentPendingInteractionProjection, AgentTurnProjection } from '../../shared/desktop';
import type { TranslationKey } from './i18n';

export function titleFromTurns(turns: AgentTurnProjection[], fallback: string): string {
  const firstUserMessage = turns.flatMap((turn) => turn.items).find((item) => item.kind === 'user')?.text.trim();
  if (!firstUserMessage) return fallback;
  return firstUserMessage.length > 28 ? `${firstUserMessage.slice(0, 28)}...` : firstUserMessage;
}

export function sidebarStartsCollapsed(): boolean {
  return window.matchMedia?.('(max-width: 680px)').matches ?? false;
}

export function upsertInteraction(current: AgentPendingInteractionProjection[], next: AgentPendingInteractionProjection): AgentPendingInteractionProjection[] {
  const updated = current.some((interaction) => interaction.interactionId === next.interactionId)
    ? current.map((interaction) => interaction.interactionId === next.interactionId ? next : interaction)
    : [...current, next];
  return updated.sort((left, right) => left.createdAt - right.createdAt).slice(-50);
}

export function recoverInteractions(current: AgentPendingInteractionProjection[], recovered: AgentPendingInteractionProjection[]): AgentPendingInteractionProjection[] {
  return recovered.reduce((result, interaction) => {
    const existing = result.find((entry) => entry.interactionId === interaction.interactionId);
    return existing && existing.status !== 'pending' ? result : upsertInteraction(result, interaction);
  }, current);
}

export function setInteractionStatus(
  current: AgentPendingInteractionProjection[],
  interactionId: string,
  status: AgentPendingInteractionProjection['status'],
  onlyFrom?: AgentPendingInteractionProjection['status'],
): AgentPendingInteractionProjection[] {
  return current.map((interaction) => interaction.interactionId === interactionId && (!onlyFrom || interaction.status === onlyFrom)
    ? { ...interaction, status } as AgentPendingInteractionProjection
    : interaction);
}

interface RuntimeStatusProps {
  loadState: 'loading' | 'ready' | 'unavailable';
  runtime?: BusinessStatusResult;
  errorMessage?: string;
  onRetry: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function RuntimeStatus({ loadState, runtime, errorMessage, onRetry, t }: RuntimeStatusProps) {
  const label = loadState === 'ready'
    ? t('runtime.ready')
    : loadState === 'loading'
      ? t('runtime.connecting')
      : t('runtime.unavailable');

  return (
    <div
      className="runtime-status"
      data-testid="runtime-status"
      data-state={loadState}
      data-runtime-source="business-service"
      title={errorMessage ?? (runtime ? `${label} · ${t('runtime.pid')} ${runtime.serverPid} · ${t('runtime.protocol')} ${runtime.protocolVersion}` : label)}
      aria-label={label}
      aria-live="polite"
    >
      <Settings2 className="runtime-settings-icon" size={14} aria-hidden="true" />
      <span className="runtime-label">{t('app.name')}</span>
      <span className="runtime-dot" aria-hidden="true" />
      {loadState === 'unavailable' ? (
        <button type="button" className="runtime-retry" onClick={() => void onRetry()} title={t('runtime.retry')}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
