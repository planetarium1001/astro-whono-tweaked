import { getTagKeys, toTagKey } from '../lib/tags';
import {
  createSelectedChipActions,
  createSelectedChipBar,
  mountSelectedChipBar,
  setSearchPanelOpen,
  syncSubtitleCount,
  unmountSelectedChipBar,
  type SelectedChipHost
} from './selected-chip-bar';
import { applyExpressionToParams,
  buildExpressionTokens,
  createEmptyExpression,
  evaluateExpression,
  getPendingOp,
  hasAnyTag,
  isSingleSegment,
  isTagOp,
  listTagKeys,
  OP_CHAR,
  parseExpression,
  removeTag,
  setSegmentOp,
  switchLastNonEmptySegmentToOr,
  switchPendingOp,
  toggleTag,
  type ExpressionToken,
  type TagOp,
  type TagSegment
} from './tag-expression';
import { canAnimate, mergeFullyHiddenGroups, runVisibilityFade } from './visibility-fade';
import {
  buildSearchHaystack,
  createDebouncedAsyncRunner,
  createJsonIndexLoader,
  createWithBase,
  tokenizeSearchQuery
} from '../utils/format';

type IndexItem = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  text: string;
  date: string | null;
};

type PageItem = {
  el: HTMLElement;
  slug: string;
};

const root = document.querySelector<HTMLElement>('[data-entry-filters]');
const FILTER_DEBOUNCE_MS = 120;
const HOVER_PREVIEW_CLOSE_DELAY_MS = 48;
const HOVER_PREVIEW_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';

if (!root) {
  // 当前页没有条目搜索与标签入口。
} else {
  const searchRoot = root.querySelector<HTMLElement>('[data-entry-search]');
  const input = searchRoot?.querySelector<HTMLInputElement>('[data-entry-search-input]') ?? null;
  const toggleBtn = searchRoot?.querySelector<HTMLButtonElement>('[data-entry-search-toggle]') ?? null;
  const panel = searchRoot?.querySelector<HTMLElement>('[data-entry-search-panel]') ?? null;
  const feedbackEl = searchRoot?.querySelector<HTMLParagraphElement>('[data-entry-search-feedback]') ?? null;
  const liveEl = searchRoot?.querySelector<HTMLParagraphElement>('[data-entry-search-live]') ?? null;
  const tagTrigger = root.querySelector<HTMLElement>('[data-entry-tag-trigger]');
  /** 所有「打开标签选择器」的入口；控件条会被整体重建，因此每次现查，不缓存节点。 */
  const tagOpenButtons = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>('[data-entry-tag-open]'));
  const tagDialog = root.querySelector<HTMLDialogElement>('[data-entry-tag-dialog]');
  const tagCloseBtn = root.querySelector<HTMLButtonElement>('[data-entry-tag-close]');
  const tagDialogTitle = tagDialog?.querySelector<HTMLElement>('.entry-tags-dialog__title') ?? null;
  const tagOptionButtons = (): HTMLButtonElement[] =>
    Array.from(tagDialog?.querySelectorAll<HTMLButtonElement>('[data-entry-tag-key]') ?? []);
  const tagModeButtons = Array.from(tagDialog?.querySelectorAll<HTMLButtonElement>('[data-entry-tag-mode]') ?? []);
  /** 标题与标签列表之间的逻辑预览长胶囊（已选标签 + 运算符）。 */
  const tagExpressionEl = tagDialog?.querySelector<HTMLElement>('[data-entry-tag-expression]') ?? null;
  const tagClearBtn = tagDialog?.querySelector<HTMLButtonElement>('[data-entry-tag-clear]') ?? null;
  const tagEmptyHint = tagDialog?.querySelector<HTMLElement>('[data-entry-tag-empty]') ?? null;
  const tagSwitchOrBtn = tagDialog?.querySelector<HTMLButtonElement>('[data-entry-tag-switch-or]') ?? null;
  const pageTitleRow = root.querySelector<HTMLElement>('.page-title-row');
  const pageSubtitle = document.querySelector<HTMLElement>('.page-subtitle');
  const pageSubtitleTextEl = pageSubtitle?.querySelector<HTMLElement>('.page-subtitle__text') ?? null;
  /** 服务端渲染的副标题原文（含「共 N 篇」），客户端筛选后只替换其中的计数片段。 */
  const subtitleTemplate = pageSubtitleTextEl?.textContent ?? '';
  const indexUrlRaw = (root.dataset.indexUrl ?? '').trim();
  const sectionSelector = (root.dataset.sectionSelector ?? '').trim();

  const base = import.meta.env.BASE_URL ?? '/';
  const withBase = createWithBase(base);
  const indexUrl = indexUrlRaw ? withBase(indexUrlRaw) : '';
  const shouldBypassIndexCache = import.meta.env.DEV;

  const items: PageItem[] = Array.from(document.querySelectorAll<HTMLElement>('[data-entry-item]')).map((el) => ({
    el,
    slug: (el.getAttribute('data-slug') || '').trim()
  }));

  // 客户端分页：服务端分页已取消，分页在已渲染 DOM 上完成。
  const pageSizeRaw = Number.parseInt((root.dataset.pageSize ?? '').trim(), 10);
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : items.length || 1;
  const paginationNav = document.querySelector<HTMLElement>('[data-entry-pagination]');
  const paginationInner = document.querySelector<HTMLElement>('[data-entry-pagination-inner]');
  let currentPage = 1;
  let filteredItems: PageItem[] = items.slice();

  const sections = sectionSelector
    ? Array.from(document.querySelectorAll<HTMLElement>(sectionSelector))
    : [];
  const availableTagKeys = new Set(
    Array.from(root.querySelectorAll<HTMLElement>('[data-entry-tag-key]'))
      .map((el) => (el.dataset.entryTagKey ?? '').trim())
      .filter(Boolean)
  );

  /**
   * 已选标签的复合逻辑表达式（见 `tag-expression.ts`）：单段写成 `?tags=&mode=`，
   * 复合表达式追加与 tags 一一对应的 `?ops=`。
   */
  let tagExpression: TagSegment[] = createEmptyExpression();
  /** 已选标签（派生量，按出现顺序；表达式是唯一真相）。 */
  const selectedTagKeys = (): string[] => listTagKeys(tagExpression);

  /** `/archive/` 的 tag 入口称谓：「更新」档为「项目」，其余档为「标签」，取自根上的 `data-entry-tag-noun`。 */
  const tagNoun = () => (root.dataset.entryTagNoun ?? '').trim() || '标签';

  /**
   * 一级作用域（仅 `/archive/` 用）：'' = 全部，否则对应 `[data-entry-item][data-archive-kind]`。
   * 可见集合只由本脚本算出，胶囊只声明作用域。
   */
  let activeScope = '';
  const scopeOf = (el: HTMLElement) => (el.dataset.archiveKind ?? '').trim();
  const matchesScope = (el: HTMLElement) => activeScope === '' || scopeOf(el) === activeScope;

  /**
   * 年份维度（仅 `/bits/` 用）：`null` = 全部；年份读自条目 DOM 的 `data-entry-year`，
   * 不依赖 index.json。
   */
  let activeYear: number | null = null;
  const yearOf = (el: HTMLElement) => {
    const raw = (el.dataset.entryYear ?? '').trim();
    if (raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const matchesYear = (el: HTMLElement) => activeYear === null || yearOf(el) === activeYear;

  const setFeedbackStatus = (text: string) => {
    if (!feedbackEl) return;
    const next = text.trim();
    const nextHidden = next === '';
    if (feedbackEl.textContent === next && feedbackEl.hidden === nextHidden) return;
    feedbackEl.textContent = next;
    feedbackEl.hidden = nextHidden;
  };

  const setLiveStatus = (text: string) => {
    if (!liveEl) return;
    if (liveEl.textContent === text) return;
    liveEl.textContent = text;
  };

  /** `visible: false` = 只播报不占位（加载提示等）。 */
  const setStatus = (text: string, { visible = true }: { visible?: boolean } = {}) => {
    setFeedbackStatus(visible ? text : '');
    setLiveStatus(text);
  };

  const getTotalPages = (count: number) => Math.max(Math.ceil(count / pageSize), 1);

  /** 当前这一轮可见性过渡的令牌 + 结束信号（事件 detail 会带上，供分组标题延后收合）。 */
  let transitionRunId = 0;
  let transitionSettled: Promise<void> = Promise.resolve();

  /** 整块淡出 / 淡入；`/archive/` 的月份整组一起处理，`runId` 早于当前轮的过渡作废。 */
  const runVisibilityTransition = (
    hide: readonly PageItem[],
    show: readonly PageItem[],
    runId: number
  ): Promise<void> => {
    const hideItems = hide.map((item) => item.el);
    const showItems = show.map((item) => item.el);
    const hideBlocks = sectionSelector
      ? mergeFullyHiddenGroups(hideItems, sectionSelector, '[data-entry-item]')
      : hideItems;
    const showBlocks = sectionSelector
      ? mergeFullyHiddenGroups(showItems, sectionSelector, '[data-entry-item]')
      : showItems;

    return runVisibilityFade({
      hide: hideBlocks,
      show: showBlocks,
      apply: (targets, hidden) => {
        for (const target of targets) target.hidden = hidden;
        // 组与成员必须一起落：组显示了但成员还 hidden（或反之）都会出现空白块
        for (const el of hidden ? hideItems : showItems) el.hidden = hidden;
      },
      isStale: () => runId !== transitionRunId
    });
  };

  /** 下一次 renderPage 直接落 `hidden`，不逐条级联；只作用于紧随其后的那一次渲染。 */
  let instantRenderPending = false;
  const applyInstantItems = (next: PageItem[]) => {
    instantRenderPending = true;
    setFilteredItems(next);
  };

  /**
   * 广播本次可见的 slug 集合（分组标题据此收敛）；`transition` / `transitionId` 是过渡结束信号。
   * 从 `root` 派发：`transitionId` 只在单个实例内有意义。
   */
  const dispatchFiltered = (visibleInPage: Set<PageItem>, runId: number) => {
    root.dispatchEvent(
      new CustomEvent('entry-search:filtered', {
        bubbles: true,
        detail: {
          visibleSlugs: [...visibleInPage].map((item) => item.slug),
          scope: activeScope,
          year: activeYear,
          transitionId: runId,
          transition: transitionSettled
        }
      })
    );
  };

  const renderPage = () => {
    const totalPages = getTotalPages(filteredItems.length);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;

    // 必须遍历全部 items：未命中的条目不在 filteredItems 里。
    const visibleInPage = new Set(filteredItems.slice(start, end));

    const instant = instantRenderPending;
    instantRenderPending = false;

    if (instant) {
      // 容器级滑动过渡（`/bits/` 年份胶囊）：条目可见性同步落状态，动画由调用方在容器上做。
      // 仍要作废正在跑的那一轮淡入淡出，否则它会在滑动过程中继续改 DOM。
      transitionRunId += 1;
      for (const item of items) {
        item.el.hidden = !visibleInPage.has(item);
      }
      transitionSettled = Promise.resolve();
      renderPagination(totalPages);
      dispatchFiltered(visibleInPage, transitionRunId);
      return;
    }

    // 只把需要变化的条目按文档顺序排进计划：淡出在前、淡入在后。
    const hide: PageItem[] = [];
    const show: PageItem[] = [];
    for (const item of items) {
      if (!visibleInPage.has(item) && !item.el.hidden) hide.push(item);
    }
    for (const item of items) {
      if (visibleInPage.has(item) && item.el.hidden) show.push(item);
    }

    const runId = ++transitionRunId;
    transitionSettled = runVisibilityTransition(hide, show, runId).catch(() => {});

    renderPagination(totalPages);
    dispatchFiltered(visibleInPage, runId);
  };

  const gotoPage = (page: number) => {
    const totalPages = getTotalPages(filteredItems.length);
    const next = Math.min(Math.max(page, 1), totalPages);
    if (next === currentPage) return;
    currentPage = next;
    renderPage();
    const anchor = paginationNav ?? root;
    anchor.scrollIntoView({ block: 'nearest' });
  };

  const renderPagination = (totalPages: number) => {
    if (!paginationNav || !paginationInner) return;
    paginationInner.textContent = '';
    if (totalPages <= 1) {
      paginationNav.hidden = true;
      return;
    }
    paginationNav.hidden = false;

    const createButton = (label: string, page: number, options: { disabled?: boolean; current?: boolean; rel?: string } = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pagination__link';
      if (options.current) button.classList.add('is-current');
      if (options.rel) button.dataset.rel = options.rel;
      button.textContent = label;
      button.disabled = options.disabled === true;
      if (options.current) button.setAttribute('aria-current', 'page');
      button.setAttribute('aria-label', options.current ? `第 ${page} 页，当前页` : `第 ${page} 页`);
      button.addEventListener('click', () => gotoPage(page));
      return button;
    };

    paginationInner.append(
      createButton('上一页', currentPage - 1, { disabled: currentPage <= 1, rel: 'prev' })
    );

    // 页码过多时只保留「首页 / 当前页邻域 / 末页」，窄屏可横向 wrap。
    const windowSize = 2;
    const pages: (number | 'ellipsis')[] = [];
    for (let page = 1; page <= totalPages; page += 1) {
      const nearCurrent = Math.abs(page - currentPage) <= windowSize;
      if (page === 1 || page === totalPages || nearCurrent) {
        pages.push(page);
      } else if (pages.at(-1) !== 'ellipsis') {
        pages.push('ellipsis');
      }
    }

    for (const page of pages) {
      if (page === 'ellipsis') {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pagination__ellipsis';
        ellipsis.setAttribute('aria-hidden', 'true');
        ellipsis.textContent = '…';
        paginationInner.append(ellipsis);
        continue;
      }
      paginationInner.append(createButton(String(page), page, { current: page === currentPage }));
    }

    paginationInner.append(
      createButton('下一页', currentPage + 1, { disabled: currentPage >= totalPages, rel: 'next' })
    );
  };

  /** 只在目标地址与当前地址不同时 `replaceState`，避免多余的历史记录项。 */
  const replaceUrlIfChanged = (next: string) => {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState({}, '', next);
  };

  const urlFrom = (url: URL) =>
    `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash}`;

  /** 兼容旧的 `?tag=<label>`：原地改写为 `?tags=<key>&mode=and`，不触发导航。 */
  const syncLegacyTagParam = () => {
    const url = new URL(window.location.href);
    const rawTag = (url.searchParams.get('tag') ?? '').trim();
    if (!rawTag) return;

    url.searchParams.delete('tag');
    const tagKey = toTagKey(rawTag);
    if (tagKey && isUsableTagKey(tagKey)) {
      // 追加到表达式最后一个段，等价于在页面里点一下这个标签
      applyExpressionToParams(
        url.searchParams,
        toggleTag(parseExpression(url.searchParams, isUsableTagKey), tagKey)
      );
    }
    replaceUrlIfChanged(urlFrom(url));
  };

  const isUsableTagKey = (key: string) =>
    Boolean(key) && (availableTagKeys.size === 0 || availableTagKeys.has(key));

  const readInitialTagState = () => {
    tagExpression = parseExpression(new URL(window.location.href).searchParams, isUsableTagKey);
  };

  /** `?tags=&mode=`（或复合的 `?tags=&ops=`）用 `history.replaceState` 更新，不触发导航。 */
  const syncTagUrl = () => {
    const url = new URL(window.location.href);
    applyExpressionToParams(url.searchParams, tagExpression);
    replaceUrlIfChanged(urlFrom(url));
  };

  const syncTagSelectionUi = () => {
    for (const button of tagOptionButtons()) {
      const key = (button.dataset.entryTagKey ?? '').trim();
      const isActive = selectedTagKeys().includes(key);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
    // `+` / `/` 的激活态 = 当前待选段的运算符
    const pendingOp = getPendingOp(tagExpression);
    for (const button of tagModeButtons) {
      const isActive = button.dataset.entryTagMode === pendingOp;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
    if (tagClearBtn) tagClearBtn.hidden = !hasAnyTag(tagExpression);
    renderExpressionPreview();
    if (tagEmptyHint) tagEmptyHint.hidden = true;
    if (tagSwitchOrBtn) tagSwitchOrBtn.hidden = true;
  };

  /** 无筛选：可见集合回到全部条目（随后按页渲染）。 */
  const showAllItems = () => {
    filteredItems = items.slice();
    currentPage = 1;
    renderPage();
  };

  /** 作用域内的条目（不涉及标签/关键词/年份），供胶囊切换时直接算可见集合。 */
  const scopedItems = () => items.filter((item) => matchesScope(item.el) && matchesYear(item.el));

  /** 有筛选：可见集合变为命中集合，并从第 1 页重新计。 */
  const setFilteredItems = (next: PageItem[]) => {
    filteredItems = next;
    currentPage = 1;
    renderPage();
  };

  const syncSections = (hasActiveFilter: boolean) => {
    if (!sections.length) return;
    for (const section of sections) {
      const sectionItems = Array.from(section.querySelectorAll<HTMLElement>('[data-entry-item]'));
      const hasVisible = sectionItems.some((el) => !el.hidden);
      section.hidden = hasActiveFilter && !hasVisible;
    }
  };

  let indexHay: Map<string, string> | null = null;
  let indexTagKeys: Map<string, string[]> | null = null;
  let filterRunId = 0;
  let hoverCloseTimer: number | null = null;
  let hoverPreviewActive = false;
  const hoverPreviewMedia = window.matchMedia(HOVER_PREVIEW_MEDIA_QUERY);
  const filterRunner = createDebouncedAsyncRunner(() => applyFilter(), FILTER_DEBOUNCE_MS);

  const isSearchOpen = () => searchRoot?.classList.contains('is-open') ?? false;
  const supportsHoverPreview = () => hoverPreviewMedia.matches;

  const searchPanelParts = { toggle: toggleBtn, panel, input };
  const setSearchOpen = (open: boolean) => setSearchPanelOpen(searchRoot, searchPanelParts, open);

  const clearHoverCloseTimer = () => {
    if (hoverCloseTimer === null) return;
    window.clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  };

  const hasSearchValue = () => Boolean(input?.value.trim());

  const isInputFocused = () => document.activeElement === input;

  const closeSearch = (options: { reset?: boolean } = {}) => {
    clearHoverCloseTimer();
    hoverPreviewActive = false;
    if (options.reset) {
      resetSearch();
    }
    setSearchOpen(false);
  };

  const openSearchInteractive = (options: { focusInput?: boolean; preloadIndex?: boolean } = {}) => {
    clearHoverCloseTimer();
    hoverPreviewActive = false;
    setSearchOpen(true);
    if (options.focusInput) {
      window.setTimeout(() => input?.focus(), 0);
    }
    if (options.preloadIndex) {
      void loadIndex();
    }
  };

  const openSearchHoverPreview = () => {
    if (!supportsHoverPreview() || indexLoader.hasFailed()) return;
    clearHoverCloseTimer();
    if (isSearchOpen() && !hoverPreviewActive) return;
    hoverPreviewActive = true;
    setSearchOpen(true);
  };

  const scheduleHoverPreviewClose = () => {
    if (!supportsHoverPreview() || !hoverPreviewActive) return;
    clearHoverCloseTimer();
    hoverCloseTimer = window.setTimeout(() => {
      hoverCloseTimer = null;
      if (!hoverPreviewActive || hasSearchValue() || isInputFocused()) return;
      closeSearch();
    }, HOVER_PREVIEW_CLOSE_DELAY_MS);
  };

  /** 状态栏文案：标签筛选 / 关键词命中各有口径。 */
  const getStatusPrefix = (query: string, totalMatches: number) => {
    if (selectedTagKeys().length > 0 && query) {
      return `标签筛选下共命中 ${totalMatches} 条`;
    }
    if (selectedTagKeys().length > 0) {
      return `共 ${totalMatches} 篇内容`;
    }
    if (query) {
      return totalMatches === 0 ? '未找到匹配内容' : `命中 ${totalMatches} 条`;
    }
    return '';
  };

  /** `TagFilterHeader` 的 `.page-subtitle` 承载状态文案（描述 + 共 N 篇），控件条只补已选胶囊与动作。 */
  /** 标签 key → 展示标签（优先取 dialog 里的标签文案，回退到 key）。 */
  const labelForTagKey = (key: string) => {
    const button = tagOptionButtons().find((item) => (item.dataset.entryTagKey ?? '').trim() === key);
    const raw = button?.querySelector<HTMLElement>('.entry-tag-option__label')?.textContent ?? '';
    return raw.replace(/^#/, '').trim() || key;
  };

  /**
   * dialog 里的逻辑预览长胶囊：渲染 `tag-expression.ts` 产出的记号流
   * （`( #a + #b ) / #c`），新增的记号淡入、被移除的记号淡出后摘掉；
   * 括号是纯文本记号，不需要动画。
   */
  const expressionTokenElement = (token: ExpressionToken): HTMLElement => {
    if (token.type === 'tag') {
      const chip = document.createElement('span');
      chip.className = 'entry-tags-dialog__expression-chip';
      chip.textContent = `#${labelForTagKey(token.key)}`;
      return chip;
    }
    const span = document.createElement('span');
    if (token.type === 'op') {
      span.className = 'entry-tags-dialog__expression-op';
      span.textContent = OP_CHAR[token.op];
      return span;
    }
    span.className = 'entry-tags-dialog__expression-paren';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = token.side;
    return span;
  };

  const expressionTokenKey = (token: ExpressionToken, index: number): string => {
    if (token.type === 'tag') return `tag:${token.key}`;
    if (token.type === 'op') return `op:${index}:${token.op}`;
    return `paren:${index}:${token.side}`;
  };

  const renderExpressionPreview = () => {
    if (!tagExpressionEl) return;
    const tokens = buildExpressionTokens(tagExpression);

    if (tokens.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'entry-tags-dialog__expression-hint';
      hint.textContent = '选择标签后，这里会实时显示筛选逻辑';
      tagExpressionEl.replaceChildren(hint);
      tagExpressionEl.dataset.empty = 'true';
      tagExpressionEl.setAttribute('aria-label', '标签逻辑预览：暂无');
      return;
    }

    const reusable = new Map<string, HTMLElement>();
    for (const child of Array.from(tagExpressionEl.children)) {
      const el = child as HTMLElement;
      const key = el.dataset.exprKey;
      if (key) reusable.set(key, el);
    }

    const next: HTMLElement[] = [];
    const entering: HTMLElement[] = [];
    tokens.forEach((token, index) => {
      const key = expressionTokenKey(token, index);
      const reused = reusable.get(key);
      if (reused) {
        reusable.delete(key);
        next.push(reused);
        return;
      }
      const created = expressionTokenElement(token);
      created.dataset.exprKey = key;
      next.push(created);
      entering.push(created);
    });

    // 离场的记号先留在末尾淡出（`fill: forwards` + finished 后移除），避免硬切
    const leaving = Array.from(reusable.values());
    for (const el of leaving) delete el.dataset.exprKey;
    tagExpressionEl.replaceChildren(...next, ...leaving);
    tagExpressionEl.dataset.empty = 'false';

    for (const el of entering) {
      if (!canAnimate(el)) continue;
      el.animate(
        [
          { opacity: 0, transform: 'translateX(-6px) scale(0.94)' },
          { opacity: 1, transform: 'none' }
        ],
        { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
    for (const el of leaving) {
      if (!canAnimate(el)) {
        el.remove();
        continue;
      }
      const animation = el.animate(
        [{ opacity: 1 }, { opacity: 0, transform: 'scale(0.94)' }],
        { duration: 160, easing: 'ease-in', fill: 'forwards' }
      );
      animation.finished.then(() => el.remove()).catch(() => el.remove());
    }

    tagExpressionEl.setAttribute(
      'aria-label',
      `标签逻辑预览：${next.map((el) => el.textContent ?? '').join(' ')}`
    );
  };

  /** 已选标签控件条的挂载点（两行结构见 `selected-chip-bar.ts`）。 */
  const chipHost: SelectedChipHost = {
    titleRow: pageTitleRow,
    subtitle: pageSubtitle,
    pageHeading: pageTitleRow?.parentElement ?? null,
    tagTrigger
  };

  /** 同步选择器选中态 + URL + 页头控件条；所有会改动表达式的手势都走这里。 */
  const syncTagState = () => {
    syncTagSelectionUi();
    syncTagUrl();
    renderStatusBar();
  };

  const renderStatusBar = () => {
    if (!pageTitleRow) return;

    if (!hasAnyTag(tagExpression)) {
      // 清空时先播退场动画再移除；`Element.animate` 在 jsdom 里不存在，必须做能力检查。
      const existing = unmountSelectedChipBar(chipHost);
      if (existing && canAnimate(existing)) {
        const animation = existing.animate(
          [
            { opacity: 1, transform: 'translateX(0)' },
            { opacity: 0, transform: 'translateX(-8px)' }
          ],
          { duration: 160, easing: 'ease-in', fill: 'forwards' }
        );
        animation.finished.then(() => existing.remove()).catch(() => existing.remove());
      } else {
        existing?.remove();
      }
      return;
    }

    // 第一行按表达式记号流渲染：段内显示胶囊，跨段把左边括起来再显示该段运算符。
    mountSelectedChipBar(
      chipHost,
      createSelectedChipBar({
        itemNoun: tagNoun(),
        labelPrefix: '#',
        tokens: buildExpressionTokens(tagExpression),
        labelOf: labelForTagKey
      }),
      createSelectedChipActions(tagNoun())
    );
  };

  /** 实时刷新副标题里的「共 N 篇」计数。 */
  const applySubtitleCount = (count: number | null) =>
    syncSubtitleCount(pageSubtitleTextEl, subtitleTemplate, count, {
      defaultUnit: '篇',
      keep: '内容'
    });

  const setDegradedMode = () => {
    if (input) {
      input.placeholder = '索引加载失败';
      input.disabled = true;
      input.setAttribute('aria-disabled', 'true');
    }
    if (toggleBtn) {
      toggleBtn.disabled = true;
      toggleBtn.setAttribute('aria-disabled', 'true');
    }
    setSearchOpen(true);
    showAllItems();
    syncSections(false);
    setStatus('索引加载失败，已禁用搜索');
  };

  const indexLoader = createJsonIndexLoader<IndexItem>({
    url: indexUrl,
    shouldBypassCache: shouldBypassIndexCache,
    onPending: () => {
      setStatus('正在加载索引...', { visible: false });
    },
    onResolved: (data) => {
      indexHay = new Map(
        data.map((item) => [
          item.slug,
          buildSearchHaystack([item.title, item.description, item.tags, item.text])
        ])
      );
      indexTagKeys = new Map(data.map((item) => [item.slug, getTagKeys(item.tags)]));
      setStatus('');
    },
    onRejected: () => {
      setDegradedMode();
    }
  });

  const loadIndex = () => indexLoader.load();

  const applyFilter = async () => {
    filterRunner.cancel();

    const runId = ++filterRunId;
    const rawQuery = (input?.value || '').trim();
    const queryTerms = tokenizeSearchQuery(rawQuery);

    // 查询串为空也可能是纯标签 / 作用域 / 年份筛选，四者任一存在就进入匹配。
    if (
      queryTerms.length === 0
      && !hasAnyTag(tagExpression)
      && activeScope === ''
      && activeYear === null
    ) {
      showAllItems();
      syncSections(false);
      setStatus('');
      applySubtitleCount(null);
      return;
    }

    const index = await loadIndex();
    if (runId !== filterRunId) return;
    if (!index || !indexHay || !indexTagKeys) return;

    const matchedSlugs = new Set<string>();
    // 先用作用域与年份排除条目，避免再算标签。
    const scopeSlugs = new Set(
      items.filter((item) => matchesScope(item.el)).map((item) => item.slug).filter(Boolean)
    );
    const yearSlugs = new Set(
      items.filter((item) => matchesYear(item.el)).map((item) => item.slug).filter(Boolean)
    );

    for (const item of index) {
      if (activeScope !== '' && !scopeSlugs.has(item.slug)) continue;
      if (activeYear !== null && !yearSlugs.has(item.slug)) continue;
      const hay = indexHay.get(item.slug) || '';
      if (queryTerms.length > 0 && !queryTerms.every((term) => hay.includes(term))) continue;

      // 命中判定走复合表达式。
      if (hasAnyTag(tagExpression)) {
        const normalizedTagKeys = indexTagKeys.get(item.slug) ?? [];
        if (!evaluateExpression(tagExpression, normalizedTagKeys)) continue;
      }

      matchedSlugs.add(item.slug);
    }

    const matchedItems = items.filter((item) => item.slug && matchedSlugs.has(item.slug));
    setFilteredItems(matchedItems);
    syncSections(true);
    setStatus(getStatusPrefix(rawQuery, matchedSlugs.size));
    applySubtitleCount(matchedItems.length);
    updateTagEmptyHint(selectedTagKeys().length, matchedItems.length, queryTerms.length);
    syncTagSelectionUi();
  };

  /** AND 模式空结果时给出提示与「切换到 OR」。 */
  const updateTagEmptyHint = (tagCount: number, matchCount: number, queryTermCount: number) => {
    if (!tagEmptyHint) return;
    // 只有「单段 AND」才提示「切换到 /」——复合表达式下这句话没有意义
    const show = tagCount > 0
      && queryTermCount === 0
      && matchCount === 0
      && isSingleSegment(tagExpression)
      && getPendingOp(tagExpression) === 'and';
    tagEmptyHint.hidden = !show;
    if (tagSwitchOrBtn) tagSwitchOrBtn.hidden = !show;
  };

  /** 消费掉深链接里的 `?picker=tag`，避免刷新时重复弹窗。 */
  const removePickerParam = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('picker') !== 'tag') return;
    url.searchParams.delete('picker');
    replaceUrlIfChanged(`${url.pathname}${url.search}${url.hash}`);
  };

  const setTagDialogExpanded = (expanded: boolean) => {
    // 页头入口与控件条里的入口都要同步
    for (const button of tagOpenButtons()) {
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    tagTrigger?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  const finalizeTagDialogClose = () => {
    if (tagDialog?.open) return;
    setTagDialogExpanded(false);
    removePickerParam();
  };

  const openTagDialog = (options: { focusTitle?: boolean } = {}) => {
    if (!tagDialog || tagDialog.open) return;
    if (typeof tagDialog.showModal === 'function') {
      tagDialog.showModal();
      if (options.focusTitle && tagDialogTitle) {
        window.requestAnimationFrame(() => {
          tagDialogTitle.focus({ preventScroll: true });
        });
      }
      setTagDialogExpanded(true);
      return;
    }
    tagDialog.setAttribute('open', '');
    if (options.focusTitle && tagDialogTitle) {
      window.requestAnimationFrame(() => {
        tagDialogTitle.focus({ preventScroll: true });
      });
    }
    setTagDialogExpanded(true);
  };

  const closeTagDialog = () => {
    if (!tagDialog) return;
    if (typeof tagDialog.close === 'function') {
      tagDialog.close();
      return;
    }
    tagDialog.removeAttribute('open');
    finalizeTagDialogClose();
  };

  const resetSearch = () => {
    if (input) input.value = '';
    showAllItems();
    syncSections(false);
    setStatus('');
  };

  // 顺序不能换：先把旧的 `?tag=` 改写成 `?tags=&mode=`，再读取标签状态，
  // 否则 `?tag=x` 首次进入不会过滤，要刷新一次才生效。
  syncLegacyTagParam();
  readInitialTagState();
  setSearchOpen(false);
  setTagDialogExpanded(false);
  syncTagSelectionUi();
  renderStatusBar();
  renderPage();
  if (hasAnyTag(tagExpression)) {
    void applyFilter();
  }

  /** 一级胶囊（`/archive/`）声明作用域；切作用域时清空已选标签（标签集合按作用域派生）。 */
  document.addEventListener('entry-search:set-scope', (event) => {
    const detail = (event as CustomEvent<{ scope?: string; clearTags?: boolean; instant?: boolean }>).detail ?? {};
    const nextScope = (detail.scope ?? '').trim();
    // 容器级滑动过渡：本次可见性同步落状态。
    const instant = detail.instant === true;
    activeScope = nextScope === 'all' ? '' : nextScope;

    if (detail.clearTags !== false && hasAnyTag(tagExpression)) {
      tagExpression = createEmptyExpression();
      syncTagState();
    }

    const scopeFallback = !hasAnyTag(tagExpression) && (input?.value ?? '').trim() === '';
    if (scopeFallback && activeScope === '' && activeYear === null) {
      if (instant) applyInstantItems(items.slice());
      else showAllItems();
      syncSections(false);
      applySubtitleCount(null);
      return;
    }
    // 作用域内没有标签/关键词时直接用 scopedItems，避免多走一次 index 请求
    if (scopeFallback) {
      if (instant) applyInstantItems(scopedItems());
      else setFilteredItems(scopedItems());
      syncSections(true);
      applySubtitleCount(null);
      return;
    }
    void applyFilter();
  });

  /** 年份胶囊（`/bits/`）声明年份；与作用域不同，这里保留已选标签。 */
  document.addEventListener('entry-search:set-year', (event) => {
    const detail = (event as CustomEvent<{ year?: number | string | null; instant?: boolean }>).detail ?? {};
    const raw = detail.year;
    const parsed = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    activeYear = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    // 容器级滑动过渡：本次可见性同步落状态
    const instant = detail.instant === true;

    // 只有年份时不必请求索引：作用域内直接按年份过滤
    if (!hasAnyTag(tagExpression) && (input?.value ?? '').trim() === '' && activeScope === '') {
      const next = activeYear === null ? items.slice() : scopedItems();
      if (instant) applyInstantItems(next);
      else if (activeYear === null) showAllItems();
      else setFilteredItems(next);
      syncSections(activeYear !== null);
      applySubtitleCount(null);
      return;
    }
    void applyFilter();
  });

  toggleBtn?.addEventListener('click', () => {
    if (hoverPreviewActive) {
      openSearchInteractive({ focusInput: true, preloadIndex: true });
      return;
    }
    const next = !isSearchOpen();
    if (next) {
      openSearchInteractive({ focusInput: true, preloadIndex: true });
      return;
    }
    closeSearch({ reset: true });
  });

  input?.addEventListener('focus', () => {
    openSearchInteractive({ preloadIndex: true });
  });

  input?.addEventListener('input', () => {
    filterRunner.schedule();
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSearch({ reset: true });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void applyFilter();
    }
  });

  const handleHoverPreviewLeave = (event: PointerEvent) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && searchRoot?.contains(nextTarget)) return;
    scheduleHoverPreviewClose();
  };

  searchRoot?.addEventListener('pointerenter', openSearchHoverPreview);
  searchRoot?.addEventListener('pointerleave', handleHoverPreviewLeave);

  document.addEventListener('click', (event) => {
    const target = event.target as Node | null;
    if (!target) return;
    if (!isSearchOpen()) return;
    if (indexLoader.hasFailed()) return;
    if (searchRoot?.contains(target)) return;
    if (hasSearchValue()) return;
    closeSearch();
  });

  /**
   * 已选标签的委托处理器，同时覆盖控件条与 dialog 内的清除按钮（不另注册，否则会重复处理）。
   * 判断顺序不可改：先 open、再 clear、再 op、最后 remove（且要求 key 非空）。
   */
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // `#标签` / 「切换标签」= 继续筛选（打开标签选择器）
    if (target.closest('[data-entry-tag-open]')) {
      event.preventDefault();
      openTagDialog();
      return;
    }

    if (target.closest('[data-entry-tag-clear]')) {
      event.preventDefault();
      tagExpression = createEmptyExpression();
      syncTagState();
      void applyFilter();
      return;
    }

    const opButton = target.closest<HTMLElement>('[data-entry-tag-op]');
    if (opButton) {
      event.preventDefault();
      const rawIndex = Number.parseInt(opButton.dataset.entryTagOpSegment ?? '', 10);
      const segmentIndex = Number.isFinite(rawIndex) ? rawIndex : 0;
      const currentOp: TagOp = isTagOp(opButton.dataset.entryTagOp) ? opButton.dataset.entryTagOp : 'and';
      tagExpression = setSegmentOp(tagExpression, segmentIndex, currentOp === 'and' ? 'or' : 'and');
      syncTagState();
      void applyFilter();
      return;
    }

    const removeBtn = target.closest<HTMLElement>('[data-entry-tag-remove]');
    const removeKey = (removeBtn?.dataset.entryTagRemove ?? '').trim();
    if (removeBtn && removeKey) {
      event.preventDefault();
      tagExpression = removeTag(tagExpression, removeKey);
      syncTagState();
      void applyFilter();
    }
  });

  /** 标签按钮：切换选中态，不导航、不关闭 dialog。 */
  tagDialog?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLButtonElement>('[data-entry-tag-key]');
    if (!option) return;
    event.preventDefault();
    const key = (option.dataset.entryTagKey ?? '').trim();
    if (!key) return;

    tagExpression = toggleTag(tagExpression, key);

    syncTagState();
    void applyFilter();
  });

  /** `+` / `/` 开关：待选段非空时把已选部分括起来并追加新段，为空时只改本段运算符。 */
  tagModeButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const nextMode: TagOp = button.dataset.entryTagMode === 'or' ? 'or' : 'and';
      if (nextMode === getPendingOp(tagExpression)) return;
      tagExpression = switchPendingOp(tagExpression, nextMode);
      syncTagState();
      void applyFilter();
    });
  });

  /** 0 命中提示里的「切换到 /」：把最后一个非空段改成 OR。 */
  tagSwitchOrBtn?.addEventListener('click', () => {
    tagExpression = switchLastNonEmptySegmentToOr(tagExpression);
    syncTagState();
    void applyFilter();
  });

  tagCloseBtn?.addEventListener('click', () => {
    closeTagDialog();
  });

  tagDialog?.addEventListener('cancel', () => {
    window.requestAnimationFrame(() => {
      finalizeTagDialogClose();
    });
  });

  tagDialog?.addEventListener('close', () => {
    finalizeTagDialogClose();
  });

  tagDialog?.addEventListener('click', (event) => {
    if (event.target === tagDialog) {
      closeTagDialog();
    }
  });

  if (new URLSearchParams(window.location.search).get('picker') === 'tag') {
    if (tagDialog) {
      openTagDialog({ focusTitle: true });
    }
    removePickerParam();
  }
}
