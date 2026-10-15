#!/usr/bin/env node
// 首页 critical CSS（index.astro 的 homeHeadCriticalCss）是手写快照且位于 global.css 之后，
// 与 src/styles 漂移就会出现只在首页复现的问题。

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

/**
 * 取某个选择器的规则体。
 * 必须带 `m` 且允许前导空白：媒体查询内的规则是缩进的。
 */
const blockBody = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)[ \\t]*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
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
// 只取 @media 之前的桌面部分
const desktopSnapshot = snapshotCss.split('@media')[0];
const globalCss = read(GLOBAL_CSS);
const layoutCss = read(LAYOUT_CSS);

const snapshotRoot = blockBody(desktopSnapshot, ':root');
const globalRoot = blockBody(globalCss, ':root');
const layoutRoot = blockBody(layoutCss, ':root');

// 壳层上限与内容 900px 上限已删除：两边都必须不存在这些声明。
const assertRemoved = (label, snapshotValue, sourceValue) => {
  if (snapshotValue !== null) problems.push(`快照仍保留应删除的 ${label}：${snapshotValue}`);
  if (sourceValue !== null) problems.push(`src/styles 仍保留应删除的 ${label}：${sourceValue}`);
};
assertRemoved(
  ':root --max',
  declaration(snapshotRoot, '--max'),
  declaration(globalRoot, '--max')
);
assertRemoved(
  ':root --layout-shell-max-inline-size',
  declaration(snapshotRoot, '--layout-shell-max-inline-size'),
  declaration(globalRoot, '--layout-shell-max-inline-size') ?? declaration(layoutRoot, '--layout-shell-max-inline-size')
);
assertRemoved(
  '.shell max-width（快照/global.css）',
  declaration(blockBody(desktopSnapshot, '.shell'), 'max-width'),
  declaration(blockBody(layoutCss, '.shell'), 'max-width')
);

// :root tokens 与 global.css 对齐（--pad-x 对应公开站点横向内边距）
const rootTokenPairs = [
  ['--sidebar', '--sidebar'],
  ['--sidebar-padding-block', '--sidebar-padding-block'],
  ['--sidebar-padding-inline', '--sidebar-padding-inline'],
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
  '.shell grid-template-columns',
  declaration(snapshotShell, 'grid-template-columns'),
  declaration(blockBody(layoutCss, '.shell'), 'grid-template-columns'),
  LAYOUT_CSS
);

// 分割线：快照残留上下留白时，空隙只会在首页出现
const snapshotDivider = blockBody(desktopSnapshot, '.divider');
const layoutDivider = blockBody(layoutCss, '.divider');
['background', 'margin'].forEach((property) => {
  compare(
    `.divider ${property}`,
    declaration(snapshotDivider, property),
    declaration(layoutDivider, property),
    LAYOUT_CSS
  );
});

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
  ['.content__inner', 'margin-inline']
].forEach(([selector, property]) => {
  compare(
    `${selector} ${property}`,
    declaration(blockBody(desktopSnapshot, selector), property),
    declaration(blockBody(layoutCss, selector), property),
    LAYOUT_CSS
  );
});

// 快照必须自带这些 token：缺了首屏会取不到值（例如 .page-header 的 gap 退化为 0）。
[
  '--header-gap',
  '--quote-pad',
  '--public-content-padding-inline',
  '--article-readable-inline-size'
].forEach((token) => {
  const snapshotValue = declaration(snapshotRoot, token);
  if (snapshotValue === null) {
    problems.push(`快照缺少首屏需要的 :root ${token}`);
  }
});

// 快照在 global.css 之后内联输出，导航的窄屏尺寸必须与 layout.css 的断点逐字一致。
const MOBILE_NAV_TIERS = [
  { query: '@media (max-width: 640px)', gap: '8px 8px', padding: '6px 7px', fontSize: '15px' },
  { query: '@media (max-width: 360px)', gap: '8px 6px', padding: '6px 6px', fontSize: '14px' }
];

const findMediaBlock = (css, query) => {
  const start = css.indexOf(query);
  if (start === -1) return null;
  let depth = 0;
  let index = css.indexOf('{', start);
  if (index === -1) return null;
  const bodyStart = index + 1;
  for (; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(bodyStart, index);
    }
  }
  return null;
};

MOBILE_NAV_TIERS.forEach(({ query, gap, padding, fontSize }) => {
  const snapshotBlock = findMediaBlock(snapshotCss, query);
  if (!snapshotBlock) {
    problems.push(`首页快照缺少 ${query} 档（layout.css 有对应档，会导致首页与其他页面不一致）`);
    return;
  }
  const navBlock = blockBody(snapshotBlock, '.nav');
  const navLinkBlock = blockBody(snapshotBlock, '.nav a');
  compare(`${query} .nav gap`, declaration(navBlock, 'gap'), gap, LAYOUT_CSS);
  compare(`${query} .nav a padding`, declaration(navLinkBlock, 'padding'), padding, LAYOUT_CSS);
  compare(`${query} .nav a font-size`, declaration(navLinkBlock, 'font-size'), fontSize, LAYOUT_CSS);
});

if (problems.length > 0) {
  console.error('[check:home-critical-css] 首页首屏 critical CSS 与 src/styles 不一致：');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  console.error('\n请同步 src/pages/index.astro 的 homeHeadCriticalCss 快照后重试。');
  process.exit(1);
}

console.log('[check:home-critical-css] OK');
