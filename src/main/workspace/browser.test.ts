import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  class Emitter {
    listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    on = vi.fn((name: string, listener: (...args: unknown[]) => void) => {
      const values = this.listeners.get(name) ?? new Set();
      values.add(listener);
      this.listeners.set(name, values);
      return this;
    });
    once = this.on;
    off = vi.fn((name: string, listener: (...args: unknown[]) => void) => {
      this.listeners.get(name)?.delete(listener);
      return this;
    });
    emit(name: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(name) ?? []) listener(...args);
    }
  }

  const browserSession = {
    getUserAgent: vi.fn(() => 'Mozilla/5.0 Electron/42.1.0 LimeShot/0.5.0'),
    setUserAgent: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
  };

  class FakeWebContents extends Emitter {
    url = '';
    title = '';
    loading = false;
    destroyed = false;
    session = browserSession;
    navigationHistory = {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(async () => undefined),
      goForward: vi.fn(async () => undefined),
    };
    setUserAgent = vi.fn();
    setWindowOpenHandler = vi.fn();
    getURL = vi.fn(() => this.url);
    getTitle = vi.fn(() => this.title);
    isLoading = vi.fn(() => this.loading);
    isDestroyed = vi.fn(() => this.destroyed);
    close = vi.fn(() => { this.destroyed = true; });
    reload = vi.fn();
    loadURL = vi.fn(async (url: string) => {
      this.loading = true;
      this.emit('did-start-loading');
      this.url = url;
      this.title = 'Loaded page';
      this.emit('did-navigate', {}, url);
      this.loading = false;
      this.emit('page-title-updated', { preventDefault: vi.fn() }, this.title);
      this.emit('did-stop-loading');
    });
  }

  class FakeWebContentsView {
    static instances: FakeWebContentsView[] = [];
    webContents = new FakeWebContents();
    setBounds = vi.fn();
    setVisible = vi.fn();
    setBackgroundColor = vi.fn();
    constructor() { FakeWebContentsView.instances.push(this); }
  }

  const ownerWebContents = new Emitter();
  const owner = Object.assign(new Emitter(), {
    webContents: ownerWebContents,
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    getContentBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    isDestroyed: vi.fn(() => false),
  });

  return { browserSession, FakeWebContentsView, owner, ownerWebContents };
});

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => electron.owner) },
  session: { fromPartition: vi.fn(() => electron.browserSession) },
  WebContentsView: electron.FakeWebContentsView,
}));

import { WorkspaceBrowserHost } from './browser';

beforeEach(() => {
  vi.clearAllMocks();
  electron.FakeWebContentsView.instances.length = 0;
  electron.owner.listeners.clear();
  electron.ownerWebContents.listeners.clear();
});

describe('WorkspaceBrowserHost', () => {
  it('uses a managed HTTP view, clamps bounds, preserves ownership, and destroys on close', async () => {
    const host = new WorkspaceBrowserHost();
    const ownerEvent = event(1);
    const otherEvent = event(2);
    const opened = host.open(ownerEvent.value);
    const view = electron.FakeWebContentsView.instances[0];

    expect(opened.url).toBe('about:blank');
    expect(electron.browserSession.setUserAgent).toHaveBeenCalledWith('Mozilla/5.0', 'zh-CN,zh,en-US,en');
    expect(view.setVisible).toHaveBeenCalledWith(false);
    host.setBounds(ownerEvent.value, { viewId: opened.viewId, visible: true, bounds: { x: 790, y: 590, width: 100, height: 100 } });
    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 790, y: 590, width: 10, height: 10 });
    expect(view.setVisible).toHaveBeenLastCalledWith(true);

    await expect(host.navigate(ownerEvent.value, { viewId: opened.viewId }, 'example.com')).resolves.toMatchObject({
      url: 'https://example.com/',
      title: 'Loaded page',
      loading: false,
    });
    await expect(host.navigate(ownerEvent.value, { viewId: opened.viewId }, 'file:///tmp/private')).rejects.toThrow('HTTP');
    expect(() => host.setBounds(otherEvent.value, { viewId: opened.viewId, visible: false, bounds: { x: 0, y: 0, width: 1, height: 1 } })).toThrow('不属于当前窗口');

    host.close(ownerEvent.value, { viewId: opened.viewId });
    expect(electron.owner.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledOnce();
  });

  it('destroys child views when the renderer reloads', () => {
    const host = new WorkspaceBrowserHost();
    const ownerEvent = event(3);
    host.open(ownerEvent.value);
    const view = electron.FakeWebContentsView.instances[0];

    electron.ownerWebContents.emit('did-start-loading');

    expect(electron.owner.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(view.webContents.close).toHaveBeenCalledOnce();
  });
});

function event(id: number) {
  const sender = {
    id,
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  };
  return { value: { sender } as unknown as Parameters<WorkspaceBrowserHost['open']>[0] };
}
