import {
  buildSearchHaystack,
  createDebouncedAsyncRunner,
  createJsonIndexLoader,
  createWithBase,
  tokenizeSearchQuery
} from '../utils/format';

const form = document.querySelector<HTMLFormElement>('[data-bits-search-form]');
const input = document.getElementById('bits-search') as HTMLInputElement | null;
const btn = document.getElementById('bits-search-btn') as HTMLButtonElement | null;
const statusEl = document.getElementById('bits-search-status') as HTMLDivElement | null;
const liveEl = document.getElementById('bits-search-live') as HTMLParagraphElement | null;
const browseRoot = document.querySelector<HTMLElement>('[data-bits-browse]');
const resultsRoot = document.querySelector<HTMLElement>('[data-bits-search-results]');
const resultsSummaryEl = document.querySelector<HTMLElement>('[data-bits-search-results-summary]');
const resultsListEl = document.querySelector<HTMLElement>('[data-bits-search-results-list]');
const clearBtn = document.querySelector<HTMLButtonElement>('[data-bits-search-clear]');

const base = import.meta.env.BASE_URL ?? '/';
const withBase = createWithBase(base);
const indexUrl = withBase('bits/index.json');

const FILTER_DEBOUNCE_MS = 120;
const MAX_VISIBLE_RESULTS = 50;
const QUERY_PARAM_QUERY = 'q';
const QUERY_PARAM_YEAR = 'year';

type IndexItem = {
  key?: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  text: string;
  excerpt?: string;
  date: string | null;
  dateLabel?: string | null;
  /** 年份胶囊声明后，关键词搜索也要落在当前年份内。 */
  year?: number | null;
  page?: number;
  href?: string;
  thumbnail?: {
    src: string;
    width?: number;
    height?: number;
    alt: string;
  } | null;
};

const getIndexKey = (item: Pick<IndexItem, 'key' | 'slug'>) => (item.key || item.slug || '').trim();
const shouldBypassIndexCache = import.meta.env.DEV;

let indexHay: Map<string, string> | null = null;
let filterRunId = 0;
/** 当前年份（null = 全部），由 `bits-year-filter.ts` 通过 `entry-search:set-year` 声明。 */
let activeYear: number | null = null;
const filterRunner = createDebouncedAsyncRunner(() => applyFilter(), FILTER_DEBOUNCE_MS);

const getTrimmedQuery = () => (input?.value || '').trim();

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const includesAnyTerm = (value: string, terms: string[]) => {
  if (!value.trim()) return false;
  if (!terms.length) return true;
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
};

const getCurrentBitsPage = () => {
  const match = window.location.pathname.match(/\/bits(?:\/page\/(\d+))?\/?$/);
  if (!match) return 1;

  const page = Number(match[1] ?? '1');
  return Number.isFinite(page) && page > 0 ? page : 1;
};

const getContextSnippet = (value: string, terms: string[], maxLength = 120) => {
  const normalized = value.trim();
  if (!normalized) return '';
  if (!terms.length) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  const lower = normalized.toLowerCase();
  let matchIndex = -1;
  let matchedTerm = '';

  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
      matchedTerm = term;
    }
  }

  if (matchIndex < 0) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  const before = Math.max(0, matchIndex - Math.floor((maxLength - matchedTerm.length) / 2));
  const after = Math.min(normalized.length, before + maxLength);
  const snippet = normalized.slice(before, after).trim();
  const prefix = before > 0 ? '…' : '';
  const suffix = after < normalized.length ? '…' : '';
  return `${prefix}${snippet}${suffix}`;
};

const getDisplaySnippet = (item: IndexItem, terms: string[]) => {
  const candidates = [
    item.description?.trim() ?? '',
    item.excerpt?.trim() ?? '',
    item.text?.trim() ?? '',
    item.title?.trim() ?? ''
  ].filter(Boolean);

  const matchedCandidate = candidates.find((value) => includesAnyTerm(value, terms));
  const source = matchedCandidate || candidates[0] || '';
  if (!source) return '';

  return getContextSnippet(source, terms, 120);
};

const highlightText = (value: string, terms: string[]) => {
  if (!value) return '';
  if (!terms.length) return escapeHtml(value);

  const validTerms = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!validTerms.length) return escapeHtml(value);

  const regex = new RegExp(`(${validTerms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = value.split(regex);

  return parts
    .map((part) => {
      if (!part) return '';
      const matched = validTerms.some((term) => part.toLowerCase() === term.toLowerCase());
      const escaped = escapeHtml(part);
      return matched ? `<mark class="bit-search-result__mark">${escaped}</mark>` : escaped;
    })
    .join('');
};

const getDisplayTags = (tags: string[]) => {
  const visibleTags = Array.isArray(tags)
    ? tags.filter((tag) => typeof tag === 'string' && tag.trim() !== '')
    : [];
  const placeTag = visibleTags.find((tag) => tag.toLowerCase().startsWith('loc:')) ?? '';
  const placeText = placeTag ? placeTag.slice(4).trim() : '';
  const normalTags = visibleTags.filter((tag) => tag !== placeTag);

  return {
    placeText,
    normalTags
  };
};

const setTextIfChanged = (el: HTMLElement | null, text: string) => {
  if (!el || el.textContent === text) return;
  el.textContent = text;
};

/** `visible: false` = 只播报不占位（加载提示等）。 */
const setStatus = (text: string, { visible = true }: { visible?: boolean } = {}) => {
  setTextIfChanged(statusEl, visible ? text : '');
  setTextIfChanged(liveEl, text);
};

const formatResultsSummary = (count: number) => {
  return count > MAX_VISIBLE_RESULTS
    ? `找到 ${count} 条结果，当前显示前 ${MAX_VISIBLE_RESULTS} 条`
    : `找到 ${count} 条结果`;
};

const isResultsVisible = () => resultsRoot?.hasAttribute('hidden') === false;
const getFirstResultLink = () => resultsListEl?.querySelector<HTMLAnchorElement>('.bit-search-result__link') ?? null;
const getFilterUrl = (query: string) => {
  const nextUrl = new URL(window.location.href);
  nextUrl.hash = '';
  if (query) {
    nextUrl.searchParams.set(QUERY_PARAM_QUERY, query);
  } else {
    nextUrl.searchParams.delete(QUERY_PARAM_QUERY);
  }
  // 不要动 `?year=`：年份参数归 `bits-year-filter.ts` 独占。
  const search = nextUrl.searchParams.toString();
  return `${nextUrl.pathname}${search ? `?${search}` : ''}`;
};

const syncUrlState = (query = getTrimmedQuery()) => {
  const next = getFilterUrl(query);
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) {
    window.history.replaceState({}, '', next);
  }
};

/** 只读 `?q=`；`?year=` 归 `bits-year-filter.ts`。 */
const readInitialState = () => {
  const url = new URL(window.location.href);
  return { query: (url.searchParams.get(QUERY_PARAM_QUERY) ?? '').trim() };
};

const showBrowse = () => {
  browseRoot?.removeAttribute('hidden');
  resultsRoot?.setAttribute('hidden', 'true');
  if (resultsListEl) {
    resultsListEl.innerHTML = '';
  }
  if (resultsSummaryEl) {
    resultsSummaryEl.textContent = '搜索结果';
  }
};

const EMPTY_RESULTS_TEXT = '未找到相关内容，换个关键词试试。';

const renderResults = (matchedItems: IndexItem[]) => {
  if (!resultsRoot || !resultsListEl) return;

  const visibleItems = matchedItems.slice(0, MAX_VISIBLE_RESULTS);
  const summary = formatResultsSummary(matchedItems.length);
  const currentBitsPage = getCurrentBitsPage();

  if (resultsSummaryEl) {
    resultsSummaryEl.textContent = summary;
  }

  resultsListEl.innerHTML = visibleItems
    .map((item) => {
      const query = getTrimmedQuery();
      const queryTerms = tokenizeSearchQuery(query);
      const snippet = getDisplaySnippet(item, queryTerms);
      const dateLabel = item.dateLabel?.trim() ?? '';
      const pageHint = item.page && item.page !== currentBitsPage ? `来自第 ${item.page} 页` : '';
      const { placeText, normalTags } = getDisplayTags(item.tags ?? []);
      const place = placeText
        ? `<span class="bit-search-result__tag bit-search-result__tag--place">📍 ${highlightText(placeText, queryTerms)}</span>`
        : '';
      const tags = normalTags
        .slice(0, 3)
        .map((tag) => `<span class="bit-search-result__tag">#${highlightText(tag.trim(), queryTerms)}</span>`)
        .join('');
      const metaTrail = [
        dateLabel
          ? `<time class="bit-search-result__date" datetime="${escapeHtml(item.date ?? '')}">${escapeHtml(dateLabel)}</time>`
          : '',
        pageHint ? `<span class="bit-search-result__page">${escapeHtml(pageHint)}</span>` : ''
      ]
        .filter(Boolean)
        .join('<span class="bit-search-result__sep" aria-hidden="true">·</span>');
      const href = item.href ? escapeHtml(item.href) : withBase('bits/');
      const thumbnail = item.thumbnail
        ? `
          <div class="bit-search-result__thumb">
            <img
              src="${escapeHtml(item.thumbnail.src)}"
              alt="${escapeHtml(item.thumbnail.alt || snippet || '絮语配图')}"
              ${item.thumbnail.width ? `width="${item.thumbnail.width}"` : ''}
              ${item.thumbnail.height ? `height="${item.thumbnail.height}"` : ''}
              loading="lazy"
              decoding="async"
            />
          </div>
        `
        : '';

      return `
        <article class="bit-card bit-card--search-result">
          <a class="bit-search-result__link" href="${href}">
            <div class="bit-search-result__layout${thumbnail ? ' bit-search-result__layout--media' : ''}">
              ${thumbnail}
              <div class="bit-search-result__content">
                ${snippet ? `<p class="bit-search-result__excerpt">${highlightText(snippet, queryTerms)}</p>` : ''}
                ${place || tags || metaTrail
                  ? `
                    <div class="bit-search-result__footer">
                      ${place || tags ? `<div class="bit-search-result__tags">${place}${tags}</div>` : '<div></div>'}
                      ${metaTrail ? `<div class="bit-search-result__meta-line">${metaTrail}</div>` : ''}
                    </div>
                  `
                  : ''}
              </div>
            </div>
          </a>
        </article>
      `;
    })
    .join('');

  browseRoot?.setAttribute('hidden', 'true');
  resultsRoot.removeAttribute('hidden');
};

const filterIndexItems = (index: IndexItem[], queryTerms: string[], year: number | null) =>
  index.filter((item) => {
    const key = getIndexKey(item);
    if (!key) return false;
    if (year !== null && item.year !== year) return false;
    const hay = indexHay?.get(key) || '';
    return queryTerms.every((term) => hay.includes(term));
  });

const resetFilters = (options: { focusInput?: boolean } = {}) => {
  filterRunId += 1;
  filterRunner.cancel();
  if (input) {
    input.value = '';
  }
  showBrowse();
  setStatus('');
  syncUrlState('');
  if (options.focusInput) {
    input?.focus();
  }
};

const setDegradedMode = () => {
  if (input) {
    input.placeholder = '索引加载失败';
    input.disabled = true;
    input.setAttribute('aria-disabled', 'true');
  }
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
  setStatus('索引加载失败，已禁用搜索');
  showBrowse();
};

const indexLoader = createJsonIndexLoader<IndexItem>({
  url: indexUrl,
  shouldBypassCache: shouldBypassIndexCache,
  onPending: () => {
    setStatus('正在加载索引...', { visible: false });
  },
  onResolved: (data) => {
    indexHay = new Map(
      data
        .map((item) => [
          getIndexKey(item),
          buildSearchHaystack([item.title, item.description, item.tags, item.text])
        ] as const)
        .filter(([key]) => key !== '')
    );
    setStatus('');
  },
  onRejected: () => {
    setDegradedMode();
  }
});

const loadIndex = () => indexLoader.load();

const applyFilter = async () => {
  if (!input) return;
  filterRunner.cancel();

  const runId = ++filterRunId;
  const rawQuery = getTrimmedQuery();
  const queryTerms = tokenizeSearchQuery(rawQuery);

  if (rawQuery === '') {
    showBrowse();
    setStatus('');
    syncUrlState('');
    return;
  }

  const index = await loadIndex();
  if (runId !== filterRunId || getTrimmedQuery().toLowerCase() !== rawQuery.toLowerCase()) {
    return;
  }
  if (!index || !indexHay) {
    showBrowse();
    return;
  }

  syncUrlState(rawQuery);

  const matchedItems = filterIndexItems(index, queryTerms, activeYear);
  if (matchedItems.length === 0) {
    showBrowse();
    if (resultsRoot && resultsListEl) {
      if (resultsSummaryEl) {
        resultsSummaryEl.textContent = '无匹配结果';
      }
      resultsListEl.innerHTML = `<p class="bits-search-results__empty">${escapeHtml(EMPTY_RESULTS_TEXT)}</p>`;
      browseRoot?.setAttribute('hidden', 'true');
      resultsRoot.removeAttribute('hidden');
    }
    setStatus('');
    return;
  }

  renderResults(matchedItems);
  setStatus('');
};

input?.addEventListener('focus', () => {
  void loadIndex();
});

input?.addEventListener('input', () => {
  filterRunner.schedule();
});

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    resetFilters({ focusInput: true });
    return;
  }
  if (event.key !== 'ArrowDown' || !isResultsVisible()) return;
  const firstResultLink = getFirstResultLink();
  if (!firstResultLink) return;
  event.preventDefault();
  firstResultLink.focus();
});

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  void applyFilter();
});

clearBtn?.addEventListener('click', () => {
  resetFilters({ focusInput: true });
});

resultsListEl?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>('a[href]');
  if (!link) return;

  const nextUrl = new URL(link.href, window.location.href);
  const currentUrl = new URL(window.location.href);
  if (nextUrl.pathname !== currentUrl.pathname) {
    return;
  }

  event.preventDefault();
  resetFilters();

  if (!nextUrl.hash) return;
  const targetEl = document.getElementById(nextUrl.hash.slice(1));
  if (!targetEl) {
    window.location.hash = nextUrl.hash;
    return;
  }

  const basePath = getFilterUrl('');
  window.history.replaceState({}, '', basePath);
  window.requestAnimationFrame(() => {
    window.location.hash = nextUrl.hash;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

resultsListEl?.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp') return;
  const target = event.target as HTMLElement | null;
  const currentLink = target?.closest<HTMLAnchorElement>('.bit-search-result__link');
  const firstResultLink = getFirstResultLink();
  if (!currentLink || !firstResultLink || currentLink !== firstResultLink) return;
  event.preventDefault();
  input?.focus();
});

const initialState = readInitialState();
if (input && initialState.query) {
  input.value = initialState.query;
}
syncUrlState(initialState.query);

/**
 * 年份胶囊声明年份后，搜索结果必须落在同一年份内；初始值也从 `?year=` 读一次
 * （带 `?q=&year=` 打开时事件可能早于本脚本求值）。
 */
const readYearParam = () => {
  const raw = (new URL(window.location.href).searchParams.get(QUERY_PARAM_YEAR) ?? '').trim();
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

activeYear = readYearParam();

document.addEventListener('entry-search:set-year', (event) => {
  const detail = (event as CustomEvent<{ year?: number | string | null }>).detail ?? {};
  const raw = detail.year;
  const parsed = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  activeYear = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  // 只有在有查询词时才需要重算结果面板；纯年份切换由 entry-search 负责列表可见性
  if (getTrimmedQuery() !== '') void applyFilter();
});

if (initialState.query) {
  void applyFilter();
}
