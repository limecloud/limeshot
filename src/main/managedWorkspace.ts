import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ManagedWorkspace {
  name: string;
  path: string;
}

export async function reserveManagedWorkspace(
  root: string,
  language: string,
  initialSubject?: string,
): Promise<ManagedWorkspace> {
  await mkdir(root, { recursive: true });
  const fallback = defaultProjectName(language);
  const baseName = filesystemSafeName(initialSubject?.trim() || fallback) || fallback;
  for (let index = 1; index <= 10_000; index += 1) {
    const name = index === 1 ? baseName : `${baseName} ${index}`;
    const path = join(root, name);
    try {
      await mkdir(path);
      return { name, path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('无法分配新的项目工作目录');
}

function filesystemSafeName(value: string): string {
  const normalized = value
    .replace(/[<>:"/\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  const shortened = Array.from(normalized).slice(0, 64).join('').replace(/[. ]+$/g, '');
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(shortened) ? `${shortened} project` : shortened;
}

function defaultProjectName(language: string): string {
  if (language.toLowerCase().startsWith('zh-tw')) return '新增專案';
  if (language.toLowerCase().startsWith('zh')) return '新项目';
  if (language.toLowerCase().startsWith('ja')) return '新規プロジェクト';
  if (language.toLowerCase().startsWith('ko')) return '새 프로젝트';
  return 'New Project';
}
