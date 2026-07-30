import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readWorkspaceContext } from './context';

let fixtureRoot = '';

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'limeshot-context-'));
});

afterEach(async () => {
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

describe('workspace context', () => {
  it('projects only the local root label and current branch', async () => {
    const workspace = join(fixtureRoot, 'sample-project');
    await mkdir(join(workspace, '.git'), { recursive: true });
    await writeFile(join(workspace, '.git', 'HEAD'), 'ref: refs/heads/feature/browser\n', 'utf8');

    await expect(readWorkspaceContext(workspace)).resolves.toEqual({
      rootName: 'sample-project',
      location: 'local',
      branch: 'feature/browser',
    });
  });
});
