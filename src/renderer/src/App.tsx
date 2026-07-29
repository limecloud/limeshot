import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Folder,
  ListFilter,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Sparkles,
  Square,
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
  AgentConversationSummary,
  AgentEvent,
  AgentInteractionExternalOpenInput,
  AgentInteractionSubmitInput,
  AgentPendingInteractionProjection,
  AgentThreadInspectResult,
  AgentTurnProjection,
  ConversationStartResult,
} from '../../shared/desktop';
import { AppSidebar } from './AppSidebar';
import { applyAgentActivityEvent, createAgentActivityState, dismissAgentNotice } from './agentActivityState';
import { createAgentEventBatcher } from './agentEventBatcher';
import { applyAgentEvent, runningTurn } from './agentState';
import { ConversationStatusSurface } from './ConversationStatusSurface';
import { ConversationTimeline } from './ConversationTimeline';
import { ExecutionPanel } from './ExecutionPanel';
import { createTranslator, isTranslationKey, resolveLocale, type TranslationKey } from './i18n';
import { PlanPanel } from './PlanPanel';
import { PendingInteractions } from './PendingInteractions';
import { WorkspaceHome } from './WorkspaceHome';

type LoadState = 'loading' | 'ready' | 'unavailable';
type ConversationLoadState = 'idle' | 'loading' | 'ready' | 'readOnly' | 'unavailable';
interface StandaloneTarget { conversationId: string; threadId?: string }
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
  const [standaloneConversations, setStandaloneConversations] = useState<AgentConversationSummary[]>([]);
  const [projectDetail, setProjectDetail] = useState<ProjectReadResult>();
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [projectLoadError, setProjectLoadError] = useState<string>();
  const [selectedProfileId, setSelectedProfileId] = useState<string>('general');
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [draftProjectId, setDraftProjectId] = useState<string>();
  const [standaloneTarget, setStandaloneTarget] = useState<StandaloneTarget>();
  const [conversationId, setConversationId] = useState(MAIN_CONVERSATION_ID);
  const [openingProject, setOpeningProject] = useState(false);
  const [inspector, setInspector] = useState<'activity' | 'project'>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [conversation, setConversation] = useState<ConversationStartResult>();
  const [threadViews, setThreadViews] = useState<AgentThreadInspectResult[]>([]);
  const [openingThreadId, setOpeningThreadId] = useState<string>();
  const [threadViewError, setThreadViewError] = useState<string>();
  const [interactions, setInteractions] = useState<AgentPendingInteractionProjection[]>([]);
  const [activityState, setActivityState] = useState(createAgentActivityState);
  const [interactionError, setInteractionError] = useState<string>();
  const [conversationLoadState, setConversationLoadState] = useState<ConversationLoadState>('idle');
  const [agentError, setAgentError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);
  const pendingFirstTurn = useRef<{ targetKey: string; text: string } | undefined>(undefined);
  const threadNavigationRequest = useRef(0);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(undefined);
    try {
      const [foundationResult, projectResult, conversationResult] = await Promise.all([
        window.limeShot.foundation.read(),
        window.limeShot.project.list(),
        window.limeShot.agent.listConversations(),
      ]);
      setRuntime(foundationResult.business);
      setProfiles(foundationResult.profiles);
      setMediaProbeReady(foundationResult.services.some((service) => service.serviceId === 'media.probe' && service.state === 'ready'));
      setMediaTranscodeReady(foundationResult.services.some((service) => service.serviceId === 'media.assemble' && service.state === 'ready'));
      setProjects(projectResult);
      setStandaloneConversations(conversationResult);
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
    let disposed = false;
    void window.limeShot.agent.listInteractions()
      .then((pending) => {
        if (!disposed) setInteractions((current) => recoverInteractions(current, pending));
      })
      .catch((error) => {
        console.error('Failed to restore pending Codex interactions', error);
        if (!disposed) setInteractionError(t('interaction.loadFailed'));
      });
    return () => { disposed = true; };
  }, [t]);

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
    threadNavigationRequest.current += 1;
    setThreadViews([]);
    setOpeningThreadId(undefined);
    setThreadViewError(undefined);
    setConversation(undefined);
    setAgentError(undefined);
    if (!selectedProjectId && !standaloneTarget) {
      setConversationLoadState('idle');
      return undefined;
    }
    const request = selectedProjectId
      ? { projectId: selectedProjectId, conversationId }
      : { projectId: null, conversationId: standaloneTarget!.conversationId, threadId: standaloneTarget!.threadId };
    const targetKey = selectedProjectId
      ? `project:${selectedProjectId}:${conversationId}`
      : `standalone:${standaloneTarget!.conversationId}`;
    let disposed = false;
    setConversationLoadState('loading');
    void window.limeShot.agent.startConversation(request)
      .then((result) => {
        if (disposed) return;
        setConversation(result);
        setConversationLoadState(result.access === 'active' ? 'ready' : 'readOnly');
        const pending = pendingFirstTurn.current;
        if (pending?.targetKey === targetKey && result.access === 'active') {
          pendingFirstTurn.current = undefined;
          setSending(true);
          void window.limeShot.agent.startTurn({
            projectId: request.projectId,
            conversationId: result.conversationId,
            threadId: result.threadId,
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
  }, [conversationId, selectedProjectId, standaloneTarget, t]);

  useEffect(() => {
    const batcher = createAgentEventBatcher((events) => {
      setActivityState((current) => events.reduce(applyAgentActivityEvent, current));
      const timelineEvents = events.filter((event) => event.type !== 'agent.error');
      if (timelineEvents.length === 0) return;
      setConversation((current) => current
        ? { ...current, turns: timelineEvents.reduce((turns, event) => applyAgentEvent(turns, current.threadId, event), current.turns) }
        : current);
      setThreadViews((current) => current.map((view) => ({
        ...view,
        turns: timelineEvents.reduce((turns, event) => applyAgentEvent(turns, view.threadId, event), view.turns),
      })));
    });
    const unsubscribe = window.limeShot.agent.subscribe((event: AgentEvent) => {
      batcher.push(event);
      if (event.type === 'interaction.updated') {
        setInteractions((current) => upsertInteraction(current, event.interaction));
        setInteractionError(undefined);
      } else if (event.type === 'interaction.resolved') {
        setInteractions((current) => current.map((interaction) => interaction.interactionId === event.interactionId && (interaction.status === 'pending' || interaction.status === 'submitting')
          ? { ...interaction, status: 'resolved' } as AgentPendingInteractionProjection
          : interaction));
      }
      if (event.type === 'agent.error') {
        console.error('Codex agent error', event.message);
        setAgentError(t('agent.sendFailed'));
        return;
      }
      if (event.type === 'turn.completed' && selectedProjectId) {
        void window.limeShot.plan.list(selectedProjectId)
          .then((result) => setPlans(result.plans))
          .catch((error) => setProjectLoadError(error instanceof Error ? error.message : t('project.readFailed')));
      } else if (event.type === 'turn.completed' && standaloneTarget) {
        void window.limeShot.agent.listConversations().then(setStandaloneConversations).catch(() => undefined);
      }
    });
    return () => {
      unsubscribe();
      batcher.dispose();
    };
  }, [selectedProjectId, standaloneTarget, t]);

  const text = (key: string, fallback: string): string => isTranslationKey(key) ? t(key) : fallback;
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId);
  const selectedProject = projects.find((project) => project.projectId === selectedProjectId);
  const selectedProjectDetail = selectedProject && projectDetail?.project.projectId === selectedProject.projectId
    ? projectDetail
    : undefined;
  const activeTurn = conversation ? runningTurn(conversation.turns) : undefined;
  const threadView = threadViews.at(-1);
  const visibleThreadId = threadView?.threadId ?? conversation?.threadId;
  const visibleThreadActivity = visibleThreadId ? activityState.threads[visibleThreadId] : undefined;
  const runtimeReadOnly = visibleThreadActivity?.lifecycle === 'archived'
    || visibleThreadActivity?.lifecycle === 'deleted'
    || visibleThreadActivity?.lifecycle === 'closed'
    || visibleThreadActivity?.status?.type === 'systemError';
  const conversationTitle = titleFromTurns(conversation?.turns ?? [], t('agent.newConversation'));
  const canSend = Boolean(
    (selectedProject || standaloneTarget)
    && conversation
    && conversationLoadState === 'ready'
    && !threadView
    && !runtimeReadOnly
    && !activeTurn
    && !sending
    && composerText.trim(),
  );

  const onDirectoryOpened = (result: ProjectCreateResult) => {
    setProjects((current) => [result.project, ...current.filter((item) => item.projectId !== result.project.projectId)]);
    setSelectedProfileId(result.project.profileId);
    setDraftProjectId(result.project.projectId);
  };

  const openProject = (projectId: string) => {
    const project = projects.find((item) => item.projectId === projectId);
    if (project) setSelectedProfileId(project.profileId);
    pendingFirstTurn.current = undefined;
    setStandaloneTarget(undefined);
    setDraftProjectId(undefined);
    setSending(false);
    setSelectedProjectId(projectId);
    setConversationId(MAIN_CONVERSATION_ID);
    setInspector(undefined);
    setComposerText('');
  };

  const openStandalone = (threadId: string) => {
    pendingFirstTurn.current = undefined;
    setSelectedProjectId(undefined);
    setDraftProjectId(undefined);
    setStandaloneTarget({ conversationId: threadId, threadId });
    setInspector(undefined);
    setSending(false);
    setComposerText('');
  };

  const openProjectDirectory = async () => {
    if (!selectedProfile || openingProject) return;
    setOpeningProject(true);
    setActionError(undefined);
    try {
      const result = await window.limeShot.project.open({
        profileId: selectedProfile.profileId,
        language: locale,
      });
      if (result) onDirectoryOpened(result);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('project.openFailed'));
    } finally {
      setOpeningProject(false);
    }
  };

  const beginFromHome = () => {
    const subject = composerText.trim();
    if (!subject) return;
    if (draftProjectId) {
      const nextConversationId = `conversation-${crypto.randomUUID()}`;
      pendingFirstTurn.current = { targetKey: `project:${draftProjectId}:${nextConversationId}`, text: subject };
      setStandaloneTarget(undefined);
      setSelectedProjectId(draftProjectId);
      setDraftProjectId(undefined);
      setConversationId(nextConversationId);
    } else {
      const nextConversationId = `standalone-${crypto.randomUUID()}`;
      pendingFirstTurn.current = { targetKey: `standalone:${nextConversationId}`, text: subject };
      setSelectedProjectId(undefined);
      setStandaloneTarget({ conversationId: nextConversationId });
    }
  };

  const startNewConversation = () => {
    pendingFirstTurn.current = undefined;
    setSending(false);
    setSelectedProjectId(undefined);
    setDraftProjectId(undefined);
    setStandaloneTarget(undefined);
    setConversation(undefined);
    setConversationId(MAIN_CONVERSATION_ID);
    setInspector(undefined);
    setAgentError(undefined);
    setComposerText('');
  };

  const sendTurn = async () => {
    if ((!selectedProject && !standaloneTarget) || !conversation || !canSend) return;
    setSending(true);
    setAgentError(undefined);
    try {
      await window.limeShot.agent.startTurn({
        projectId: selectedProject?.projectId ?? null,
        conversationId: conversation.conversationId,
        threadId: conversation.threadId,
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

  const openSubThread = async (threadId: string) => {
    const parentThreadId = threadView?.threadId ?? conversation?.threadId;
    if (!parentThreadId || !threadId || threadId === parentThreadId || openingThreadId) return;
    const requestId = ++threadNavigationRequest.current;
    setOpeningThreadId(threadId);
    setThreadViewError(undefined);
    try {
      const result = await window.limeShot.agent.inspectSubThread({ parentThreadId, threadId });
      if (threadNavigationRequest.current !== requestId) return;
      setThreadViews((current) => {
        const currentParentId = current.at(-1)?.threadId ?? conversation?.threadId;
        return currentParentId === parentThreadId ? [...current, result] : current;
      });
    } catch (error) {
      console.error('Failed to inspect Codex sub-thread', error);
      if (threadNavigationRequest.current === requestId) setThreadViewError(t('agent.subThreadOpenFailed'));
    } finally {
      if (threadNavigationRequest.current === requestId) setOpeningThreadId(undefined);
    }
  };

  const closeSubThread = () => {
    threadNavigationRequest.current += 1;
    setOpeningThreadId(undefined);
    setThreadViewError(undefined);
    setThreadViews((current) => current.slice(0, -1));
  };

  const submitPendingInteraction = async (input: AgentInteractionSubmitInput) => {
    setInteractionError(undefined);
    setInteractions((current) => setInteractionStatus(current, input.interactionId, 'submitting'));
    try {
      await window.limeShot.agent.submitInteraction(input);
      setInteractions((current) => setInteractionStatus(current, input.interactionId, 'resolved'));
    } catch (error) {
      console.error('Failed to submit Codex interaction', error);
      setInteractions((current) => setInteractionStatus(current, input.interactionId, 'pending', 'submitting'));
      setInteractionError(t('interaction.submitFailed'));
    }
  };

  const openInteractionExternal = async (input: AgentInteractionExternalOpenInput) => {
    await window.limeShot.agent.openInteractionExternal(input);
  };

  return (
    <main className="app-shell" data-testid="app-shell" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
      {!sidebarCollapsed ? (
        <AppSidebar
          projects={projects}
          conversations={standaloneConversations}
          selectedProjectId={selectedProjectId}
          selectedThreadId={standaloneTarget?.threadId}
          conversationTitle={conversationTitle}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          footer={<RuntimeStatus loadState={loadState} runtime={runtime} errorMessage={errorMessage} onRetry={load} t={t} />}
          onHome={startNewConversation}
          onNewConversation={startNewConversation}
          onConversationSelect={openStandalone}
          onSearchOpenChange={setSearchOpen}
          onSearchQueryChange={setSearchQuery}
          onProjectSelect={openProject}
          onProjectEdit={(projectId) => {
            openProject(projectId);
            setInspector('project');
          }}
          t={t}
        />
      ) : null}

      <section className="workspace">
        <header className="workspace-toolbar" data-testid="workspace-toolbar">
          <button type="button" onClick={() => setSidebarCollapsed((current) => !current)} title={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}>
            {sidebarCollapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
          </button>
          <span className="workspace-toolbar-title">{selectedProject || standaloneTarget ? conversationTitle : t('home.workspaceTitle')}</span>
          <span className="workspace-toolbar-spacer" />
          {selectedProject || standaloneTarget ? (
            <button
              type="button"
              data-active={inspector === 'activity' ? 'true' : 'false'}
              onClick={() => setInspector((current) => current === 'activity' ? undefined : 'activity')}
              title={inspector === 'activity' ? t('activity.closePanel') : t('activity.openPanel')}
            >
              <ListFilter size={15} aria-hidden="true" />
            </button>
          ) : null}
          {selectedProject ? (
            <button
              type="button"
              data-active={inspector === 'project' ? 'true' : 'false'}
              onClick={() => setInspector((current) => current === 'project' ? undefined : 'project')}
              title={inspector === 'project' ? t('project.closeDetails') : t('project.openDetails')}
            >
              {inspector === 'project' ? <PanelRightClose size={15} aria-hidden="true" /> : <PanelRightOpen size={15} aria-hidden="true" />}
            </button>
          ) : null}
        </header>

        {selectedProject || standaloneTarget ? (
          <div className="project-conversation-layout" data-inspector={inspector ?? 'closed'}>
            <section
              className="conversation-workspace"
              data-testid="agent-panel"
              data-agent-state={conversationLoadState}
              data-conversation-id={conversation?.conversationId ?? ''}
              data-thread-id={conversation?.threadId ?? ''}
            >
              <ConversationTimeline
                turns={threadView?.turns ?? conversation?.turns ?? []}
                loadState={threadView ? 'readOnly' : conversationLoadState}
                errorMessage={threadViewError ?? agentError}
                t={t}
                threadContext={threadView ? {
                  title: threadView.agentNickname || threadView.name || t('agent.subThread'),
                  ...(threadView.agentRole ? { subtitle: threadView.agentRole } : {}),
                } : undefined}
                onBackThread={threadView ? closeSubThread : undefined}
                onOpenThread={(threadId) => void openSubThread(threadId)}
                openingThreadId={openingThreadId}
              />
              <PendingInteractions
                interactions={interactions}
                currentThreadId={threadView?.threadId ?? conversation?.threadId}
                turns={threadView?.turns ?? conversation?.turns ?? []}
                onSubmit={submitPendingInteraction}
                onOpenExternal={openInteractionExternal}
                errorMessage={interactionError}
                t={t}
              />
              <footer className="composer-shell">
                <div className="composer-field">
                  <textarea
                    aria-label={threadView ? t('agent.subThreadReadOnly') : t('agent.inputPlaceholder')}
                    placeholder={threadView ? t('agent.subThreadReadOnly') : t('agent.inputPlaceholder')}
                    value={composerText}
                    rows={2}
                    disabled={Boolean(threadView) || runtimeReadOnly || conversationLoadState !== 'ready' || Boolean(activeTurn) || sending}
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
                      <span><Sparkles size={14} aria-hidden="true" />{text(selectedProfile?.nameKey ?? '', selectedProfile?.profileId ?? selectedProject?.profileId ?? 'general')}</span>
                      {selectedProject ? <span><Folder size={14} aria-hidden="true" />{selectedProject.workspaceName}</span> : <span>{t('home.noProject')}</span>}
                    </div>
                    {!threadView && activeTurn ? (
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

            {inspector === 'activity' ? (
              <aside className="workspace-inspector conversation-activity-inspector" aria-label={t('activity.region')}>
                <header>
                  <strong>{t('activity.region')}</strong>
                  <button type="button" onClick={() => setInspector(undefined)} title={t('activity.closePanel')}><X size={16} aria-hidden="true" /></button>
                </header>
                <div className="workspace-inspector-body conversation-activity-inspector-body">
                  <ConversationStatusSurface
                    state={activityState}
                    threadId={visibleThreadId}
                    onDismissNotice={(noticeId) => setActivityState((current) => dismissAgentNotice(current, noticeId))}
                    onSelectFile={(path) => {
                      if (!threadView && !runtimeReadOnly) setComposerText((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${path} `);
                    }}
                    t={t}
                  />
                </div>
              </aside>
            ) : selectedProject && inspector === 'project' ? (
              <aside className="workspace-inspector project-inspector" aria-label={t('project.details')}>
                <header>
                  <div><strong>{selectedProject.name}</strong><span>{selectedProject.workspaceName}</span></div>
                  <button type="button" onClick={() => setInspector(undefined)} title={t('project.closeDetails')}><X size={16} aria-hidden="true" /></button>
                </header>
                <div className="workspace-inspector-body project-inspector-body">
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
            selectedProjectId={draftProjectId}
            composerText={composerText}
            submitting={openingProject}
            onProfileSelect={setSelectedProfileId}
            onComposerTextChange={setComposerText}
            onProjectSelect={setDraftProjectId}
            onProjectBrowse={() => void openProjectDirectory()}
            onSubmit={beginFromHome}
            text={text}
            t={t}
          />
        )}
      </section>

      {openingProject ? <div className="project-creating-indicator" role="status"><LoaderCircle size={15} aria-hidden="true" />{t('project.opening')}</div> : null}
      {actionError ? <div className="app-action-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError(undefined)} title={t('project.dialogClose')}><X size={14} aria-hidden="true" /></button></div> : null}
    </main>
  );
}

function titleFromTurns(turns: AgentTurnProjection[], fallback: string): string {
  const firstUserMessage = turns.flatMap((turn) => turn.items).find((item) => item.kind === 'user')?.text.trim();
  if (!firstUserMessage) return fallback;
  return firstUserMessage.length > 28 ? `${firstUserMessage.slice(0, 28)}...` : firstUserMessage;
}

function upsertInteraction(current: AgentPendingInteractionProjection[], next: AgentPendingInteractionProjection): AgentPendingInteractionProjection[] {
  const updated = current.some((interaction) => interaction.interactionId === next.interactionId)
    ? current.map((interaction) => interaction.interactionId === next.interactionId ? next : interaction)
    : [...current, next];
  return updated.sort((left, right) => left.createdAt - right.createdAt).slice(-50);
}

function recoverInteractions(current: AgentPendingInteractionProjection[], recovered: AgentPendingInteractionProjection[]): AgentPendingInteractionProjection[] {
  return recovered.reduce((result, interaction) => {
    const existing = result.find((entry) => entry.interactionId === interaction.interactionId);
    return existing && existing.status !== 'pending' ? result : upsertInteraction(result, interaction);
  }, current);
}

function setInteractionStatus(
  current: AgentPendingInteractionProjection[],
  interactionId: string,
  status: AgentPendingInteractionProjection['status'],
  onlyFrom?: AgentPendingInteractionProjection['status'],
): AgentPendingInteractionProjection[] {
  return current.map((interaction) => interaction.interactionId === interactionId && (!onlyFrom || interaction.status === onlyFrom)
    ? { ...interaction, status } as AgentPendingInteractionProjection
    : interaction);
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
