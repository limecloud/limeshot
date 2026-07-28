import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';

import { BusinessSupervisor } from './business/supervisor';
import { CodexSupervisor } from './codex/supervisor';
import { ConversationBindings } from './conversationBindings';
import { registerIpc } from './ipc';

let business: BusinessSupervisor | undefined;
let codex: CodexSupervisor | undefined;
let unregisterIpc: (() => void) | undefined;

function createWindow(): BrowserWindow {
  const hiddenForSmoke = process.env.LIMESHOT_ELECTRON_SMOKE === '1';
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    show: !hiddenForSmoke,
    title: 'LimeShot',
    backgroundColor: '#f4f6f8',
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.once('ready-to-show', () => { if (!hiddenForSmoke) window.show(); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
}

app.whenReady().then(async () => {
  app.setName('LimeShot');
  const bindings = new ConversationBindings();
  business = new BusinessSupervisor();
  codex = new CodexSupervisor(async (request) => {
    const owner = bindings.read(request.threadId);
    if (!owner) throw new Error('Codex Thread 尚未绑定 LimeShot Project');
    return business!.request('tool/call', {
      context: { projectId: owner.projectId, conversationId: owner.conversationId, threadId: request.threadId, turnId: request.turnId, callId: request.callId },
      tool: request.tool,
      arguments: request.arguments,
    });
  });
  unregisterIpc = registerIpc(business, codex, bindings);
  try { await business.start(); } catch (error) { console.error(error); }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.once('before-quit', () => {
  unregisterIpc?.();
  void codex?.stop();
  void business?.stop();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
