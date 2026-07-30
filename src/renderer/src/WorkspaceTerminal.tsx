import { useCallback, useEffect, useRef, useState } from 'react';

import { useWorkspacePanelTitle, type WorkspacePanelTarget } from './WorkspaceChrome';
import type { TranslationKey } from './i18n';

type XTerm = import('@xterm/xterm').Terminal;
type FitAddon = import('@xterm/addon-fit').FitAddon;
type Translate = (key: TranslationKey) => string;

interface WorkspaceTerminalProps {
  active: boolean;
  projectId?: string;
  target: WorkspacePanelTarget;
  t: Translate;
}

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 28;
const INPUT_FLUSH_DELAY_MS = 8;

export function WorkspaceTerminal({ active, projectId, target, t }: WorkspaceTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | undefined>(undefined);
  const fitAddonRef = useRef<FitAddon | undefined>(undefined);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const terminalSizeRef = useRef({ cols: DEFAULT_COLS, rows: DEFAULT_ROWS });
  const [title, setTitle] = useState(t('workspace.tab.terminal'));
  const [error, setError] = useState<string>();

  useWorkspacePanelTitle(target, 'terminal', title);

  const fit = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    try { fitAddon.fit(); } catch { return; }
    const nextSize = { cols: terminal.cols || DEFAULT_COLS, rows: terminal.rows || DEFAULT_ROWS };
    if (nextSize.cols === terminalSizeRef.current.cols && nextSize.rows === terminalSizeRef.current.rows) return;
    terminalSizeRef.current = nextSize;
    const sessionId = sessionIdRef.current;
    if (sessionId) void window.limeShot.workspace.terminal.resize({ sessionId, ...nextSize });
  }, []);

  useEffect(() => {
    if (!projectId || !containerRef.current) return undefined;
    let disposed = false;
    let terminal: XTerm | undefined;
    let fitAddon: FitAddon | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let inputFlushTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingInput = '';
    let inputDisposable: { dispose(): void } | undefined;
    let activeSessionId: string | undefined;

    const flushInput = () => {
      if (inputFlushTimer) clearTimeout(inputFlushTimer);
      inputFlushTimer = undefined;
      if (!pendingInput || !activeSessionId || disposed) return;
      const data = pendingInput;
      pendingInput = '';
      void window.limeShot.workspace.terminal.write({ sessionId: activeSessionId, data })
        .catch((cause: unknown) => terminal?.writeln(`\r\n${cause instanceof Error ? cause.message : t('workspace.terminal.failed')}`));
    };
    const unsubscribe = window.limeShot.workspace.terminal.subscribe((event) => {
      if (event.sessionId !== activeSessionId || disposed || !terminal) return;
      if (event.type === 'output') terminal.write(event.data);
      if (event.type === 'exit') terminal.writeln(`\r\n${t('workspace.terminal.exited')} ${event.exitCode ?? ''}`);
    });

    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      .then(async ([{ Terminal }, { FitAddon: XTermFitAddon }]) => {
        if (disposed || !containerRef.current) return;
        terminal = new Terminal({
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          cursorBlink: true,
          convertEol: true,
          fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.35,
          scrollback: 5_000,
          theme: {
            background: '#ffffff', foreground: '#27272a', cursor: '#18181b', cursorAccent: '#ffffff',
            selectionBackground: '#dbeafe', black: '#27272a', red: '#c2414b', green: '#16845b', yellow: '#a16207',
            blue: '#1677c8', magenta: '#a23caf', cyan: '#0e7490', white: '#f8fafc', brightBlack: '#71717a',
            brightRed: '#dc2626', brightGreen: '#16a34a', brightYellow: '#ca8a04', brightBlue: '#2563eb',
            brightMagenta: '#c026d3', brightCyan: '#0891b2', brightWhite: '#ffffff',
          },
        });
        fitAddon = new XTermFitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);
        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;
        fit();

        const result = await window.limeShot.workspace.terminal.start({ projectId, ...terminalSizeRef.current });
        if (disposed) {
          void window.limeShot.workspace.terminal.close({ sessionId: result.sessionId });
          return;
        }
        activeSessionId = result.sessionId;
        sessionIdRef.current = result.sessionId;
        setTitle(result.title);
        inputDisposable = terminal.onData((data) => {
          pendingInput += data;
          if (data.includes('\r') || data.includes('\n')) flushInput();
          else if (!inputFlushTimer) inputFlushTimer = setTimeout(flushInput, INPUT_FLUSH_DELAY_MS);
        });
        resizeObserver = new ResizeObserver(fit);
        resizeObserver.observe(containerRef.current);
        terminal.focus();
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('workspace.terminal.failed')));

    return () => {
      disposed = true;
      unsubscribe();
      inputDisposable?.dispose();
      resizeObserver?.disconnect();
      if (inputFlushTimer) clearTimeout(inputFlushTimer);
      if (activeSessionId) void window.limeShot.workspace.terminal.close({ sessionId: activeSessionId });
      sessionIdRef.current = undefined;
      terminal?.dispose();
      terminalRef.current = undefined;
      fitAddonRef.current = undefined;
    };
  }, [fit, projectId, t]);

  useEffect(() => {
    if (!active) return undefined;
    const frame = requestAnimationFrame(() => {
      fit();
      terminalRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, fit]);

  if (!projectId) return <div className="workspace-tool-message"><span>{t('workspace.projectRequired')}</span></div>;
  return (
    <section className="workspace-terminal" data-testid={`workspace-${target}-terminal`} onClick={() => terminalRef.current?.focus()}>
      <div className="workspace-terminal-xterm" ref={containerRef} />
      {error ? <div className="workspace-tool-message" data-error="true"><span>{error}</span></div> : null}
    </section>
  );
}
