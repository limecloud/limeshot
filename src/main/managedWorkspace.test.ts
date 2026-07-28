import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { reserveManagedWorkspace } from './managedWorkspace';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('managed workspace', () => {
  it('creates localized projects without asking for an external directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'limeshot-workspaces-'));
    roots.push(root);
    expect(await reserveManagedWorkspace(root, 'zh-CN')).toMatchObject({ name: '新项目' });
    expect(await reserveManagedWorkspace(root, 'zh-CN')).toMatchObject({ name: '新项目 2' });
  });

  it('uses a filesystem-safe request summary as the project name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'limeshot-workspaces-'));
    roots.push(root);
    expect(await reserveManagedWorkspace(root, 'en-US', 'Launch: video / draft?')).toMatchObject({
      name: 'Launch video draft',
    });
  });
});
