import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Folder,
  ListFilter,
  LoaderCircle,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Settings2,
  Sparkles,
  Square,
  X,
} from 'lucide-react';

import type {
  BusinessProfile,
  BusinessStatusResult,
  ProjectSummary,
  ProjectCreateResult,
  ProjectReadResult,
  ProductionPlan,
} from '@business/generated';
import type {
  AgentConversationSummary,
  AgentProjectConversationSummary,
  AgentEvent,
  AgentInteractionExternalOpenInput,
  AgentInteractionSubmitInput,
  AgentPendingInteractionProjection,
  AgentThreadInspectResult,
  AgentTurnProjection,
  ConversationTargetInput,
  ConversationStartResult,
} from '../../shared/desktop';
import { AppSidebar } from './AppSidebar';
import { applyAgentActivityEvent, createAgentActivityState, dismissAgentNotice } from './agentActivityState';
import { createAgentEventBatcher } from './agentEventBatcher';
import { applyAgentEvent, runningTurn } from './agentState';
import { ConversationStatusSurface } from './ConversationStatusSurface';
import { ConversationTimeline } from './ConversationTimeline';
import { createTranslator, isTranslationKey, resolveLocale, type TranslationKey } from './i18n';
import { PendingInteractions } from './PendingInteractions';
import { ProjectOverview } from './ProjectOverview';
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
  const [projectConversations, setProjectConversations] = useState<Record<string, AgentProjectConversationSummary[]>>({});
  const [projectConversationFailedIds, setProjectConversationFailedIds] = useState<string[]>([]);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(sidebarStartsCollapsed);
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
  const projectContextId = selectedProjectId ?? draftProjectId;

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
    void Promise.allSettled(projects.map((project) => window.limeShot.agent.listProjectConversations({ projectId: project.projectId })))
      .then((results) => {
        if (disposed) return;
        const next: Record<string, AgentProjectConversationSummary[]> = {};
        const failed: string[] = [];
        results.forEach((result, index) => {
          const projectId = projects[index]?.projectId;
          if (!projectId) return;
          if (result.status === 'fulfilled') next[projectId] = result.value.conversations;
          else failed.push(projectId);
        });
        setProjectConversations(next);
        setProjectConversationFailedIds(failed);
      });
    return () => { disposed = true; };
  }, [projects]);

  useEffect(() => {
    const narrowWindow = window.matchMedia?.('(max-width: 680px)');
    if (!narrowWindow) return undefined;
    const onViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) setSidebarCollapsed(true);
    };
    narrowWindow.addEventListener('change', onViewportChange);
    return () => narrowWindow.removeEventListener('change', onViewportChange);
  }, []);

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
    if (!projectContextId) {
      setProjectDetail(undefined);
      setPlans([]);
      setProjectLoadError(undefined);
      return undefined;
    }
    let disposed = false;
    void Promise.all([
      window.limeShot.project.read(projectContextId),
      window.limeShot.plan.list(projectContextId),
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
  }, [projectContextId, t]);

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
        if (request.projectId) {
          const summary: AgentProjectConversationSummary = {
            projectId: request.projectId,
            conversationId: result.conversationId,
            threadId: result.threadId,
            title: titleFromTurns(result.turns, t('agent.newConversation')),
            updatedAtEpochMs: Date.now(),
            origin: 'limeshot',
            client: 'appServer',
          };
          setProjectConversations((current) => ({
            ...current,
            [request.projectId!]: [summary, ...(current[request.projectId!] ?? []).filter((item) => item.threadId !== result.threadId)],
          }));
        }
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
        void window.limeShot.agent.listProjectConversations({ projectId: selectedProjectId })
          .then((result) => setProjectConversations((current) => ({ ...current, [selectedProjectId]: result.conversations })))
          .catch(() => setProjectConversationFailedIds((current) => current.includes(selectedProjectId) ? current : [...current, selectedProjectId]));
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
  const collapseSidebarOnNarrowWindow = () => {
    if (window.matchMedia?.('(max-width: 680px)').matches) setSidebarCollapsed(true);
  };
  const selectedProfile = profiles.find((profile) => profile.profileId === selectedProfileId);
  const selectedProject = projects.find((project) => project.projectId === selectedProjectId);
  const projectContext = projects.find((project) => project.projectId === projectContextId);
  const selectedProjectDetail = projectContext && projectDetail?.project.projectId === projectContext.projectId
    ? projectDetail
    : undefined;
  const activeTurn = conversation ? runningTurn(conversation.turns) : undefined;
  const threadView = threadViews.at(-1);
  const visibleThreadId = threadView?.threadId ?? conversation?.threadId;
  const visibleThreadActivity = visibleThreadId ? activityState.threads[visibleThreadId] : undefined;
  const projectThreadIds = useMemo(
    () => new Set(Object.values(projectConversations).flatMap((items) => items.map((item) => item.threadId))),
    [projectConversations],
  );
  const visibleStandaloneConversations = useMemo(
    () => standaloneConversations.filter((item) => !projectThreadIds.has(item.threadId)),
    [projectThreadIds, standaloneConversations],
  );
  const runtimeReadOnly = visibleThreadActivity?.lifecycle === 'archived'
    || visibleThreadActivity?.lifecycle === 'deleted'
    || visibleThreadActivity?.lifecycle === 'closed'
    || visibleThreadActivity?.status?.type === 'systemError';
  const conversationTitle = visibleThreadActivity?.name?.trim() || titleFromTurns(conversation?.turns ?? [], t('agent.newConversation'));
  const activeProjectConversation: AgentProjectConversationSummary | undefined = selectedProject && conversation
    ? {
        projectId: selectedProject.projectId,
        conversationId: conversation.conversationId,
        threadId: conversation.threadId,
        title: conversationTitle,
        updatedAtEpochMs: selectedProject.updatedAtEpochMs,
        origin: 'limeshot',
        client: 'appServer',
        workspaceLabel: selectedProject.workspaceName,
      }
    : undefined;
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
    threadNavigationRequest.current += 1;
    pendingFirstTurn.current = undefined;
    setStandaloneTarget(undefined);
    setDraftProjectId(projectId);
    setSending(false);
    setSelectedProjectId(undefined);
    setConversationId(MAIN_CONVERSATION_ID);
    setConversation(undefined);
    setConversationLoadState('idle');
    setThreadViews([]);
    setOpeningThreadId(undefined);
    setThreadViewError(undefined);
    setInspector(undefined);
    setAgentError(undefined);
    setComposerText('');
    collapseSidebarOnNarrowWindow();
  };

  const openStandalone = (threadId: string) => {
    pendingFirstTurn.current = undefined;
    setSelectedProjectId(undefined);
    setDraftProjectId(undefined);
    setStandaloneTarget({ conversationId: threadId, threadId });
    setInspector(undefined);
    setSending(false);
    setComposerText('');
    collapseSidebarOnNarrowWindow();
  };

  const openProjectConversation = (projectId: string, nextConversationId: string) => {
    const project = projects.find((item) => item.projectId === projectId);
    if (project) setSelectedProfileId(project.profileId);
    pendingFirstTurn.current = undefined;
    setStandaloneTarget(undefined);
    setDraftProjectId(undefined);
    setSending(false);
    setSelectedProjectId(projectId);
    setConversationId(nextConversationId);
    setInspector(undefined);
    setComposerText('');
    collapseSidebarOnNarrowWindow();
  };

  const renameConversation = async (target: ConversationTargetInput, title: string) => {
    await window.limeShot.agent.renameConversation({ ...target, title });
    const threadId = target.threadId;
    setActivityState((current) => applyAgentActivityEvent(current, {
      type: 'thread.context.updated',
      threadId,
      patch: { name: title },
    }));
    setStandaloneConversations((current) => current.map((item) => item.threadId === threadId ? { ...item, title } : item));
    if (target.projectId) {
      setProjectConversations((current) => ({
        ...current,
        [target.projectId!]: (current[target.projectId!] ?? []).map((item) => item.threadId === threadId ? { ...item, title } : item),
      }));
    }
  };

  const removeConversationFromRenderer = (threadId: string) => {
    setStandaloneConversations((current) => current.filter((item) => item.threadId !== threadId));
    setProjectConversations((current) => Object.fromEntries(Object.entries(current).map(([projectId, items]) => [
      projectId,
      items.filter((item) => item.threadId !== threadId),
    ])));
    if (conversation?.threadId !== threadId) return;
    pendingFirstTurn.current = undefined;
    setConversation(undefined);
    setThreadViews([]);
    setSending(false);
    setComposerText('');
    if (selectedProjectId) {
      setDraftProjectId(selectedProjectId);
      setSelectedProjectId(undefined);
    } else {
      setStandaloneTarget(undefined);
    }
  };

  const archiveConversation = async (target: ConversationTargetInput) => {
    await window.limeShot.agent.archiveConversation(target);
    removeConversationFromRenderer(target.threadId);
  };

  const deleteConversation = async (target: ConversationTargetInput) => {
    await window.limeShot.agent.deleteConversation(target);
    removeConversationFromRenderer(target.threadId);
  };

  const renameProject = async (projectId: string, name: string) => {
    const result = await window.limeShot.project.rename({ projectId, name });
    setProjects((current) => current.map((project) => project.projectId === projectId ? result.project : project));
    setProjectDetail((current) => current?.project.projectId === projectId ? { ...current, project: result.project } : current);
  };

  const revealProject = (projectId: string) => window.limeShot.project.reveal(projectId);

  const markProjectConversationsRead = async (projectId: string) => {
    const result = await window.limeShot.agent.listProjectConversations({ projectId });
    setProjectConversations((current) => ({ ...current, [projectId]: result.conversations }));
    return result.conversations.map((item) => item.threadId);
  };

  const revealConversation = async (target: ConversationTargetInput) => {
    await window.limeShot.agent.revealConversation(target);
  };

  const copyConversationWorkingDirectory = async (target: ConversationTargetInput) => {
    await window.limeShot.agent.copyConversationWorkingDirectory(target);
  };

  const copyConversationSessionId = async (target: ConversationTargetInput) => {
    await window.limeShot.agent.copyConversationSessionId(target);
  };

  const archiveProjectConversations = async (projectId: string) => {
    const result = await window.limeShot.agent.archiveProjectConversations({ projectId });
    setProjectConversations((current) => ({
      ...current,
      [projectId]: (current[projectId] ?? []).filter((item) => !result.archivedThreadIds.includes(item.threadId)),
    }));
    if (conversation && result.archivedThreadIds.includes(conversation.threadId)) removeConversationFromRenderer(conversation.threadId);
    if (result.failedThreadIds.length > 0) throw new Error('部分项目对话归档失败');
  };

  const removeProject = async (projectId: string) => {
    await window.limeShot.project.archive({ projectId });
    setProjects((current) => current.filter((project) => project.projectId !== projectId));
    setProjectConversations((current) => {
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    if (selectedProjectId === projectId || draftProjectId === projectId) {
      pendingFirstTurn.current = undefined;
      setSelectedProjectId(undefined);
      setDraftProjectId(undefined);
      setStandaloneTarget(undefined);
      setConversation(undefined);
      setThreadViews([]);
      setInspector(undefined);
      setComposerText('');
    }
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
    const projectContext = selectedProjectId ?? draftProjectId;
    pendingFirstTurn.current = undefined;
    setSending(false);
    setSelectedProjectId(undefined);
    setDraftProjectId(projectContext);
    setStandaloneTarget(undefined);
    setConversation(undefined);
    setConversationId(MAIN_CONVERSATION_ID);
    setInspector(undefined);
    setAgentError(undefined);
    setComposerText('');
    collapseSidebarOnNarrowWindow();
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

  const projectInspectorSurface = projectContext && inspector === 'project' ? (
    <aside className="workspace-inspector project-inspector" aria-label={t('project.details')}>
      <header>
        <div><strong>{projectContext.name}</strong><span>{projectContext.workspaceName}</span></div>
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
  ) : null;

  return (
    <main className="app-shell" data-testid="app-shell" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
      {!sidebarCollapsed ? (
        <>
          <AppSidebar
            projects={projects}
            projectConversations={projectConversations}
            projectConversationFailedIds={projectConversationFailedIds}
            conversations={visibleStandaloneConversations}
            selectedProjectId={selectedProjectId ?? draftProjectId}
            activeProjectId={selectedProjectId}
            selectedThreadId={standaloneTarget?.threadId}
            conversationTitle={conversationTitle}
            activeProjectConversation={activeProjectConversation}
            searchOpen={searchOpen}
            searchQuery={searchQuery}
            footer={(
              <RuntimeStatus
                loadState={loadState}
                runtime={runtime}
                profileLabel={text(selectedProfile?.nameKey ?? '', selectedProfile?.profileId ?? 'general')}
                errorMessage={errorMessage}
                onRetry={load}
                t={t}
              />
            )}
            onCollapse={() => setSidebarCollapsed(true)}
            onNewConversation={startNewConversation}
            onConversationSelect={openStandalone}
            onSearchOpenChange={setSearchOpen}
            onSearchQueryChange={setSearchQuery}
            onProjectSelect={openProject}
            onProjectConversationSelect={openProjectConversation}
            onProjectEdit={(projectId) => {
              openProject(projectId);
              setInspector('project');
            }}
            onProjectReveal={revealProject}
            onProjectMarkAllRead={markProjectConversationsRead}
            onProjectRename={renameProject}
            onProjectArchiveConversations={archiveProjectConversations}
            onProjectRemove={removeProject}
            onConversationRename={renameConversation}
            onConversationArchive={archiveConversation}
            onConversationDelete={deleteConversation}
            onConversationReveal={revealConversation}
            onConversationCopyWorkingDirectory={copyConversationWorkingDirectory}
            onConversationCopySessionId={copyConversationSessionId}
            t={t}
          />
          <button className="sidebar-scrim" type="button" aria-label={t('nav.collapseSidebar')} onClick={() => setSidebarCollapsed(true)} />
        </>
      ) : null}

      <section className="workspace main-surface">
        <header className="workspace-toolbar" data-home={!selectedProject && !standaloneTarget ? 'true' : 'false'} data-testid="workspace-toolbar">
          {sidebarCollapsed ? (
            <button type="button" onClick={() => setSidebarCollapsed(false)} title={t('nav.expandSidebar')}>
              <PanelLeftOpen size={15} aria-hidden="true" />
            </button>
          ) : null}
          {selectedProject || standaloneTarget ? <span className="workspace-toolbar-title">{conversationTitle}</span> : null}
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
            ) : projectInspectorSurface}
          </div>
        ) : (
          <div className="project-conversation-layout" data-inspector={projectInspectorSurface ? 'project' : 'closed'}>
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
            {projectInspectorSurface}
          </div>
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

function sidebarStartsCollapsed(): boolean {
  return window.matchMedia?.('(max-width: 680px)').matches ?? false;
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

interface RuntimeStatusProps {
  loadState: LoadState;
  runtime?: BusinessStatusResult;
  profileLabel: string;
  errorMessage?: string;
  onRetry: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

function RuntimeStatus({ loadState, runtime, profileLabel, errorMessage, onRetry, t }: RuntimeStatusProps) {
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
      <span className="runtime-label">{profileLabel}</span>
      <span className="runtime-dot" aria-hidden="true" />
      {loadState === 'unavailable' ? (
        <button type="button" className="runtime-retry" onClick={() => void onRetry()} title={t('runtime.retry')}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
