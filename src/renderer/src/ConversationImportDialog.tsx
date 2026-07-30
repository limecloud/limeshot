import { Download, Folder, LoaderCircle, MessageSquare, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { AgentConversationSummary } from '../../shared/desktop';
import type { TranslationKey } from './i18n';

interface ConversationImportDialogProps {
  candidates: AgentConversationSummary[];
  loadState: 'loading' | 'ready' | 'failed';
  errorMessage?: string;
  importingThreadId?: string;
  locale: string;
  onClose: () => void;
  onImport: (conversation: AgentConversationSummary) => void;
  onRetry: () => void;
  t: (key: TranslationKey) => string;
}

export function ConversationImportDialog({ candidates, loadState, errorMessage, importingThreadId, locale, onClose, onImport, onRetry, t }: ConversationImportDialogProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((candidate) => `${candidate.title} ${candidate.workspaceLabel ?? ''}`.toLocaleLowerCase().includes(normalized));
  }, [candidates, query]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importingThreadId) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [importingThreadId, onClose]);

  return (
    <div className="conversation-import-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !importingThreadId) onClose();
    }}>
      <section className="conversation-import-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-import-title">
        <header>
          <div>
            <strong id="conversation-import-title">{t('conversationImport.title')}</strong>
            <span>{t('conversationImport.subtitle')}</span>
          </div>
          <button type="button" disabled={Boolean(importingThreadId)} onClick={onClose} title={t('conversationImport.close')}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <label className="conversation-import-search">
          <Search size={14} aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('conversationImport.search')} />
        </label>

        <div className="conversation-import-list">
          {loadState === 'loading' ? <p className="conversation-import-state" role="status"><LoaderCircle className="spin" size={15} aria-hidden="true" />{t('conversationImport.loading')}</p> : null}
          {loadState === 'failed' ? (
            <div className="conversation-import-state" role="alert">
              <span>{errorMessage || t('conversationImport.failed')}</span>
              <button type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />{t('conversationImport.retry')}</button>
            </div>
          ) : null}
          {loadState === 'ready' && filtered.length === 0 ? <p className="conversation-import-state">{query ? t('conversationImport.noResults') : t('conversationImport.empty')}</p> : null}
          {loadState === 'ready' ? filtered.map((candidate) => {
            const importing = importingThreadId === candidate.threadId;
            return (
              <button className="conversation-import-item" type="button" data-thread-id={candidate.threadId} disabled={Boolean(importingThreadId)} onClick={() => onImport(candidate)} key={candidate.threadId}>
                <MessageSquare size={15} aria-hidden="true" />
                <span className="conversation-import-copy">
                  <strong>{candidate.title || t('agent.newConversation')}</strong>
                  <small>
                    <span>{t(clientKey(candidate.client))}</span>
                    {candidate.workspaceLabel ? <span><Folder size={11} aria-hidden="true" />{candidate.workspaceLabel}</span> : null}
                    <time dateTime={new Date(candidate.updatedAtEpochMs).toISOString()}>{dateFormatter.format(candidate.updatedAtEpochMs)}</time>
                  </small>
                </span>
                <span className="conversation-import-command">
                  {importing ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                  {importing ? t('conversationImport.importing') : t('conversationImport.action')}
                </span>
              </button>
            );
          }) : null}
        </div>
      </section>
    </div>
  );
}

function clientKey(client: AgentConversationSummary['client']): TranslationKey {
  if (client === 'cli') return 'conversationImport.client.cli';
  if (client === 'vscode') return 'conversationImport.client.vscode';
  if (client === 'appServer') return 'conversationImport.client.appServer';
  return 'conversationImport.client.unknown';
}
