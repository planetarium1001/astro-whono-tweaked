// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTagKeys } from '../src/lib/tags';
import {
  PAGES,
  clickTag,
  importEntrySearch,
  loadPage,
  pageItems,
  stubEntrySearchEnvironment,
  stubMatchMedia,
  tagButtons,
  visibleSlugs
} from './entry-search-harness';

/**
 * 级联动效测试：串行，一次只走一步。
 *
 * 这一组要替换 Element.prototype.animate 并自己控制时钟，因此单独成文件。
 * jsdom 没有 Web Animations API，这里给可控的假实现：记录目标元素、起止时刻与方向，
 * 只在测试推进时钟时 resolve finished，用于断言串行语义、旧队列作废与分组收合时机。
 */

type FakeAnimationRecord = {
  el: Element;
  isEntryItem: boolean;
  kind: 'hide' | 'show';
  /** 原始关键帧（用于断言滑动方向） */
  frames: { opacity?: number; transform?: string }[];
  start: number;
  end: number;
  settled: boolean;
  cancelled: boolean;
  resolveFinished: () => void;
  rejectFinished: (error: unknown) => void;
};

const createAnimationHarness = () => {
  const records: FakeAnimationRecord[] = [];
  let clock = 0;
  const originalAnimate = Element.prototype.animate;

  Element.prototype.animate = function fakeAnimate(
    this: Element,
    keyframes: unknown,
    options?: unknown
  ) {
    const frames = Array.isArray(keyframes) ? (keyframes as { opacity?: number }[]) : [];
    const duration = Number((options as { duration?: number } | undefined)?.duration ?? 0);
    // 「错峰开始、同时结束」完全由 delay + duration 表达，假动画必须识别
    const delay = Number((options as { delay?: number } | undefined)?.delay ?? 0);
    let resolveFinished = () => {};
    let rejectFinished = (_error: unknown) => {};
    const finished = new Promise<void>((resolve, reject) => {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    const record: FakeAnimationRecord = {
      el: this,
      isEntryItem: this instanceof Element && this.hasAttribute('data-entry-item'),
      // 淡出以 opacity: 1 起手、淡入以 opacity: 0 起手
      kind: frames[0]?.opacity === 1 ? 'hide' : 'show',
      frames: frames as { opacity?: number; transform?: string }[],
      start: clock + delay,
      end: clock + delay + duration,
      settled: false,
      cancelled: false,
      resolveFinished,
      rejectFinished
    };
    records.push(record);
    return {
      finished,
      cancel: () => {
        if (record.cancelled) return;
        record.cancelled = true;
        rejectFinished(new Error('animation aborted'));
      }
    } as unknown as Animation;
  };

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  /** 推进假时钟 ms 毫秒，并结算所有到期动画（再冲一次微任务队列）。 */
  const step = async (ms: number) => {
    clock += ms;
    for (const record of records) {
      if (!record.settled && !record.cancelled && record.end <= clock) {
        record.settled = true;
        record.resolveFinished();
      }
    }
    await flush();
    await flush();
  };

  // 推进到最近的动画结束点并结算；串行实现下下一步会在同一时刻起步，
  // 因此 next.start === prev.end 可被精确断言。
  const stepToNextBoundary = async () => {
    await flush();
    const pending = records.filter((record) => !record.settled && !record.cancelled);
    if (pending.length > 0) {
      clock = Math.max(clock, Math.min(...pending.map((record) => record.end)));
    }
    for (const record of pending) {
      if (record.end > clock) continue;
      record.settled = true;
      record.resolveFinished();
    }
    await flush();
    await flush();
  };

  /** 一路推进到没有挂起动画（每次走到最近的一个动画结束点）。 */
  const settleAll = async (maxRounds = 200) => {
    for (let round = 0; round < maxRounds; round += 1) {
      await flush();
      const pending = records.filter((record) => !record.settled && !record.cancelled);
      if (pending.length === 0) {
        await flush();
        if (records.every((record) => record.settled || record.cancelled)) return;
        continue;
      }
      clock = Math.max(clock, Math.min(...pending.map((record) => record.end)));
      for (const record of pending) {
        if (record.end > clock) continue;
        record.settled = true;
        record.resolveFinished();
      }
    }
  };

  return {
    records,
    step,
    stepToNextBoundary,
    settleAll,
    now: () => clock,
    // 必须要求 el.isConnected：上一例留下的旧实例仍可能在跑自己的队列
    //（vi.resetModules() 不回收它们），其目标元素已从文档摘掉，不过滤会被算成本例的动画。

    entryItemRecords: (kind?: 'hide' | 'show') =>
      records.filter(
        (record) =>
          record.isEntryItem
          && record.el.isConnected
          && (kind === undefined || record.kind === kind)
      ),
    /** 当前页面里某个容器上的动画（胶囊切换的左右滑动过渡）。 */
    containerRecords: (selector: string) =>
      records.filter((record) => record.el.isConnected && record.el.matches(selector)),
    restore: () => {
      if (originalAnimate) {
        Element.prototype.animate = originalAnimate;
      } else {
        delete (Element.prototype as { animate?: unknown }).animate;
      }
    }
  };
};

/** 命中数最少的标签 → 需要淡出的条目最多，最能体现串行。 */
const fewestMatchingTagKey = (indexItems: { slug: string; tags: string[] }[]) => {
  const countFor = (key: string) =>
    indexItems.filter((item) => getTagKeys(item.tags).includes(key)).length;
  const keys = tagButtons().map((el) => (el.dataset.entryTagKey ?? '').trim());
  return keys.sort((a, b) => countFor(a) - countFor(b))[0]!;
};

/** /bits/ 年份胶囊，已剔除「全部」：结果按年份倒序，第 1 项最新。 */
const bitsYearPills = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-bits-year-item][data-bits-year]'))
    .filter((el) => (el.dataset.bitsYear ?? '').trim() !== '');

const clickBitsYear = (year: string) => {
  const pill = document.querySelector<HTMLElement>(
    `[data-bits-year-item][data-bits-year="${year}"]`
  );
  expect(pill, `需要 ${year} 年份胶囊`).not.toBeNull();
  pill!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return pill!;
};

/** 某一年份下的条目 slug，从已渲染条目推导，不绑定示例内容。 */
const slugsForYear = (year: string) =>
  pageItems()
    .filter((el) => (el.dataset.entryYear ?? '').trim() === year)
    .map((el) => (el.dataset.slug ?? '').trim())
    .sort();

describe('级联动效：串行，一次只走一步', () => {
  let harness: ReturnType<typeof createAnimationHarness>;

  /** 动画记录的最后一帧 transform，用于断言滑动终点。 */
  const lastFrame = (record: (typeof harness.records)[number]) => record.frames.at(-1)?.transform ?? '';
  /** 动画记录的第一帧 transform，用于断言滑动起点。 */
  const firstFrame = (record: (typeof harness.records)[number]) => record.frames[0]?.transform ?? '';

  beforeEach(() => {
    stubEntrySearchEnvironment();
    harness = createAnimationHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('blog：淡出是一个整体，一次计划全部、错峰起步、同时结束', async () => {
    const { indexItems } = await loadPage(PAGES[1]);
    await importEntrySearch();

    const key = fewestMatchingTagKey(indexItems);
    const hiddenSlugs = new Set(
      indexItems.filter((item) => !getTagKeys(item.tags).includes(key)).map((item) => item.slug)
    );
    const expectedHideOrder = pageItems()
      .filter((el) => hiddenSlugs.has((el.dataset.slug ?? '').trim()))
      .map((el) => (el.dataset.slug ?? '').trim());
    expect(expectedHideOrder.length, '这个标签至少要隐藏 3 条才验证得了串行').toBeGreaterThanOrEqual(3);

    await clickTag(key);

    const hides = () => harness.entryItemRecords('hide');

    // 点击后整批动画同时创建，不逐条排队
    expect(hides().length, '需要变化的条目应当一次性全部进入过渡').toBe(expectedHideOrder.length);

    // 顺序 = 文档顺序（自上而下扫过）
    expect(hides().map((record) => (record.el as HTMLElement).dataset.slug)).toEqual(expectedHideOrder);

    // 错峰起步：起点单调递增，且后一条不等前一条结束（重叠才是一个整体）
    const starts = hides().map((record) => record.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts.at(-1)!).toBeGreaterThan(starts[0]!);
    expect(hides()[1]!.start).toBeLessThan(hides()[0]!.end);

    // 同时结束：所有淡出动画的终点完全相同
    expect(new Set(hides().map((record) => record.end)).size, '所有条目必须同时结束').toBe(1);
    // 让最后一步也落地，然后确认可见集合收敛到命中集合
    await harness.settleAll();
    expect(visibleSlugs().sort()).toEqual(
      indexItems
        .filter((item) => getTagKeys(item.tags).includes(key))
        .map((item) => item.slug)
        .sort()
    );
  });

  it('blog：条目再多也是同一个总时长，错峰自然变密、尾部不拖长', async () => {
    const { indexItems } = await loadPage(PAGES[1]);
    await importEntrySearch();

    const key = fewestMatchingTagKey(indexItems);
    await clickTag(key);

    const hides = harness.entryItemRecords('hide');
    expect(hides.length).toBeGreaterThan(0);

    // 总时长固定：第一条时长就是整段过渡时长
    const total = hides[0]!.end - hides[0]!.start;
    expect(total).toBeLessThanOrEqual(420);
    expect(new Set(hides.map((record) => record.end)).size, '全部同时结束').toBe(1);

    // 每个条目的可见时长不短于下限（错峰被夹取，而不是把尾部拖到 420 之后）
    const durations = hides.map((record) => record.end - record.start);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(150);

    await harness.settleAll();
    expect(harness.entryItemRecords('hide').every((record) => record.cancelled || record.settled)).toBe(true);
  });

  it('blog：新一轮筛选立即取代旧队列', async () => {
    const { indexItems } = await loadPage(PAGES[1]);
    await importEntrySearch();

    const key = fewestMatchingTagKey(indexItems);
    await clickTag(key);
    // 走完第一步，让第二步开始 —— 此时队列处于「进行到一半」
    await harness.step(1000);
    expect(harness.entryItemRecords('hide').length).toBeGreaterThanOrEqual(2);

    const recordedBefore = harness.records.length;
    const clear = document.querySelector<HTMLElement>('[data-entry-tag-clear]');
    expect(clear, '需要控件条上的清除按钮').not.toBeNull();
    clear!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await harness.settleAll();

    // 旧队列被作废：清除之后不得再产生任何「淡出」条目动画
    const lateHides = harness.records
      .slice(recordedBefore)
      .filter((record) => record.isEntryItem && record.kind === 'hide');
    expect(lateHides.length, '旧队列必须立即停止，不能继续往下吞').toBe(0);

    // 且最终收敛到「全部可见」
    expect(visibleSlugs().length).toBe(pageItems().length);
  });

  it('prefers-reduced-motion：不排动画队列，直接落状态', async () => {
    await loadPage(PAGES[1]);
    stubMatchMedia(true);
    await importEntrySearch();

    const key = tagButtons()[0]!.dataset.entryTagKey!.trim();
    await clickTag(key);

    expect(harness.entryItemRecords().length, '减少动效时不应创建任何条目动画').toBe(0);
    expect(visibleSlugs().length).toBeLessThan(pageItems().length);
  });

  it('archive：整组被筛空时，先让这一组淡完，再收合年月分组标题', async () => {
    const { indexItems } = await loadPage(PAGES[2]);
    await importEntrySearch({ archiveScope: true });

    const groups = () => Array.from(document.querySelectorAll<HTMLElement>('[data-archive-group]'));
    const slugsOf = (group: HTMLElement) =>
      Array.from(group.querySelectorAll<HTMLElement>('[data-entry-item]')).map((el) =>
        (el.dataset.slug ?? '').trim()
      );

    // 找一个「只命中部分分组」的标签，才能观察到「整组被筛空」
    const candidates = tagButtons().map((el) => (el.dataset.entryTagKey ?? '').trim());
    const target = candidates.find((key) => {
      const matched = new Set(
        indexItems.filter((item) => getTagKeys(item.tags).includes(key)).map((item) => item.slug)
      );
      const groupsWithMatches = groups().filter((group) =>
        slugsOf(group).some((slug) => matched.has(slug))
      ).length;
      return groupsWithMatches > 0 && groupsWithMatches < groups().length;
    });
    expect(target, '需要一个只命中部分年月分组的标签').toBeTruthy();

    await clickTag(target!);

    // 行还在逐条淡出：此时不能已经把分组 hidden，
    // 父级 display:none 会当场掐掉还没轮到的行，表现为硬切。
    expect(
      groups().every((group) => !group.hidden),
      '级联进行中不得提前收合分组'
    ).toBe(true);

    await harness.settleAll();

    const matched = new Set(
      indexItems.filter((item) => getTagKeys(item.tags).includes(target!)).map((item) => item.slug)
    );

    // 分组收合是异步的（等 transition 走完），因此用 waitFor；
    // 同时先钉住可见集合收敛到命中集合，否则分组断言会掩盖真正的失败原因。
    await vi.waitFor(
      () => {
        expect(visibleSlugs().sort()).toEqual([...matched].sort());
        for (const group of groups()) {
          const hasMatch = slugsOf(group).some((slug) => matched.has(slug));
          expect(group.hidden, hasMatch ? '有命中的分组必须保留' : '整组无命中的分组必须收合').toBe(!hasMatch);
        }
        expect(groups().some((group) => group.hidden), '本用例需要至少一个被筛空的分组').toBe(true);
      },
      { timeout: 3000 }
    );
  });

  // 归档的两种过渡：一级胶囊走横向滑动，标签筛选走竖直整块淡入淡出。
  // 两段过渡都不能让页头参与动画。
  it('archive：一级胶囊切换走内容左右滑动（页头不参与）', async () => {
    await loadPage(PAGES[2]);
    await importEntrySearch({ archiveScope: true });

    const devlogPill = document.querySelector<HTMLElement>('[data-archive-scope="devlog"]')!;
    devlogPill.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const slides = () => harness.containerRecords('[data-archive-content]');
    // 动的是内容容器，而不是包住页头的外层容器
    expect(slides().length).toBe(1);
    expect(slides()[0]!.kind).toBe('hide');
    expect(
      harness.containerRecords('[data-archive-timeline]').length,
      '不应再对包住页头的容器做滑动'
    ).toBe(0);

    // 页头完全没有动画
    for (const selector of ['.page-title', '.page-subtitle', '.page-heading']) {
      const header = document.querySelector(selector);
      if (!header) continue;
      expect(harness.records.filter((record) => record.el === header).length, `页头 ${selector} 不应有动画`).toBe(0);
    }

    // 滑动期间不叠逐条淡出（两套动作不能同时跑）
    expect(harness.entryItemRecords().length).toBe(0);

    // 推进到滑出结束（中间可能还有别的动画边界，例如上一轮标签胶囊的退场）
    for (let step = 0; step < 5 && slides().length < 2; step += 1) {
      await harness.stepToNextBoundary();
    }
    expect(slides().length).toBe(2);
    expect(slides()[1]!.kind, '第二段必须是从另一侧滑入').toBe('show');
    expect(slides()[1]!.start).toBeGreaterThanOrEqual(slides()[0]!.end);
    expect(harness.entryItemRecords().length).toBe(0);

    await harness.settleAll();
    const devlogSlugs = pageItems()
      .filter((el) => (el.dataset.archiveKind ?? '').trim() === 'devlog')
      .map((el) => (el.dataset.slug ?? '').trim())
      .sort();
    expect(visibleSlugs().sort()).toEqual(devlogSlugs);
    expect(devlogPill.getAttribute('aria-pressed')).toBe('true');
  });

  it('archive：标签筛选走竖直整块淡出，整月作为一块（不与滑动叠加）', async () => {
    const { indexItems } = await loadPage(PAGES[2]);
    await importEntrySearch({ archiveScope: true });

    const keys = Array.from(
      document.querySelectorAll<HTMLElement>('[data-entry-tag-key]'),
      (el) => (el.dataset.entryTagKey ?? '').trim()
    ).filter(Boolean);
    expect(keys.length, '归档 dialog 需要标签可点').toBeGreaterThan(0);

    // 选一个能筛掉内容的标签（隐藏集合非空）
    let picked = '';
    for (const key of keys) {
      const hides = indexItems.some((item) => !getTagKeys(item.tags).includes(key));
      if (hides) {
        picked = key;
        break;
      }
    }
    expect(picked, '需要一个会筛掉内容的标签').not.toBe('');

    // 必须走 clickTag（内部等 aria-pressed + 250ms）：标签筛选是防抖的，
    // 直接派发 click 就断言会读到还没开始过渡的中间态。
    await clickTag(picked);

    // 标签筛选不做容器滑动（方向是竖直的，滑动语义不对）
    expect(harness.containerRecords('[data-archive-content]').length).toBe(0);

    // 整月要淡出时，月份（含标题）作为一块动，而不是先淡条目再淡标题
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-entry-section]'));
    const matchesPicked = (member: HTMLElement) => {
      const item = indexItems.find((entry) => entry.slug === (member.dataset.slug ?? ''));
      return Boolean(item) && getTagKeys(item!.tags).includes(picked);
    };
    const fullyHiddenSections = sections.filter((section) => {
      const members = Array.from(section.querySelectorAll<HTMLElement>('[data-entry-item]'));
      // 与实现同口径：成员当前都可见且都不命中 → 整组会作为一块淡出
      return members.length > 0 && members.every((member) => !member.hidden && !matchesPicked(member));
    });
    expect(fullyHiddenSections.length, '需要「整月都要淡出」的分组才能验证整块过渡').toBeGreaterThan(0);

    const groupAnimations = (section: HTMLElement) =>
      harness.records.filter((record) => record.el === section && record.kind === 'hide');
    const memberAnimations = (section: HTMLElement) =>
      Array.from(section.querySelectorAll<HTMLElement>('[data-entry-item]'))
        .flatMap((member) => harness.records.filter((record) => record.el === member && record.kind === 'hide'));

    for (const section of fullyHiddenSections) {
      expect(groupAnimations(section).length, '整月应作为一块参与淡出').toBe(1);
      expect(memberAnimations(section).length, '整块淡出时不该再逐条淡出').toBe(0);
    }

    // 部分命中的月份仍然逐条淡出
    const partialSections = sections.filter((section) => {
      const members = Array.from(section.querySelectorAll<HTMLElement>('[data-entry-item]'));
      const hiding = members.filter((member) => !member.hidden && !matchesPicked(member));
      return hiding.length > 0 && hiding.length < members.length;
    });
    for (const section of partialSections) {
      expect(groupAnimations(section).length, '只淡出部分成员时不能整组动').toBe(0);
      expect(memberAnimations(section).length).toBeGreaterThan(0);
    }

    await harness.settleAll();
  });

  it('bits：切年份胶囊同样走滑动过渡，且年份筛选立即生效', async () => {
    await loadPage(PAGES[0]);
    await importEntrySearch({ bitsYear: true });

    const browse = document.querySelector<HTMLElement>('[data-bits-browse]');
    expect(browse, '需要 /bits/ 的内容容器').not.toBeNull();

    const year = bitsYearPills()[0]?.dataset.bitsYear ?? '';
    expect(year, '需要至少一个年份胶囊').not.toBe('');
    const pill = clickBitsYear(year);

    const slides = () => harness.containerRecords('[data-bits-browse]');
    expect(slides().length).toBe(1);
    expect(slides()[0]!.kind).toBe('hide');
    expect(pill.getAttribute('aria-pressed')).toBe('true');

    await harness.stepToNextBoundary();
    expect(slides().length).toBe(2);
    expect(slides()[1]!.kind).toBe('show');
    expect(visibleSlugs().sort()).toEqual(slugsForYear(year));
    expect(window.location.search).toContain(`year=${year}`);
    expect(harness.entryItemRecords().length).toBe(0);
  });

  // 滑动方向按胶囊在条上的位置顺序决定：胶囊条是年份倒序，
  // 按年份数值比较会正好相反。往右点一颗 = 内容向左滑出、从右侧滑入。
  it('bits：年份前进与后退的滑动方向相反（按胶囊条位置顺序）', async () => {
    await loadPage(PAGES[0]);
    await importEntrySearch({ bitsYear: true });

    const slides = () => harness.containerRecords('[data-bits-browse]');

    // 胶囊条按年份倒序：全部(第 1 颗) → 最新年份(第 2 颗) → 次新年份(第 3 颗)。
    // 全部 → 较早年份 = 往右点一颗 → 内容向左滑出、从右侧滑入。
    const [newestYear, olderYear] = bitsYearPills().map((pill) => pill.dataset.bitsYear ?? '');
    expect(olderYear, '需要至少两个年份胶囊').toBeTruthy();
    clickBitsYear(olderYear!);

    expect(slides().length).toBe(1);
    expect(lastFrame(slides()[0]!), '往右点时内容应向左滑出').toContain('translateX(-24px)');
    await harness.stepToNextBoundary();
    expect(slides().length).toBe(2);
    expect(firstFrame(slides()[1]!), '往右点时应从右侧滑入').toContain('translateX(24px)');
    await harness.settleAll();

    // 较早年份 → 最新年份 = 往左点一颗 → 方向与上一步相反
    clickBitsYear(newestYear!);

    const backward = slides().slice(2);
    expect(backward.length).toBe(1);
    expect(lastFrame(backward[0]!), '往左点时内容应向右滑出').toContain('translateX(24px)');
    await harness.stepToNextBoundary();
    const backwardIn = slides().slice(3);
    expect(backwardIn.length).toBe(1);
    expect(firstFrame(backwardIn[0]!), '往左点时应从左侧滑入').toContain('translateX(-24px)');
    await harness.settleAll();
  });

  // 归档一级胶囊与 /bits/ 年份胶囊同一套语义：按胶囊在条上的位置顺序决定方向。
  it('archive：一级胶囊往右切与往左切的滑动方向相反', async () => {
    await loadPage(PAGES[2]);
    await importEntrySearch({ archiveScope: true });

    const slides = () => harness.containerRecords('[data-archive-content]');

    // 全部(第 1 颗) → 更新(第 4 颗)：往右切
    document.querySelector<HTMLElement>('[data-archive-scope="devlog"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(slides().length).toBe(1);
    expect(lastFrame(slides()[0]!), '往右切时内容应向左滑出').toContain('translateX(-24px)');

    // 推进到滑出结束（中间可能还有别的动画边界，例如上一轮用例留下的退场动画）
    for (let step = 0; step < 5 && slides().length < 2; step += 1) {
      await harness.stepToNextBoundary();
    }
    expect(slides().length).toBe(2);
    expect(firstFrame(slides()[1]!), '往右切时应从右侧滑入').toContain('translateX(24px)');
    await harness.settleAll();

    // 更新 → 全部：往左切（方向必须与上一步相反）
    document.querySelector<HTMLElement>('[data-archive-scope="all"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const backwardSlides = slides().slice(2);
    expect(backwardSlides.length).toBe(1);
    expect(lastFrame(backwardSlides[0]!), '往左切时内容应向右滑出').toContain('translateX(24px)');
    for (let step = 0; step < 5 && slides().length < 4; step += 1) {
      await harness.stepToNextBoundary();
    }
    const backwardIn = slides().slice(3);
    expect(backwardIn.length).toBe(1);
    expect(firstFrame(backwardIn[0]!), '往左切时应从左侧滑入').toContain('translateX(-24px)');
    await harness.settleAll();
  });

  it('prefers-reduced-motion：不播滑动，直接换内容', async () => {
    await loadPage(PAGES[2]);
    stubMatchMedia(true);
    await importEntrySearch({ archiveScope: true });

    const devlogCount = pageItems().filter(
      (el) => (el.dataset.archiveKind ?? '').trim() === 'devlog'
    ).length;
    const devlogPill = document.querySelector<HTMLElement>('[data-archive-scope="devlog"]')!;
    devlogPill.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(harness.containerRecords('[data-archive-timeline]').length, '减少动效时不应播滑动').toBe(0);
    expect(visibleSlugs().length, '内容要立即换好').toBe(devlogCount);
    expect(devlogPill.getAttribute('aria-pressed')).toBe('true');
  });
});
