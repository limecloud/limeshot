import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  Check,
  ChevronRight,
  CircleDotDashed,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  ListTree,
  LoaderCircle,
  Paperclip,
  Plus,
  Puzzle,
  RotateCw,
  Target,
  X,
} from 'lucide-react';

import type {
  AgentCaptureSourceOption,
  AgentComposerAttachment,
  AgentComposerCapability,
  AgentComposerCatalogInput,
  AgentComposerMode,
} from '../../shared/desktop';
import type { TranslationKey } from './i18n';

export interface ComposerProjectOption {
  id: string;
  label: string;
  description: string;
}

interface ComposerAddMenuProps {
  context: AgentComposerCatalogInput;
  attachments: AgentComposerAttachment[];
  capabilities: AgentComposerCapability[];
  mode: AgentComposerMode;
  disabled: boolean;
  projects: ComposerProjectOption[];
  selectedProjectId?: string;
  open?: boolean;
  onAttachmentsChange: (attachments: AgentComposerAttachment[]) => void;
  onCapabilitiesChange: (capabilities: AgentComposerCapability[]) => void;
  onModeChange: (mode: AgentComposerMode) => void;
  onProjectSelect?: (projectId: string | undefined) => void;
  onProjectOpen?: () => void;
  projectOpening?: boolean;
  onPrefill: (text: string) => void;
  onError: (message: string) => void;
  onOpenChange?: (open: boolean) => void;
  t: (key: TranslationKey) => string;
}

type MenuState = 'main' | 'attachments' | 'capture' | 'projects';
type CatalogState = 'idle' | 'loading' | 'ready' | 'failed';

export function ComposerAddMenu({
  context,
  attachments,
  capabilities,
  mode,
  disabled,
  projects,
  selectedProjectId,
  open: controlledOpen,
  onAttachmentsChange,
  onCapabilitiesChange,
  onModeChange,
  onProjectSelect,
  onProjectOpen,
  projectOpening = false,
  onPrefill,
  onError,
  onOpenChange,
  t,
}: ComposerAddMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState>('main');
  const [catalogState, setCatalogState] = useState<CatalogState>('idle');
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof window.limeShot.agent.composerCatalog>>>({
    capabilities: [],
    planModeAvailable: false,
    pluginLoadFailed: false,
  });
  const [captureSources, setCaptureSources] = useState<AgentCaptureSourceOption[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const contextKey = `${context.projectId ?? 'standalone'}\0${context.conversationId ?? ''}\0${context.threadId ?? ''}`;

  const close = useCallback((restoreFocus = false) => {
    if (controlledOpen === undefined) setInternalOpen(false);
    setMenu('main');
    onOpenChange?.(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, [controlledOpen, onOpenChange]);

  const loadCatalog = useCallback(async () => {
    setCatalogState('loading');
    try {
      const result = await window.limeShot.agent.composerCatalog(context);
      setCatalog(result);
      setCatalogState('ready');
    } catch (error) {
      console.error('Failed to load Composer capabilities', error);
      setCatalogState('failed');
    }
  }, [contextKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCatalogState('idle');
    setCatalog({ capabilities: [], planModeAvailable: false, pluginLoadFailed: false });
    setCaptureSources([]);
  }, [contextKey]);

  useEffect(() => {
    if (open && (catalogState === 'idle' || catalogState === 'failed')) void loadCatalog();
  }, [catalogState, loadCatalog, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);

  const toggle = () => {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    if (controlledOpen === undefined) setInternalOpen(true);
    setMenu('main');
    onOpenChange?.(true);
    if (catalogState === 'idle' || catalogState === 'failed') void loadCatalog();
  };

  const pickAttachments = async (selection: 'files' | 'folder') => {
    if (actionPending) return;
    setActionPending(true);
    try {
      const selected = await window.limeShot.agent.pickAttachments({ selection });
      if (selected.length > 0) onAttachmentsChange(mergeById(attachments, selected));
      close(true);
    } catch (error) {
      console.error('Failed to select Composer attachments', error);
      onError(t('composer.add.attachmentFailed'));
    } finally {
      setActionPending(false);
    }
  };

  const openCaptureSources = async () => {
    setMenu('capture');
    if (captureSources.length > 0 || captureLoading) return;
    setCaptureLoading(true);
    try {
      setCaptureSources(await window.limeShot.agent.listCaptureSources());
    } catch (error) {
      console.error('Failed to list capture sources', error);
      onError(t('composer.add.captureFailed'));
    } finally {
      setCaptureLoading(false);
    }
  };

  const captureSource = async (source: AgentCaptureSourceOption) => {
    if (actionPending) return;
    setActionPending(true);
    try {
      const attachment = await window.limeShot.agent.captureSource({ id: source.id });
      onAttachmentsChange(mergeById(attachments, [attachment]));
      close(true);
    } catch (error) {
      console.error('Failed to capture app window', error);
      onError(t('composer.add.captureFailed'));
    } finally {
      setActionPending(false);
    }
  };

  const selectCapability = (capability: AgentComposerCapability) => {
    const selected = capabilities.some((item) => item.id === capability.id);
    onCapabilitiesChange(selected
      ? capabilities.filter((item) => item.id !== capability.id)
      : [...capabilities, capability]);
    if (!selected && capability.recordSkill && capability.defaultPrompt) onPrefill(capability.defaultPrompt);
    close(true);
  };

  const recordSkill = catalog.capabilities.find((capability) => capability.recordSkill);
  const plugins = catalog.capabilities.filter((capability) => !capability.recordSkill);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const planDisabled = catalogState !== 'ready' || !catalog.planModeAvailable;

  return (
    <div className="composer-add-control" ref={rootRef}>
      <button
        ref={triggerRef}
        className="composer-add-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('composer.add.open')}
        title={t('composer.add.open')}
        disabled={disabled}
        onClick={toggle}
      >
        <Plus size={17} aria-hidden="true" />
      </button>

      {open ? (
        <div className="composer-add-menu-layer">
          <div className="composer-add-menu" role="menu" aria-label={t('composer.add.menu')} data-menu={menu} data-testid="composer-add-menu">
            {menu === 'main' ? (
              <>
                <MenuLabel>{t('composer.add.section')}</MenuLabel>
                <MenuItem icon={Paperclip} label={t('composer.add.filesAndFolders')} onClick={() => setMenu('attachments')} trailing />
                <MenuItem icon={AppWindow} label={t('composer.add.captureWindow')} onClick={() => void openCaptureSources()} trailing />
                <MenuItem
                  icon={FolderOpen}
                  label={t('composer.add.project')}
                  detail={selectedProject?.label ?? t('composer.add.projectHint')}
                  disabled={!onProjectSelect && !onProjectOpen}
                  onClick={() => setMenu('projects')}
                  trailing
                />
                <MenuItem
                  icon={Target}
                  label={t('composer.add.goal')}
                  detail={t('composer.add.goalHint')}
                  selected={mode === 'goal'}
                  onClick={() => { onModeChange(mode === 'goal' ? 'default' : 'goal'); close(true); }}
                />
                <MenuItem
                  icon={ListTree}
                  label={t('composer.add.planMode')}
                  detail={t('composer.add.planModeHint')}
                  disabled={planDisabled}
                  selected={mode === 'plan'}
                  onClick={() => { onModeChange(mode === 'plan' ? 'default' : 'plan'); close(true); }}
                />
                {recordSkill ? (
                  <MenuItem icon={CircleDotDashed} label={t('composer.add.recordSkill')} onClick={() => selectCapability(recordSkill)} />
                ) : null}

                <MenuLabel>{t('composer.add.plugins')}</MenuLabel>
                {catalogState === 'loading' ? <MenuStatus icon={LoaderCircle}>{t('composer.add.loadingPlugins')}</MenuStatus> : null}
                {catalogState === 'failed' || catalog.pluginLoadFailed ? (
                  <button className="composer-add-retry" type="button" role="menuitem" onClick={() => void loadCatalog()}>
                    <RotateCw size={14} aria-hidden="true" />
                    <span>{t('composer.add.pluginFailed')}</span>
                  </button>
                ) : null}
                {catalogState === 'ready' && !catalog.pluginLoadFailed && plugins.length === 0 ? (
                  <MenuStatus>{t('composer.add.noPlugins')}</MenuStatus>
                ) : null}
                {plugins.map((capability) => (
                  <MenuItem
                    key={capability.id}
                    icon={pluginIcon(capability.label)}
                    label={capability.label}
                    detail={capability.description}
                    selected={capabilities.some((item) => item.id === capability.id)}
                    onClick={() => selectCapability(capability)}
                  />
                ))}
              </>
            ) : null}

            {menu === 'attachments' ? (
              <>
                <MenuBack label={t('composer.add.filesAndFolders')} onClick={() => setMenu('main')} />
                <MenuItem icon={File} label={t('composer.add.files')} disabled={actionPending} onClick={() => void pickAttachments('files')} />
                <MenuItem icon={Folder} label={t('composer.add.folder')} disabled={actionPending} onClick={() => void pickAttachments('folder')} />
              </>
            ) : null}

            {menu === 'capture' ? (
              <>
                <MenuBack label={t('composer.add.captureWindow')} onClick={() => setMenu('main')} />
                {captureLoading ? <MenuStatus icon={LoaderCircle}>{t('composer.add.captureLoading')}</MenuStatus> : null}
                {!captureLoading && captureSources.length === 0 ? <MenuStatus>{t('composer.add.captureEmpty')}</MenuStatus> : null}
                {captureSources.map((source) => (
                  <button className="composer-capture-source" type="button" role="menuitem" disabled={actionPending} onClick={() => void captureSource(source)} key={source.id}>
                    <img src={source.previewUrl} alt="" />
                    <span>{source.label}</span>
                  </button>
                ))}
              </>
            ) : null}

            {menu === 'projects' ? (
              <>
                <MenuBack label={t('composer.add.project')} onClick={() => setMenu('main')} />
                {onProjectOpen ? (
                  <MenuItem
                    icon={projectOpening ? LoaderCircle : FolderPlus}
                    label={projectOpening ? t('composer.add.openingProject') : t('composer.add.openProject')}
                    detail={t('composer.add.openProjectHint')}
                    disabled={projectOpening}
                    onClick={() => { onProjectOpen(); close(); }}
                  />
                ) : null}
                {onProjectSelect ? (
                  <MenuItem
                    icon={FileText}
                    label={t('composer.add.noProject')}
                    selected={!selectedProjectId}
                    onClick={() => { onProjectSelect(undefined); close(true); }}
                  />
                ) : null}
                {projects.map((project) => (
                  <MenuItem
                    key={project.id}
                    icon={Folder}
                    label={project.label}
                    detail={project.description}
                    selected={project.id === selectedProjectId}
                    onClick={() => { onProjectSelect?.(project.id); close(true); }}
                  />
                ))}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ComposerSelections({
  attachments,
  capabilities,
  mode,
  onAttachmentsChange,
  onCapabilitiesChange,
  onModeChange,
  t,
}: Pick<ComposerAddMenuProps, 'attachments' | 'capabilities' | 'mode' | 'onAttachmentsChange' | 'onCapabilitiesChange' | 'onModeChange' | 't'>) {
  const hasSelections = attachments.length > 0 || capabilities.length > 0 || mode !== 'default';
  if (!hasSelections) return null;
  return (
    <div className="composer-selections" data-testid="composer-selections">
      {attachments.map((attachment) => (
        <SelectionChip
          key={attachment.id}
          icon={attachmentIcon(attachment)}
          label={attachment.label}
          previewUrl={attachment.previewUrl}
          removeLabel={t('composer.add.removeAttachment')}
          onRemove={() => onAttachmentsChange(attachments.filter((item) => item.id !== attachment.id))}
        />
      ))}
      {capabilities.map((capability) => (
        <SelectionChip
          key={capability.id}
          icon={Puzzle}
          label={capability.label}
          removeLabel={t('composer.add.removePlugin')}
          onRemove={() => onCapabilitiesChange(capabilities.filter((item) => item.id !== capability.id))}
        />
      ))}
      {mode !== 'default' ? (
        <SelectionChip
          icon={mode === 'goal' ? Target : ListTree}
          label={t(mode === 'goal' ? 'composer.mode.goal' : 'composer.mode.plan')}
          removeLabel={t('composer.add.disableMode')}
          onRemove={() => onModeChange('default')}
        />
      ) : null}
    </div>
  );
}

function MenuLabel({ children }: { children: string }) {
  return <span className="composer-add-menu-label">{children}</span>;
}

function MenuStatus({ children, icon: Icon }: { children: string; icon?: typeof LoaderCircle }) {
  return <div className="composer-add-menu-status" role="status">{Icon ? <Icon className="spin" size={14} aria-hidden="true" /> : null}{children}</div>;
}

function MenuBack({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="composer-add-menu-back" type="button" role="menuitem" onClick={onClick}>
      <ChevronRight size={14} aria-hidden="true" />
      <strong>{label}</strong>
    </button>
  );
}

function MenuItem({
  icon: Icon,
  label,
  detail,
  disabled,
  selected,
  trailing,
  onClick,
}: {
  icon: typeof Paperclip;
  label: string;
  detail?: string;
  disabled?: boolean;
  selected?: boolean;
  trailing?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="composer-add-menu-item" type="button" role="menuitem" disabled={disabled} data-selected={selected ? 'true' : 'false'} onClick={onClick}>
      <Icon size={15} aria-hidden="true" />
      <span><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span>
      {selected ? <Check size={14} aria-hidden="true" /> : trailing ? <ChevronRight size={14} aria-hidden="true" /> : null}
    </button>
  );
}

function SelectionChip({
  icon: Icon,
  label,
  previewUrl,
  removeLabel,
  onRemove,
}: {
  icon: typeof Paperclip;
  label: string;
  previewUrl?: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="composer-selection-chip">
      {previewUrl ? <img src={previewUrl} alt="" /> : <Icon size={13} aria-hidden="true" />}
      <span>{label}</span>
      <button type="button" onClick={onRemove} aria-label={`${removeLabel}: ${label}`} title={removeLabel}><X size={12} aria-hidden="true" /></button>
    </span>
  );
}

function attachmentIcon(attachment: AgentComposerAttachment) {
  if (attachment.kind === 'folder') return Folder;
  if (attachment.kind === 'image' || attachment.kind === 'appScreenshot') return Image;
  return Paperclip;
}

function pluginIcon(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes('document') || normalized.includes('pdf')) return FileText;
  return Puzzle;
}

function mergeById<T extends { id: string }>(current: T[], additions: T[]): T[] {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...additions.filter((item) => !known.has(item.id))];
}
