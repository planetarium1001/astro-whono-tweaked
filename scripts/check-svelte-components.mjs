#!/usr/bin/env node
/**
 * check-svelte-components：编译全部 .svelte 组件。astro check（tsc）不看模板，build 也不编译
 * 只在 DEV 下挂载的后台 Svelte 岛，这里用 svelte/compiler 直接编译。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { compile } from 'svelte/compiler';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'src');

const collect = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
      continue;
    }
    if (entry.name.endsWith('.svelte')) out.push(full);
  }
  return out;
};

const files = collect(SOURCE_DIR).sort();
const failures = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  try {
    compile(source, { filename: file, generate: 'client' });
  } catch (error) {
    const relative = path.relative(ROOT, file);
    const start = error.start ? `:${error.start.line}:${error.start.column}` : '';
    failures.push(`${relative}${start} — ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error('[check:svelte] 组件编译失败：');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`[check:svelte] OK（${files.length} 个 .svelte 组件全部编译通过）`);
