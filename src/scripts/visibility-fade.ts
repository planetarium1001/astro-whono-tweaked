/**
 * 「整块一起淡出 / 淡入」的可见性过渡：元素错峰开始、最后同时结束；分组内成员全部要淡出时，
 * 把分组本身当成一块。淡出跑完才落 `hidden`（中途落会立刻重排）。`isStale()` 为 true 时不再落状态。
 */

const DEFAULT_TOTAL_MS = 420;
const DEFAULT_STAGGER_MS = 55;
/** 单个元素的最短时长：错峰到最后的元素不能短到看不见 */
const MIN_TARGET_MS = 150;

/** 环境是否支持 Web Animations 且未要求减少动效。 */
export const canAnimate = (el: HTMLElement | null | undefined): boolean => {
  if (!el || typeof el.animate !== 'function') return false;
  return typeof window.matchMedia === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

type PhaseOptions = {
  total: number;
  stagger: number;
  easing: string;
};

/**
 * 错峰开始、同时结束：第 i 个元素延迟 `i * step`、时长 `total - i * step`；
 * `step` 会被夹取，保证最后一个元素仍有 `MIN_TARGET_MS` 时长。
 */
const playPhase = (
  targets: readonly HTMLElement[],
  from: number,
  to: number,
  { total, stagger, easing }: PhaseOptions
): Promise<void> => {
  const maxStep = targets.length > 1
    ? Math.max((total - MIN_TARGET_MS) / (targets.length - 1), 0)
    : 0;
  const step = Math.min(stagger, maxStep);
  const animations = targets.map((el, index) => {
    const delay = index * step;
    const duration = Math.max(total - delay, MIN_TARGET_MS);
    return el.animate(
      [
        { opacity: from, transform: 'translateY(2px)' },
        { opacity: to, transform: 'translateY(0)' }
      ],
      { duration, delay, easing, fill: 'both' }
    );
  });
  return Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {});
};

const cancelAnimations = (targets: readonly HTMLElement[]) => {
  for (const el of targets) {
    for (const animation of el.getAnimations?.() ?? []) animation.cancel();
  }
};

type VisibilityFadePlan = {
  /** 需要隐藏的元素 / 块（按 DOM 顺序） */
  hide: readonly HTMLElement[];
  /** 需要显示的元素 / 块（按 DOM 顺序） */
  show: readonly HTMLElement[];
  /** 落 `hidden` 的唯一入口（调用方自己决定写哪些属性） */
  apply: (targets: readonly HTMLElement[], hidden: boolean) => void;
  /** 返回 true 表示本次已被更晚的一次接管，不再落状态 */
  isStale?: () => boolean;
  total?: number;
  stagger?: number;
};

/** 跑一次「淡出 → 落 hidden → 显示 → 淡入」；Promise 在两段都结束后 resolve。 */
export const runVisibilityFade = async ({
  hide,
  show,
  apply,
  isStale,
  total = DEFAULT_TOTAL_MS,
  stagger = DEFAULT_STAGGER_MS
}: VisibilityFadePlan): Promise<void> => {
  const stale = () => isStale?.() === true;
  const animatable = (targets: readonly HTMLElement[]) =>
    targets.filter((el) => canAnimate(el));

  // 淡出：全部跑完再一次性 hidden（避免中途重排）
  if (hide.length > 0) {
    const animated = animatable(hide);
    if (animated.length > 0) {
      await playPhase(animated, 1, 0, { total, stagger, easing: 'ease-out' });
    }
    if (stale()) return;
    apply(hide, true);
    cancelAnimations(animated);
  }

  // 淡入：先显示（同时落 hidden=false），再错峰淡入
  if (show.length > 0) {
    if (stale()) return;
    apply(show, false);
    const animated = animatable(show);
    if (animated.length > 0) {
      await playPhase(animated, 0, 1, { total, stagger, easing: 'ease-in' });
      if (stale()) return;
      cancelAnimations(animated);
    }
  }
};

/** 把「整组都要淡出的成员」合并成组本身，让分组标题与条目作为一块淡出。 */
export const mergeFullyHiddenGroups = (
  targets: readonly HTMLElement[],
  groupSelector: string,
  itemSelector: string
): HTMLElement[] => {
  const targetSet = new Set(targets);
  const merged: HTMLElement[] = [];
  const handledGroups = new Set<HTMLElement>();

  for (const el of targets) {
    const group = el.closest<HTMLElement>(groupSelector);
    if (!group) {
      merged.push(el);
      continue;
    }
    if (handledGroups.has(group)) continue;

    const members = Array.from(group.querySelectorAll<HTMLElement>(itemSelector));
    const allHiding = members.length > 0 && members.every((member) => targetSet.has(member));
    if (allHiding) {
      handledGroups.add(group);
      merged.push(group);
      continue;
    }
    merged.push(el);
  }

  return merged;
};
