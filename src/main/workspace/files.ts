import { open, lstat, readdir, realpath } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type {
  WorkspaceFileEntry,
  WorkspaceFileReadInput,
  WorkspaceFileReadResult,
  WorkspaceFilesListInput,
  WorkspaceFilesListResult,
} from '../../shared/desktop';

const MAX_DIRECTORY_ENTRIES = 500;
const MAX_TEXT_BYTES = 1_048_576;

export async function listWorkspaceFiles(
  workspacePath: string,
  input: WorkspaceFilesListInput,
): Promise<WorkspaceFilesListResult> {
  const root = await realpath(workspacePath);
  const directory = normalizeRelativePath(input.directory ?? '');
  const absoluteDirectory = await resolveContainedPath(root, directory);
  const directoryStats = await lstat(absoluteDirectory);
  if (!directoryStats.isDirectory()) throw new Error('目标不是工作区目录');

  const allEntries = await readdir(absoluteDirectory, { withFileTypes: true });
  const entries = await Promise.all(allEntries.slice(0, MAX_DIRECTORY_ENTRIES).map(async (entry): Promise<WorkspaceFileEntry> => {
    const absolutePath = join(absoluteDirectory, entry.name);
    const relativePath = relative(root, absolutePath).split(sep).join('/');
    const stats = await lstat(absolutePath);
    return {
      name: entry.name,
      path: relativePath,
      kind: stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'directory' : 'file',
      size: stats.isFile() ? stats.size : null,
    };
  }));

  entries.sort((left, right) => {
    const leftOrder = left.kind === 'directory' ? 0 : left.kind === 'file' ? 1 : 2;
    const rightOrder = right.kind === 'directory' ? 0 : right.kind === 'file' ? 1 : 2;
    return leftOrder - rightOrder || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });

  return {
    rootName: basename(root),
    directory,
    entries,
    truncated: allEntries.length > MAX_DIRECTORY_ENTRIES,
  };
}

export async function readWorkspaceFile(
  workspacePath: string,
  input: WorkspaceFileReadInput,
): Promise<WorkspaceFileReadResult> {
  const root = await realpath(workspacePath);
  const path = normalizeRelativePath(input.path);
  if (!path) throw new Error('文件路径不能为空');
  const absolutePath = await resolveContainedPath(root, path);
  const stats = await lstat(absolutePath);
  if (!stats.isFile()) throw new Error('目标不是工作区文件');

  const bytesToRead = Math.min(stats.size, MAX_TEXT_BYTES + 1);
  const buffer = Buffer.alloc(bytesToRead);
  const handle = await open(absolutePath, 'r');
  let bytesRead = 0;
  try {
    ({ bytesRead } = await handle.read(buffer, 0, bytesToRead, 0));
  } finally {
    await handle.close();
  }
  const contentBuffer = buffer.subarray(0, bytesRead);
  if (contentBuffer.includes(0)) throw new Error('暂不支持预览二进制文件');

  const extension = extname(path).toLowerCase();
  return {
    path,
    content: contentBuffer.subarray(0, MAX_TEXT_BYTES).toString('utf8'),
    language: languageForExtension(extension),
    kind: extension === '.md' || extension === '.mdx' || extension === '.markdown' ? 'markdown' : 'text',
    truncated: stats.size > MAX_TEXT_BYTES,
  };
}

export async function resolveWorkspaceFile(workspacePath: string, inputPath: string): Promise<string> {
  const root = await realpath(workspacePath);
  const path = normalizeRelativePath(inputPath);
  if (!path) throw new Error('文件路径不能为空');
  return resolveContainedPath(root, path);
}

function normalizeRelativePath(input: string): string {
  if (typeof input !== 'string' || input.includes('\0') || isAbsolute(input) || input.includes('\\')) {
    throw new Error('无效的工作区相对路径');
  }
  const segments = input.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment === '.' || segment === '..')) throw new Error('工作区路径禁止越界');
  return segments.join('/');
}

async function resolveContainedPath(root: string, relativePath: string): Promise<string> {
  const candidate = resolve(root, relativePath);
  const canonical = await realpath(candidate);
  const nestedPath = relative(root, canonical);
  if (nestedPath === '' || (nestedPath !== '..' && !nestedPath.startsWith(`..${sep}`) && !isAbsolute(nestedPath))) return canonical;
  throw new Error('工作区路径禁止越界');
}

function languageForExtension(extension: string): string {
  return ({
    '.css': 'css', '.html': 'html', '.js': 'javascript', '.jsx': 'javascript', '.json': 'json',
    '.md': 'markdown', '.mdx': 'markdown', '.mjs': 'javascript', '.py': 'python', '.rs': 'rust',
    '.sh': 'shell', '.toml': 'toml', '.ts': 'typescript', '.tsx': 'typescript', '.yaml': 'yaml', '.yml': 'yaml',
  } as Record<string, string>)[extension] ?? 'text';
}
