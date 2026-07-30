import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listWorkspaceFiles, readWorkspaceFile } from './files';

let fixtureRoot = '';
let workspace = '';

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'limeshot-files-'));
  workspace = join(fixtureRoot, 'workspace');
  await mkdir(join(workspace, 'src'), { recursive: true });
  await writeFile(join(workspace, 'AGENTS.md'), '# Workspace\n', 'utf8');
  await writeFile(join(workspace, 'src', 'app.ts'), 'export const ready = true;\n', 'utf8');
});

afterEach(async () => {
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

describe('workspace files', () => {
  it('lists directories first and reads project-scoped text files', async () => {
    const root = await listWorkspaceFiles(workspace, { projectId: 'project-1' });
    expect(root.rootName).toBe('workspace');
    expect(root.entries.map((entry) => [entry.name, entry.kind])).toEqual([
      ['src', 'directory'],
      ['AGENTS.md', 'file'],
    ]);

    await expect(readWorkspaceFile(workspace, { projectId: 'project-1', path: 'AGENTS.md' })).resolves.toMatchObject({
      path: 'AGENTS.md',
      kind: 'markdown',
      content: '# Workspace\n',
    });
  });

  it('rejects traversal, absolute paths, binary files, and symlinks outside the workspace', async () => {
    const outside = join(fixtureRoot, 'outside.txt');
    await writeFile(outside, 'private\n', 'utf8');
    await symlink(outside, join(workspace, 'outside-link'));
    await writeFile(join(workspace, 'binary.bin'), Buffer.from([0, 1, 2]));

    await expect(readWorkspaceFile(workspace, { projectId: 'project-1', path: '../outside.txt' })).rejects.toThrow('禁止越界');
    await expect(readWorkspaceFile(workspace, { projectId: 'project-1', path: outside })).rejects.toThrow('无效的工作区相对路径');
    await expect(readWorkspaceFile(workspace, { projectId: 'project-1', path: 'outside-link' })).rejects.toThrow('禁止越界');
    await expect(readWorkspaceFile(workspace, { projectId: 'project-1', path: 'binary.bin' })).rejects.toThrow('二进制');
  });
});
