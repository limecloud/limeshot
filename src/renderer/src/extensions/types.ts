import type { ComponentType } from 'react';

import type {
  AgentComposerAttachment,
  AgentComposerCapability,
  AgentComposerMode,
  AgentModelSettings,
} from '../../../shared/desktop';
import type { Locale } from '../i18n';

export interface ProductWorkspaceSummary {
  workspaceId: string;
  name: string;
  workspaceLabel: string;
}

export interface ProductHomeContext {
  locale: Locale;
  workspaces: ProductWorkspaceSummary[];
  selectedWorkspaceId?: string;
  composerText: string;
  composerAttachments: AgentComposerAttachment[];
  composerCapabilities: AgentComposerCapability[];
  composerMode: AgentComposerMode;
  modelSettings?: AgentModelSettings;
  onComposerTextChange: (text: string) => void;
  onComposerAttachmentsChange: (attachments: AgentComposerAttachment[]) => void;
  onComposerCapabilitiesChange: (capabilities: AgentComposerCapability[]) => void;
  onComposerModeChange: (mode: AgentComposerMode) => void;
  onModelSettingsChange: (settings: AgentModelSettings) => void;
  onWorkspaceSelect: (workspaceId: string | undefined) => void;
  onWorkspaceOpened: (workspaceId: string) => Promise<void>;
  onSubmit: () => void;
}

export interface ProductWorkspaceContext {
  locale: Locale;
  workspace: ProductWorkspaceSummary;
}

export interface ProductExtension {
  id: string;
  Home: ComponentType<ProductHomeContext>;
  Workspace: ComponentType<ProductWorkspaceContext>;
}
