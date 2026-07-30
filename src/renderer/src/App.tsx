import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitCompareArrows,
  ListFilter,
  PanelBottom,
  PanelLeftOpen,
  PanelRight,
  X,
} from 'lucide-react';

import type { BusinessStatusResult, ProjectSummary } from '@business/generated';
import type {
  AgentConversationSummary,
  AgentComposerAttachment,
  AgentComposerCapability,
  AgentComposerMode,
  AgentProjectConversationSummary,
  AgentEvent,
  AgentInteractionExternalOpenInput,
  AgentInteractionSubmitInput,
  AgentModelSettings,
  AgentPendingInteractionProjection,
  AgentThreadInspectResult,
  AgentTurnProjection,
  ConversationTargetInput,
  ConversationStartResult,
} from '../../shared/desktop';
import { AppSidebar } from './AppSidebar';
import {
  recoverInteractions,
  RuntimeStatus,
  setInteractionStatus,
  sidebarStartsCollapsed,
  titleFromTurns,
  upsertInteraction,
} from './AppSupport';
import { applyAgentActivityEvent, createAgentActivityState } from './agentActivityState';
import { createAgentEventBatcher } from './agentEventBatcher';
import { applyAgentEvent, runningTurn } from './agentState';
import { ConversationComposer } from './ConversationComposer';
import { DiffStats } from './ConversationReview';
import { ConversationTimeline } from './ConversationTimeline';
import { summarizeConversationChanges } from './conversationChanges';
import { createTranslator, resolveLocale } from './i18n';
import { PendingInteractions } from './PendingInteractions';
import { EnvironmentMenu } from './EnvironmentMenu';
import {
  WorkspaceChromeProvider,
  WorkspacePanelSurfaces,
  WorkspacePanelTabs,
  type WorkspacePanelTarget,
} from './WorkspaceChrome';
import { ExtensionHost } from './extensions/ExtensionHost';
import { useWorkspacePanels } from './useWorkspacePanels';

type LoadState = 'loading' | 'ready' | 'unavailable';
type ConversationLoadState = 'idle' | 'loading' | 'ready' | 'readOnly' | 'unavailable';
interface StandaloneTarget { conversationId: string; threadId?: string }
interface PendingFirstTurn {
  targetKey: string;
  text: string;
  attachmentIds: string[];
  capabilityIds: string[];
  mode: AgentComposerMode;
  initialModelSettings?: AgentModelSettings;
}
const MAIN_CONVERSATION_ID = 'main';

export function App() {
  const locale = useMemo(() => resolveLocale(navigator.language), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [runtime, setRuntime] = useState<BusinessStatusResult>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [standaloneConversations, setStandaloneConversations] = useState<AgentConversationSummary[]>([]);
  const [projectConversations, setProjectConversations] = useState<Record<string, AgentProjectConversationSummary[]>>({});
  const [projectConversationFailedIds, setProjectConversationFailedIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [draftProjectId, setDraftProjectId] = useState<string>();
  const [extensionWorkspaceId, setExtensionWorkspaceId] = useState<string>();
  const [standaloneTarget, setStandaloneTarget] = useState<StandaloneTarget>();
  const [conversationId, setConversationId] = useState(MAIN_CONVERSATION_ID);
  const [activeSurface, setActiveSurface] = useState<'activity'>();
  const [selectedChangePath, setSelectedChangePath] = useState<string>();
  const {
    rightPanel,
    bottomPanel,
    rightPanelExpanded,
    setRightPanelExpanded,
    resetWorkspacePanels,
    openWorkspaceTab,
    activateWorkspaceTab,
    closeWorkspaceTab,
    closeWorkspacePanel,
    toggleWorkspacePanel,
  } = useWorkspacePanels();
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
  const [composerText, setComposerText] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<AgentComposerAttachment[]>([]);
  const [composerCapabilities, setComposerCapabilities] = useState<AgentComposerCapability[]>([]);
  const [composerMode, setComposerMode] = useState<AgentComposerMode>('default');
  const [draftModelSettings, setDraftModelSettings] = useState<AgentModelSettings>();
  const [sending, setSending] = useState(false);
  const pendingFirstTurn = useRef<PendingFirstTurn | undefined>(undefined);
  const threadNavigationRequest = useRef(0);
  const resetComposer = useCallback(() => {
    setComposerText('');
    setComposerAttachments([]);
    setComposerCapabilities([]);
    setComposerMode('default');
  }, []);
  const completeComposerSubmission = useCallback((submittedMode: AgentComposerMode) => {
    setComposerText('');
    setComposerAttachments([]);
    setComposerCapabilities([]);
    if (submittedMode === 'goal') setComposerMode('default');
  }, []);
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
      setProjects(projectResult);
      setStandaloneConversations(conversationResult);
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
    const pending = pendingFirstTurn.current;
    const initialModelSettings = pending?.targetKey === targetKey ? pending.initialModelSettings : undefined;
    const startRequest = initialModelSettings ? { ...request, initialModelSettings } : request;
    let disposed = false;
    setConversationLoadState('loading');
    void window.limeShot.agent.startConversation(startRequest)
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
        const firstTurn = pendingFirstTurn.current;
        if (firstTurn?.targetKey === targetKey && result.access === 'active') {
          pendingFirstTurn.current = undefined;
          setSending(true);
          void window.limeShot.agent.startTurn({
            projectId: request.projectId,
            conversationId: result.conversationId,
            threadId: result.threadId,
            text: firstTurn.text,
            attachmentIds: firstTurn.attachmentIds,
            capabilityIds: firstTurn.capabilityIds,
            mode: firstTurn.mode,
            ...(firstTurn.initialModelSettings ? { modelSettings: firstTurn.initialModelSettings } : {}),
          }).then(() => completeComposerSubmission(firstTurn.mode)).catch((error) => {
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
  }, [completeComposerSubmission, conversationId, selectedProjectId, standaloneTarget, t]);

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

  const collapseSidebarOnNarrowWindow = () => {
    if (window.matchMedia?.('(max-width: 680px)').matches) setSidebarCollapsed(true);
  };
  const selectedProject = projects.find((project) => project.projectId === selectedProjectId);
  const extensionWorkspace = projects.find((project) => project.projectId === extensionWorkspaceId);
  const activeTurn = conversation ? runningTurn(conversation.turns) : undefined;
  const threadView = threadViews.at(-1);
  const visibleThreadId = threadView?.threadId ?? conversation?.threadId;
  const visibleTurns = threadView?.turns ?? conversation?.turns ?? [];
  const conversationChanges = useMemo(() => summarizeConversationChanges(visibleTurns), [visibleTurns]);

  useEffect(() => {
    setSelectedChangePath(undefined);
  }, [visibleThreadId]);
  const visibleThreadActivity = visibleThreadId ? activityState.threads[visibleThreadId] : undefined;
  const conversationThreadActivity = conversation ? activityState.threads[conversation.threadId] : undefined;
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
  const currentModel = conversationThreadActivity?.settings?.model
    ?? conversationThreadActivity?.model?.current
    ?? conversation?.modelSettings?.model;
  const currentEffort = conversationThreadActivity?.settings?.effort ?? conversation?.modelSettings?.effort;
  const currentModelSettings = currentModel && currentEffort ? { model: currentModel, effort: currentEffort } : undefined;
  const hasComposerInput = Boolean(composerText.trim() || composerAttachments.length > 0 || composerCapabilities.length > 0);
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
    && hasComposerInput
    && (composerMode !== 'goal' || composerText.trim()),
  );

  const openReview = (path?: string, target: WorkspacePanelTarget = 'right') => {
    setSelectedChangePath(path ?? conversationChanges.files[0]?.path);
    openWorkspaceTab('review', target);
  };

  const openProject = (projectId: string) => {
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
    setActiveSurface(undefined);
    resetWorkspacePanels();
    setExtensionWorkspaceId(undefined);
    setAgentError(undefined);
    resetComposer();
    collapseSidebarOnNarrowWindow();
  };

  const openStandalone = (threadId: string) => {
    pendingFirstTurn.current = undefined;
    setSelectedProjectId(undefined);
    setDraftProjectId(undefined);
    setStandaloneTarget({ conversationId: threadId, threadId });
    setActiveSurface(undefined);
    resetWorkspacePanels();
    setExtensionWorkspaceId(undefined);
    setSending(false);
    resetComposer();
    collapseSidebarOnNarrowWindow();
  };

  const openProjectConversation = (projectId: string, nextConversationId: string) => {
    pendingFirstTurn.current = undefined;
    setStandaloneTarget(undefined);
    setDraftProjectId(undefined);
    setSending(false);
    setSelectedProjectId(projectId);
    setConversationId(nextConversationId);
    setActiveSurface(undefined);
    resetWorkspacePanels();
    setExtensionWorkspaceId(undefined);
    resetComposer();
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
    resetComposer();
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
      setActiveSurface(undefined);
      resetComposer();
    }
    if (extensionWorkspaceId === projectId) setExtensionWorkspaceId(undefined);
  };

  const refreshProjects = async (selectedWorkspaceId: string) => {
    const nextProjects = await window.limeShot.project.list();
    setProjects(nextProjects);
    setDraftProjectId(selectedWorkspaceId);
    setComposerCapabilities([]);
  };

  const beginFromHome = () => {
    const subject = composerText.trim();
    if (!hasComposerInput || (composerMode === 'goal' && !subject)) return;
    const firstTurn = {
      text: subject,
      attachmentIds: composerAttachments.map((attachment) => attachment.id),
      capabilityIds: composerCapabilities.map((capability) => capability.id),
      mode: composerMode,
      initialModelSettings: draftModelSettings,
    };
    if (draftProjectId) {
      const nextConversationId = `conversation-${crypto.randomUUID()}`;
      pendingFirstTurn.current = { targetKey: `project:${draftProjectId}:${nextConversationId}`, ...firstTurn };
      setStandaloneTarget(undefined);
      setSelectedProjectId(draftProjectId);
      setDraftProjectId(undefined);
      setConversationId(nextConversationId);
    } else {
      const nextConversationId = `standalone-${crypto.randomUUID()}`;
      pendingFirstTurn.current = { targetKey: `standalone:${nextConversationId}`, ...firstTurn };
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
    setActiveSurface(undefined);
    setExtensionWorkspaceId(undefined);
    setAgentError(undefined);
    resetComposer();
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
        attachmentIds: composerAttachments.map((attachment) => attachment.id),
        capabilityIds: composerCapabilities.map((capability) => capability.id),
        mode: composerMode,
        ...(currentModelSettings ? { modelSettings: currentModelSettings } : {}),
      });
      completeComposerSubmission(composerMode);
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
    <WorkspaceChromeProvider>
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
              setExtensionWorkspaceId(projectId);
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
        <header
          className="workspace-toolbar"
          data-home={!selectedProject && !standaloneTarget && !extensionWorkspace ? 'true' : 'false'}
          data-right-panel={rightPanel.open ? 'true' : 'false'}
          data-panel-expanded={rightPanel.open && rightPanelExpanded ? 'true' : 'false'}
          data-testid="workspace-toolbar"
        >
          <div className="workspace-toolbar-conversation">
            {sidebarCollapsed ? (
              <button type="button" onClick={() => setSidebarCollapsed(false)} title={t('nav.expandSidebar')}>
                <PanelLeftOpen size={15} aria-hidden="true" />
              </button>
            ) : null}
            {extensionWorkspace ? (
              <span className="workspace-toolbar-title">{extensionWorkspace.name}</span>
            ) : selectedProject || standaloneTarget ? (
              <span className="workspace-toolbar-title">{conversationTitle}</span>
            ) : null}
            <span className="workspace-toolbar-spacer" />
            {selectedProject || standaloneTarget ? (
              <>
                <button
                  className="workspace-environment-toggle"
                  type="button"
                  data-active={activeSurface === 'activity' ? 'true' : 'false'}
                  onClick={() => setActiveSurface((current) => current === 'activity' ? undefined : 'activity')}
                  title={t('environment.title')}
                >
                  <ListFilter size={15} aria-hidden="true" />
                </button>
                <button
                  className="workspace-review-toggle"
                  type="button"
                  data-active={rightPanel.open && rightPanel.activeTab === 'review' ? 'true' : 'false'}
                  data-testid="workspace-review-toggle"
                  onClick={() => openReview()}
                  title={t('inspector.openReview')}
                >
                  <GitCompareArrows size={15} aria-hidden="true" />
                  <span className="workspace-review-toggle-label">{t('inspector.changes')}</span>
                  <DiffStats additions={conversationChanges.additions} deletions={conversationChanges.deletions} />
                </button>
                <button
                  className="workspace-panel-toggle"
                  type="button"
                  data-active={bottomPanel.open ? 'true' : 'false'}
                  onClick={() => toggleWorkspacePanel('bottom')}
                  title={t('workspace.toggleBottomPanel')}
                  aria-label={t('workspace.toggleBottomPanel')}
                >
                  <PanelBottom size={15} aria-hidden="true" />
                </button>
                <button
                  className="workspace-panel-toggle"
                  type="button"
                  data-active={rightPanel.open ? 'true' : 'false'}
                  onClick={() => toggleWorkspacePanel('right')}
                  title={t('workspace.toggleSidePanel')}
                  aria-label={t('workspace.toggleSidePanel')}
                >
                  <PanelRight size={15} aria-hidden="true" />
                </button>
              </>
            ) : null}
            {extensionWorkspace ? (
              <button
                type="button"
                onClick={() => setExtensionWorkspaceId(undefined)}
                title={t('action.close')}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {rightPanel.open ? (
            <WorkspacePanelTabs
              target="right"
              tabs={rightPanel.tabs}
              activeTab={rightPanel.activeTab}
              expanded={rightPanelExpanded}
              onActivate={(tab) => activateWorkspaceTab(tab, 'right')}
              onAdd={(tab) => openWorkspaceTab(tab, 'right')}
              onCloseTab={(tab) => closeWorkspaceTab(tab, 'right')}
              onClosePanel={() => closeWorkspacePanel('right')}
              onExpandedChange={setRightPanelExpanded}
              t={t}
            />
          ) : null}
        </header>

        {extensionWorkspace ? (
          <ExtensionHost
            extensionId="production"
            surface="workspace"
            context={{
              locale,
              workspace: {
                workspaceId: extensionWorkspace.projectId,
                name: extensionWorkspace.name,
                workspaceLabel: extensionWorkspace.workspaceName,
              },
            }}
          />
        ) : selectedProject || standaloneTarget ? (
          <div
            className="workspace-thread-shell"
            data-right-panel={rightPanel.open ? 'true' : 'false'}
            data-panel-expanded={rightPanel.open && rightPanelExpanded ? 'true' : 'false'}
            data-testid="workspace-thread-shell"
          >
            <div className="workspace-primary" data-bottom-panel={bottomPanel.open ? 'true' : 'false'}>
              <section
                className="conversation-workspace"
                data-testid="agent-panel"
                data-agent-state={conversationLoadState}
                data-conversation-id={conversation?.conversationId ?? ''}
                data-thread-id={conversation?.threadId ?? ''}
              >
              <ConversationTimeline
                turns={visibleTurns}
                loadState={threadView ? 'readOnly' : conversationLoadState}
                errorMessage={threadViewError ?? agentError}
                t={t}
                threadContext={threadView ? {
                  title: threadView.agentNickname || threadView.name || t('agent.subThread'),
                  ...(threadView.agentRole ? { subtitle: threadView.agentRole } : {}),
                } : undefined}
                onBackThread={threadView ? closeSubThread : undefined}
                onOpenThread={(threadId) => void openSubThread(threadId)}
                onOpenChanges={(path) => {
                  openReview(path);
                }}
                openingThreadId={openingThreadId}
              />
              {activeSurface === 'activity' ? (
                <EnvironmentMenu
                  projectId={selectedProject?.projectId}
                  workspaceLabel={selectedProject?.workspaceName ?? visibleThreadActivity?.settings?.cwd}
                  turns={visibleTurns}
                  changes={conversationChanges}
                  onOpenReview={() => openReview()}
                  onOpenTerminal={() => openWorkspaceTab('terminal', 'right')}
                  onOpenTasks={() => openWorkspaceTab('tasks', 'right')}
                  onOpenBrowser={() => openWorkspaceTab('browser', 'right')}
                  onOpenFiles={() => openWorkspaceTab('files', 'right')}
                  onClose={() => setActiveSurface(undefined)}
                  t={t}
                />
              ) : null}
              <PendingInteractions
                interactions={interactions}
                currentThreadId={threadView?.threadId ?? conversation?.threadId}
                turns={visibleTurns}
                onSubmit={submitPendingInteraction}
                onOpenExternal={openInteractionExternal}
                errorMessage={interactionError}
                t={t}
              />
              <ConversationComposer
                surface="thread"
                context={{
                  projectId: selectedProject?.projectId ?? null,
                  conversationId: conversation?.conversationId,
                  threadId: conversation?.threadId,
                }}
                text={composerText}
                attachments={composerAttachments}
                capabilities={composerCapabilities}
                mode={composerMode}
                disabled={Boolean(threadView) || runtimeReadOnly || conversationLoadState !== 'ready' || sending}
                active={Boolean(!threadView && activeTurn)}
                canSubmit={canSend}
                placeholder={threadView ? t('agent.subThreadReadOnly') : t('agent.inputPlaceholder')}
                inputLabel={threadView ? t('agent.subThreadReadOnly') : t('agent.inputPlaceholder')}
                modelTarget={conversation ? {
                  projectId: selectedProject?.projectId ?? null,
                  conversationId: conversation.conversationId,
                  threadId: conversation.threadId,
                } : undefined}
                currentModel={currentModel}
                currentEffort={currentEffort}
                projectLabel={selectedProject?.workspaceName}
                onTextChange={setComposerText}
                onAttachmentsChange={setComposerAttachments}
                onCapabilitiesChange={setComposerCapabilities}
                onModeChange={setComposerMode}
                onSubmit={() => void sendTurn()}
                onInterrupt={() => void interruptTurn()}
                onError={setAgentError}
                t={t}
              />
              </section>

              {bottomPanel.open ? (
                <section className="workspace-bottom-panel" aria-label={t('workspace.bottomPanel')}>
                  <WorkspacePanelTabs
                    target="bottom"
                    tabs={bottomPanel.tabs}
                    activeTab={bottomPanel.activeTab}
                    onActivate={(tab) => activateWorkspaceTab(tab, 'bottom')}
                    onAdd={(tab) => openWorkspaceTab(tab, 'bottom')}
                    onCloseTab={(tab) => closeWorkspaceTab(tab, 'bottom')}
                    onClosePanel={() => closeWorkspacePanel('bottom')}
                    t={t}
                  />
                  <WorkspacePanelSurfaces
                    tabs={bottomPanel.tabs}
                    activeTab={bottomPanel.activeTab}
                    target="bottom"
                    turns={visibleTurns}
                    projectId={selectedProject?.projectId}
                    selectedChangePath={selectedChangePath}
                    onSelectedChangePathChange={setSelectedChangePath}
                    onOpenReview={(path) => openReview(path, 'bottom')}
                    onOpenThread={(threadId) => void openSubThread(threadId)}
                    openingThreadId={openingThreadId}
                    t={t}
                  />
                </section>
              ) : null}
            </div>

            {rightPanel.open ? (
              <aside className="workspace-right-panel" aria-label={t('workspace.rightPanel')}>
                <WorkspacePanelSurfaces
                  tabs={rightPanel.tabs}
                  activeTab={rightPanel.activeTab}
                  target="right"
                  turns={visibleTurns}
                  projectId={selectedProject?.projectId}
                  selectedChangePath={selectedChangePath}
                  onSelectedChangePathChange={setSelectedChangePath}
                  onOpenReview={(path) => openReview(path, 'right')}
                  onOpenThread={(threadId) => void openSubThread(threadId)}
                  openingThreadId={openingThreadId}
                  t={t}
                />
              </aside>
            ) : null}
          </div>
        ) : (
          <div className="project-conversation-layout" data-workspace-mode="conversation">
            <ExtensionHost
              extensionId="production"
              surface="home"
              context={{
                locale,
                workspaces: projects.map((project) => ({
                  workspaceId: project.projectId,
                  name: project.name,
                  workspaceLabel: project.workspaceName,
                })),
                selectedWorkspaceId: draftProjectId,
                composerText,
                composerAttachments,
                composerCapabilities,
                composerMode,
                modelSettings: draftModelSettings,
                onComposerTextChange: setComposerText,
                onComposerAttachmentsChange: setComposerAttachments,
                onComposerCapabilitiesChange: setComposerCapabilities,
                onComposerModeChange: setComposerMode,
                onModelSettingsChange: setDraftModelSettings,
                onWorkspaceSelect: (workspaceId) => {
                  setDraftProjectId(workspaceId);
                  setComposerCapabilities([]);
                },
                onWorkspaceOpened: refreshProjects,
                onSubmit: beginFromHome,
              }}
            />
          </div>
        )}
      </section>
    </main>
    </WorkspaceChromeProvider>
  );
}
