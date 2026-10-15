/**
 * `/archive/` 一级胶囊（全部 / 博客 / 项目 / 更新）：只声明作用域，
 * 可见集合统一由 `entry-search.ts` 算出。
 */
import {
  createContentSlider,
  createPillCursor,
  pillDirection,
  type SlideDirection
} from './content-slide';

const ROOT = document.querySelector<HTMLElement>('[data-archive-timeline]');

if (ROOT) {
  const PILLS = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-archive-scope]'));
  const GROUP_SELECTOR = '[data-archive-group]';
  // 必须从 document 找：标签 dialog 由 TagFilterHeader 渲染在 timeline 之外。
  const TAG_LIST = document.querySelector<HTMLElement>('.entry-tags-dialog__list');
  const TAG_DATA_EL = document.getElementById('archive-tag-scope-data');
  /** 页头的 tag 入口（`#标签` / `#项目`）：切到「项目」作用域时整体隐藏。 */
  const TAG_TRIGGER = document.querySelector<HTMLElement>('[data-entry-tag-trigger]');
  const TAG_DIALOG_TITLE = document.querySelector<HTMLElement>('.entry-tags-dialog__title');
  const TAG_COUNT = document.querySelector<HTMLElement>('[data-entry-tag-count]');
  /** entry-search 的根：`data-entry-tag-noun` 让它把「切换标签 / 清除筛选」改成「切换项目 …」。 */
  const ENTRY_ROOT = document.querySelector<HTMLElement>('[data-entry-filters]');

  type ScopeId = 'all' | 'blog' | 'projects' | 'devlog';
  type TagSummaryJson = { key: string; label: string; count: number };

  const readTagPayload = (): Record<ScopeId, TagSummaryJson[]> => {
    const fallback: Record<ScopeId, TagSummaryJson[]> = { all: [], blog: [], projects: [], devlog: [] };
    if (!TAG_DATA_EL) return fallback;
    try {
      const parsed = JSON.parse(TAG_DATA_EL.textContent ?? '{}') as Partial<Record<ScopeId, TagSummaryJson[]>>;
      return {
        all: parsed.all ?? [],
        blog: parsed.blog ?? [],
        projects: parsed.projects ?? [],
        devlog: parsed.devlog ?? []
      };
    } catch {
      return fallback;
    }
  };

  const tagPayload = readTagPayload();
  let currentScope: ScopeId = 'all';

  /** 滑动目标是内容容器 `[data-archive-content]`；滑 `[data-archive-timeline]` 会把页头一并滑走。 */
  const contentSlider = createContentSlider(
    () => document.querySelector<HTMLElement>('[data-archive-content]')
  );

  /** 把作用域交给 entry-search（它拥有唯一的可见性真相）。 */
  const publishScope = (scope: ScopeId, options: { instant?: boolean } = {}) => {
    document.dispatchEvent(
      new CustomEvent('entry-search:set-scope', {
        detail: { scope, clearTags: true, instant: options.instant === true }
      })
    );
  };

  /** 归档的 tag 入口随一级胶囊换语义：项目档隐藏入口，更新档改称「项目」，其余档为「标签」。 */
  const syncTagEntryLabels = (scope: ScopeId) => {
    const isProjects = scope === 'projects';
    const noun = scope === 'devlog' ? '项目' : '标签';
    const pageTitle = (TAG_DIALOG_TITLE?.textContent ?? '').replace(/(标签|项目)\s*$/, '').trim() || '归档';

    if (TAG_TRIGGER) {
      TAG_TRIGGER.hidden = isProjects;
      if (!isProjects) TAG_TRIGGER.textContent = `#${noun}`;
    }
    if (TAG_DIALOG_TITLE) TAG_DIALOG_TITLE.textContent = `${pageTitle}${noun}`;
    if (ENTRY_ROOT) ENTRY_ROOT.dataset.entryTagNoun = noun;
  };

  /** 作用域切换时重建 dialog 里的标签按钮。 */
  const syncTagOptions = (scope: ScopeId) => {
    if (!TAG_LIST) return;
    const options = tagPayload[scope] ?? [];
    TAG_LIST.textContent = '';
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entry-tag-option';
      button.dataset.entryTagKey = option.key;
      button.setAttribute('aria-pressed', 'false');

      const label = document.createElement('span');
      label.className = 'entry-tag-option__label';
      label.textContent = `#${option.label}`;

      const count = document.createElement('span');
      count.className = 'entry-tag-option__count';
      count.textContent = String(option.count);

      button.append(label, count);
      TAG_LIST.append(button);
    }
    if (TAG_COUNT) TAG_COUNT.textContent = `共 ${options.length} 个`;
  };

  /** 判定基准是 entry-search 广播的可见 slug 集合，不能用 DOM 的 `hidden`（淡出期间尚未落下）。 */
  const syncGroupVisibility = (visibleSlugs?: Set<string>) => {
    document.querySelectorAll<HTMLElement>(GROUP_SELECTOR).forEach((group) => {
      const items = Array.from(group.querySelectorAll<HTMLElement>('[data-entry-item]'));
      const hasVisible = visibleSlugs
        ? items.some((item) => visibleSlugs.has((item.dataset.slug ?? '').trim()))
        : items.some((item) => !item.hidden);
      group.hidden = items.length > 0 && !hasVisible;
    });
  };

  /** 等 entry-search 的过渡走完再收合，`transitionId` 用于丢弃过期的一轮。 */
  let latestTransitionId = 0;

  const applyGroupVisibility = (visibleSlugs: Set<string> | undefined, transitionId: number) => {
    // transitionId === 0 表示事件没带令牌（旧版广播 / 手工派发）：立即执行，避免永不收合
    if (transitionId !== 0 && transitionId !== latestTransitionId) return;
    syncGroupVisibility(visibleSlugs);
  };

  const scopesRoot = document.querySelector<HTMLElement>('[data-archive-scope-bar]');
  const cursor = scopesRoot
    ? createPillCursor(
        scopesRoot,
        scopesRoot.querySelector<HTMLElement>('[data-archive-scope-cursor]'),
        PILLS
      )
    : null;

  /** 胶囊激活态与滑块立即更新，「换内容」交给 slider：滑出结束后才落作用域。 */
  const setActiveScope = (scope: ScopeId, options: { animate?: boolean } = {}) => {
    // 方向按胶囊在条上的先后顺序决定，不按取值大小。
    const direction: SlideDirection = pillDirection(
      PILLS,
      (pill) => pill.dataset.archiveScope ?? 'all',
      currentScope,
      scope
    );

    currentScope = scope;
    let activePill: HTMLButtonElement | null = null;
    PILLS.forEach((pill) => {
      const isActive = pill.dataset.archiveScope === scope;
      pill.classList.toggle('is-active', isActive);
      // 与原 /bits/ 年份胶囊一致：用 aria-pressed 表达选中态
      pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      if (isActive) activePill = pill;
    });

    if (activePill) cursor?.moveTo(activePill);

    syncTagEntryLabels(scope);

    contentSlider.run(
      () => {
        syncTagOptions(scope);
        publishScope(scope, { instant: true });
      },
      { animate: options.animate === true, direction }
    );
  };

  // entry-search 每次重算可见集合后，年月分组标题要跟着收掉或恢复
  document.addEventListener('entry-search:filtered', (event) => {
    const detail = (event as CustomEvent<{
      visibleSlugs?: string[];
      transitionId?: number;
      transition?: Promise<void>;
    }>).detail;
    const visibleSlugs = detail?.visibleSlugs ? new Set(detail.visibleSlugs) : undefined;
    const transitionId = detail?.transitionId ?? 0;
    latestTransitionId = Math.max(latestTransitionId, transitionId);

    const settle = () => applyGroupVisibility(visibleSlugs, transitionId);
    if (detail?.transition && typeof detail.transition.then === 'function') {
      // 行都淡出之后再收合分组（成功/失败都要收合，否则会留下空的分组标题）
      void detail.transition.then(settle, settle);
      return;
    }
    settle();
  });

  PILLS.forEach((pill) => {
    pill.addEventListener('click', () => {
      const scope = (pill.dataset.archiveScope ?? 'all') as ScopeId;
      if (scope === currentScope) return;
      setActiveScope(scope, { animate: true });
    });
  });

  // 初始化：只落状态，不播滑动动画
  setActiveScope('all');
}
