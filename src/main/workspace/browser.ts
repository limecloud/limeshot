import { randomUUID } from 'node:crypto';
import {
  BrowserWindow,
  session as electronSession,
  WebContentsView,
  type IpcMainInvokeEvent,
  type Rectangle,
  type WebContents,
} from 'electron';

import {
  DESKTOP_IPC,
  type WorkspaceBrowserBoundsInput,
  type WorkspaceBrowserState,
  type WorkspaceBrowserTargetInput,
} from '../../shared/desktop';

interface BrowserViewSession {
  id: string;
  owner: BrowserWindow;
  sender: WebContents;
  senderId: number;
  view: WebContentsView;
  loading: boolean;
  pendingUrl?: string;
  navigationToken: number;
  ownerCloseListener: () => void;
  rendererLoadListener: () => void;
  error?: string;
}

const BROWSER_PARTITION = 'persist:limeshot-browser';
const BROWSER_ACCEPT_LANGUAGES = 'zh-CN,zh,en-US,en';

export class WorkspaceBrowserHost {
  readonly #views = new Map<string, BrowserViewSession>();

  open(event: IpcMainInvokeEvent): WorkspaceBrowserState {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error('无法定位浏览器所属窗口');
    const id = randomUUID();
    const browserSession = electronSession.fromPartition(BROWSER_PARTITION, { cache: true });
    const userAgent = normalizeBrowserUserAgent(browserSession.getUserAgent());
    browserSession.setUserAgent(userAgent, BROWSER_ACCEPT_LANGUAGES);
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: BROWSER_PARTITION,
      },
    });
    const session: BrowserViewSession = {
      id,
      owner,
      sender: event.sender,
      senderId: event.sender.id,
      view,
      loading: false,
      navigationToken: 0,
      ownerCloseListener: () => this.closeOwnedBy(event.sender.id),
      rendererLoadListener: () => this.closeOwnedBy(event.sender.id),
    };
    this.#views.set(id, session);
    owner.contentView.addChildView(view);
    view.setBackgroundColor('#ffffff');
    view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    view.setVisible(false);
    view.webContents.setUserAgent(userAgent);
    view.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    view.webContents.session.setPermissionCheckHandler(() => false);
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedBrowserUrl(url)) void this.navigate(event, { viewId: id }, url);
      return { action: 'deny' };
    });
    view.webContents.on('will-navigate', (navigationEvent, url) => {
      if (!isAllowedBrowserUrl(url)) navigationEvent.preventDefault();
    });
    view.webContents.on('did-start-loading', () => {
      session.loading = true;
      session.error = undefined;
      this.#emit(session);
    });
    view.webContents.on('did-stop-loading', () => {
      this.#clearPendingNavigation(session, view.webContents.getURL());
      session.loading = false;
      this.#emit(session);
    });
    view.webContents.on('did-navigate', (_navigationEvent, url) => {
      this.#clearPendingNavigation(session, url);
      this.#emit(session);
    });
    view.webContents.on('did-navigate-in-page', (_navigationEvent, url) => {
      this.#clearPendingNavigation(session, url);
      this.#emit(session);
    });
    view.webContents.on('page-title-updated', (titleEvent) => {
      titleEvent.preventDefault();
      this.#emit(session);
    });
    view.webContents.on('did-fail-load', (_loadEvent, errorCode, errorDescription, validatedUrl) => {
      if (errorCode === -3) return;
      if (!this.#isCurrentNavigation(session, validatedUrl)) return;
      this.#clearPendingNavigation(session, validatedUrl);
      session.loading = false;
      session.error = errorDescription;
      this.#emit(session);
    });
    owner.once('closed', session.ownerCloseListener);
    owner.webContents.on('did-start-loading', session.rendererLoadListener);
    return this.#state(session);
  }

  async navigate(event: IpcMainInvokeEvent, input: WorkspaceBrowserTargetInput, rawUrl: string): Promise<WorkspaceBrowserState> {
    const session = this.#ownedView(event, input);
    const url = normalizeBrowserUrl(rawUrl);
    const navigationToken = ++session.navigationToken;
    session.pendingUrl = url;
    session.loading = true;
    session.error = undefined;
    this.#emit(session);
    try {
      await session.view.webContents.loadURL(url);
      if (!this.#isCurrentRequest(session, navigationToken, url)) return this.#state(session);
      session.pendingUrl = undefined;
      session.loading = session.view.webContents.isLoading();
    } catch (cause) {
      if (!this.#isCurrentRequest(session, navigationToken, url)) return this.#state(session);
      session.pendingUrl = undefined;
      session.loading = false;
      session.error = cause instanceof Error ? cause.message : String(cause);
      this.#emit(session);
      throw cause;
    }
    return this.#state(session);
  }

  async back(event: IpcMainInvokeEvent, input: WorkspaceBrowserTargetInput): Promise<WorkspaceBrowserState> {
    const session = this.#ownedView(event, input);
    if (session.view.webContents.navigationHistory.canGoBack()) await session.view.webContents.navigationHistory.goBack();
    return this.#state(session);
  }

  async forward(event: IpcMainInvokeEvent, input: WorkspaceBrowserTargetInput): Promise<WorkspaceBrowserState> {
    const session = this.#ownedView(event, input);
    if (session.view.webContents.navigationHistory.canGoForward()) await session.view.webContents.navigationHistory.goForward();
    return this.#state(session);
  }

  async reload(event: IpcMainInvokeEvent, input: WorkspaceBrowserTargetInput): Promise<WorkspaceBrowserState> {
    const session = this.#ownedView(event, input);
    session.view.webContents.reload();
    return this.#state(session);
  }

  setBounds(event: IpcMainInvokeEvent, input: WorkspaceBrowserBoundsInput): void {
    const session = this.#ownedView(event, input);
    if (!input.visible) {
      session.view.setVisible(false);
      return;
    }
    const content = session.owner.getContentBounds();
    const bounds = clampBounds(input.bounds, content);
    session.view.setBounds(bounds);
    session.view.setVisible(bounds.width > 0 && bounds.height > 0);
  }

  close(event: IpcMainInvokeEvent, input: WorkspaceBrowserTargetInput): void {
    const session = this.#ownedView(event, input);
    this.#closeSession(session);
  }

  closeOwnedBy(senderId: number): void {
    for (const session of this.#views.values()) if (session.senderId === senderId) this.#closeSession(session);
  }

  dispose(): void {
    for (const session of [...this.#views.values()]) this.#closeSession(session);
  }

  #ownedView(event: IpcMainInvokeEvent, input: WorkspaceBrowserTargetInput): BrowserViewSession {
    if (!input || typeof input.viewId !== 'string' || !input.viewId) throw new Error('无效的浏览器视图标识');
    const session = this.#views.get(input.viewId);
    if (!session || session.senderId !== event.sender.id) throw new Error('浏览器视图不存在或不属于当前窗口');
    return session;
  }

  #state(session: BrowserViewSession): WorkspaceBrowserState {
    const history = session.view.webContents.navigationHistory;
    const currentUrl = session.pendingUrl ?? session.view.webContents.getURL();
    return {
      viewId: session.id,
      url: currentUrl || 'about:blank',
      title: session.view.webContents.getTitle(),
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      loading: session.loading || Boolean(session.pendingUrl),
      ...(session.error ? { error: session.error } : {}),
    };
  }

  #emit(session: BrowserViewSession): void {
    if (!session.sender.isDestroyed()) session.sender.send(DESKTOP_IPC.workspaceBrowserEvent, this.#state(session));
  }

  #isCurrentRequest(session: BrowserViewSession, navigationToken: number, url: string): boolean {
    return this.#views.get(session.id) === session
      && session.navigationToken === navigationToken
      && session.pendingUrl === url;
  }

  #isCurrentNavigation(session: BrowserViewSession, url: unknown): boolean {
    return !(typeof url === 'string' && session.pendingUrl && url !== session.pendingUrl);
  }

  #clearPendingNavigation(session: BrowserViewSession, url?: unknown): void {
    if (this.#isCurrentNavigation(session, url)) session.pendingUrl = undefined;
  }

  #closeSession(session: BrowserViewSession): void {
    this.#views.delete(session.id);
    session.navigationToken += 1;
    session.pendingUrl = undefined;
    if (!session.owner.isDestroyed()) {
      session.owner.off('closed', session.ownerCloseListener);
      session.owner.webContents.off('did-start-loading', session.rendererLoadListener);
      session.owner.contentView.removeChildView(session.view);
    }
    if (!session.view.webContents.isDestroyed()) session.view.webContents.close();
  }
}

function normalizeBrowserUserAgent(value: string): string {
  const normalized = value
    .replace(/\sElectron\/[^\s]+/giu, '')
    .replace(/\sLimeShot\/[^\s]+/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized || value;
}

function normalizeBrowserUrl(input: string): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 2_048) throw new Error('无效的浏览器地址');
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  if (!isAllowedBrowserUrl(candidate)) throw new Error('浏览器仅支持 HTTP 和 HTTPS 地址');
  return new URL(candidate).toString();
}

function isAllowedBrowserUrl(input: string): boolean {
  try {
    const protocol = new URL(input).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function clampBounds(bounds: Rectangle, contentBounds: Rectangle): Rectangle {
  const x = Math.max(0, Math.min(Math.round(bounds.x), contentBounds.width - 1));
  const y = Math.max(0, Math.min(Math.round(bounds.y), contentBounds.height - 1));
  const width = Math.max(1, Math.min(Math.round(bounds.width), contentBounds.width - x));
  const height = Math.max(1, Math.min(Math.round(bounds.height), contentBounds.height - y));
  return { x, y, width, height };
}
