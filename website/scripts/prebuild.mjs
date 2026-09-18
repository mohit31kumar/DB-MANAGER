import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = path.join(root, '..', 'docs', 'screenshots');
const dest = path.join(root, 'public', 'screenshots');

if (existsSync(src)) {
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log('Copied screenshots to public/screenshots');
} else {
  console.warn('docs/screenshots not found, skipping copy');
}