#!/usr/bin/env node
/**
 * Vendors the shared domain contract into every runtime that needs it.
 *
 * We deliberately copy instead of using npm workspaces: Metro (React Native)
 * and tsx (Node) resolve out-of-root sources very differently on Windows, and
 * a vendored copy keeps both bundlers dependency-free and deterministic.
 * `packages/contracts/src` is the ONLY place to edit these files.
 */
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'packages', 'contracts', 'src');
const targets = [
  join(root, 'apps', 'api', 'src', 'contracts'),
  join(root, 'apps', 'slate', 'src', 'contracts'),
];

const banner = `// AUTO-GENERATED — do not edit.\n// Source: packages/contracts/src • regenerate with \`npm run sync:contracts\`\n`;

for (const target of targets) {
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}

// Drop a README so nobody edits the vendored copy by accident.
for (const target of targets) {
  await writeFile(join(target, 'README.md'), `${banner}`, 'utf8');
}

const files = await readdir(source);
console.log(`synced ${files.length} contract file(s) -> ${targets.length} runtime(s)`);
