import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleEllipsis,
  CircleX,
  Code2,
  FileCode2,
  GitCompareArrows,
  Image,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Network,
  Search,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';

import type {
  AgentInputProjection,
  AgentItemProjection,
  AgentItemStatus,
  AgentJsonValue,
  AgentToolContentProjection,
  AgentTurnProjection,
} from '../../shared/desktop';
import type { TranslationKey } from './i18n';

type Translate = (key: TranslationKey) => string;
type ConversationLoadState = 'idle' | 'loading' | 'ready' | 'readOnly' | 'unavailable';

interface ConversationTimelineProps {
  turns: AgentTurnProjection[];
  loadState: ConversationLoadState;
  errorMessage?: string;
  t: Translate;
  threadContext?: { title: string; subtitle?: string };
  onBackThread?: () => void;
  onOpenThread?: (threadId: string) => void;
  openingThreadId?: string;
}

export function ConversationTimeline({ turns, loadState, errorMessage, t, threadContext, onBackThread, onOpenThread, openingThreadId }: ConversationTimelineProps) {
  const itemCount = turns.reduce((count, turn) => count + turn.items.length, 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);

  useEffect(() => {
    if (followTail.current) tailRef.current?.scrollIntoView?.({ block: 'end' });
  }, [turns, loadState, errorMessage]);

  return (
    <div
      className="conversation-scroll"
      ref={scrollRef}
      onScroll={() => {
        const node = scrollRef.current;
        if (node) followTail.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      }}
    >
      {threadContext ? (
        <header className="agent-thread-context">
          <button type="button" onClick={onBackThread} title={t('agent.backToParent')} aria-label={t('agent.backToParent')}><ArrowLeft size={14} aria-hidden="true" /></button>
          <div><strong>{threadContext.title}</strong>{threadContext.subtitle ? <span>{threadContext.subtitle}</span> : null}</div>
          <small>{t('agent.subThreadReadOnly')}</small>
        </header>
      ) : null}
      <div className="agent-timeline" role="log" aria-live="polite" aria-relevant="additions text" aria-atomic="false">
        {loadState === 'loading' ? <div className="agent-loading-state" role="status" aria-label={t('agent.connecting')}><LoaderCircle className="spin" size={15} aria-hidden="true" /></div> : null}
        {itemCount === 0 && loadState !== 'loading' ? <p className="agent-empty">{t('agent.empty')}</p> : null}
        {turns.map((turn) => <ConversationTurn turn={turn} t={t} onOpenThread={onOpenThread} openingThreadId={openingThreadId} key={turn.id} />)}
        {errorMessage ? <p className="agent-error" role="alert">{errorMessage}</p> : null}
        <div className="agent-timeline-tail" ref={tailRef} aria-hidden="true" />
      </div>
    </div>
  );
}

function ConversationTurn({ turn, t, onOpenThread, openingThreadId }: { turn: AgentTurnProjection; t: Translate; onOpenThread?: (threadId: string) => void; openingThreadId?: string }) {
  const hasAssistantOutput = turn.items.some((item) => item.type === 'agentMessage' && item.text.length > 0);
  return (
    <section className="agent-turn" data-status={turn.status} data-turn-id={turn.id}>
      {turn.items.map((item) => <AgentItemRenderer item={item} t={t} onOpenThread={onOpenThread} openingThreadId={openingThreadId} key={item.id} />)}
      {turn.plan ? (
        <section className="agent-turn-panel" data-panel="plan">
          <header><ListChecks size={14} aria-hidden="true" /><strong>{t('agent.turnPlan')}</strong></header>
          {turn.plan.explanation ? <p>{turn.plan.explanation}</p> : null}
          <ol>{turn.plan.steps.map((step, index) => <li data-status={step.status} key={`${index}-${step.step}`}><StatusIcon status={step.status === 'pending' ? undefined : step.status === 'inProgress' ? 'inProgress' : 'completed'} /><span>{step.step}</span></li>)}</ol>
        </section>
      ) : null}
      {turn.diff ? (
        <details className="agent-turn-panel" data-panel="diff">
          <summary><GitCompareArrows size={14} aria-hidden="true" /><strong>{t('agent.turnDiff')}</strong><ChevronRight size={13} aria-hidden="true" /></summary>
          <pre>{preview(turn.diff, 24_000)}</pre>
        </details>
      ) : null}
      {turn.status === 'inProgress' && !hasAssistantOutput ? (
        <div className="agent-response-pending" role="status"><LoaderCircle className="spin" size={13} aria-hidden="true" />{t('agent.status.inProgress')}</div>
      ) : null}
      {turn.usage ? (
        <div className="agent-turn-usage" title={t('agent.tokenUsage')}>
          <span>{t('agent.tokenUsage')}</span><strong>{turn.usage.totalTokens.toLocaleString()}</strong>
        </div>
      ) : null}
      {turn.status === 'failed' ? <p className="agent-error" role="alert">{t('agent.sendFailed')}</p> : null}
    </section>
  );
}

export function AgentItemRenderer({ item, t, onOpenThread, openingThreadId }: { item: AgentItemProjection; t: Translate; onOpenThread?: (threadId: string) => void; openingThreadId?: string }) {
  switch (item.type) {
    case 'userMessage':
      return (
        <article className="agent-item agent-user-message" data-kind="user" data-item-type={item.type}>
          <div className="agent-user-content">
            {item.content.map((input, index) => <InputContent input={input} t={t} key={`${input.type}-${index}`} />)}
          </div>
        </article>
      );
    case 'hookPrompt':
      if (!item.text.trim()) return null;
      return (
        <article className="agent-item agent-user-message agent-hook-feedback" data-kind="user" data-item-id={item.id} data-item-type={item.type}>
          <div className="agent-user-stack">
            <div className="agent-user-content">{item.text ? <p>{item.text}</p> : null}</div>
            <div className="agent-user-status"><Code2 size={11} aria-hidden="true" /><span>{t('agent.hookFeedback')}</span></div>
          </div>
        </article>
      );
    case 'agentMessage':
      return (
        <article className="agent-item agent-assistant-message" data-kind="assistant" data-item-type={item.type}>
          {item.text ? <p>{item.text}</p> : item.status === 'inProgress' ? <LoaderCircle className="spin" size={14} aria-label={t('agent.status.inProgress')} /> : null}
          {item.memoryCitation ? (
            <details className="agent-citations">
              <summary>{t('agent.citations')} · {item.memoryCitation.entries.length + item.memoryCitation.threadIds.length}</summary>
              {item.memoryCitation.entries.map((entry, index) => <p key={`${entry.path}-${index}`}><code>{entry.path}:{entry.lineStart}-{entry.lineEnd}</code>{entry.note ? ` ${entry.note}` : ''}</p>)}
              {item.memoryCitation.threadIds.map((threadId) => <p key={threadId}>{t('agent.citationThread')}</p>)}
            </details>
          ) : null}
        </article>
      );
    case 'plan':
      return (
        <article className="agent-item agent-plan-item" data-kind="plan" data-item-type={item.type}>
          <ItemHeader label={t('agent.item.plan')} status={item.status} icon={<ListChecks size={14} aria-hidden="true" />} t={t} />
          <p>{item.text}</p>
        </article>
      );
    case 'reasoning':
      return (
        <ItemDetails item={item} label={t('agent.item.reasoning')} summary={item.summary[0]} icon={<Sparkles size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          <div className="agent-reasoning-parts">{item.summary.map((part, index) => <p key={index}>{part}</p>)}</div>
        </ItemDetails>
      );
    case 'commandExecution':
      return (
        <ItemDetails item={item} label={commandLabel(item, t)} summary={commandSummary(item)} icon={<Code2 size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          {item.actions.length > 0 ? <ul className="agent-action-list">{item.actions.map((action, index) => <li key={`${action.type}-${index}`}><span>{action.name ?? action.path ?? action.query ?? action.type}</span></li>)}</ul> : null}
          {item.command ? <pre className="agent-command">{preview(item.command, 8_000)}</pre> : null}
          <MetaLine values={[item.cwd && `${t('agent.cwd')}: ${item.cwd}`, item.exitCode !== undefined && `${t('agent.exitCode')}: ${item.exitCode}`, duration(item.durationMs, t)]} />
          {item.output ? <OutputBlock label={t('agent.output')} value={item.output} /> : null}
          {item.terminalInteractions.length > 0 ? <p className="agent-muted">{t('agent.terminalInputSent')}{item.terminalInteractions.length > 1 ? ` (${item.terminalInteractions.length})` : ''}</p> : null}
        </ItemDetails>
      );
    case 'fileChange':
      return (
        <ItemDetails item={item} label={t('agent.item.fileChange')} summary={fileChangeSummary(item)} icon={<FileCode2 size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          <div className="agent-file-changes">{item.changes.map((change, index) => (
            <FileChangeDetails change={change} initiallyOpen={item.changes.length === 1} t={t} key={`${change.path}-${index}`} />
          ))}</div>
        </ItemDetails>
      );
    case 'mcpToolCall':
      return (
        <ItemDetails item={item} label={`${t('agent.item.mcpToolCall')} · ${item.server}/${item.tool}`} summary={item.status === 'inProgress' ? singleLinePreview(item.progress.at(-1)) : undefined} displayStatus={item.error ? 'failed' : undefined} icon={<Network size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          <JsonBlock label={t('agent.arguments')} value={item.arguments} />
          {item.progress.length > 0 ? <ol className="agent-progress-list">{item.progress.slice(-8).map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ol> : null}
          <ToolContent content={item.content} t={t} />
          {item.structuredContent !== undefined ? <JsonBlock label={t('agent.structuredContent')} value={item.structuredContent} /> : null}
          {item.error ? <p className="agent-error" role="alert">{item.error}</p> : null}
          <MetaLine values={[item.pluginId, item.resourceUri, duration(item.durationMs, t)]} />
        </ItemDetails>
      );
    case 'dynamicToolCall':
      return (
        <ItemDetails item={item} label={`${t('agent.item.dynamicToolCall')} · ${item.namespace ? `${item.namespace}/` : ''}${item.tool}`} summary={item.success === false ? t('agent.toolFailed') : singleLinePreview(item.text)} displayStatus={item.success === false ? 'failed' : undefined} icon={<Wrench size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          <JsonBlock label={t('agent.arguments')} value={item.arguments} />
          <ToolContent content={item.content} t={t} />
          {item.success === false ? <p className="agent-error" role="alert">{t('agent.toolFailed')}</p> : null}
          <MetaLine values={[duration(item.durationMs, t)]} />
        </ItemDetails>
      );
    case 'collabAgentToolCall': {
      if (item.tool === 'wait') return null;
      const agents = collabAgentRows(item);
      return (
        <ItemDetails item={item} label={collabActionLabel(item, t)} summary={collabCount(item, t)} icon={<Users size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          {item.prompt ? <p className="agent-multi-agent-prompt"><strong>{t('agent.multiAgent.input')}</strong>{item.prompt}</p> : null}
          <MetaLine values={[item.model, item.reasoningEffort]} />
          <ul className="agent-agent-list">{agents.map((agent) => <li key={agent.threadId}>{onOpenThread ? (
            <button type="button" onClick={() => onOpenThread(agent.threadId)} disabled={openingThreadId === agent.threadId} aria-label={`${t('agent.openSubThread')}: ${agent.message || t('agent.subThread')}`}>
              {openingThreadId === agent.threadId ? <LoaderCircle className="spin" size={11} aria-hidden="true" /> : <StatusIcon status={agentStatus(agent.status)} />}
              <span><strong>{agent.threadId}</strong><small>{collabAgentState(agent.status, t)}{agent.message ? `: ${agent.message}` : ''}</small></span><ChevronRight size={12} aria-hidden="true" />
            </button>
          ) : <><StatusIcon status={agentStatus(agent.status)} /><span><strong>{agent.threadId}</strong><small>{collabAgentState(agent.status, t)}{agent.message ? `: ${agent.message}` : ''}</small></span></>}</li>)}</ul>
        </ItemDetails>
      );
    }
    case 'subAgentActivity':
      return <SystemLine item={item} label={subAgentSummary(item, t)} icon={<Users size={13} aria-hidden="true" />} onActivate={onOpenThread ? () => onOpenThread(item.agentThreadId) : undefined} actionLabel={`${t('agent.openSubThread')}: ${item.agentPath}`} busy={openingThreadId === item.agentThreadId} />;
    case 'webSearch':
      return (
        <ItemDetails item={item} label={searchLabel(item.action?.type, t)} summary={webSearchSummary(item)} icon={<Search size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          {item.action?.url ? <code className="agent-url">{item.action.url}</code> : null}
          {item.action?.pattern ? <p className="agent-muted">{item.action.pattern}</p> : null}
          <WebSearchResults results={item.results} t={t} />
        </ItemDetails>
      );
    case 'imageView':
      return <SystemLine item={item} label={t('agent.item.imageView')} icon={<Image size={13} aria-hidden="true" />} detail={item.path} />;
    case 'sleep':
      return null;
    case 'imageGeneration': {
      const url = safeMediaUrl(item.result, 'image');
      return (
        <ItemDetails item={item} label={t('agent.item.imageGeneration')} summary={singleLinePreview(item.savedPath ?? item.revisedPrompt)} icon={<Image size={13} aria-hidden="true" />} t={t} open={item.status === 'inProgress'}>
          {url ? <img className="agent-media-preview" src={url} alt={item.revisedPrompt || t('agent.item.imageGeneration')} loading="lazy" /> : item.result ? <p className="agent-tool-text">{preview(item.result, 4_000)}</p> : item.status === 'inProgress' ? <div className="agent-media-loading" role="status"><LoaderCircle className="spin" size={14} aria-hidden="true" /><span>{t('agent.status.inProgress')}</span></div> : null}
          {item.revisedPrompt ? <p className="agent-muted agent-tool-text">{preview(item.revisedPrompt, 4_000)}</p> : null}
          {item.savedPath ? <code>{item.savedPath}</code> : null}
        </ItemDetails>
      );
    }
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return null;
    case 'contextCompaction':
      return <SystemLine item={item} label={contextCompactionLabel(item, t)} icon={<CircleEllipsis size={13} aria-hidden="true" />} busy={item.status === 'inProgress'} />;
    case 'unknown':
      return null;
  }
}

function InputContent({ input, t }: { input: AgentInputProjection; t: Translate }) {
  if (input.type === 'text') return <p>{input.text}</p>;
  if (input.type === 'image') {
    const url = input.url ? safeMediaUrl(input.url, 'image') : undefined;
    return <figure>{url ? <img src={url} alt={input.label || t('agent.attachment')} loading="lazy" /> : <Image size={18} aria-hidden="true" />}<figcaption>{input.label}</figcaption></figure>;
  }
  if (input.type === 'audio') {
    const url = input.url ? safeMediaUrl(input.url, 'audio') : undefined;
    return <div className="agent-input-media">{url ? <audio src={url} controls preload="metadata" aria-label={input.label} /> : <MessageSquareText size={16} aria-hidden="true" />}<span>{input.label}</span></div>;
  }
  return <span className="agent-input-token" data-input-type={input.type}>{input.type === 'skill' ? <Sparkles size={12} aria-hidden="true" /> : <FileCode2 size={12} aria-hidden="true" />}{input.label}</span>;
}

function ItemDetails({ item, label, summary, displayStatus, icon, t, open, children }: { item: AgentItemProjection; label: string; summary?: string; displayStatus?: AgentItemStatus; icon: ReactNode; t: Translate; open?: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(Boolean(open));
  useEffect(() => {
    if (item.status && item.status !== 'inProgress') setExpanded(false);
  }, [item.status]);
  return (
    <details className="agent-item agent-activity-item" data-kind={item.kind} data-item-id={item.id} data-item-type={item.type} data-status={displayStatus ?? item.status} open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary><ItemHeader label={label} summary={summary} status={displayStatus ?? item.status} icon={icon} t={t} /><ChevronRight className="agent-disclosure" size={13} aria-hidden="true" /></summary>
      <div className="agent-item-detail">{children}</div>
    </details>
  );
}

function FileChangeDetails({ change, initiallyOpen, t }: { change: Extract<AgentItemProjection, { type: 'fileChange' }>['changes'][number]; initiallyOpen: boolean; t: Translate }) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  return (
    <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary><span data-change-kind={fileChangeKind(change.kind)}>{change.kind}</span><code>{change.path}</code><ChevronRight size={12} aria-hidden="true" /></summary>
      {change.diff ? <pre>{preview(change.diff, 24_000)}</pre> : <p className="agent-muted">{t('agent.noContent')}</p>}
    </details>
  );
}

function ItemHeader({ label, summary, status, icon, t }: { label: string; summary?: string; status?: AgentItemStatus; icon: ReactNode; t: Translate }) {
  const showStatus = status === 'failed' || status === 'declined' || status === 'interrupted';
  return <div className="agent-item-label">{status === 'inProgress' ? <LoaderCircle className="spin" size={13} aria-hidden="true" /> : icon}<span className="agent-item-title">{label}</span>{summary ? <span className="agent-item-summary">{summary}</span> : null}{showStatus ? <em><StatusIcon status={status} />{statusLabel(status, t)}</em> : null}</div>;
}

function SystemLine({ item, label, icon, detail, onActivate, actionLabel, busy }: { item: AgentItemProjection; label: string; icon: ReactNode; detail?: string; onActivate?: () => void; actionLabel?: string; busy?: boolean }) {
  const content = <>{busy ? <LoaderCircle className="spin" size={13} aria-hidden="true" /> : icon}<strong>{label}</strong>{detail ? <span>{detail}</span> : null}{onActivate ? <ChevronRight size={12} aria-hidden="true" /> : null}</>;
  return onActivate
    ? <button className="agent-system-line agent-thread-link" type="button" data-item-id={item.id} data-item-type={item.type} data-status={item.status} onClick={onActivate} disabled={busy} aria-label={actionLabel}>{content}</button>
    : <article className="agent-system-line" data-item-id={item.id} data-item-type={item.type} data-status={item.status}>{content}</article>;
}

function ToolContent({ content, t }: { content: AgentToolContentProjection[]; t: Translate }) {
  if (content.length === 0) return null;
  return <div className="agent-tool-content">{content.map((part, index) => {
    if (part.type === 'text') return <p className="agent-tool-text" key={index}>{preview(part.text, 8_000)}</p>;
    if (part.type === 'image') {
      const url = safeMediaUrl(part.url, 'image');
      return url ? <img className="agent-media-preview" src={url} alt={t('agent.toolResult')} loading="lazy" key={index} /> : <code key={index}>{t('agent.unsupportedMedia')}</code>;
    }
    if (part.type === 'audio') {
      const url = safeMediaUrl(part.url, 'audio');
      return url ? <audio src={url} controls preload="metadata" aria-label={t('agent.toolResult')} key={index} /> : <code key={index}>{t('agent.unsupportedMedia')}</code>;
    }
    if (part.type === 'resource' || part.type === 'resourceLink') return <div className="agent-resource" key={index}>{part.type === 'resourceLink' && part.name ? <strong>{part.name}</strong> : null}<code>{part.uri}</code>{part.type === 'resource' && part.text ? <p className="agent-tool-text">{preview(part.text, 8_000)}</p> : null}</div>;
    return <JsonBlock label={t('agent.toolResult')} value={part.value} key={index} />;
  })}</div>;
}

function WebSearchResults({ results, t }: { results: Extract<AgentItemProjection, { type: 'webSearch' }>['results']; t: Translate }) {
  const [expanded, setExpanded] = useState(false);
  const visibleResults = expanded ? results : results.slice(0, 3);
  if (results.length === 0) return null;
  return (
    <div className="agent-search-result-set">
      <ol className="agent-search-results">{visibleResults.map((result, index) => <li key={`${result.url ?? result.title}-${index}`}><strong>{result.title || result.source || t('agent.result')}</strong>{result.snippet ? <p>{result.snippet}</p> : null}{result.url ? <code>{result.url}</code> : null}{result.details !== undefined ? <JsonBlock label={t('agent.result')} value={result.details} /> : null}</li>)}</ol>
      {results.length > 3 ? <button className="agent-search-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? t('agent.showLess') : `${t('agent.showMore')} · ${results.length - 3}`}</button> : null}
    </div>
  );
}

function OutputBlock({ label, value }: { label: string; value: string }) {
  return <section className="agent-output"><strong>{label}</strong><pre>{preview(value, 16_000)}</pre></section>;
}

function JsonBlock({ label, value }: { label: string; value: AgentJsonValue }) {
  return <details className="agent-json"><summary>{label}</summary><pre>{preview(JSON.stringify(redactJson(value), null, 2), 16_000)}</pre></details>;
}

function MetaLine({ values }: { values: Array<string | false | undefined> }) {
  const visible = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  return visible.length > 0 ? <p className="agent-meta">{visible.join(' · ')}</p> : null;
}

function StatusIcon({ status }: { status?: AgentItemStatus }) {
  if (status === 'inProgress') return <LoaderCircle className="spin" size={11} aria-hidden="true" />;
  if (status === 'completed') return <CheckCircle2 size={11} aria-hidden="true" />;
  if (status === 'declined') return <Ban size={11} aria-hidden="true" />;
  if (status === 'failed') return <CircleX size={11} aria-hidden="true" />;
  return <CircleEllipsis size={11} aria-hidden="true" />;
}

function statusLabel(status: AgentItemStatus, t: Translate): string {
  return t(`agent.status.${status}` as TranslationKey);
}

function commandLabel(item: Extract<AgentItemProjection, { type: 'commandExecution' }>, t: Translate): string {
  if (item.actions.some((action) => action.type === 'search')) return t('agent.item.search');
  if (item.actions.some((action) => action.type === 'read')) return t('agent.item.read');
  if (item.actions.some((action) => action.type === 'listFiles')) return t('agent.item.listFiles');
  return t('agent.item.commandExecution');
}

function commandSummary(item: Extract<AgentItemProjection, { type: 'commandExecution' }>): string | undefined {
  const action = item.actions[0];
  if (!action) return singleLinePreview(item.command);
  const value = action.type === 'search'
    ? [action.query, action.path].filter(Boolean).join(' · ')
    : action.name ?? action.path ?? action.query ?? action.command;
  return appendAdditionalCount(singleLinePreview(value), item.actions.length - 1);
}

function fileChangeSummary(item: Extract<AgentItemProjection, { type: 'fileChange' }>): string | undefined {
  return appendAdditionalCount(singleLinePreview(item.changes[0]?.path), item.changes.length - 1);
}

function webSearchSummary(item: Extract<AgentItemProjection, { type: 'webSearch' }>): string | undefined {
  if (item.action?.type === 'openPage') return singleLinePreview(item.action.url ?? item.query);
  if (item.action?.type === 'findInPage') return singleLinePreview([item.action.pattern, item.action.url].filter(Boolean).join(' · '));
  const queries = item.action?.queries ?? [];
  return appendAdditionalCount(singleLinePreview(item.action?.query ?? queries[0] ?? item.query), Math.max(queries.length - 1, 0));
}

function searchLabel(action: Extract<AgentItemProjection, { type: 'webSearch' }>['action'] extends infer Action ? Action extends { type: infer Type } ? Type : undefined : undefined, t: Translate): string {
  if (action === 'openPage') return t('agent.item.openPage');
  if (action === 'findInPage') return t('agent.item.findInPage');
  return t('agent.item.webSearch');
}

function collabActionLabel(item: Extract<AgentItemProjection, { type: 'collabAgentToolCall' }>, t: Translate): string {
  if (item.tool === 'unknown' || item.tool === 'wait') return t('agent.item.collabAgentToolCall');
  const status = item.status === 'inProgress' ? 'inProgress' : item.status === 'failed' ? 'failed' : 'completed';
  return t(`agent.collab.${item.tool}.${status}` as TranslationKey);
}

function collabCount(item: Extract<AgentItemProjection, { type: 'collabAgentToolCall' }>, t: Translate): string | undefined {
  const count = new Set([...item.receiverThreadIds, ...item.agents.map((agent) => agent.threadId)]).size;
  if (count === 0) return undefined;
  return count === 1 ? t('agent.multiAgent.oneAgent') : `${count} ${t('agent.multiAgent.agents')}`;
}

function collabAgentRows(item: Extract<AgentItemProjection, { type: 'collabAgentToolCall' }>): Extract<AgentItemProjection, { type: 'collabAgentToolCall' }>['agents'] {
  const agents = new Map(item.agents.map((agent) => [agent.threadId, agent]));
  for (const threadId of item.receiverThreadIds) {
    if (!agents.has(threadId)) agents.set(threadId, { threadId, status: 'unknown' });
  }
  return [...agents.values()];
}

function collabAgentState(status: Extract<AgentItemProjection, { type: 'collabAgentToolCall' }>['agents'][number]['status'], t: Translate): string {
  return t(`agent.collabState.${status}` as TranslationKey);
}

function subAgentSummary(item: Extract<AgentItemProjection, { type: 'subAgentActivity' }>, t: Translate): string {
  const status = item.activity === 'started'
    ? t('agent.subAgent.started')
    : item.activity === 'interacted'
      ? t('agent.subAgent.updated')
      : item.activity === 'interrupted'
        ? t('agent.subAgent.interrupted')
        : t('agent.item.subAgentActivity');
  return `${item.agentPath || t('agent.subThread')} ${status}`;
}

function contextCompactionLabel(item: Extract<AgentItemProjection, { type: 'contextCompaction' }>, t: Translate): string {
  const status = item.status === 'inProgress' ? 'inProgress' : 'completed';
  return t(`agent.contextCompaction.${item.source}.${status}` as TranslationKey);
}

function agentStatus(status: Extract<AgentItemProjection, { type: 'collabAgentToolCall' }>['agents'][number]['status']): AgentItemStatus | undefined {
  if (status === 'running' || status === 'pendingInit') return 'inProgress';
  if (status === 'completed' || status === 'shutdown') return 'completed';
  if (status === 'errored' || status === 'notFound') return 'failed';
  if (status === 'interrupted') return 'interrupted';
  return undefined;
}

function duration(value: number | undefined, t: Translate): string | undefined {
  if (value === undefined) return undefined;
  return `${t('agent.duration')}: ${value < 1_000 ? `${Math.round(value)}ms` : `${Math.round(value / 100) / 10}s`}`;
}

function appendAdditionalCount(value: string | undefined, additionalCount: number): string | undefined {
  if (!value) return undefined;
  return additionalCount > 0 ? `${value} · +${additionalCount}` : value;
}

function singleLinePreview(value: string | undefined, limit = 120): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function fileChangeKind(kind: string): 'added' | 'updated' | 'deleted' | 'moved' {
  const normalized = kind.toLowerCase();
  if (normalized.includes('add') || normalized.includes('create')) return 'added';
  if (normalized.includes('delete') || normalized.includes('remove')) return 'deleted';
  if (normalized.includes('move') || normalized.includes('rename')) return 'moved';
  return 'updated';
}

function redactJson(value: AgentJsonValue): AgentJsonValue {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, isSensitiveJsonKey(key) ? '[REDACTED]' : redactJson(entry)]));
}

function isSensitiveJsonKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'token'
    || normalized.endsWith('token')
    || normalized.includes('password')
    || normalized.includes('passwd')
    || normalized.includes('authorization')
    || normalized.includes('secret')
    || normalized.includes('apikey')
    || normalized.includes('cookie')
    || normalized.includes('credential')
    || normalized.includes('privatekey');
}

function safeMediaUrl(value: string, kind: 'image' | 'audio'): string | undefined {
  const prefix = kind === 'image' ? 'data:image/' : 'data:audio/';
  return value.startsWith('https://') || value.startsWith(prefix) ? value : undefined;
}

function preview(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.floor(limit / 2))}\n…\n${value.slice(-Math.floor(limit / 2))}`;
}
