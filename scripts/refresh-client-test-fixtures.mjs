#!/usr/bin/env node
/**
 * 刷新客户端行为测试用的页面快照（SSR 输出与脚本加载顺序只有构建产物才完整）。
 *
 * 用法：`SITE_URL=... npm run build && node ./scripts/refresh-client-test-fixtures.mjs`
 */

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tests', 'fixtures');

/** 文章详情页快照来源：取构建产物里字典序第一篇文章。 */
const resolveArticleFixtureSource = async () => {
  const blogDir = path.join(ROOT, 'dist', 'blog');
  if (!existsSync(blogDir)) return null;

  const entries = await readdir(blogDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `dist/blog/${entry.name}/index.html`)
    .filter((relative) => existsSync(path.join(ROOT, relative)))
    .sort();

  return candidates[0] ?? null;
};

const SOURCES = [
  ['dist/bits/index.html', 'bits-page.dev.html'],
  ['dist/bits/index.json', 'bits-index.dev.json'],
  ['dist/blog/index.html', 'blog-page.dev.html'],
  ['dist/blog/index.json', 'blog-index.dev.json'],
  ['dist/archive/index.html', 'archive-page.dev.html'],
  ['dist/archive/index.json', 'archive-index.dev.json'],
  [(await resolveArticleFixtureSource()) ?? 'dist/blog/<entry>/index.html', 'article-page.dev.html'],
  ['dist/devlog/index.html', 'devlog-page.dev.html']
];

await mkdir(OUT, { recursive: true });

let copied = 0;
const missing = [];
for (const [from, to] of SOURCES) {
  const source = path.join(ROOT, from);
  if (!existsSync(source)) {
    missing.push(from);
    continue;
  }
  await copyFile(source, path.join(OUT, to));
  copied += 1;
}

if (missing.length > 0) {
  console.error('[refresh-client-test-fixtures] 缺少构建产物，请先 `SITE_URL=... npm run build`：');
  for (const item of missing) console.error(`  - ${item}`);
  process.exit(1);
}

console.log(`[refresh-client-test-fixtures] 已刷新 ${copied} 个快照到 tests/fixtures/`);
