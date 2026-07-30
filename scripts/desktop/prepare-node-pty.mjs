import { chmod, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.platform === 'darwin') {
  const root = resolve(import.meta.dirname, '../..');
  const candidates = [
    resolve(root, 'node_modules', 'node-pty', 'build', 'Release', 'spawn-helper'),
    resolve(root, 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
  ];
  let prepared = false;
  for (const candidate of candidates) {
    try {
      const details = await stat(candidate);
      if (!details.isFile()) continue;
      const mode = details.mode | 0o111;
      if (details.mode !== mode) await chmod(candidate, mode);
      prepared = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (!prepared) throw new Error(`node-pty spawn-helper 不存在: ${process.platform}-${process.arch}`);
}
