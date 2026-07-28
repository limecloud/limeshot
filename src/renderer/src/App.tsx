import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronRight,
  Folder,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Sparkles,
  Square,
  Wrench,
  X,
} from 'lucide-react';

import type {
  BriefInput,
  BusinessProfile,
  BusinessStatusResult,
  ProjectSummary,
  ProjectCreateResult,
  ProjectReadResult,
  ProductionPlan,
} from '@business/generated';
import type {
  AgentItemProjection,
  AgentTurnProjection,
  ConversationStartResult,
} from '../../shared/desktop';
import { AppSidebar } from './AppSidebar';
import { applyAgentEvent, runningTurn } from './agentState';
import { ExecutionPanel } from './ExecutionPanel';
import { createTranslator, isTranslationKey, resolveLocale, type TranslationKey } from './i18n';
import { PlanPanel } from './PlanPanel';
import { WorkspaceHome } from './WorkspaceHome';

type LoadState = 'loading' | 'ready' | 'unavailable';
type ConversationLoadState = 'idle' | 'loading' | 'ready' | 'readOnly' | 'unavailable';
const MAIN_CONVERSATION_ID = 'main';

export function App() {
  const locale = useMemo(() => resolveLocale(navigator.language), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [runtime, setRuntime] = useState<BusinessStatusResult>();
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [mediaProbeReady, setMediaProbeReady] = useState(false);
  const [mediaTranscodeReady, setMediaTranscodeReady] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectDetail, setProjectDetail] = useState<ProjectReadResult>();
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [projectLoadError, setProjectLoadError] = useState<string>();
  const [selectedProfileId, setSelectedProfileId] = useState<string>('general');
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [conversationId, setConversationId] = useState(MAIN_CONVERSATION_ID);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectInspectorOpen, setProjectInspectorOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [conversation, setConversation] = useState<ConversationStartResult>();
  const [conversationLoadState, setConversationLoadState] = useState<ConversationLoadState>('idle');
  const [agentError, setAgentError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const pendingFirstTurn = useRef<{ projectId: string; text: string } | undefined>(undefined);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(undefined);
    try {
      const [foundationResult, projectResult] = await Promise.all([
        window.limeShot.foundation.read(),
        window.limeShot.project.list(),
      ]);
      setRuntime(foundationResult.business);
      setProfiles(foundationResult.profiles);
      setMediaProbeReady(foundationResult.services.some((service) => service.serviceId === 'media.probe' && service.state === 'ready'));
      setMediaTranscodeReady(foundationResult.services.some((service) => service.serviceId === 'media.assemble' && service.state === 'ready'));
      setProjects(projectResult);
      setSelectedProfileId((current) => foundationResult.profiles.some((profile) => profile.profileId === current)
        ? current
        : foundationResult.profiles[0]?.profileId ?? 'general');
      setLoadState('ready');
    } catch (error) {
      setLoadState('unavailable');
      setErrorMessage(error instanceof Error ? error.message : t('runtime.unavailable'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetail(undefined);
      setPlans([]);
      setProjectLoadError(undefined);
      return undefined;
    }
    let disposed = false;
    void Promise.all([
      window.limeShot.project.read(selectedProjectId),
      window.limeShot.plan.list(selectedProjectId),
    ])
      .then(([result, planResult]) => {
        if (!disposed) {
          setProjectDetail(result);
          setPlans(planResult.plans);
          setProjectLoadError(undefined);
        }
      })
      .catch((error) => {
        if (!disposed) setProjectLoadError(error instanceof Error ? error.message : t('project.readFailed'));
      });
    return () => {
      disposed = true;
    };
  }, [selectedProjectId, t]);

  useEffect(() => {
    setConversation(undefined);
    setAgentError(undefined);
    if (!selectedProjectId) {
      setConversationLoadState('idle');
      return undefined;
    }
    let disposed = false;
    setConversationLoadState('loading');
    void window.limeShot.agent.startConversation({ projectId: selectedProjectId, conversationId })
      .then((result) => {
        if (disposed) return;
        setConversation(result);
        setConversationLoadState(result.access === 'active' ? 'ready' : 'readOnly');
        const pending = pendingFirstTurn.current;
        if (pending?.projectId === selectedProjectId && result.access === 'active') {
          pendingFirstTurn.current = undefined;
          setSending(true);
          void window.limeShot.agent.startTurn({
            projectId: selectedProjectId,
            conversationId: result.conversationId,
            text: pending.text,
          }).then(() => setComposerText('')).catch((error) => {
            console.error('Failed to send initial Codex turn', error);
            setAgentError(t('agent.sendFailed'));
          }).finally(() => setSending(false));
        }
      })
      .catch((error) => {
        if (disposed) return;
        console.error('Failed to start Codex conversation', error);
        setConversationLoadState('unavailable');
        setAgentError(t('agent.unavailable'));
      });
    return () => { disposed = true; };
  }, [conversationId, selectedProjectId, t]);

  useEffect(() => window.limeShot.agent.subscribe((event) => {
    if (event.type === 'agent.error') {
      console.error('Codex agent error', event.message);
      setAgentError(t('agent.sendFailed'));
      return;
    }
    setConversation((current) => current
      ? { ...current, turns: applyAgentEvent(current.turns, current.threadId, event) }
      : current);
    if (event.type === 'turn.completed' && selectedProjectId) {
      void window.limeShot.plan.list(selectedProjectId)
        .then((result) => setPlans(result.plans))
        .catch((error) => setProjectLoadError(error instanceof Error ? error.message : t('project.readFailed')));
    }
  }), [selectedProjectId, t]);

  const text = (key: string, fallback: string): string => isTranslationKey(key) ? t(key) : fallback;
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId);
  const selectedProject = projects.find((project) => project.projectId === selectedProjectId);
  const selectedProjectDetail = selectedProject && projectDetail?.project.projectId === selectedProject.projectId
    ? projectDetail
    : undefined;
  const activeTurn = conversation ? runningTurn(conversation.turns) : undefined;
  const conversationTitle = titleFromTurns(conversation?.turns ?? [], t('agent.newConversation'));
  const canSend = Boolean(
    selectedProject
    && conversation
    && conversationLoadState === 'ready'
    && !activeTurn
    && !sending
    && composerText.trim(),
  );

  const onProjectCreated = (result: ProjectCreateResult, initialSubject: string) => {
    setProjects((current) => [result.project, ...current.filter((item) => item.projectId !== result.project.projectId)]);
    setProjectDetail(result);
    setSelectedProjectId(result.project.projectId);
    setConversationId(MAIN_CONVERSATION_ID);
    setProjectInspectorOpen(false);
    setComposerText(initialSubject);
    if (initialSubject) pendingFirstTurn.current = { projectId: result.project.projectId, text: initialSubject };
  };

  const openProject = (projectId: string) => {
    const project = projects.find((item) => item.projectId === projectId);
    if (project) setSelectedProfileId(project.profileId);
    setSelectedProjectId(projectId);
    setConversationId(MAIN_CONVERSATION_ID);
    setProjectInspectorOpen(false);
    setComposerText('');
  };

  const createProject = async (subject = '') => {
    if (!selectedProfile || creatingProject) return;
    setCreatingProject(true);
    setActionError(undefined);
    try {
      const result = await window.limeShot.project.create({
        profileId: selectedProfile.profileId,
        language: locale,
        initialSubject: subject.trim() || undefined,
      });
      onProjectCreated(result, subject.trim());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('project.createFailed'));
    } finally {
      setCreatingProject(false);
    }
  };

  const openProjectDirectory = async () => {
    if (!selectedProfile || creatingProject) return;
    setCreatingProject(true);
    setActionError(undefined);
    try {
      const result = await window.limeShot.project.open({
        profileId: selectedProfile.profileId,
        language: locale,
      });
      if (result) onProjectCreated(result, '');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('project.createFailed'));
    } finally {
      setCreatingProject(false);
    }
  };

  const beginFromHome = () => {
    const subject = composerText.trim();
    if (!subject) return;
    void createProject(subject);
  };

  const startNewConversation = () => {
    pendingFirstTurn.current = undefined;
    setSending(false);
    setSelectedProjectId(undefined);
    setConversationId(MAIN_CONVERSATION_ID);
    setProjectInspectorOpen(false);
    setAgentError(undefined);
    setComposerText('');
  };

  const sendTurn = async () => {
    if (!selectedProject || !conversation || !canSend) return;
    setSending(true);
    setAgentError(undefined);
    try {
      await window.limeShot.agent.startTurn({
        projectId: selectedProject.projectId,
        conversationId: conversation.conversationId,
        text: composerText.trim(),
      });
      setComposerText('');
    } catch (error) {
      console.error('Failed to send Codex turn', error);
      setAgentError(t('agent.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const interruptTurn = async () => {
    if (!conversation || !activeTurn) return;
    try {
      await window.limeShot.agent.interrupt({ threadId: conversation.threadId, turnId: activeTurn.id });
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : t('agent.interruptFailed'));
    }
  };

  return (
    <main className="app-shell" data-testid="app-shell" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
      {!sidebarCollapsed ? (
        <AppSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          conversationTitle={conversationTitle}
          creatingProject={creatingProject}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          footer={<RuntimeStatus loadState={loadState} runtime={runtime} errorMessage={errorMessage} onRetry={load} t={t} />}
          onHome={startNewConversation}
          onNewConversation={startNewConversation}
          onNewProject={() => void openProjectDirectory()}
          onSearchOpenChange={setSearchOpen}
          onSearchQueryChange={setSearchQuery}
          onProjectSelect={openProject}
          t={t}
        />
      ) : null}

      <section className="workspace">
        <header className="workspace-toolbar" data-testid="workspace-toolbar">
          <button type="button" onClick={() => setSidebarCollapsed((current) => !current)} title={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}>
            {sidebarCollapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
          </button>
          <span className="workspace-toolbar-title">{selectedProject ? conversationTitle : t('home.workspaceTitle')}</span>
          <span className="workspace-toolbar-spacer" />
          {selectedProject ? (
            <button
              type="button"
              data-active={projectInspectorOpen ? 'true' : 'false'}
              onClick={() => setProjectInspectorOpen((current) => !current)}
              title={projectInspectorOpen ? t('project.closeDetails') : t('project.openDetails')}
            >
              {projectInspectorOpen ? <PanelRightClose size={15} aria-hidden="true" /> : <PanelRightOpen size={15} aria-hidden="true" />}
            </button>
          ) : null}
        </header>

        {selectedProject ? (
          <div className="project-conversation-layout" data-inspector-open={projectInspectorOpen ? 'true' : 'false'}>
            <section className="conversation-workspace" data-testid="agent-panel" data-agent-state={conversationLoadState}>
              <ConversationTimeline
                turns={conversation?.turns ?? []}
                loadState={conversationLoadState}
                errorMessage={agentError}
                t={t}
              />
              <footer className="composer-shell">
                <div className="composer-field">
                  <textarea
                    aria-label={t('agent.inputPlaceholder')}
                    placeholder={t('agent.inputPlaceholder')}
                    value={composerText}
                    rows={2}
                    disabled={conversationLoadState !== 'ready' || Boolean(activeTurn) || sending}
                    onChange={(event) => setComposerText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && canSend) {
                        event.preventDefault();
                        void sendTurn();
                      }
                    }}
                  />
                  <footer>
                    <div className="composer-context">
                      <span><Sparkles size={14} aria-hidden="true" />{text(selectedProfile?.nameKey ?? '', selectedProfile?.profileId ?? selectedProject.profileId)}</span>
                      <span><Folder size={14} aria-hidden="true" />{selectedProject.workspaceName}</span>
                    </div>
                    {activeTurn ? (
                      <button className="send-button" type="button" onClick={() => void interruptTurn()} title={t('agent.interrupt')}>
                        <Square size={15} aria-hidden="true" />
                      </button>
                    ) : (
                      <button className="send-button" type="button" disabled={!canSend} onClick={() => void sendTurn()} title={t('agent.send')}>
                        <Send size={17} aria-hidden="true" />
                      </button>
                    )}
                  </footer>
                </div>
              </footer>
            </section>

            {projectInspectorOpen ? (
              <aside className="project-inspector" aria-label={t('project.details')}>
                <header>
                  <div><strong>{selectedProject.name}</strong><span>{selectedProject.workspaceName}</span></div>
                  <button type="button" onClick={() => setProjectInspectorOpen(false)} title={t('project.closeDetails')}><X size={16} aria-hidden="true" /></button>
                </header>
                <div className="project-inspector-body">
                  {selectedProjectDetail ? (
                    <ProjectOverview
                      detail={selectedProjectDetail}
                      plans={plans}
                      mediaProbeReady={mediaProbeReady}
                      mediaTranscodeReady={mediaTranscodeReady}
                      onBriefUpdated={(brief) => setProjectDetail((current) => current ? { ...current, brief } : current)}
                      onPlanUpdated={(plan) => setPlans((current) => current.map((item) => item.planId === plan.planId ? plan : item))}
                      t={t}
                    />
                  ) : projectLoadError ? <p className="project-read-error" role="alert">{projectLoadError}</p> : <p className="project-loading">{t('project.loading')}</p>}
                </div>
              </aside>
            ) : null}
          </div>
        ) : (
          <WorkspaceHome
            profiles={profiles}
            projects={projects}
            selectedProfileId={selectedProfileId}
            composerText={composerText}
            submitting={creatingProject}
            onProfileSelect={setSelectedProfileId}
            onComposerTextChange={setComposerText}
            onProjectSelect={openProject}
            onSubmit={beginFromHome}
            text={text}
            t={t}
          />
        )}
      </section>

      {creatingProject ? <div className="project-creating-indicator" role="status"><LoaderCircle size={15} aria-hidden="true" />{t('project.creating')}</div> : null}
      {actionError ? <div className="app-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError(undefined)} title={t('project.dialogClose')}><X size={14} aria-hidden="true" /></button></div> : null}
    </main>
  );
}

interface ConversationTimelineProps {
  turns: AgentTurnProjection[];
  loadState: ConversationLoadState;
  errorMessage?: string;
  t: (key: TranslationKey) => string;
}

function ConversationTimeline({ turns, loadState, errorMessage, t }: ConversationTimelineProps) {
  const itemCount = turns.reduce((count, turn) => count + turn.items.length, 0);
  return (
    <div className="conversation-scroll">
      <div className="agent-timeline" aria-live="polite">
        {loadState === 'loading' ? <p className="agent-empty">{t('agent.connecting')}</p> : null}
        {itemCount === 0 && loadState !== 'loading' ? <p className="agent-empty">{t('agent.empty')}</p> : null}
        {turns.map((turn) => <ConversationTurn turn={turn} t={t} key={turn.id} />)}
        {errorMessage ? <p className="agent-error" role="alert">{errorMessage}</p> : null}
      </div>
    </div>
  );
}

function ConversationTurn({ turn, t }: { turn: AgentTurnProjection; t: (key: TranslationKey) => string }) {
  const activityItems = turn.items.filter((item) => item.kind === 'tool' || item.kind === 'activity');
  const userItems = turn.items.filter((item) => item.kind === 'user');
  const responseItems = turn.items.filter((item) => item.kind !== 'user' && item.kind !== 'tool' && item.kind !== 'activity');
  return (
    <section className="agent-turn" data-status={turn.status}>
      {userItems.map((item) => <AgentItem item={item} t={t} key={item.id} />)}
      {activityItems.length > 0 ? (
        <details className="agent-activity" data-tools={activityItems.map((item) => item.title).filter(Boolean).join(' ')}>
          <summary><ChevronRight size={14} aria-hidden="true" /><span>{t('agent.processed')}</span><small>{activityItems.length}</small></summary>
          <div>{activityItems.map((item) => <AgentItem item={item} t={t} key={item.id} />)}</div>
        </details>
      ) : null}
      {responseItems.map((item) => <AgentItem item={item} t={t} key={item.id} />)}
      {turn.status === 'failed' ? <p className="agent-error" role="alert">{t('agent.sendFailed')}</p> : null}
    </section>
  );
}

function AgentItem({ item, t }: { item: AgentItemProjection; t: (key: TranslationKey) => string }) {
  if (item.kind === 'user') {
    return <article className="agent-item" data-kind="user"><p>{item.text}</p></article>;
  }
  if (item.kind === 'tool' || item.kind === 'activity') {
    return (
      <article className="agent-item" data-kind={item.kind}>
        <div className="agent-item-label">
          <ChevronRight size={14} aria-hidden="true" />
          <Wrench size={13} aria-hidden="true" />
          <span>{item.title ?? t('agent.tool')}</span>
          {item.status ? <em>{item.status}</em> : null}
        </div>
        {item.text ? <p>{item.text}</p> : null}
      </article>
    );
  }
  if (item.kind === 'assistant') {
    return <article className="agent-item" data-kind="assistant">{item.text ? <p>{item.text}</p> : null}</article>;
  }
  return (
    <article className="agent-item" data-kind={item.kind}>
      <div className="agent-item-label"><Bot size={14} aria-hidden="true" /><span>{t('agent.plan')}</span></div>
      {item.text ? <p>{item.text}</p> : null}
    </article>
  );
}

function titleFromTurns(turns: AgentTurnProjection[], fallback: string): string {
  const firstUserMessage = turns.flatMap((turn) => turn.items).find((item) => item.kind === 'user')?.text.trim();
  if (!firstUserMessage) return fallback;
  return firstUserMessage.length > 28 ? `${firstUserMessage.slice(0, 28)}...` : firstUserMessage;
}

interface ProjectOverviewProps {
  detail: ProjectReadResult;
  plans: ProductionPlan[];
  mediaProbeReady: boolean;
  mediaTranscodeReady: boolean;
  onBriefUpdated: (brief: ProjectReadResult['brief']) => void;
  onPlanUpdated: (plan: ProductionPlan) => void;
  t: (key: TranslationKey) => string;
}

function ProjectOverview({ detail, plans, mediaProbeReady, mediaTranscodeReady, onBriefUpdated, onPlanUpdated, t }: ProjectOverviewProps) {
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

interface RuntimeStatusProps {
  loadState: LoadState;
  runtime?: BusinessStatusResult;
  errorMessage?: string;
  onRetry: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

function RuntimeStatus({ loadState, runtime, errorMessage, onRetry, t }: RuntimeStatusProps) {
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
      title={errorMessage}
      aria-live="polite"
    >
      <span className="runtime-dot" aria-hidden="true" />
      <span className="runtime-copy">
        <strong>{label}</strong>
        {runtime ? (
          <small>{t('runtime.pid')} {runtime.serverPid} · {t('runtime.protocol')} {runtime.protocolVersion}</small>
        ) : null}
      </span>
      {loadState === 'unavailable' ? (
        <button type="button" className="runtime-retry" onClick={() => void onRetry()} title={t('runtime.retry')}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
