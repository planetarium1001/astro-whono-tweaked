// 浏览数据（PV / UV）的 DOM 契约与填值 helper。
//
// 主题只渲染槽位与样式，数字由 src/scripts/view-stats.ts 填入；
// 未填值的槽位保持 hidden，不占位、不引起重排。

export type ViewStatKey = 'pv' | 'uv';

/** 槽位挂载完成、可以填值时在 document 上派发 */
export const VIEW_STATS_READY_EVENT = 'astro-whono:view-stats-ready';
export const VIEW_STATS_ROOT_SELECTOR = '[data-view-stats]';
export const VIEW_STATS_ITEM_SELECTOR = '[data-view-stat]';
export const VIEW_STATS_VALUE_SELECTOR = '[data-view-stat-value]';

const numberFormatter = new Intl.NumberFormat('zh-CN');

/** 数字千分位；「1.2万」这类非数字文本原样返回 */
export const formatViewStatValue = (value: number | string): string => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? numberFormatter.format(value) : '';
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^[\d.,\s]+$/.test(text)) {
    const numeric = Number(text.replace(/[,\s]/g, ''));
    if (Number.isFinite(numeric)) return numberFormatter.format(numeric);
  }
  return text;
};

/** 当前页面的槽位；传 stat 时只取对应种类 */
export const resolveViewStats = (
  stat?: ViewStatKey,
  root: ParentNode = document
): HTMLElement[] => {
  const items = Array.from(root.querySelectorAll<HTMLElement>(VIEW_STATS_ITEM_SELECTOR));
  return stat ? items.filter((item) => item.dataset.viewStat === stat) : items;
};

/** 写入数字并摘掉 hidden；item 可传槽位本身或其 [data-view-stat-value] */
export const setViewStatValue = (item: Element, value: number | string): void => {
  const target = item.matches(VIEW_STATS_VALUE_SELECTOR)
    ? item
    : item.querySelector(VIEW_STATS_VALUE_SELECTOR);
  if (!(target instanceof HTMLElement)) return;

  target.textContent = formatViewStatValue(value);
  if (item instanceof HTMLElement) item.hidden = false;
};

export const dispatchViewStatsReady = (): void => {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent(VIEW_STATS_READY_EVENT));
};
