/**
 * `/devlog/` 摘要策略：整页一个开关，任一条摘要被压缩就整体回退到正文顶部（窄屏亦然）。
 * 列表属性 `data-devlog-excerpts` 取 `inline` / `fallback`；无 JS 时摘要照旧显示。
 */
const list = document.querySelector<HTMLElement>('[data-devlog-list]');

if (list) {
  const NARROW_QUERY = '(max-width: 900px)';
  const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-devlog-row]'));
  const descriptions = rows
    .map((row) => row.querySelector<HTMLElement>('.devlog-row__description'))
    .filter((el): el is HTMLElement => el !== null);
  const summaries = rows
    .map((row) => row.querySelector<HTMLElement>('[data-devlog-panel-summary]'))
    .filter((el): el is HTMLElement => el !== null);

  const matchNarrow = () => {
    if (typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(NARROW_QUERY).matches;
  };

  /**
   * 摘要一刀切的过渡：列表摘要淡出 → 落状态 → 行高过渡与正文摘要淡入并行；`inline` 方向镜像。
   * 用令牌丢弃过期的一轮。
   */
  const FADE_MS = 300;
  const REFLOW_MS = 360;
  let applyToken = 0;
  /** 已落定的模式；测量时属性会被临时置成 `inline`，不能拿它当状态读。 */
  let currentMode: 'inline' | 'fallback' | null = null;

  const canFade = (el: HTMLElement) =>
    typeof el.animate === 'function'
    && typeof window.matchMedia === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cancelAnimations = (targets: readonly HTMLElement[]) => {
    for (const target of targets) {
      for (const animation of target.getAnimations?.() ?? []) animation.cancel();
    }
  };

  const commitMode = (fallback: boolean) => {
    currentMode = fallback ? 'fallback' : 'inline';
    list.dataset.devlogExcerpts = currentMode;
    for (const summary of summaries) summary.hidden = !fallback;
  };

  /** 记录每一行当前高度（行高变化前后各量一次，用来做「正文范围」过渡）。 */
  const measureRows = () => new Map(rows.map((row) => [row, row.offsetHeight]));

  /** 行高从旧值动画到新值，行内暂时 `overflow: hidden` 避免内容溢出。 */
  const animateRowHeights = (before: Map<HTMLElement, number>) => {
    for (const row of rows) {
      const from = before.get(row);
      if (from === undefined) continue;
      const to = row.offsetHeight;
      if (Math.abs(to - from) < 1) continue;
      row.style.overflow = 'hidden';
      const animation = row.animate(
        [{ height: `${from}px` }, { height: `${to}px` }],
        { duration: REFLOW_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
      );
      const restore = () => {
        row.style.overflow = '';
        animation.cancel();
      };
      animation.finished.then(restore, restore);
    }
  };

  const fadeSummariesIn = () => {
    for (const summary of summaries) {
      if (summary.hidden) continue;
      summary.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
    }
  };

  const applyMode = (fallback: boolean) => {
    const next = fallback ? 'fallback' : 'inline';
    if (currentMode === next) {
      // 测量会把属性临时置成 `inline`，这里把它恢复成已落定的模式
      if (list.dataset.devlogExcerpts !== next) list.dataset.devlogExcerpts = next;
      return;
    }
    // 首次落状态（列表上还没有属性）不需要过渡，直接落定
    if (currentMode === null) {
      commitMode(fallback);
      return;
    }

    const token = ++applyToken;
    const canAnimate = canFade(list) && rows.length > 0;
    if (!canAnimate) {
      commitMode(fallback);
      return;
    }

    cancelAnimations([...descriptions, ...summaries, ...rows]);

    if (!fallback) {
      // 镜像：先让摘要回到列表，再把行高过渡回去，同时摘要淡入
      const before = measureRows();
      commitMode(false);
      animateRowHeights(before);
      for (const description of descriptions) {
        description.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
      }
      return;
    }

    // 列表里的摘要先淡出。
    currentMode = 'fallback';
    const fadeOuts = descriptions.map((description) =>
      description.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' }
      )
    );
    void Promise.all(fadeOuts.map((animation) => animation.finished.catch(() => {}))).then(() => {
      if (token !== applyToken) return;
      // 摘要离开列表，正文顶部的完整摘要放开。
      const before = measureRows();
      commitMode(true);
      cancelAnimations(descriptions);
      // 行高过渡与正文摘要淡入并行。
      animateRowHeights(before);
      fadeSummariesIn();
    });
  };

  const syncMode = () => {
    // 窄屏档：摘要在列表里一律不显示，直接回退到正文
    if (matchNarrow()) {
      applyMode(true);
      return;
    }

    // 先按「显示」量一次真实宽度，再决定最终模式（同一个任务内完成，不会闪一帧）
    list.dataset.devlogExcerpts = 'inline';
    const truncated = descriptions.some(
      (description) => description.scrollWidth > description.clientWidth + 1
    );
    applyMode(truncated);
  };

  syncMode();

  /** 视口变化与字体替换都会改变可用宽度，用 `requestAnimationFrame` 合帧后重新判定。 */
  let frame = 0;
  const scheduleSync = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      syncMode();
    });
  };

  window.addEventListener('resize', scheduleSync);
  document.fonts?.ready.then(scheduleSync).catch(() => {});
}

// 无 import 时显式导出，避免 TS 把顶层 const 当全局变量。
export {};
