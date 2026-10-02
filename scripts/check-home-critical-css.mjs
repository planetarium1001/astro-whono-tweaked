#!/usr/bin/env node
// 首页首屏 critical CSS（index.astro 的 homeHeadCriticalCss）是手写快照，
// 且在 head 中位于 global.css 之后，同优先级声明会长期覆盖真实样式；
// 与 src/styles 漂移就会出现「首页侧栏比文章页宽」这类只在首页复现的问题。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const INDEX_PAGE = path.join(ROOT, 'src', 'pages', 'index.astro');
const GLOBAL_CSS = path.join(ROOT, 'src', 'styles', 'global.css');
const LAYOUT_CSS = path.join(ROOT, 'src', 'styles', 'components', 'layout.css');

const read = (file) => readFileSync(file, 'utf8');

const extractCriticalCss = (source) => {
  const match = /String\.raw`([\s\S]*?)`\s*\]\s*\.join/.exec(source);
  if (!match) {
    throw new Error('未能在 src/pages/index.astro 中定位 homeHeadCriticalCss 的 String.raw 快照');
  }
  return match[1];
};

const blockBody = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  return match ? match[1] : null;
};

const declaration = (block, property) => {
  if (!block) return null;
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|;)\\s*${escaped}\\s*:([^;]+)`, 'm').exec(block);
  return match ? match[1].trim() : null;
};

const problems = [];
const compare = (label, snapshotValue, sourceValue, sourceFile) => {
  if (snapshotValue === null) {
    problems.push(`快照缺少 ${label}`);
    return;
  }
  if (sourceValue === null) {
    problems.push(`${sourceFile} 中缺少可对比的 ${label}`);
    return;
  }
  if (snapshotValue !== sourceValue) {
    problems.push(
      `${label} 漂移：首页快照 = "${snapshotValue}"，${path.relative(ROOT, sourceFile)} = "${sourceValue}"`
    );
  }
};

const snapshotCss = extractCriticalCss(read(INDEX_PAGE));
// 只取 @media 之前的桌面部分，避免匹配到移动端覆盖值
const desktopSnapshot = snapshotCss.split('@media')[0];
const globalCss = read(GLOBAL_CSS);
const layoutCss = read(LAYOUT_CSS);

const snapshotRoot = blockBody(desktopSnapshot, ':root');
const globalRoot = blockBody(globalCss, ':root');
const resolvedShellMax = declaration(globalRoot, '--layout-shell-max-inline-size');

// :root tokens 与 global.css 对齐（--pad-x 对应公开站点横向内边距）
const rootTokenPairs = [
  ['--sidebar', '--sidebar'],
  ['--sidebar-padding-block', '--sidebar-padding-block'],
  ['--sidebar-padding-inline', '--sidebar-padding-inline'],
  ['--max', '--max'],
  ['--pad-x', '--public-content-padding-inline'],
  ['--card-pad', '--card-pad'],
  ['--tap-min-h', '--tap-min-h']
];
rootTokenPairs.forEach(([snapshotToken, globalToken]) => {
  compare(
    `:root ${snapshotToken}`,
    declaration(snapshotRoot, snapshotToken),
    declaration(globalRoot, globalToken),
    GLOBAL_CSS
  );
});

// 壳层与侧栏的桌面尺寸必须与 layout.css 一致
const snapshotShell = blockBody(desktopSnapshot, '.shell');
compare(
  '.shell max-width',
  declaration(snapshotShell, 'max-width'),
  resolvedShellMax,
  GLOBAL_CSS
);
compare(
  '.shell grid-template-columns',
  declaration(snapshotShell, 'grid-template-columns'),
  declaration(blockBody(layoutCss, '.shell'), 'grid-template-columns'),
  LAYOUT_CSS
);

const snapshotSidebar = blockBody(desktopSnapshot, '.sidebar');
const layoutSidebar = blockBody(layoutCss, '.sidebar');
['padding', 'gap'].forEach((property) => {
  compare(
    `.sidebar ${property}`,
    declaration(snapshotSidebar, property),
    declaration(layoutSidebar, property),
    LAYOUT_CSS
  );
});

[
  ['.sidebar__title', 'font-size'],
  ['.sidebar__quote', 'max-width'],
  ['.sidebar__quote', 'font-size'],
  ['.content__inner', 'max-width'],
  ['.content__inner', 'margin-inline']
].forEach(([selector, property]) => {
  compare(
    `${selector} ${property}`,
    declaration(blockBody(desktopSnapshot, selector), property),
    declaration(blockBody(layoutCss, selector), property),
    LAYOUT_CSS
  );
});

if (problems.length > 0) {
  console.error('[check:home-critical-css] 首页首屏 critical CSS 与 src/styles 不一致：');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  console.error('\n请同步 src/pages/index.astro 的 homeHeadCriticalCss 快照后重试。');
  process.exit(1);
}

console.log('[check:home-critical-css] OK');
