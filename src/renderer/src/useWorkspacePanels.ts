import { useState } from 'react';

import type { WorkspacePanelTarget, WorkspaceTabKind } from './WorkspaceChrome';

interface WorkspacePanelState {
  tabs: WorkspaceTabKind[];
  activeTab?: WorkspaceTabKind;
  open: boolean;
}

const CLOSED_PANEL: WorkspacePanelState = { tabs: [], open: false };

export function useWorkspacePanels() {
  const [rightPanel, setRightPanel] = useState<WorkspacePanelState>(CLOSED_PANEL);
  const [bottomPanel, setBottomPanel] = useState<WorkspacePanelState>(CLOSED_PANEL);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);

  const resetWorkspacePanels = () => {
    setRightPanel(CLOSED_PANEL);
    setBottomPanel(CLOSED_PANEL);
    setRightPanelExpanded(false);
  };

  const openWorkspaceTab = (tab: WorkspaceTabKind, target: WorkspacePanelTarget) => {
    const update = (current: WorkspacePanelState): WorkspacePanelState => ({
      tabs: current.tabs.includes(tab) ? current.tabs : [...current.tabs, tab],
      activeTab: tab,
      open: true,
    });
    if (target === 'right') {
      setRightPanel(update);
      if (tab !== 'review') setRightPanelExpanded(true);
    }
    else setBottomPanel(update);
  };

  const activateWorkspaceTab = (tab: WorkspaceTabKind, target: WorkspacePanelTarget) => {
    if (target === 'right') {
      setRightPanel((current) => ({ ...current, activeTab: tab, open: true }));
      if (tab !== 'review') setRightPanelExpanded(true);
    } else {
      setBottomPanel((current) => ({ ...current, activeTab: tab, open: true }));
    }
  };

  const closeWorkspaceTab = (tab: WorkspaceTabKind, target: WorkspacePanelTarget) => {
    const update = (current: WorkspacePanelState): WorkspacePanelState => {
      const tabs = current.tabs.filter((item) => item !== tab);
      return {
        tabs,
        ...(tabs.length > 0 ? { activeTab: current.activeTab === tab ? tabs.at(-1) : current.activeTab } : {}),
        open: tabs.length > 0,
      };
    };
    if (target === 'right') {
      setRightPanel(update);
      setRightPanelExpanded(false);
    } else setBottomPanel(update);
  };

  const closeWorkspacePanel = (target: WorkspacePanelTarget) => {
    if (target === 'right') {
      setRightPanel((current) => ({ ...current, open: false }));
      setRightPanelExpanded(false);
    } else setBottomPanel((current) => ({ ...current, open: false }));
  };

  const toggleWorkspacePanel = (target: WorkspacePanelTarget) => {
    const current = target === 'right' ? rightPanel : bottomPanel;
    if (current.open) {
      closeWorkspacePanel(target);
    } else if (current.activeTab) {
      if (target === 'right') setRightPanel((panel) => ({ ...panel, open: true }));
      else setBottomPanel((panel) => ({ ...panel, open: true }));
    } else {
      openWorkspaceTab(target === 'right' ? 'review' : 'terminal', target);
    }
  };

  return {
    rightPanel,
    bottomPanel,
    rightPanelExpanded,
    setRightPanel,
    setBottomPanel,
    setRightPanelExpanded,
    resetWorkspacePanels,
    openWorkspaceTab,
    activateWorkspaceTab,
    closeWorkspaceTab,
    closeWorkspacePanel,
    toggleWorkspacePanel,
  };
}
