import {
  createSelectedChipActions,
  createSelectedChipBar,
  mountSelectedChipBar,
  setSearchPanelOpen,
  syncSubtitleCount,
  unmountSelectedChipBar,
  type SelectedChipHost
} from './selected-chip-bar';
import { runVisibilityFade } from './visibility-fade';
import {
  buildSearchHaystack,
  createDebouncedAsyncRunner,
  tokenizeSearchQuery
} from '../utils/format';

/**
 * `/devlog/` 的项目筛选与页头搜索，取值域只有 `project`；搜索用每行已渲染文本，与项目条件同时成立。
 * 本页只有本脚本写 `hidden`，抽屉展开由 `devlog-drawer.ts` 负责。
 */

const dialog = document.querySelector<HTMLDialogElement>('[data-entry-tag-dialog]');
const listEl = document.querySelector<HTMLElement>('[data-devlog-list]');

if (dialog && listEl) {
  const ROWS = Array.from(listEl.querySelectorAll<HTMLElement>('[data-devlog-row]'));
  const OPTIONS = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-entry-tag-key]'));
  const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-entry-tag-trigger]'));
  const clearButton = dialog.querySelector<HTMLButtonElement>('[data-entry-tag-clear]');
  const countEl = dialog.querySelector<HTMLElement>('[data-entry-tag-count]');
  const subtitleTextEl = document.querySelector<HTMLElement>('.page-subtitle__text');
  const subtitle = document.querySelector<HTMLElement>('.page-subtitle');
  const titleRow = document.querySelector<HTMLElement>('.page-title-row');
  const pageHeading = titleRow?.parentElement ?? null;
  const subtitleTemplate = subtitleTextEl?.textContent ?? '';

  /** 页头搜索：结构与 `/blog/` 一致（`TagFilterHeader` 的 `showSearch`），交互自己接。 */
  const searchRoot = document.querySelector<HTMLElement>('[data-entry-search]');
  const searchToggle = searchRoot?.querySelector<HTMLButtonElement>('[data-entry-search-toggle]') ?? null;
  const searchPanel = searchRoot?.querySelector<HTMLElement>('[data-entry-search-panel]') ?? null;
  const searchInput = searchRoot?.querySelector<HTMLInputElement>('[data-entry-search-input]') ?? null;
  const searchFeedback = searchRoot?.querySelector<HTMLElement>('[data-entry-search-feedback]') ?? null;
  const searchLive = searchRoot?.querySelector<HTMLElement>('[data-entry-search-live]') ?? null;

  let activeValue = '';
  let activeQuery = '';
  let runId = 0;

  const optionValue = (option: HTMLButtonElement) => (option.dataset.entryTagKey ?? '').trim();
  const matchesProject = (row: HTMLElement, value: string) =>
    value === '' || (row.dataset.devlogProject ?? '').trim() === value;

  /** 每行只算一次 haystack（全量渲染的文本：标题 / 摘要 / 项目 / kind / 正文）。 */
  const haystackCache = new Map<HTMLElement, string>();
  const haystackOf = (row: HTMLElement) => {
    const cached = haystackCache.get(row);
    if (cached !== undefined) return cached;
    const next = buildSearchHaystack([
      row.querySelector('.devlog-row__title')?.textContent,
      row.querySelector('.devlog-row__description')?.textContent,
      row.querySelector('.devlog-row__project')?.textContent,
      row.querySelector('.devlog-row__kind')?.textContent,
      row.querySelector('[data-devlog-panel]')?.textContent
    ]);
    haystackCache.set(row, next);
    return next;
  };

  const matchesQuery = (row: HTMLElement, query: string) => {
    const terms = tokenizeSearchQuery(query);
    if (terms.length === 0) return true;
    const haystack = haystackOf(row);
    return terms.every((term) => haystack.includes(term));
  };

  /** 当前可见 = 「项目 ∧ 关键词」。 */
  const matches = (row: HTMLElement) =>
    matchesProject(row, activeValue) && matchesQuery(row, activeQuery);

  /** 副标题里的「共 N 条更新」跟着筛选结果走。 */
  const applySubtitleCount = (visible: number | null) =>
    syncSubtitleCount(subtitleTextEl, subtitleTemplate, visible, {
      defaultUnit: '条',
      keep: '更新'
    });

  const syncOptions = () => {
    for (const option of OPTIONS) {
      const isActive = optionValue(option) === activeValue;
      option.classList.toggle('is-active', isActive);
      option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
    if (clearButton) clearButton.hidden = activeValue === '';
    if (countEl) countEl.textContent = `共 ${Math.max(OPTIONS.length - 1, 0)} 个项目`;
  };

  const chipHost: SelectedChipHost = {
    titleRow,
    subtitle,
    pageHeading,
    tagTrigger: triggers[0] ?? null
  };

  /** 已选项目胶囊 + 第二行动作；未选中时整块移除并回到单行页头。 */
  const renderChip = () => {
    if (!activeValue || !titleRow || !subtitle) {
      unmountSelectedChipBar(chipHost)?.remove();
      return;
    }
    mountSelectedChipBar(
      chipHost,
      createSelectedChipBar({
        items: [{ key: activeValue, label: activeValue }],
        itemNoun: '项目',
        labelPrefix: ''
      }),
      createSelectedChipActions('项目')
    );
  };

  /** 时间线收尾只认最后一条可见条目，标记按计划结果同步打上。 */
  const markLastVisibleRow = () => {
    const lastVisible = [...ROWS].reverse().find((row) => matches(row)) ?? null;
    for (const row of ROWS) {
      row.classList.toggle('is-last-visible', row === lastVisible);
    }
  };

  /** 搜索状态文案（与 `/blog/` 的 `entry-search` 同一套口径）。 */
  const syncSearchStatus = (visible: number) => {
    const hasQuery = tokenizeSearchQuery(activeQuery).length > 0;
    const text = !hasQuery ? '' : visible === 0 ? '未找到匹配内容' : `命中 ${visible} 条`;
    if (searchFeedback) {
      if (searchFeedback.textContent !== text) searchFeedback.textContent = text;
      searchFeedback.hidden = text === '';
    }
    if (searchLive && searchLive.textContent !== text) searchLive.textContent = text;
  };

  /** 按「项目 ∧ 关键词」重算可见集合并整体过渡一次，不翻页滑动。 */
  const runPlan = (options: { animate?: boolean } = {}) => {
    const animate = options.animate ?? true;
    const id = ++runId;
    const hide: HTMLElement[] = [];
    const show: HTMLElement[] = [];
    for (const row of ROWS) {
      const hit = matches(row);
      if (hit && row.hidden) show.push(row);
      if (!hit && !row.hidden) hide.push(row);
    }

    // 计数与逐条状态同步落，不等动画。
    const visibleAfter = ROWS.filter((row) => matches(row)).length;
    applySubtitleCount(visibleAfter);
    syncOptions();
    renderChip();
    markLastVisibleRow();
    syncSearchStatus(visibleAfter);

    if (!animate) {
      for (const row of hide) row.hidden = true;
      for (const row of show) row.hidden = false;
      return;
    }

    void runVisibilityFade({
      hide,
      show,
      apply: (targets, hidden) => {
        for (const target of targets) target.hidden = hidden;
      },
      isStale: () => id !== runId,
      total: 380,
      stagger: 50
    }).then(() => {
      if (id !== runId) return;
      // 兜底：动画结束后再校准一次（例如取消动画导致中途落下的 hidden）
      const visible = ROWS.filter((row) => !row.hidden).length;
      applySubtitleCount(visible);
    });
  };

  /** 切换「项目」筛选：值没变就不重算。 */
  const apply = (value: string, options: { animate?: boolean } = {}) => {
    if (value === activeValue) return;
    activeValue = value;
    runPlan(options);
  };

  /** 关键词变化（防抖后）重算；关键词不改变项目状态。 */
  const applyQuery = (query: string) => {
    if (query === activeQuery) return;
    activeQuery = query;
    runPlan({ animate: true });
  };

  const queryRunner = createDebouncedAsyncRunner(() => applyQuery((searchInput?.value ?? '').trim()), 120);

  const searchPanelParts = { toggle: searchToggle, panel: searchPanel, input: searchInput };
  const setSearchOpen = (open: boolean) => setSearchPanelOpen(searchRoot, searchPanelParts, open);

  const resetSearch = () => {
    if (searchInput) searchInput.value = '';
    queryRunner.cancel();
    applyQuery('');
  };

  const openSearch = (focusInput = true) => {
    setSearchOpen(true);
    if (focusInput) window.setTimeout(() => searchInput?.focus(), 0);
  };

  const closeSearch = (options: { reset?: boolean } = {}) => {
    if (options.reset) resetSearch();
    setSearchOpen(false);
  };

  if (searchToggle) {
    searchToggle.addEventListener('click', () => {
      if (searchRoot?.classList.contains('is-open')) {
        closeSearch({ reset: true });
        return;
      }
      openSearch(true);
    });
  }

  searchInput?.addEventListener('input', () => queryRunner.schedule());
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch({ reset: true });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      queryRunner.cancel();
      applyQuery((searchInput.value ?? '').trim());
    }
  });

  /** 点击面板之外关闭（保留关键词与结果，与 `/blog/` 的搜索一致）。 */
  document.addEventListener('click', (event) => {
    const target = event.target as Node | null;
    if (!target || !searchRoot?.classList.contains('is-open')) return;
    if (searchRoot.contains(target)) return;
    if ((searchInput?.value ?? '').trim() !== '') return;
    closeSearch();
  });

  setSearchOpen(false);

  const openDialog = () => {
    try {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } catch {
      dialog.setAttribute('open', '');
    }
    for (const trigger of triggers) trigger.setAttribute('aria-expanded', 'true');
  };

  const closeDialog = () => {
    try {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    } catch {
      dialog.removeAttribute('open');
    }
    for (const trigger of triggers) trigger.setAttribute('aria-expanded', 'false');
  };

  // 触发器：拦截默认跳转，改为打开 dialog（无 JS 时仍可访问静态回退）
  for (const trigger of triggers) {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      if (dialog.open) {
        closeDialog();
        return;
      }
      openDialog();
    });
  }

  // 已选胶囊上的 `项目名` / `×` / 「切换项目 / 清除筛选」都用事件委托
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-entry-tag-clear]') || target.closest('[data-entry-tag-remove]')) {
      apply('');
      closeDialog();
      return;
    }
    const open = target.closest('[data-entry-tag-open]');
    // 触发器自己那一份由上面的循环处理（这里只接管胶囊与「切换项目」）
    if (open && !open.hasAttribute('data-entry-tag-trigger') && !dialog.open) openDialog();
  });

  dialog.querySelector<HTMLElement>('[data-entry-tag-close]')?.addEventListener('click', closeDialog);

  // 点击 dialog 之外的遮罩区域关闭（`<dialog>` 自身覆盖整屏时点击目标是 dialog）
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });

  OPTIONS.forEach((option) => {
    option.addEventListener('click', () => {
      const value = optionValue(option);
      // 单选：点已选中的项目 = 回到全部（与「全部」选项等价）
      apply(value === activeValue ? '' : value);
      closeDialog();
    });
  });

  clearButton?.addEventListener('click', () => {
    apply('');
    closeDialog();
  });

  /** 锚点命中被筛掉的条目时复位到「全部」，否则归档跳过来就是死链。 */
  const revealHashTarget = () => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim();
    if (!id) return;
    const row = listEl.querySelector<HTMLElement>(`[data-devlog-row][data-devlog-id="${CSS.escape(id)}"]`);
    if (!row || !row.hidden) return;
    apply('', { animate: false });
  };

  /** URL 里的 `?project=`（归档时间线的项目名链接会带过来）——首屏直接按它筛选。 */
  const initialValue = new URLSearchParams(window.location.search).get('project')?.trim() ?? '';
  const hasInitialMatch = OPTIONS.some((option) => optionValue(option) === initialValue);

  syncOptions();
  renderChip();
  markLastVisibleRow();
  syncSearchStatus(ROWS.length);
  if (initialValue && hasInitialMatch) apply(initialValue, { animate: false });
  revealHashTarget();
  window.addEventListener('hashchange', revealHashTarget);
}
