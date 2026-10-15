// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixturePageLoader, fixturePath } from './fixture-page';

/**
 * 右侧目录把手的端到端客户端行为测试（真实页面 HTML + 真实 `article-toc.ts`）。
 *
 * 状态机与 ARIA 同步在脚本里，收起状态写在 `<html data-toc-collapsed>`。
 */

const TOC_COLLAPSED_KEY = 'astro-whono:toc-collapsed';

const loadPage = createFixturePageLoader('article-page.dev.html');

/**
 * 执行页面 `<head>` 里含指定关键字的内联脚本。
 * `article-toc.ts` 的初始 ARIA 状态读它写到 `<html>` 上的属性。
 */
const runInlineHeadScript = async (keyword: string) => {
  const html = await readFile(fixturePath('article-page.dev.html'), 'utf8');
  const blocks = Array.from(
    html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => match[1] ?? ''
  ).filter((code) => code.includes(keyword));
  expect(blocks.length, `fixture 内应有含「${keyword}」的内联脚本`).toBeGreaterThan(0);
  for (const code of blocks) {
    // eslint-disable-next-line no-new-func -- 就是要在 jsdom 里跑页面自带的脚本
    new Function(code)();
  }
};

const importToc = async () => {
  vi.resetModules();
  await import('../src/scripts/article-toc');
};

const toggleButton = () => {
  const button = document.querySelector<HTMLButtonElement>('[data-toc-toggle]');
  expect(button, 'fixture 里必须有 data-toc-toggle 的目录把手').not.toBeNull();
  return button!;
};

const clickToggle = () => {
  toggleButton().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

const isCollapsed = () => document.documentElement.dataset.tocCollapsed === 'true';

describe('article-toc 目录把手客户端行为', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    // jsdom 的 <html> 在同一文件的用例间是共享的，上一例写入的状态位会污染下一例。
    delete document.documentElement.dataset.tocCollapsed;
    delete document.documentElement.dataset.tocIntro;
    // 路径只用于推导 localStorage 键，取任意合法的文章路径即可，不绑定具体内容。
    window.history.replaceState(null, '', '/blog/sample-post/');
    // jsdom 不实现 matchMedia（脚本用它判断 prefers-reduced-motion）。
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      })
    );
    await loadPage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('把手渲染三条线段（供 ≡ / ||| 形变），而不是图标字形', async () => {
    const glyph = toggleButton().querySelector('.article-toc__glyph');
    expect(glyph, '把手内必须有 .article-toc__glyph 容器').not.toBeNull();
    expect(glyph!.querySelectorAll('.article-toc__bar').length).toBe(3);
    expect(toggleButton().querySelector('svg'), '不再使用图标集字形').toBeNull();
  });

  it('点击把手：收起状态落到 <html>、ARIA 同步、localStorage 记忆', async () => {
    await importToc();
    expect(isCollapsed()).toBe(false);
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true');

    clickToggle();

    expect(isCollapsed(), '点击后 <html data-toc-collapsed> 必须为 true').toBe(true);
    expect(toggleButton().getAttribute('aria-expanded')).toBe('false');
    expect(toggleButton().getAttribute('aria-label')).toBe('展开目录');
    expect(toggleButton().getAttribute('title')).toBe('展开目录');
    expect(window.localStorage.getItem(TOC_COLLAPSED_KEY)).toBe('1');
  });

  it('再点一次：恢复展开并清除状态位', async () => {
    await importToc();

    clickToggle();
    clickToggle();

    expect(isCollapsed()).toBe(false);
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true');
    expect(toggleButton().getAttribute('aria-label')).toBe('收起目录');
    expect(window.localStorage.getItem(TOC_COLLAPSED_KEY)).toBe('0');
  });

  it('localStorage 里记着收起：首绘脚本落地状态位，ARIA 随之是收起态', async () => {
    window.localStorage.setItem(TOC_COLLAPSED_KEY, '1');
    await runInlineHeadScript('toc-collapsed');

    await importToc();

    expect(document.documentElement.dataset.tocCollapsed).toBe('true');
    expect(toggleButton().getAttribute('aria-expanded')).toBe('false');
    expect(toggleButton().getAttribute('aria-label')).toBe('展开目录');
  });

  it('首次访问：首绘脚本给 <html> 打上入场态 data-toc-intro（由脚本撤掉后展开）', async () => {
    await runInlineHeadScript('data-toc-intro');

    expect(document.documentElement.dataset.tocIntro).toBe('true');
    expect(isCollapsed()).toBe(false);
  });

  it('目录把手与悬浮列按钮共用同一尺寸 token', async () => {
    // 两处都必须引用 --rail-action-size，而不是各自的字面值。
    const [tocCss, layoutCss] = await Promise.all([
      readFile(path.join(process.cwd(), 'src', 'styles', 'components', 'article-toc.css'), 'utf8'),
      readFile(path.join(process.cwd(), 'src', 'styles', 'components', 'layout.css'), 'utf8')
    ]);
    const toggleBlock = /\.article-toc__toggle\s*\{[^}]*\}/.exec(tocCss)?.[0] ?? '';
    expect(toggleBlock).toContain('width: var(--rail-action-size)');
    expect(toggleBlock).toContain('height: var(--rail-action-size)');
    const stackBlock = /\.float-stack\s*\{[^}]*\}/.exec(layoutCss)?.[0] ?? '';
    expect(stackBlock).toContain('--float-button-size: var(--rail-action-size)');
    expect(layoutCss).toContain('--rail-action-size: 34px');
    expect(layoutCss).toMatch(/\.float-stack__button::before\s*\{[^}]*height: var\(--tap-min-h\)/s);
  });
});
