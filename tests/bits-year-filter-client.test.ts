// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGES,
  importEntrySearch,
  loadPage,
  pageItems,
  stubEntrySearchEnvironment,
  visibleSlugs
} from './entry-search-harness';

/**
 * `/bits/` 年份胶囊的端到端客户端行为测试：真实页面 HTML + 真实 index.json + 真实脚本
 * （entry-search.ts + bits-year-filter.ts）跑交互，断言可见性收敛与 `?year=` 双向一致。
 */

type BitsIndexItem = { slug: string; year: number | null };

const BITS_PAGE = PAGES[0];

const allItems = () => pageItems();
const visibleYears = () =>
  allItems()
    .filter((el) => !el.hidden)
    .map((el) => (el.dataset.entryYear ?? '').trim());

const yearPill = (year: string) =>
  document.querySelector<HTMLButtonElement>(`[data-bits-year-item][data-bits-year="${year}"]`);

const clickPill = (year: string) => {
  const pill = yearPill(year);
  expect(pill, `找不到年份胶囊：${year || '全部'}`).not.toBeNull();
  pill!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

const currentYearParam = () => new URL(window.location.href).searchParams.get('year');

describe('bits 年份胶囊客户端行为', () => {
  beforeEach(() => {
    stubEntrySearchEnvironment('/bits/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('胶囊条：第一项是「全部」且默认选中，其余年份按倒序排列', async () => {
    await loadPage(BITS_PAGE);
    await importEntrySearch({ bitsYear: true });

    const pills = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-bits-year-item]'));
    expect(pills.length).toBeGreaterThan(1);
    expect(pills[0]!.dataset.bitsYear).toBe('');
    expect(pills[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(pills[0]!.textContent?.trim()).toBe('全部');

    const years = pills.slice(1).map((pill) => Number(pill.dataset.bitsYear));
    expect(years).toEqual([...years].sort((a, b) => b - a));
    for (const pill of pills.slice(1)) {
      expect(pill.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('筛选前全部条目可见', async () => {
    const { indexItems: index } = await loadPage<BitsIndexItem>(BITS_PAGE);
    await importEntrySearch({ bitsYear: true });

    expect(visibleSlugs().length).toBe(allItems().length);
    expect(index.length).toBe(allItems().length);
  });

  it('点击某一年：只剩该年条目', async () => {
    const { indexItems: index } = await loadPage<BitsIndexItem>(BITS_PAGE);
    await importEntrySearch({ bitsYear: true });

    const target = index.find((item) => item.year !== null)!.year!;
    const expected = index
      .filter((item) => item.year === target)
      .map((item) => item.slug)
      .sort();

    clickPill(String(target));

    expect(visibleSlugs().sort()).toEqual(expected);
    expect(visibleYears().every((year) => year === String(target))).toBe(true);
    expect(yearPill(String(target))!.getAttribute('aria-pressed')).toBe('true');
    expect(yearPill('')!.getAttribute('aria-pressed')).toBe('false');
    expect(currentYearParam()).toBe(String(target));
    // 滑块代码路径必须真的跑过（jsdom 里尺寸为 0，但 ready 标记会落下）
    expect(document.querySelector<HTMLElement>('[data-bits-year-bar]')!.dataset.ready).toBe('true');
  });

  it('再点「全部」：条目全部恢复，URL 上的年份参数被清掉', async () => {
    await loadPage(BITS_PAGE);
    await importEntrySearch({ bitsYear: true });

    clickPill('2026');
    expect(visibleSlugs().length).toBeLessThan(allItems().length);

    clickPill('');

    expect(visibleSlugs().length).toBe(allItems().length);
    expect(yearPill('')!.getAttribute('aria-pressed')).toBe('true');
    expect(currentYearParam()).toBeNull();
  });

  it('带 ?year= 直接打开：初始即按该年筛选，胶囊同步为选中态', async () => {
    const { indexItems: index } = await loadPage<BitsIndexItem>(BITS_PAGE);
    const target = index.find((item) => item.year !== null)!.year!;
    window.history.replaceState(null, '', `/bits/?year=${target}`);

    await importEntrySearch({ bitsYear: true });

    expect(visibleYears().every((year) => year === String(target))).toBe(true);
    expect(yearPill(String(target))!.getAttribute('aria-pressed')).toBe('true');
    expect(yearPill('')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('非法的 ?year= 静默忽略：回落到全部，并清掉脏参数', async () => {
    await loadPage(BITS_PAGE);
    window.history.replaceState(null, '', '/bits/?year=1999');

    await importEntrySearch({ bitsYear: true });

    expect(visibleSlugs().length).toBe(allItems().length);
    expect(yearPill('')!.getAttribute('aria-pressed')).toBe('true');
    expect(currentYearParam()).toBeNull();
  });
});
