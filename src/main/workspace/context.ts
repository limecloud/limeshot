import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

import type { WorkspaceContextResult } from '../../shared/desktop';

export async function readWorkspaceContext(workspacePath: string): Promise<WorkspaceContextResult> {
  const root = await realpath(workspacePath);
  return {
    rootName: basename(root),
    location: 'local',
    ...await readGitBranch(root),
  };
}

export async function readGitBranch(workspacePath: string): Promise<{ branch?: string }> {
  try {
    const gitEntry = resolve(workspacePath, '.git');
    const gitStats = await stat(gitEntry);
    let headPath = resolve(gitEntry, 'HEAD');
    if (gitStats.isFile()) {
      const pointer = (await readFile(gitEntry, 'utf8')).trim();
      const match = /^gitdir:\s*(.+)$/iu.exec(pointer);
      if (!match?.[1]) return {};
      const gitDirectory = isAbsolute(match[1]) ? match[1] : resolve(dirname(gitEntry), match[1]);
      headPath = resolve(gitDirectory, 'HEAD');
    }
    const head = (await readFile(headPath, 'utf8')).trim();
    const prefix = 'ref: refs/heads/';
    return head.startsWith(prefix) ? { branch: head.slice(prefix.length) } : { branch: head.slice(0, 8) };
  } catch {
    return {};
  }
}
