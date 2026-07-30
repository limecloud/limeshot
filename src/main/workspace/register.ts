import { ipcMain, shell } from 'electron';

import {
  DESKTOP_IPC,
  type WorkspaceBrowserBoundsInput,
  type WorkspaceBrowserNavigateInput,
  type WorkspaceBrowserTargetInput,
  type WorkspaceContextReadInput,
  type WorkspaceFileReadInput,
  type WorkspaceFileRevealInput,
  type WorkspaceFilesListInput,
  type WorkspaceTerminalCloseInput,
  type WorkspaceTerminalStartInput,
  type WorkspaceTerminalResizeInput,
  type WorkspaceTerminalWriteInput,
} from '../../shared/desktop';
import { WorkspaceBrowserHost } from './browser';
import { readWorkspaceContext } from './context';
import { listWorkspaceFiles, readWorkspaceFile, resolveWorkspaceFile } from './files';
import { WorkspaceTerminalHost } from './terminal';

type ResolveProjectWorkspace = (projectId: string) => Promise<string>;

export function registerWorkspaceIpc(resolveProjectWorkspace: ResolveProjectWorkspace): () => void {
  const terminals = new WorkspaceTerminalHost();
  const browsers = new WorkspaceBrowserHost();

  ipcMain.handle(DESKTOP_IPC.workspaceContextRead, async (_event, input: WorkspaceContextReadInput) => {
    const projectId = requireProjectId(input?.projectId);
    return readWorkspaceContext(await resolveProjectWorkspace(projectId));
  });
  ipcMain.handle(DESKTOP_IPC.workspaceFilesList, async (_event, input: WorkspaceFilesListInput) => {
    const projectId = requireProjectId(input?.projectId);
    return listWorkspaceFiles(await resolveProjectWorkspace(projectId), input);
  });
  ipcMain.handle(DESKTOP_IPC.workspaceFileRead, async (_event, input: WorkspaceFileReadInput) => {
    const projectId = requireProjectId(input?.projectId);
    return readWorkspaceFile(await resolveProjectWorkspace(projectId), input);
  });
  ipcMain.handle(DESKTOP_IPC.workspaceFileReveal, async (_event, input: WorkspaceFileRevealInput): Promise<void> => {
    const projectId = requireProjectId(input?.projectId);
    shell.showItemInFolder(await resolveWorkspaceFile(await resolveProjectWorkspace(projectId), input.path));
  });
  ipcMain.handle(DESKTOP_IPC.workspaceTerminalStart, async (event, input: WorkspaceTerminalStartInput) => {
    const projectId = requireProjectId(input?.projectId);
    return terminals.start(event, await resolveProjectWorkspace(projectId), input);
  });
  ipcMain.handle(DESKTOP_IPC.workspaceTerminalWrite, (event, input: WorkspaceTerminalWriteInput) => terminals.write(event, input?.sessionId, input?.data));
  ipcMain.handle(DESKTOP_IPC.workspaceTerminalResize, (event, input: WorkspaceTerminalResizeInput) => terminals.resize(event, input?.sessionId, input?.cols, input?.rows));
  ipcMain.handle(DESKTOP_IPC.workspaceTerminalClose, (event, input: WorkspaceTerminalCloseInput) => terminals.close(event, input?.sessionId));
  ipcMain.handle(DESKTOP_IPC.workspaceBrowserOpen, (event) => browsers.open(event));
  ipcMain.handle(DESKTOP_IPC.workspaceBrowserNavigate, (event, input: WorkspaceBrowserNavigateInput) => browsers.navigate(event, input, input?.url));
  ipcMain.handle(DESKTOP_IPC.workspaceBrowserBack, (event, input: WorkspaceBrowserTargetInput) => browsers.back(event, input));
  ipcMain.handle(DESKTOP_IPC.workspaceBrowserForward, (event, input: WorkspaceBrowserTargetInput) => browsers.forward(event, input));
  ipcMain.handle(DESKTOP_IPC.workspaceBrowserReload, (event, input: WorkspaceBrowserTargetInput) => browsers.reload(event, input));
  ipcMain.handle(DESKTOP_IPC.workspaceBrowserBounds, (event, input: WorkspaceBrowserBoundsInput) => browsers.setBounds(event, input));
  ipcMain.handle(DESKTOP_IPC.workspaceBrowserClose, (event, input: WorkspaceBrowserTargetInput) => browsers.close(event, input));

  return () => {
    terminals.dispose();
    browsers.dispose();
  };
}

function requireProjectId(projectId: string | undefined): string {
  if (typeof projectId !== 'string' || !projectId) throw new Error('无效的项目标识');
  return projectId;
}
