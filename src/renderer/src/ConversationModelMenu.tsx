import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react';

import type { AgentModelOption, AgentModelSettings, ConversationTargetInput } from '../../shared/desktop';
import type { TranslationKey } from './i18n';

interface ConversationModelMenuProps {
  target?: ConversationTargetInput;
  currentModel?: string;
  currentEffort?: string;
  disabled: boolean;
  onSettingsChange?: (settings: AgentModelSettings) => void;
  onError: (message: string) => void;
  t: (key: TranslationKey) => string;
}

type CatalogState = 'idle' | 'loading' | 'ready' | 'failed';
type Submenu = 'model' | 'effort';

export function ConversationModelMenu({ target, currentModel, currentEffort, disabled, onSettingsChange, onError, t }: ConversationModelMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu>();
  const [catalogState, setCatalogState] = useState<CatalogState>('idle');
  const [models, setModels] = useState<AgentModelOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const selectedModel = useMemo(() => {
    const current = currentModel ? models.find((model) => model.model === currentModel) : undefined;
    return current ?? (!currentModel ? models.find((model) => model.isDefault) ?? models[0] : undefined);
  }, [currentModel, models]);
  const selectedEffort = currentEffort ?? selectedModel?.defaultReasoningEffort;
  const modelLabel = selectedModel?.displayName
    ?? currentModel
    ?? (catalogState === 'idle' || catalogState === 'loading' ? t('composer.model.loading') : t('composer.model.unavailable'));
  const effortLabel = selectedEffort ? reasoningEffortLabel(selectedEffort, t) : t('composer.model.effort.default');

  const loadModels = useCallback(async () => {
    setCatalogState('loading');
    setActionError(undefined);
    try {
      const result = await window.limeShot.agent.listModels();
      setModels(result.models);
      setCatalogState('ready');
    } catch (error) {
      console.error('Failed to load Codex models', error);
      setCatalogState('failed');
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSubmenu(undefined);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setSubmenu(undefined);
    setActionError(undefined);
  }, [target?.threadId]);

  useEffect(() => {
    if (!disabled) void loadModels();
  }, [disabled, loadModels, target?.threadId]);

  useEffect(() => {
    if (target || currentModel || catalogState !== 'ready' || !selectedModel || !onSettingsChange) return;
    onSettingsChange({ model: selectedModel.model, effort: selectedModel.defaultReasoningEffort });
  }, [catalogState, currentModel, onSettingsChange, selectedModel, target]);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setSubmenu(undefined);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const toggleMenu = () => {
    if (disabled) return;
    if (open) {
      closeMenu();
      return;
    }
    setOpen(true);
    setSubmenu(undefined);
    if (catalogState === 'idle' || catalogState === 'failed') void loadModels();
  };

  const updateSettings = async (model: AgentModelOption, effort: string) => {
    if (saving) return;
    setSaving(true);
    setActionError(undefined);
    try {
      const settings = { model: model.model, effort };
      if (target) await window.limeShot.agent.updateThreadSettings({ ...target, ...settings });
      else if (onSettingsChange) onSettingsChange(settings);
      closeMenu(true);
    } catch (error) {
      console.error('Failed to update Codex thread settings', error);
      const message = t('composer.model.updateFailed');
      setActionError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  const selectModel = (model: AgentModelOption) => {
    const effort = model.supportedReasoningEfforts.some((option) => option.effort === selectedEffort)
      ? selectedEffort!
      : model.defaultReasoningEffort;
    void updateSettings(model, effort);
  };

  const selectEffort = (effort: string) => {
    if (selectedModel) void updateSettings(selectedModel, effort);
  };

  const menuDisabled = catalogState !== 'ready' || saving;

  return (
    <div
      className="composer-model-control"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeMenu(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        className="composer-model-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('composer.model.open')}
        disabled={disabled}
        onClick={toggleMenu}
        data-testid="composer-model-trigger"
        data-model={selectedModel?.model ?? currentModel ?? ''}
        data-effort={selectedEffort ?? ''}
      >
        <span>{modelLabel}</span>
        <span>{effortLabel}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open ? (
        <div className="composer-model-menu-layer">
          <div className="composer-model-menu" role="menu" aria-label={t('composer.model.menu')}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={submenu === 'model'}
              disabled={menuDisabled}
              onMouseEnter={() => setSubmenu('model')}
              onFocus={() => setSubmenu('model')}
              onClick={() => setSubmenu('model')}
            >
              <strong>{t('composer.model.label')}</strong>
              <span>{modelLabel}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={submenu === 'effort'}
              disabled={menuDisabled || !selectedModel}
              onMouseEnter={() => setSubmenu('effort')}
              onFocus={() => setSubmenu('effort')}
              onClick={() => setSubmenu('effort')}
            >
              <strong>{t('composer.model.reasoning')}</strong>
              <span>{effortLabel}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
            {catalogState === 'loading' ? (
              <div className="composer-model-menu-status" role="status">
                <LoaderCircle className="spin" size={14} aria-hidden="true" />
                {t('composer.model.loading')}
              </div>
            ) : null}
            {catalogState === 'failed' ? (
              <div className="composer-model-menu-status" role="alert">
                <span>{t('composer.model.failed')}</span>
                <button type="button" onClick={() => void loadModels()}>{t('composer.model.retry')}</button>
              </div>
            ) : null}
            {catalogState === 'ready' && models.length === 0 ? (
              <div className="composer-model-menu-status" role="status">{t('composer.model.unavailable')}</div>
            ) : null}
            {actionError ? <div className="composer-model-menu-status" role="alert">{actionError}</div> : null}
          </div>

          {submenu === 'model' && catalogState === 'ready' ? (
            <div className="composer-model-submenu" role="menu" aria-label={t('composer.model.label')}>
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={model.model === currentModel}
                  data-model={model.model}
                  disabled={saving}
                  onClick={() => selectModel(model)}
                >
                  <span>{model.displayName}</span>
                  <span className="composer-model-check">{model.model === currentModel ? <Check size={15} aria-hidden="true" /> : null}</span>
                </button>
              ))}
            </div>
          ) : null}

          {submenu === 'effort' && selectedModel && catalogState === 'ready' ? (
            <div className="composer-model-submenu composer-effort-submenu" role="menu" aria-label={t('composer.model.reasoning')}>
              {selectedModel.supportedReasoningEfforts.map((option) => (
                <button
                  key={option.effort}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.effort === selectedEffort}
                  data-effort={option.effort}
                  disabled={saving}
                  onClick={() => selectEffort(option.effort)}
                >
                  <span>
                    <strong>{reasoningEffortLabel(option.effort, t)}</strong>
                    {option.effort === 'max' || option.effort === 'ultra'
                      ? <small>{t('composer.model.usageFaster')}</small>
                      : null}
                  </span>
                  <span className="composer-model-check">{option.effort === selectedEffort ? <Check size={15} aria-hidden="true" /> : null}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function reasoningEffortLabel(effort: string, t: (key: TranslationKey) => string): string {
  const keyByEffort: Record<string, TranslationKey> = {
    none: 'composer.model.effort.none',
    minimal: 'composer.model.effort.minimal',
    low: 'composer.model.effort.low',
    medium: 'composer.model.effort.medium',
    high: 'composer.model.effort.high',
    xhigh: 'composer.model.effort.xhigh',
    max: 'composer.model.effort.max',
    ultra: 'composer.model.effort.ultra',
  };
  return keyByEffort[effort] ? t(keyByEffort[effort]) : effort;
}
