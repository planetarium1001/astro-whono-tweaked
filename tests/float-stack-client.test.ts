// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixturePageLoader } from './fixture-page';

/**
 * 浮动列客户端行为：首页是否输出浮动列、窄屏目录按钮的可用条件与点击行为、
 * 以及「使用目录按钮之前的阅读位置」不被中途的目录跳转覆盖。
 *
 * 位置栈是脚本内部状态，用例只断言可观察结果（滚动目标、按钮显隐）。
 */

const read = (relative: string) => readFile(path.join(process.cwd(), relative), 'utf8');

const loadArticlePage = createFixturePageLoader('article-page.dev.html');
const loadBitsPage = createFixturePageLoader('bits-page.dev.html');

/** 窄屏时 `(max-width: 1279.98px)` 命中，其余查询（含减弱动效）一律不命中。 */
const stubMatchMedia = (narrow: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: narrow && query === '(max-width: 1279.98px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })
  );
};

const importScripts = async () => {
  vi.resetModules();
  await import('../src/scripts/sidebar-floating-actions');
  await import('../src/scripts/article-toc');
};

const tocJumpButton = () => {
  const button = document.querySelector<HTMLButtonElement>('#toc-jump');
  expect(button, '快照里必须有浮动列的目录按钮').not.toBeNull();
  return button!;
};

const inlineToc = () => {
  const details = document.querySelector<HTMLDetailsElement>('details.article-toc--inline');
  expect(details, '快照里必须有内联目录').not.toBeNull();
  return details!;
};

const click = (element: Element) => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

/** 视口矩形的最小替身，够位置栈与跳转高亮读取 top / bottom / height。 */
const rectAt = (top: number, height = 40) =>
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

/** 正文标题在文档中的固定位置：视口内位置 = 文档位置 - 滚动距离。 */
const HEADING_DOC_TOP = 5000;

describe('浮动列路由：首页与列表页、文章页同组', () => {
  it('首页 / 也输出浮动列，后台与关于页不输出', async () => {
    const source = await read('src/layouts/BaseLayout.astro');
    const condition = /const showFloatStack = ([\s\S]+?);\r?\n/.exec(source)?.[1] ?? '';
    expect(condition, 'BaseLayout 里应有 showFloatStack 的路由条件').not.toBe('');
    const isShown = new Function('routePath', 'isAdminPage', `return ${condition};`) as (
      routePath: string,
      isAdminPage: boolean
    ) => boolean;

    expect(isShown('/', false)).toBe(true);
    expect(isShown('/blog/', false)).toBe(true);
    expect(isShown('/blog/2026-01-05-hello/', false)).toBe(true);
    expect(isShown('/bits/', false)).toBe(true);
    expect(isShown('/about/', false)).toBe(false);
    expect(isShown('/', true)).toBe(false);
  });

  it('目录按钮复用浮动列按钮样式、位于浮动列内且初始隐藏', async () => {
    const source = await read('src/layouts/BaseLayout.astro');
    const stackAt = source.indexOf('data-float-stack');
    const buttonAt = source.indexOf('id="toc-jump"');

    expect(stackAt).toBeGreaterThan(-1);
    expect(buttonAt).toBeGreaterThan(stackAt);
    expect(source).toMatch(/id="toc-jump"\s+class="float-stack__button"[\s\S]*?hidden\s*>/);
  });

  it('目录按钮的显隐只由脚本控制，不写窄屏 CSS', async () => {
    const layoutCss = await read('src/styles/components/layout.css');
    expect(layoutCss).not.toContain('toc-jump');
  });
});

describe('窄屏目录按钮', () => {
  let scrollY = 0;
  const setScrollY = (y: number) => {
    scrollY = y;
  };

  /** 快照 + 几何替身：jsdom 没有布局，滚动位置、文档高度与标题位置都要自己给出。 */
  const prepareArticle = async () => {
    await loadArticlePage();
    const heading = document.querySelector<HTMLElement>('.prose h2[id]');
    expect(heading, '快照正文里应有带锚点的标题').not.toBeNull();
    heading!.getBoundingClientRect = () => rectAt(HEADING_DOC_TOP - scrollY);
    // jsdom 不实现 scrollIntoView，目录按钮与条目跳转都会调用它。
    (heading as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
    const details = inlineToc();
    (details as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
    const link = details.querySelector<HTMLAnchorElement>('a[data-toc-target]');
    expect(link, '内联目录里应有条目链接').not.toBeNull();
    return { details, link: link! };
  };

  beforeEach(async () => {
    window.localStorage.clear();
    delete document.documentElement.dataset.tocCollapsed;
    delete document.documentElement.dataset.tocIntro;
    window.history.replaceState(null, '', '/blog/sample-post/');
    scrollY = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 768 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 4768 });
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('窄屏且有内联目录：按钮显示，点击展开目录并平滑滚过去', async () => {
    stubMatchMedia(true);
    const { details } = await prepareArticle();

    await importScripts();

    const button = tocJumpButton();
    expect(button.hidden, '窄屏有目录时按钮必须可见').toBe(false);
    expect(details.open).toBe(false);

    click(button);

    expect(details.open, '点击后内联目录必须展开').toBe(true);
    const scrollIntoView = details.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    expect(scrollIntoView, '点击后必须滚到内联目录').toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({ behavior: 'smooth', block: 'start' });
  });

  it('宽屏：按钮保持隐藏', async () => {
    stubMatchMedia(false);
    await loadArticlePage();

    await importScripts();

    expect(tocJumpButton().hidden).toBe(true);
  });

  it('页面没有内联目录：按钮保持隐藏', async () => {
    stubMatchMedia(true);
    await loadBitsPage();

    await importScripts();

    expect(tocJumpButton().hidden).toBe(true);
    window.dispatchEvent(new Event('resize'));
    expect(tocJumpButton().hidden).toBe(true);
  });

  it('使用目录按钮后，中途的目录条目跳转不覆盖返回位置', async () => {
    stubMatchMedia(true);
    const { link } = await prepareArticle();

    setScrollY(1000);
    await importScripts();
    const resume = document.querySelector<HTMLButtonElement>('#resume-reading')!;

    click(tocJumpButton());
    expect(resume.hidden, '记下返回位置后按钮必须可用').toBe(false);

    // 用户已随目录按钮滚到页面顶部，再从目录条目跳到正文。
    setScrollY(200);
    click(link);
    expect(
      decodeURIComponent(window.location.hash.slice(1)),
      '目录条目跳转必须真的发生'
    ).toBe('正文');
    // 用户继续读到别处，再点「回到上次阅读位置」。
    setScrollY(3000);
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    click(resume);

    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    // 1000 是点目录按钮之前的位置（比例 0.25）；若被目录跳转覆盖则会是 200。
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
  });

  it('返回位置用掉后，目录条目跳转恢复入栈', async () => {
    stubMatchMedia(true);
    const { link } = await prepareArticle();

    setScrollY(1000);
    await importScripts();
    const resume = document.querySelector<HTMLButtonElement>('#resume-reading')!;

    click(tocJumpButton());
    setScrollY(3000);
    click(resume);

    // 返回位置已用掉：此后的目录条目跳转照旧入栈。
    setScrollY(3600);
    click(link);
    setScrollY(400);
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    click(resume);

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 3600, behavior: 'smooth' });
  });

  it('页面开头点目录按钮：不锁定返回位置，目录条目跳转照常入栈', async () => {
    stubMatchMedia(true);
    const { link } = await prepareArticle();

    setScrollY(0);
    await importScripts();
    const resume = document.querySelector<HTMLButtonElement>('#resume-reading')!;

    click(tocJumpButton());
    expect(resume.hidden, '页面开头没有可回退的位置').toBe(true);

    setScrollY(1200);
    click(link);
    expect(resume.hidden, '目录条目跳转仍要入栈').toBe(false);

    setScrollY(300);
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    click(resume);

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' });
  });
});
