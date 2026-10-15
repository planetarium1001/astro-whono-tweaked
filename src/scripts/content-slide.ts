import { canAnimate } from './visibility-fade';

/**
 * 胶囊条页面的共享动效：滑块对齐与内容区左右滑动。内容过渡不用 `startViewTransition`
 * （内容切换依赖异步的 index.json，其 DOM 变更回调要求同步）。
 */

// 时长与曲线：滑出用加速离开、滑入用减速落位，整段约 0.74s。
const SLIDE_OUT_MS = 300;
const SLIDE_IN_MS = 440;
const SLIDE_DISTANCE_PX = 24;

/** 同一次内容切换里正在播放的动画（重复触发时先取消，避免叠加）。 */
const runningAnimations = new WeakMap<HTMLElement, Animation>();

const play = (
  el: HTMLElement,
  keyframes: Keyframe[],
  duration: number,
  easing: string
): Promise<void> => {
  runningAnimations.get(el)?.cancel();
  const animation = el.animate(keyframes, { duration, easing, fill: 'both' });
  runningAnimations.set(el, animation);
  return animation.finished.then(
    () => {
      if (runningAnimations.get(el) === animation) runningAnimations.delete(el);
    },
    () => {}
  );
};

/** 内容滑动方向：`forward` 向左滑出，`backward` 向右滑出。 */
export type SlideDirection = 'forward' | 'backward';

const sign = (direction: SlideDirection) => (direction === 'forward' ? -1 : 1);

/** 滑出并淡出（结束时内容完全隐去，避免中途重排）。 */
const slideOut = (el: HTMLElement, direction: SlideDirection = 'forward'): Promise<void> =>
  play(
    el,
    [
      { opacity: 1, transform: 'translateX(0) scale(1)' },
      { opacity: 0, transform: `translateX(${sign(direction) * SLIDE_DISTANCE_PX}px) scale(0.985)` }
    ],
    SLIDE_OUT_MS,
    'cubic-bezier(0.45, 0, 0.55, 1)'
  );

/** 从对侧滑入（与滑出方向相反，读起来像内容被换了一页）。 */
const slideIn = (el: HTMLElement, direction: SlideDirection = 'forward'): Promise<void> =>
  play(
    el,
    [
      { opacity: 0, transform: `translateX(${-sign(direction) * SLIDE_DISTANCE_PX}px) scale(0.99)` },
      { opacity: 1, transform: 'translateX(0) scale(1)' }
    ],
    SLIDE_IN_MS,
    'cubic-bezier(0.16, 1, 0.3, 1)'
  );

type ContentSlider = {
  /** 播放「滑出 → swap() → 滑入」；不可动画或容器缺失时直接 swap()。 */
  run: (swap: () => void, options?: { animate?: boolean; direction?: SlideDirection }) => void;
};

/**
 * 为某个内容容器建切换器。`getContainer` 用函数：容器可能来自按需渲染的片段，每次现查。
 * 每次 `run` 递增令牌，旧的滑出结束后放弃 swap，由最新的一次接管。
 */
export const createContentSlider = (getContainer: () => HTMLElement | null): ContentSlider => {
  let runId = 0;
  return {
    run: (swap, options = {}) => {
      const id = ++runId;
      const container = getContainer();
      if (options.animate === false || !container || !canAnimate(container)) {
        swap();
        return;
      }
      const direction = options.direction ?? 'forward';
      void (async () => {
        await slideOut(container, direction);
        if (id !== runId) return; // 已被更晚的一次切换接管
        swap();
        await slideIn(container, direction);
      })();
    }
  };
};

/**
 * 胶囊条滑块：宽度取所有胶囊的最大宽度，以激活项中心定位并夹取到 `[0, 容器宽 − 滑块宽]`；
 * resize 与字体就绪后重新对齐到 `.is-active` 胶囊。
 */
type PillCursor = {
  /** 把滑块对齐到指定的胶囊。 */
  moveTo: (pill: HTMLElement) => void;
};

export const createPillCursor = (
  bar: HTMLElement,
  cursor: HTMLElement | null,
  pills: readonly HTMLElement[]
): PillCursor => {
  const moveTo = (pill: HTMLElement) => {
    if (!cursor) return;
    const barRect = bar.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const cursorWidth = pills.reduce(
      (width, item) => Math.max(width, item.offsetWidth),
      pill.offsetWidth
    );
    const centeredLeft = pillRect.left - barRect.left - (cursorWidth - pillRect.width) / 2;
    const maxLeft = Math.max(barRect.width - cursorWidth, 0);
    const cursorLeft = Math.min(Math.max(centeredLeft, 0), maxLeft);

    cursor.style.width = `${cursorWidth}px`;
    cursor.style.transform = `translateX(${cursorLeft}px)`;
    bar.dataset.ready = 'true';
  };

  const sync = () => {
    const active = pills.find((pill) => pill.classList.contains('is-active'));
    if (active) moveTo(active);
  };

  window.addEventListener('resize', sync);
  // 字体替换会改变文本宽度，滑块必须在之后重新对齐
  document.fonts?.ready.then(sync).catch(() => {});

  return { moveTo };
};

/** 按胶囊在条上的先后顺序决定内容滑动方向（不是按取值大小）。 */
export const pillDirection = <T>(
  pills: readonly HTMLElement[],
  readValue: (pill: HTMLElement) => T,
  from: T,
  to: T
): SlideDirection => {
  const indexOf = (value: T) => pills.findIndex((pill) => readValue(pill) === value);
  return indexOf(to) >= indexOf(from) ? 'forward' : 'backward';
};
