import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Globe2, MoreVertical, RotateCw, X } from 'lucide-react';

import type { WorkspaceBrowserState } from '../../shared/desktop';
import { useWorkspacePanelTitle, type WorkspacePanelTarget } from './WorkspaceChrome';
import type { TranslationKey } from './i18n';

type Translate = (key: TranslationKey) => string;

interface WorkspaceBrowserProps {
  active: boolean;
  target: WorkspacePanelTarget;
  t: Translate;
}

export function WorkspaceBrowser({ active, target, t }: WorkspaceBrowserProps) {
  const [state, setState] = useState<WorkspaceBrowserState>();
  const [address, setAddress] = useState('');
  const [showImport, setShowImport] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<WorkspaceBrowserState | undefined>(undefined);
  stateRef.current = state;

  useWorkspacePanelTitle(target, 'browser', state?.title || t('workspace.browser.newTab'));

  useEffect(() => {
    let disposed = false;
    let openedViewId: string | undefined;
    const unsubscribe = window.limeShot.workspace.browser.subscribe((event) => {
      if (event.viewId !== openedViewId || disposed) return;
      setState(event);
      if (event.url !== 'about:blank') setAddress(event.url);
    });
    void window.limeShot.workspace.browser.open()
      .then((opened) => {
        if (disposed) {
          void window.limeShot.workspace.browser.close({ viewId: opened.viewId });
          return;
        }
        openedViewId = opened.viewId;
        setState(opened);
      })
      .catch((cause: unknown) => {
        if (!disposed) setState({
          viewId: '',
          url: 'about:blank',
          title: '',
          canGoBack: false,
          canGoForward: false,
          loading: false,
          error: cause instanceof Error ? cause.message : t('workspace.browser.failed'),
        });
      });
    return () => {
      disposed = true;
      unsubscribe();
      if (openedViewId) void window.limeShot.workspace.browser.close({ viewId: openedViewId });
    };
  }, []);

  useEffect(() => {
    if (!state?.viewId) return undefined;
    let disposed = false;
    const updateBounds = () => {
      if (disposed) return;
      const element = viewportRef.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      void window.limeShot.workspace.browser.setBounds({
        viewId: state.viewId,
        visible: active && state.url !== 'about:blank',
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      });
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    if (viewportRef.current) observer.observe(viewportRef.current);
    window.addEventListener('resize', updateBounds);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [active, state?.url, state?.viewId]);

  const navigate = async (event: FormEvent) => {
    event.preventDefault();
    if (!state?.viewId || !address.trim()) return;
    try {
      const next = await window.limeShot.workspace.browser.navigate({ viewId: state.viewId, url: address });
      setState(next);
      setAddress(next.url);
    } catch (cause) {
      setState((current) => current ? { ...current, error: cause instanceof Error ? cause.message : t('workspace.browser.failed') } : current);
    }
  };

  const command = async (kind: 'back' | 'forward' | 'reload') => {
    const current = stateRef.current;
    if (!current) return;
    const next = await window.limeShot.workspace.browser[kind]({ viewId: current.viewId });
    setState(next);
    if (next.url !== 'about:blank') setAddress(next.url);
  };

  return (
    <section className="workspace-browser" data-testid={`workspace-${target}-browser`}>
      <div className="workspace-browser-toolbar">
        <button type="button" disabled={!state?.canGoBack} title={t('nav.back')} onClick={() => void command('back')}><ArrowLeft size={15} /></button>
        <button type="button" disabled={!state?.canGoForward} title={t('nav.forward')} onClick={() => void command('forward')}><ArrowRight size={15} /></button>
        <button type="button" disabled={!state || state.url === 'about:blank'} title={t('workspace.browser.reload')} onClick={() => void command('reload')}><RotateCw className={state?.loading ? 'spin' : undefined} size={14} /></button>
        <form onSubmit={navigate}>
          <input aria-label={t('workspace.browser.address')} placeholder={t('workspace.browser.addressPlaceholder')} value={address} onChange={(event) => setAddress(event.target.value)} />
        </form>
        <button type="button" disabled title={t('workspace.browser.more')}><MoreVertical size={15} /></button>
      </div>
      {showImport && state?.url === 'about:blank' ? (
        <div className="workspace-browser-import">
          <span className="workspace-browser-chrome" aria-hidden="true" />
          <span><strong>{t('workspace.browser.importTitle')}</strong><small>{t('workspace.browser.importDescription')}</small></span>
          <button type="button" disabled title={t('workspace.browser.importUnavailable')}>{t('workspace.browser.import')}</button>
          <button type="button" aria-label={t('action.close')} onClick={() => setShowImport(false)}><X size={14} /></button>
        </div>
      ) : null}
      <div className="workspace-browser-viewport" ref={viewportRef}>
        {state?.url === 'about:blank' ? <div className="workspace-browser-empty"><Globe2 size={24} /><strong>{t('workspace.browser.start')}</strong><span>{t('workspace.browser.startHint')}</span></div> : null}
        {state?.error ? <div className="workspace-browser-error">{state.error}</div> : null}
      </div>
    </section>
  );
}
