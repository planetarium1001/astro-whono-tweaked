// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixturePageLoader } from './fixture-page';

/**
 * `/devlog/` 的「项目」筛选与行内展开：取值域只有 `project`，交互复用 tag dialog。
 * 用构建产物里的真实页面 HTML 与真实脚本跑交互，断言可见性收敛、单选语义、
 * 「全部」复位、`?project=` 首屏筛选与深链接可用。
 */

const loadPage = createFixturePageLoader('devlog-page.dev.html');

// vi.resetModules() 只清模块缓存，不摘上一例挂在 document / window 上的监听器。
// 多跑一例就多一份 click 委托，点一次会被处理多次，表现为随用例顺序时好时坏的假失败。
// 因此记录导入期间注册的监听器，afterEach 统一摘掉。
const boundListeners: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }[] = [];

const importScripts = async () => {
  vi.resetModules();
  const record = (target: EventTarget) => {
    const original = target.addEventListener.bind(target);
    return vi.spyOn(target, 'addEventListener').mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean
    ) => {
      boundListeners.push({ target, type, listener });
      return original(type, listener, options);
    }) as typeof target.addEventListener);
  };

  const documentSpy = record(document);
  const windowSpy = record(window);
  try {
    // 与 `/devlog/` 页面的真实顺序一致：摘要策略 → 抽屉 → 筛选
    await import('../src/scripts/devlog-excerpts');
    await import('../src/scripts/devlog-drawer');
    await import('../src/scripts/devlog-filter');
  } finally {
    documentSpy.mockRestore();
    windowSpy.mockRestore();
  }
};

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-devlog-row]'));
const visibleRows = () => rows().filter((row) => !row.hidden);
const visibleIds = () => visibleRows().map((row) => row.dataset.devlogId ?? '');
const projects = () =>
  [...new Set(rows().map((row) => (row.dataset.devlogProject ?? '').trim()))].filter(Boolean);
const kinds = () =>
  [...new Set(rows().map((row) => (row.dataset.devlogKind ?? '').trim()))].filter(Boolean);

const dialog = () => document.querySelector<HTMLDialogElement>('[data-entry-tag-dialog]');
const trigger = () => document.querySelector<HTMLElement>('[data-entry-tag-trigger]');

/** dialog 里按项目名（key）找选项；空串 = 「全部」。 */
const option = (value: string) =>
  dialog()?.querySelector<HTMLButtonElement>(`[data-entry-tag-key="${value}"]`) ?? null;

const optionValues = () =>
  Array.from(dialog()?.querySelectorAll<HTMLElement>('[data-entry-tag-key]') ?? []).map((el) =>
    (el.dataset.entryTagKey ?? '').trim()
  );

const click = (el: Element | null) => {
  expect(el, '目标元素不存在').not.toBeNull();
  el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

const clickOption = (value: string) => {
  const target = option(value);
  expect(target, `找不到项目选项：${value || '全部'}`).not.toBeNull();
  click(target);
};

const subtitleText = () =>
  document.querySelector<HTMLElement>('.page-subtitle__text')?.textContent?.trim() ?? '';

describe('/devlog/ 的「项目」筛选与行内展开', () => {
  // jsdom 不实现 scrollIntoView（抽屉在锚点命中时会调用它）——按环境缺口补桩，不改产品代码
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.replaceState(null, '', '/devlog/');
    Element.prototype.scrollIntoView = function noopScrollIntoView() {};
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
  });

  afterEach(() => {
    if (originalScrollIntoView) {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
    for (const { target, type, listener } of boundListeners.splice(0)) {
      target.removeEventListener(type, listener);
    }
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('复用 tag dialog，取值域只有 project、没有 kind', async () => {
    await loadPage();
    await importScripts();

    // 样式载体是 tag dialog
    expect(dialog(), '需要复用 tag dialog').not.toBeNull();
    expect(dialog()!.classList.contains('entry-tags-dialog')).toBe(true);
    // 标题 = 集合展示名 + 取值域；展示名随站点设置变化，从 fixture 自身推导
    const pageTitle = document.querySelector('.page-title')?.textContent?.trim() ?? '';
    expect(pageTitle).not.toBe('');
    expect(dialog()!.querySelector('.entry-tags-dialog__title')?.textContent?.trim()).toBe(`${pageTitle}项目`);
    expect(trigger(), '需要一个打开 dialog 的触发器').not.toBeNull();
    expect(trigger()!.textContent?.trim(), '未筛选时触发器显示 #项目').toBe('#项目');
    // 单选项目没有 AND/OR 语义，也没有 RSS
    expect(dialog()!.querySelector('.entry-tags-dialog__mode')).toBeNull();
    expect(document.querySelector('.page-subtitle__link'), 'devlog 不该有 RSS 链接').toBeNull();
    // 不出现胶囊条
    expect(document.querySelector('[data-devlog-filter-bar]')).toBeNull();
    expect(document.querySelector('.scope-pills__item')).toBeNull();

    // 取值域 = 「全部」 + 去重后的 project 值
    const values = optionValues();
    expect(values[0], '第一项应是「全部」').toBe('');
    expect(option('')!.classList.contains('is-active')).toBe(true);
    expect(option('')!.textContent).toContain('全部');

    expect(projects().length, '需要至少两个项目才能验证筛选收敛').toBeGreaterThan(1);
    expect(values.slice(1)).toEqual(projects());

    // kind 值不得出现在选项里
    expect(kinds().length).toBeGreaterThan(0);
    for (const kind of kinds()) {
      expect(values, `kind（${kind}）不应成为筛选取值`).not.toContain(kind);
    }
  });

  it('触发器打开 dialog（并拦截跳转），关闭按钮收起', async () => {
    await loadPage();
    await importScripts();

    click(trigger());
    expect(dialog()!.hasAttribute('open'), '点击触发器应打开 dialog').toBe(true);
    expect(trigger()!.getAttribute('aria-expanded')).toBe('true');

    click(dialog()!.querySelector('[data-entry-tag-close]'));
    expect(dialog()!.hasAttribute('open')).toBe(false);
    expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('选中一个项目：只剩该项目的条目，单选状态与副标题计数同步', async () => {
    await loadPage();
    await importScripts();

    const project = projects()[0]!;
    const expected = rows()
      .filter((row) => (row.dataset.devlogProject ?? '').trim() === project)
      .map((row) => row.dataset.devlogId ?? '');
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length, '该项目不应覆盖全部条目').toBeLessThan(rows().length);

    clickOption(project);

    expect(visibleIds().sort()).toEqual([...expected].sort());
    expect(option(project)!.getAttribute('aria-pressed')).toBe('true');
    expect(option(project)!.classList.contains('is-active')).toBe(true);
    expect(option('')!.getAttribute('aria-pressed')).toBe('false');
    // 副标题计数跟随可见条数
    expect(subtitleText()).toContain(`共 ${expected.length} 条更新`);
    expect(document.querySelector('[data-devlog-count]')).toBeNull();
  });

  // 选中项目后要显示当前项目：第一行已选胶囊，
  // 第二行「切换项目 / 清除筛选」，触发器隐藏。
  it('选中项目后显示已选胶囊（复用 tag 的设计），触发器让位给「切换项目 / 清除筛选」', async () => {
    await loadPage();
    await importScripts();

    const heading = document.querySelector<HTMLElement>('.page-heading')!;
    expect(heading.classList.contains('page-heading--tag-bar'), '未筛选时是单行页头').toBe(false);
    expect(trigger()!.hidden).toBe(false);

    const project = projects()[0]!;
    clickOption(project);

    // 第一行：标签图标 + 项目名 + ×（文案不带 #，因为它是「项目」不是「标签」）
    const strip = document.querySelector<HTMLElement>('[data-entry-tag-status]');
    expect(strip, '选中项目后要显示已选胶囊').not.toBeNull();
    expect(strip!.querySelector('.entry-tag-apply__icon svg')).not.toBeNull();
    expect(strip!.querySelector('.entry-tag-chip__label')?.textContent?.trim()).toBe(project);
    expect(strip!.querySelector('.entry-tag-chip__remove')).not.toBeNull();

    // 第二行：切换项目 / 清除筛选
    const actions = document.querySelector<HTMLElement>('[data-entry-tag-actions]');
    expect(actions).not.toBeNull();
    expect(actions!.parentElement?.classList.contains('page-subtitle')).toBe(true);
    expect(Array.from(actions!.querySelectorAll('button')).map((el) => el.textContent?.trim()))
      .toEqual(['切换项目', '清除筛选']);
    expect(actions!.querySelector('button')!.classList.contains('page-subtitle__action')).toBe(true);
    expect(heading.classList.contains('page-heading--tag-bar'), '有已选项目时切成两行').toBe(true);
    expect(trigger()!.hidden, '触发器应让位').toBe(true);

    // 胶囊上的 × 也能清空
    click(strip!.querySelector('[data-entry-tag-remove]'));
    expect(visibleRows().length).toBe(rows().length);
    expect(document.querySelector('[data-entry-tag-status]')).toBeNull();
    expect(document.querySelector('[data-entry-tag-actions]')).toBeNull();
    expect(trigger()!.hidden).toBe(false);
  });

  it('单选语义：点同一个项目 = 回到「全部」；点「全部」也回全部', async () => {
    await loadPage();
    await importScripts();

    const project = projects()[0]!;
    clickOption(project);
    expect(visibleRows().length).toBeLessThan(rows().length);

    clickOption(project);
    expect(visibleRows().length).toBe(rows().length);
    expect(option('')!.classList.contains('is-active')).toBe(true);
    expect(trigger()!.textContent?.trim()).toBe('#项目');

    clickOption(project);
    expect(visibleRows().length).toBeLessThan(rows().length);
    clickOption('');
    expect(visibleRows().length).toBe(rows().length);
    expect(subtitleText()).toContain(`共 ${rows().length} 条更新`);
  });

  it('?project= 首屏直接按该项目筛选（归档时间线的项目名链接会带过来）', async () => {
    const project = projects()[projects().length - 1]!;
    window.history.replaceState(null, '', `/devlog/?project=${encodeURIComponent(project)}`);
    await loadPage();
    await importScripts();

    const expected = rows()
      .filter((row) => (row.dataset.devlogProject ?? '').trim() === project)
      .map((row) => row.dataset.devlogId ?? '');
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(rows().length);
    expect(visibleIds().sort()).toEqual([...expected].sort());
    expect(option(project)!.classList.contains('is-active')).toBe(true);
  });

  it('行内展开：面板显隐、aria-expanded 与展开态类名同步（右侧只留图标）', async () => {
    await loadPage();
    await importScripts();

    const row = rows()[0]!;
    const toggle = row.querySelector<HTMLButtonElement>('[data-devlog-toggle]')!;
    const panel = row.querySelector<HTMLElement>('[data-devlog-panel]')!;

    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(row.classList.contains('is-open')).toBe(false);
    // 右侧只留图标，不显示「展开 / 收起」字样
    expect(row.querySelector('[data-devlog-action-label]')).toBeNull();
    expect(row.querySelector('.devlog-row__caret')).not.toBeNull();

    click(toggle);
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(row.classList.contains('is-open'), '展开态用类名驱动图标方向').toBe(true);

    click(toggle);
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(row.classList.contains('is-open')).toBe(false);
  });

  it('深链接 #<entryId> 自动展开；被当前筛选藏住时自动复位到「全部」', async () => {
    await loadPage();
    await importScripts();

    const row = rows()[0]!;
    const id = row.dataset.devlogId!;
    const otherProject = projects().find(
      (project) => project !== (row.dataset.devlogProject ?? '').trim()
    );
    expect(otherProject, '需要两个不同的项目才能构造「目标被筛掉」').toBeTruthy();

    clickOption(otherProject!);
    expect(row.hidden, '前置条件：目标行已被筛掉').toBe(true);

    window.history.replaceState(null, '', `/devlog/#${id}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(row.hidden, '锚点目标不能被筛掉（否则归档跳过来就是死链）').toBe(false);
    expect(visibleIds().sort()).toEqual(rows().map((item) => item.dataset.devlogId ?? '').sort());
    const toggle = row.querySelector<HTMLButtonElement>('[data-devlog-toggle]')!;
    expect(toggle.getAttribute('aria-expanded'), '锚点命中应自动展开').toBe('true');
  });

  // /devlog/ 仿照博客与归档提供搜索：关键词与「项目」筛选同时成立（AND），无结果给提示。
  it('搜索：关键词过滤，且与项目筛选同时成立（AND）', async () => {
    await loadPage();
    await importScripts();

    const searchRoot = document.querySelector<HTMLElement>('[data-entry-search]')!;
    const toggle = searchRoot.querySelector<HTMLElement>('[data-entry-search-toggle]')!;
    const input = searchRoot.querySelector<HTMLInputElement>('[data-entry-search-input]')!;
    expect(searchRoot.classList.contains('is-open'), '默认收起').toBe(false);

    click(toggle);
    expect(searchRoot.classList.contains('is-open'), '点放大镜应展开').toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const search = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // 防抖 120ms
      await new Promise((resolve) => setTimeout(resolve, 220));
    };

    // 关键词取第一行 kind（形如 breaking / feature），它只出现在该行的 kind 里
    const first = rows()[0]!;
    const term = first.querySelector<HTMLElement>('.devlog-row__kind')!.textContent!.trim();
    await search(term);

    const matchesTerm = (row: HTMLElement) =>
      [
        '.devlog-row__title',
        '.devlog-row__description',
        '.devlog-row__project',
        '.devlog-row__kind',
        '[data-devlog-panel]'
      ]
        .map((selector) => row.querySelector(selector)?.textContent ?? '')
        .join(' ')
        .toLowerCase()
        .includes(term.toLowerCase());

    await vi.waitFor(() => {
      expect(visibleRows().length).toBeGreaterThan(0);
      for (const row of visibleRows()) expect(matchesTerm(row), '可见行必须命中关键词').toBe(true);
      for (const row of rows()) {
        if (matchesTerm(row)) expect(row.hidden, '命中关键词的行必须可见').toBe(false);
      }
    });
    expect(subtitleText()).toContain(`共 ${visibleRows().length} 条更新`);

    // 叠加「另一个项目」的筛选 → 只剩交集
    const otherProject = projects().find((project) => project !== (term && first.dataset.devlogProject)) ?? projects()[0]!;
    clickOption(otherProject);
    await vi.waitFor(() => {
      for (const row of visibleRows()) {
        expect((row.dataset.devlogProject ?? '').trim()).toBe(otherProject);
        expect(matchesTerm(row)).toBe(true);
      }
    });

    // 无结果时给提示
    await search('zzz-不存在的关键词');
    await vi.waitFor(() => {
      expect(visibleRows().length).toBe(0);
    });
    expect(
      document.querySelector<HTMLElement>('[data-entry-search-feedback]')?.textContent
    ).toBe('未找到匹配内容');
  });

  it('正文末尾的链接组渲染成独立链接行，正文里不重复出现链接', async () => {
    await loadPage();

    const row = rows().find((item) => item.querySelector('.devlog-panel__prose .trailing-links'));
    expect(row, '至少一条更新应带末尾链接行').toBeDefined();

    const prose = row!.querySelector<HTMLElement>('.devlog-panel__prose')!;
    const linkRow = prose.querySelector<HTMLElement>('.trailing-links')!;
    expect(linkRow, '链接行使用共享的 .trailing-links 标记').not.toBeNull();
    expect(linkRow.parentElement).toBe(prose);
    // 链接组已从正文剥离，只出现在链接行里
    const anchors = Array.from(prose.querySelectorAll('a'));
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((anchor) => linkRow.contains(anchor)), '正文与链接行不应重复渲染链接').toBe(true);
    expect(linkRow.textContent ?? '').not.toContain('·');
  });

  const descriptionRows = () =>
    rows().filter(
      (row) =>
        row.querySelector('.devlog-row__description') && row.querySelector('[data-devlog-panel-summary]')
    );

  const feedWidths = (selector: (row: HTMLElement) => HTMLElement, scrollWidth: number, clientWidth: number) => {
    for (const row of descriptionRows()) {
      const target = selector(row);
      Object.defineProperty(target, 'scrollWidth', { configurable: true, value: scrollWidth });
      Object.defineProperty(target, 'clientWidth', { configurable: true, value: clientWidth });
    }
  };

  it('宽屏且每条都放得下：全部显示摘要，正文里不重复', async () => {
    await loadPage();
    await importScripts();

    const list = document.querySelector<HTMLElement>('[data-devlog-list]')!;
    expect(list.dataset.devlogExcerpts).toBe('inline');
    for (const row of descriptionRows()) {
      expect(row.querySelector<HTMLElement>('[data-devlog-panel-summary]')!.hidden).toBe(true);
    }
  });

  it('只要有一条被压缩：整体回退，摘要全部搬到正文顶部', async () => {
    await loadPage();
    // jsdom 没有布局：除第一条外都「放得下」，第一条「被压缩」
    feedWidths((row) => row.querySelector<HTMLElement>('.devlog-row__description')!, 100, 240);
    const first = descriptionRows()[0]!;
    Object.defineProperty(first.querySelector<HTMLElement>('.devlog-row__description')!, 'scrollWidth', {
      configurable: true,
      value: 400
    });

    await importScripts();

    const list = document.querySelector<HTMLElement>('[data-devlog-list]')!;
    expect(list.dataset.devlogExcerpts, '有一条放不下 → 所有摘要一起回退').toBe('fallback');
    for (const row of descriptionRows()) {
      const summary = row.querySelector<HTMLElement>('[data-devlog-panel-summary]')!;
      expect(summary.hidden, '回退态下每条都要在正文里给出完整摘要').toBe(false);
      const description = row.querySelector<HTMLElement>('.devlog-row__description')!;
      expect(summary.textContent?.trim()).toBe(description.textContent?.trim());
      expect(summary.parentElement?.classList.contains('devlog-panel__inner')).toBe(true);
    }
  });

  // 时间线收尾只认最后一条可见条目：按项目筛选后，新的「最后一条」也要把线收在它的日期上。
  it('按项目筛选后，时间线收尾跟着新的最后一条可见条目', async () => {
    await loadPage();
    await importScripts();

    const markedIds = () =>
      rows()
        .filter((row) => row.classList.contains('is-last-visible'))
        .map((row) => row.dataset.devlogId ?? '');
    expect(markedIds(), '初始应标记最后一行').toEqual([rows().at(-1)!.dataset.devlogId]);

    const project = projects()[0]!;
    const expectedLast = [...rows()]
      .reverse()
      .find((row) => (row.dataset.devlogProject ?? '').trim() === project)!.dataset.devlogId;

    clickOption(project);
    expect(markedIds(), '筛选后应改为标记该项目的最后一条').toEqual([expectedLast]);
  });

  // 摘要策略切换要淡入淡出而非硬切：切到回退时先播 opacity 1→0，动画结束后才落 `hidden`。
  it('摘要切换有淡出过渡，动画结束后才落 hidden', async () => {
    await loadPage();
    await importScripts();

    const list = document.querySelector<HTMLElement>('[data-devlog-list]')!;
    expect(list.dataset.devlogExcerpts, '前置条件：初始为 inline').toBe('inline');

    const originalAnimate = Element.prototype.animate;
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const calls: { target: Element; keyframes: unknown }[] = [];
    Element.prototype.animate = function (this: Element, keyframes: unknown) {
      calls.push({ target: this, keyframes });
      return { finished: Promise.resolve(), cancel: () => {} } as unknown as Animation;
    };
    /**
     * jsdom 不做布局（`offsetHeight` 恒为 0）→ 行高过渡会被「高度没变」跳过。
     * 这里喂一组「过渡前 96 / 过渡后 68」的高度，让行高过渡真的跑到。
     */
    const heightReads = new Map<HTMLElement, number>();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.hasAttribute('data-devlog-row')) return 0;
        const reads = (heightReads.get(this) ?? 0) + 1;
        heightReads.set(this, reads);
        return reads === 1 ? 96 : 68;
      }
    });

    try {
      // 让第一条「被压缩」，再触发一次重算（脚本监听 resize 并合帧）
      Object.defineProperty(
        descriptionRows()[0]!.querySelector<HTMLElement>('.devlog-row__description')!,
        'scrollWidth',
        { configurable: true, value: 400 }
      );
      window.dispatchEvent(new Event('resize'));
      await vi.waitFor(
        () => {
          expect(list.dataset.devlogExcerpts).toBe('fallback');
        },
        { timeout: 3000 }
      );
    } finally {
      Element.prototype.animate = originalAnimate;
      if (originalOffsetHeight) {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      } else {
        delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
      }
    }

    const keyframesOf = (call: { keyframes: unknown }) =>
      Array.isArray(call.keyframes) ? (call.keyframes as { opacity?: number; height?: string }[]) : [];

    // 列表里的摘要先淡出（1 → 0）
    const fadeOut = calls.find((call) => {
      const frames = keyframesOf(call);
      return frames[0]?.opacity === 1 && frames[1]?.opacity === 0;
    });
    expect(fadeOut, '切到回退时应当先播一次 1 → 0 的淡出').toBeTruthy();
    expect(fadeOut!.target.classList.contains('devlog-row__description')).toBe(true);

    // 行高过渡：过渡要覆盖到正文那一部分
    const heightTransition = calls.find((call) => keyframesOf(call)[0]?.height !== undefined);
    expect(heightTransition, '落状态后应当跑一次行高过渡').toBeTruthy();
    expect(heightTransition!.target.classList.contains('devlog-row')).toBe(true);

    // 正文里的完整摘要并行淡入（0 → 1）
    const summaryFadeIn = calls.find((call) => {
      const frames = keyframesOf(call);
      return frames[0]?.opacity === 0
        && frames[1]?.opacity === 1
        && call.target.hasAttribute('data-devlog-panel-summary');
    });
    expect(summaryFadeIn, '回退态下正文里的摘要要淡入').toBeTruthy();
  });

  it('窄屏：默认就把摘要放进正文（不测量）', async () => {
    await loadPage();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width: 900px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }));

    await importScripts();

    const list = document.querySelector<HTMLElement>('[data-devlog-list]')!;
    expect(list.dataset.devlogExcerpts).toBe('fallback');
    for (const row of descriptionRows()) {
      expect(row.querySelector<HTMLElement>('[data-devlog-panel-summary]')!.hidden).toBe(false);
    }
  });
});
