// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixturePageLoader } from './fixture-page';

/**
 * 窄屏内联目录展开 / 收起过渡的客户端行为（真实页面 HTML + 真实 `article-toc.ts`）。
 *
 * 脚本量出目录高度写入 `--article-toc-inline-height`，过渡期间 `details` 保持展开并裁掉溢出，
 * 过渡结束后先撤掉裁切再落定 `details.open`。jsdom 没有布局，高度由替身按 open 状态给出。
 */

const ANIM_ATTR = 'data-toc-anim';
const HEIGHT_VAR = '--article-toc-inline-height';
const INLINE_MQ = '(max-width: 1279.98px)';
const REDUCED_MQ = '(prefers-reduced-motion: reduce)';
// 略大于 article-toc.ts 的 INLINE_TOC_ANIM_MS
const ANIM_MS = 400;

const COLLAPSED_HEIGHT = 60;
const LIST_HEIGHT = 200;

const loadPage = createFixturePageLoader('article-page.dev.html');

let reducedMotion = false;
let details: HTMLDetailsElement;
let list: HTMLElement;
let summary: HTMLElement;

const rectAt = (height: number, top = 0) =>
  ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({})
  }) as unknown as DOMRect;

const importToc = async () => {
  vi.resetModules();
  await import('../src/scripts/article-toc');
};

const click = (element: Element) => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

const animState = () => details.getAttribute(ANIM_ATTR);
const heightVar = () => details.style.getPropertyValue(HEIGHT_VAR);

describe('内联目录展开 / 收起过渡', () => {
  beforeEach(async () => {
    reducedMotion = false;
    vi.useFakeTimers();
    // jsdom 不实现 matchMedia；窄屏命中，减弱动效按用例切换。
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === REDUCED_MQ ? reducedMotion : query === INLINE_MQ,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }));
    // 过渡收尾后的滚动排在下一帧，同步执行便于断言。
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    await loadPage();
    delete document.documentElement.dataset.tocIntro;
    window.history.replaceState(null, '', '/blog/sample-post/');

    const inline = document.querySelector<HTMLDetailsElement>('details.article-toc--inline');
    expect(inline, '快照里必须有内联目录').not.toBeNull();
    details = inline!;
    list = details.querySelector<HTMLElement>('.article-toc__list')!;
    summary = details.querySelector<HTMLElement>('summary')!;
    expect(details.open).toBe(false);

    // 收起态只渲染摘要条，展开态含整份列表；关闭态下列表不参与渲染。
    details.getBoundingClientRect = () =>
      rectAt(details.open ? COLLAPSED_HEIGHT + LIST_HEIGHT : COLLAPSED_HEIGHT);
    list.getBoundingClientRect = () => rectAt(details.open ? LIST_HEIGHT : 0);

    await importToc();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('点摘要展开：立即展开，过渡高度从收起高度涨到展开高度', () => {
    click(summary);

    expect(details.open, '展开立即可见，不必等过渡结束').toBe(true);
    expect(animState()).toBe('expand');
    expect(heightVar()).toBe(`${COLLAPSED_HEIGHT + LIST_HEIGHT}px`);
  });

  it('展开过渡结束：撤掉裁切与高度变量，内容不被裁掉', () => {
    click(summary);
    vi.advanceTimersByTime(ANIM_MS);

    expect(details.open).toBe(true);
    expect(animState(), '过渡结束后不再裁切').toBeNull();
    expect(heightVar(), '过渡结束后不再写死高度').toBe('');
  });

  it('点摘要收起：过渡期间保持展开，结束后关闭且不留占位', () => {
    details.open = true;
    click(summary);

    // 收起期间 details 必须保持展开，内容才有得裁；此时列表已被压到收起高度。
    expect(details.open, '收起过渡期间保持展开').toBe(true);
    expect(animState()).toBe('collapse');
    expect(heightVar()).toBe(`${COLLAPSED_HEIGHT}px`);

    vi.advanceTimersByTime(ANIM_MS);

    expect(details.open, '过渡结束才落定关闭').toBe(false);
    expect(animState()).toBeNull();
    expect(heightVar(), '收起后不留占位高度').toBe('');
  });

  it('减弱动效：不写过渡态，开关立即生效', () => {
    reducedMotion = true;

    click(summary);
    expect(details.open).toBe(true);
    expect(animState(), '减弱动效不做过渡').toBeNull();
    expect(heightVar()).toBe('');

    click(summary);
    expect(details.open).toBe(false);
    expect(animState()).toBeNull();
  });

  it('目录条目跳转：hash 立即落地，滚动等收起过渡结束后才发生', () => {
    const link = list.querySelector<HTMLAnchorElement>('a[data-toc-target]');
    expect(link, '内联目录里应有条目链接').not.toBeNull();
    const id = link!.dataset.tocTarget ?? '';
    const heading = document.getElementById(id);
    expect(heading, '条目必须指向存在的标题').not.toBeNull();
    const scrollIntoView = vi.fn();
    (heading as unknown as { scrollIntoView: () => void }).scrollIntoView = scrollIntoView;

    details.open = true;
    click(link!);

    expect(details.getAttribute(ANIM_ATTR), '跳转前先收起目录').toBe('collapse');
    expect(
      decodeURIComponent(window.location.hash.slice(1)),
      'hash 不随过渡延迟'
    ).toBe(id);
    expect(scrollIntoView, '收起过渡会挪动正文，滚动须等过渡结束').not.toHaveBeenCalled();

    vi.advanceTimersByTime(ANIM_MS);

    expect(details.open).toBe(false);
    expect(scrollIntoView, '过渡结束后再滚动，落点才准').toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({ block: 'start' });
  });

  it('过渡期间再点一次：从当前高度接着反向过渡，不残留上一个过渡态', () => {
    click(summary);
    expect(animState()).toBe('expand');

    click(summary);
    expect(details.open, '展开中途收起时 details 保持展开').toBe(true);
    expect(animState()).toBe('collapse');

    vi.advanceTimersByTime(ANIM_MS);
    expect(details.open).toBe(false);
    expect(animState()).toBeNull();
    expect(heightVar()).toBe('');
  });

  it('目录按钮跳转：展开过渡结束后再校准一次落点', () => {
    const button = document.querySelector<HTMLButtonElement>('#toc-jump');
    expect(button, '快照里必须有浮动列的目录按钮').not.toBeNull();
    const scrollIntoView = vi.fn();
    (details as unknown as { scrollIntoView: () => void }).scrollIntoView = scrollIntoView;
    // 目录不在视口内：按钮走「展开并滚过去」分支。
    details.getBoundingClientRect = () =>
      rectAt(details.open ? COLLAPSED_HEIGHT + LIST_HEIGHT : COLLAPSED_HEIGHT, 2000);

    click(button!);

    expect(details.open).toBe(true);
    expect(scrollIntoView, '展开后立刻滚一次').toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(ANIM_MS);
    expect(scrollIntoView, '过渡结束后按最终高度再校准一次').toHaveBeenCalledTimes(2);
  });
});

describe('内联目录过渡样式', () => {
  const read = (relative: string) => readFile(path.join(process.cwd(), relative), 'utf8');

  it('过渡态用 max-height 裁切，减弱动效时关掉过渡', async () => {
    const css = await read('src/styles/components/article-toc.css');
    const anim = /\.article-toc--inline\[data-toc-anim\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    expect(anim, '需要 [data-toc-anim] 规则').not.toBe('');
    expect(anim).toMatch(/max-height:\s*var\(--article-toc-inline-height/);
    expect(anim).toMatch(/overflow:\s*hidden/);
    expect(anim).toMatch(/transition:\s*max-height/);
    // 未过渡时不得残留裁切
    expect(css).not.toMatch(/\.article-toc--inline\s*\{[^}]*overflow:\s*hidden/);

    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(reduced).toContain('.article-toc--inline[data-toc-anim]');
  });
});
