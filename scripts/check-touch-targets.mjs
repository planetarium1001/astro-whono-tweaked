#!/usr/bin/env node
/**
 * check-touch-targets：校验构建产物里交互元素的最终生效触控尺寸。
 * 取值受 CSS 规则顺序与同特异性覆盖影响，源文件声明不可信，必须解析 dist 产物。
 * 用法：`SITE_URL=... npm run build && node ./scripts/check-touch-targets.mjs`
 */

import process from 'node:process';
import {
  collectDistStyleSources,
  collectOrderedDeclarations,
  normalizePseudoSelector,
  parsePx,
  toSelectorTable
} from './css-sources.mjs';

const ROOT = process.cwd();
const MIN_TAP_PX = 44;

// 有 hitOverlay 的目标视觉尺寸可以更小，有效热区以覆盖层为准。
const TARGETS = [
  { selector: '.pagination__link', property: 'min-height', note: '前端分页控件' },
  {
    selector: '.float-stack__button',
    property: 'width',
    note: '右下角浮动操作列（视觉 34px，与侧栏图标按钮统一，热区由覆盖层提供）',
    hitOverlay: { selector: '.float-stack__button::before', property: 'width' }
  },
  {
    selector: '.float-stack__button',
    property: 'height',
    note: '右下角浮动操作列（视觉 34px，与侧栏图标按钮统一，热区由覆盖层提供）',
    hitOverlay: { selector: '.float-stack__button::before', property: 'height' }
  },
  {
    selector: '.scope-pills__item',
    property: 'height',
    note: '一级胶囊（/archive/ 作用域 + /bits/ 年份，视觉 28px）',
    hitOverlay: { selector: '.scope-pills__item::after', property: 'height' }
  },
  {
    selector: '.entry-tag-option',
    property: 'min-height',
    note: 'tag dialog 选项（视觉 28px）',
    hitOverlay: { selector: '.entry-tag-option::before', property: 'height' }
  },
  {
    selector: '.entry-tag-chip__remove',
    property: 'height',
    note: '已选标签移除按钮（视觉 13px ×，热区由 ::after 覆盖层撑到 44px 高；宽度刻意留在胶囊内）',
    hitOverlay: { selector: '.entry-tag-chip__remove::after', property: 'height' }
  },
  {
    selector: '.bits-search-results__clear',
    property: 'min-height',
    note: 'bits「重置筛选」'
  },
  { selector: '.project-dialog__close', property: 'width', note: 'projects 弹窗关闭' },
  { selector: '.project-dialog__close', property: 'height', note: 'projects 弹窗关闭' }
];

// 解析 var() 链（--float-button-size → var(--tap-min-h) → 44px）。
// 不做这一步会把 `width: var(--float-button-size)` 误判为不可解析。
const resolveValue = (value, variables, depth = 0) => {
  const trimmed = value.replace(/\s*!important\s*$/, '').trim();
  if (depth > 8 || !trimmed.includes('var(')) return trimmed;
  return trimmed.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (_all, name, fallback) => {
    const next = variables.get(name) ?? fallback ?? '';
    return resolveValue(String(next), variables, depth + 1);
  });
};

const main = async () => {
  const sources = await collectDistStyleSources(ROOT);
  if (sources.length === 0) {
    console.error('[check-touch-targets] 未找到 dist 产物，请先 `SITE_URL=... npm run build`。');
    process.exit(1);
  }

  const ordered = collectOrderedDeclarations(sources);
  const bySelector = toSelectorTable(ordered);

  // 自定义属性表（后出现的覆盖先出现的，等价于同特异性后者胜）
  const variables = new Map();
  for (const { property, value } of ordered) {
    if (property.startsWith('--')) variables.set(property, value);
  }

  const tapMin = resolveValue(variables.get('--tap-min-h') ?? '44px', variables);

  const problems = [];
  const lines = [
    `[check-touch-targets] 基于 ${sources.length} 个样式源（含 html 内联样式）`,
    `[check-touch-targets] --tap-min-h = ${tapMin}`
  ];

  for (const { selector, property, note, hitOverlay } of TARGETS) {
    const effective = hitOverlay ?? { selector, property };
    const raw = bySelector.get(normalizePseudoSelector(effective.selector))?.get(effective.property);
    if (!raw) {
      problems.push(`${selector} 未声明 ${property}（${note}）→ 无法保证 ${MIN_TAP_PX}px 触控目标`);
      continue;
    }
    const resolved = resolveValue(raw, variables);
    const px = parsePx(resolved);
    if (px === null) {
      problems.push(`${selector} 的 ${property} 无法解析为 px：${raw}`);
      continue;
    }
    if (px < MIN_TAP_PX) {
      problems.push(`${selector} 的 ${property} 生效值是 ${px}px < ${MIN_TAP_PX}px（${note}）`);
      continue;
    }
    lines.push(`  ${selector} { ${property}: ${resolved} } = ${px}px（${note}）`);
  }

  if (problems.length > 0) {
    console.error(lines.join('\n'));
    console.error('\n[check-touch-targets] 以下触控目标不达标：');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log(lines.join('\n'));
  console.log(`[check-touch-targets] OK（${TARGETS.length} 项全部 >= ${MIN_TAP_PX}px）`);
};

await main();
