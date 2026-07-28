import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const cargo = await readFile(resolve(root, 'rust/Cargo.toml'), 'utf8');

if (!cargo.includes(`version = "${packageJson.version}"`)) {
  throw new Error('package.json 与 Rust workspace version 不一致');
}
