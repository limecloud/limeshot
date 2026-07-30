import type { ReactNode, Ref } from 'react';
import { Folder, Send, Square } from 'lucide-react';

import type {
  AgentComposerAttachment,
  AgentComposerCapability,
  AgentComposerCatalogInput,
  AgentComposerMode,
  AgentModelSettings,
  ConversationTargetInput,
} from '../../shared/desktop';
import { ComposerAddMenu, ComposerSelections, type ComposerProjectOption } from './ComposerAddMenu';
import { ConversationModelMenu } from './ConversationModelMenu';
import type { TranslationKey } from './i18n';

interface ConversationComposerProps {
  surface: 'home' | 'thread';
  context: AgentComposerCatalogInput;
  text: string;
  attachments: AgentComposerAttachment[];
  capabilities: AgentComposerCapability[];
  mode: AgentComposerMode;
  disabled: boolean;
  canSubmit: boolean;
  placeholder: string;
  inputLabel: string;
  currentModel?: string;
  currentEffort?: string;
  modelTarget?: ConversationTargetInput;
  modelSettings?: AgentModelSettings;
  projects?: ComposerProjectOption[];
  selectedProjectId?: string;
  projectLabel?: string;
  leadingControls?: ReactNode;
  inputRef?: Ref<HTMLTextAreaElement>;
  autoFocus?: boolean;
  active?: boolean;
  addMenuOpen?: boolean;
  projectOpening?: boolean;
  onAddMenuOpenChange?: (open: boolean) => void;
  onTextChange: (text: string) => void;
  onAttachmentsChange: (attachments: AgentComposerAttachment[]) => void;
  onCapabilitiesChange: (capabilities: AgentComposerCapability[]) => void;
  onModeChange: (mode: AgentComposerMode) => void;
  onModelSettingsChange?: (settings: AgentModelSettings) => void;
  onProjectSelect?: (projectId: string | undefined) => void;
  onProjectOpen?: () => void;
  onSubmit: () => void;
  onInterrupt?: () => void;
  onError: (message: string) => void;
  t: (key: TranslationKey) => string;
}

export function ConversationComposer({
  surface,
  context,
  text,
  attachments,
  capabilities,
  mode,
  disabled,
  canSubmit,
  placeholder,
  inputLabel,
  currentModel,
  currentEffort,
  modelTarget,
  modelSettings,
  projects = [],
  selectedProjectId,
  projectLabel,
  leadingControls,
  inputRef,
  autoFocus,
  active = false,
  addMenuOpen,
  projectOpening,
  onAddMenuOpenChange,
  onTextChange,
  onAttachmentsChange,
  onCapabilitiesChange,
  onModeChange,
  onModelSettingsChange,
  onProjectSelect,
  onProjectOpen,
  onSubmit,
  onInterrupt,
  onError,
  t,
}: ConversationComposerProps) {
  const modePlaceholder = mode === 'goal'
    ? t('composer.placeholder.goal')
    : mode === 'plan'
      ? t('composer.placeholder.plan')
      : placeholder;
  const menuDisabled = disabled || active;
  const field = (
    <div className={surface === 'home' ? 'home-composer-field' : 'composer-field'}>
      <ComposerSelections
        attachments={attachments}
        capabilities={capabilities}
        mode={mode}
        onAttachmentsChange={onAttachmentsChange}
        onCapabilitiesChange={onCapabilitiesChange}
        onModeChange={onModeChange}
        t={t}
      />
      <textarea
        ref={inputRef}
        autoFocus={autoFocus}
        aria-label={inputLabel}
        placeholder={modePlaceholder}
        value={text}
        rows={2}
        disabled={menuDisabled}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && canSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <footer>
        <div className={surface === 'home' ? 'composer-tools' : 'composer-context'}>
          <ComposerAddMenu
            context={context}
            attachments={attachments}
            capabilities={capabilities}
            mode={mode}
            disabled={menuDisabled}
            projects={projects}
            selectedProjectId={selectedProjectId}
            open={addMenuOpen}
            projectOpening={projectOpening}
            onAttachmentsChange={onAttachmentsChange}
            onCapabilitiesChange={onCapabilitiesChange}
            onModeChange={onModeChange}
            onProjectSelect={onProjectSelect}
            onProjectOpen={onProjectOpen}
            onPrefill={(value) => onTextChange(text.trim() ? `${text}\n${value}` : value)}
            onError={onError}
            onOpenChange={onAddMenuOpenChange}
            t={t}
          />
          {leadingControls}
          {projectLabel ? <span><Folder size={14} aria-hidden="true" />{projectLabel}</span> : null}
        </div>
        <div className="composer-actions">
          <ConversationModelMenu
            target={modelTarget}
            currentModel={modelSettings?.model ?? currentModel}
            currentEffort={modelSettings?.effort ?? currentEffort}
            disabled={menuDisabled}
            onSettingsChange={onModelSettingsChange}
            onError={onError}
            t={t}
          />
          {active && onInterrupt ? (
            <button className={surface === 'home' ? 'home-send-button' : 'send-button'} type="button" onClick={onInterrupt} title={t('agent.interrupt')}>
              <Square size={15} aria-hidden="true" />
            </button>
          ) : (
            <button className={surface === 'home' ? 'home-send-button' : 'send-button'} type="button" disabled={!canSubmit} onClick={onSubmit} title={t('agent.send')}>
              <Send size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );

  return surface === 'thread' ? <footer className="composer-shell">{field}</footer> : field;
}
