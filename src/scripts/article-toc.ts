// 文章目录：滚动高亮、点击跳转、收起状态、跳转高亮。
// rail / inline 两份目录按 data-toc-target 归组，统一更新高亮。
// 窄屏浮动列的「查看目录」按钮也在这里接管：展开内联目录并滚过去。

const SPY_OFFSET_PX = 96;
const ACTIVE_CLASS = 'is-active';
const HEADING_SELECTOR = '.prose :is(h2, h3)[id]';
// 与 article-toc.css 的 .prose-flash 动画（1400ms）同量级
const FLASH_DURATION_MS = 1500;
const TOC_COLLAPSED_KEY = 'astro-whono:toc-collapsed';
// 内联目录在窄于该断点时才是目录的唯一形态（宽于它由右侧常驻目录接管）。
const INLINE_TOC_MQ = '(max-width: 1279.98px)';
// 与 article-toc.css 的 .article-toc--inline[data-toc-anim] 过渡时长对齐，另留少量余量。
const INLINE_TOC_ANIM_MS = 320;
// 过渡高度变量与状态属性，见 article-toc.css 同名选择器。
const INLINE_TOC_HEIGHT_VAR = '--article-toc-inline-height';
const INLINE_TOC_ANIM_ATTR = 'data-toc-anim';

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const initArticleToc = () => {
  const tocRoots = Array.from(document.querySelectorAll<HTMLElement>('[data-article-toc]'));
  if (tocRoots.length === 0) return;

  const linksById = new Map<string, HTMLAnchorElement[]>();
  tocRoots.forEach((root) => {
    root.querySelectorAll<HTMLAnchorElement>('a[data-toc-target]').forEach((link) => {
      const id = link.dataset.tocTarget;
      if (!id) return;
      const bucket = linksById.get(id);
      if (bucket) {
        bucket.push(link);
      } else {
        linksById.set(id, [link]);
      }
    });
  });
  if (linksById.size === 0) return;

  const headings = Array.from(document.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .filter((heading) => linksById.has(heading.id));

  let activeId = '';

  const setActive = (id: string) => {
    if (id === activeId) return;
    activeId = id;
    linksById.forEach((bucket, key) => {
      const isActive = key === activeId;
      bucket.forEach((link) => {
        link.classList.toggle(ACTIVE_CLASS, isActive);
        if (isActive) {
          link.setAttribute('aria-current', 'true');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    });
  };

  const resolveActiveId = () => {
    const lastHeading = headings[headings.length - 1];
    if (!lastHeading) return '';

    const scrolledToBottom =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (scrolledToBottom) return lastHeading.id;

    let next = '';
    headings.forEach((heading) => {
      if (heading.getBoundingClientRect().top - SPY_OFFSET_PX <= 0) {
        next = heading.id;
      }
    });
    return next;
  };

  let ticking = false;
  const update = () => setActive(resolveActiveId());
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };

  /**
   * 窄屏内联目录的展开 / 收起过渡：`<details>` 原生开合不做高度过渡，
   * 沿用窄屏侧栏收起的做法，脚本量高写入 --article-toc-inline-height；
   * 过渡期间保持展开以便裁切，结束后才撤掉过渡态并落定 details.open。
   */
  const inlineToc = document.querySelector<HTMLDetailsElement>('details.article-toc--inline');

  type InlineTocPending = { open: boolean; onSettled?: (() => void) | undefined };
  let inlineTocPending: InlineTocPending | null = null;
  let inlineTocTimer: number | undefined;

  /** 撤掉过渡态：状态属性、高度变量与兜底定时器。 */
  const resetInlineTocAnim = () => {
    if (inlineTocTimer !== undefined) {
      window.clearTimeout(inlineTocTimer);
      inlineTocTimer = undefined;
    }
    if (!inlineToc) return;
    inlineToc.removeAttribute(INLINE_TOC_ANIM_ATTR);
    inlineToc.style.removeProperty(INLINE_TOC_HEIGHT_VAR);
  };

  /** 过渡收尾：先撤掉裁切再落定 details.open，两端都不会跳变。 */
  const settleInlineToc = (open: boolean, onSettled?: () => void) => {
    resetInlineTocAnim();
    inlineTocPending = null;
    if (inlineToc) inlineToc.open = open;
    onSettled?.();
  };

  /**
   * 展开 / 收起内联目录，返回是否真的做了过渡。
   * onSettled 在过渡结束后调用；未做过渡（减弱动效、元素缺失）时立即调用。
   */
  const toggleInlineToc = (open: boolean, onSettled?: () => void) => {
    // 打断上一段过渡：上一段的收尾回调照常执行，不丢用户已发起的跳转。
    const interrupted = inlineTocPending;
    resetInlineTocAnim();
    inlineTocPending = null;

    const list = inlineToc?.querySelector<HTMLElement>('.article-toc__list') ?? null;
    if (!inlineToc || !list || prefersReducedMotion()) {
      if (inlineToc) inlineToc.open = open;
      interrupted?.onSettled?.();
      onSettled?.();
      return false;
    }

    // 目标态已达成又没有待收尾的过渡：不必把内容重放一次淡入。
    if (!interrupted && inlineToc.open === open) {
      onSettled?.();
      return false;
    }

    const openedBefore = inlineToc.open;
    // 起点取当前可见高度：被打断时也从中途接着走，不会跳变。
    const startHeight = inlineToc.getBoundingClientRect().height;
    // 量自然高度须先渲染内容（关闭态下列表不显示），并撤掉裁切；同帧内不会绘出中间态。
    inlineToc.open = true;
    inlineToc.removeAttribute(INLINE_TOC_ANIM_ATTR);
    inlineToc.style.removeProperty(INLINE_TOC_HEIGHT_VAR);
    void inlineToc.offsetHeight;
    const expandedHeight = inlineToc.getBoundingClientRect().height;
    const collapsedHeight = Math.max(expandedHeight - list.getBoundingClientRect().height, 0);

    // 起点帧：借用相反方向的值把列表压回起点；列表本来就在场时不重放淡入。
    inlineToc.setAttribute(INLINE_TOC_ANIM_ATTR, open && !openedBefore ? 'collapse' : 'expand');
    inlineToc.style.setProperty(INLINE_TOC_HEIGHT_VAR, `${startHeight}px`);
    // 强制一次布局：max-height 由 none 进入具体值无法插值，须先提交起点帧。
    void inlineToc.offsetHeight;
    // 终点帧：高度取刚量到的自然高度，撤掉裁切时不会露出被裁的内容。
    inlineToc.setAttribute(INLINE_TOC_ANIM_ATTR, open ? 'expand' : 'collapse');
    inlineToc.style.setProperty(
      INLINE_TOC_HEIGHT_VAR,
      `${open ? expandedHeight : collapsedHeight}px`
    );

    inlineTocPending = { open, onSettled };
    interrupted?.onSettled?.();
    inlineTocTimer = window.setTimeout(() => settleInlineToc(open, onSettled), INLINE_TOC_ANIM_MS);
    return true;
  };

  /** 目录条目跳转前收起内联目录，收尾后再滚动，落点才不受过渡期间的高度变化影响。 */
  const closeInlineToc = (link: Element, onSettled: () => void) => {
    const details = link.closest<HTMLDetailsElement>('details.article-toc--inline');
    if (!details || !details.open) {
      onSettled();
      return;
    }
    if (details === inlineToc) {
      toggleInlineToc(false, onSettled);
      return;
    }
    details.open = false;
    onSettled();
  };

  /* 摘要条的点击也由脚本接管：原生开合没有高度过渡。 */
  const inlineTocSummary = inlineToc?.querySelector<HTMLElement>('summary') ?? null;

  if (inlineToc && inlineTocSummary) {
    const toc = inlineToc;
    inlineTocSummary.addEventListener('click', (event) => {
      event.preventDefault();
      // 过渡期间 open 一直为 true，这里按当前状态取反即「展开中再点收起」。
      toggleInlineToc(!toc.open);
    });
  }

  /* 目标章节高亮：铺一层从标题到下一个同级/更高级标题的淡色带。 */
  const prose = document.querySelector<HTMLElement>('.prose');
  let activeFlash: HTMLElement | null = null;

  const flashSection = (heading: HTMLElement) => {
    if (!prose || heading.parentElement !== prose) return;

    const depth = Number(heading.tagName.slice(1));
    let lastBlock: HTMLElement = heading;
    let node = heading.nextElementSibling;
    while (node instanceof HTMLElement) {
      const match = /^H([1-6])$/.exec(node.tagName);
      if (match && Number(match[1]) <= depth) break;
      lastBlock = node;
      node = node.nextElementSibling;
    }

    const proseRect = prose.getBoundingClientRect();
    const startRect = heading.getBoundingClientRect();
    const endRect = lastBlock.getBoundingClientRect();

    activeFlash?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'prose-flash';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.top = `${startRect.top - proseRect.top}px`;
    overlay.style.height = `${Math.max(endRect.bottom - startRect.top, startRect.height)}px`;
    prose.appendChild(overlay);
    activeFlash = overlay;

    window.setTimeout(() => {
      overlay.remove();
      if (activeFlash === overlay) activeFlash = null;
    }, FLASH_DURATION_MS);
  };

  tocRoots.forEach((root) => {
    root.addEventListener('click', (event) => {
      const eventTarget = event.target;
      const link = eventTarget instanceof Element
        ? eventTarget.closest<HTMLAnchorElement>('a[data-toc-target]')
        : null;
      if (!link) return;

      const id = link.dataset.tocTarget;
      const heading = id ? document.getElementById(id) : null;
      if (!id || !(heading instanceof HTMLElement)) return;

      event.preventDefault();
      setActive(id);
      // 覆盖层随正文滚动，可在平滑滚动前铺好；此时目录尚未变高变矮，量到的位置就是正文位置。
      flashSection(heading);
      // 通知浮动列把跳转前的位置入栈。
      window.dispatchEvent(new CustomEvent('astro-whono:reading-jump'));
      try {
        window.history.pushState(null, '', `#${id}`);
      } catch (_) {}

      const scrollToHeading = () => {
        window.requestAnimationFrame(() => {
          heading.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'start'
          });
          // 聚焦标题，便于读屏落到该小节。
          if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        });
      };

      // 目录在正文上方：收起过渡会挪动正文，等过渡结束再滚，落点才准。
      closeInlineToc(link, scrollToHeading);
    });
  });

  /* 收起/展开：只切 <html> 状态位，列宽由 CSS 变量过渡。 */
  const toggles = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-toc-toggle]'));
  const rootEl = document.documentElement;

  const syncToggleLabel = (collapsed: boolean) => {
    const label = collapsed ? '展开目录' : '收起目录';
    toggles.forEach((button) => {
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    });
  };

  const setCollapsed = (collapsed: boolean, persist: boolean) => {
    if (collapsed) {
      rootEl.dataset.tocCollapsed = 'true';
    } else {
      delete rootEl.dataset.tocCollapsed;
    }
    syncToggleLabel(collapsed);
    if (persist) {
      try {
        window.localStorage.setItem(TOC_COLLAPSED_KEY, collapsed ? '1' : '0');
      } catch (_) {}
    }
  };

  if (toggles.length > 0) {
    syncToggleLabel(rootEl.dataset.tocCollapsed === 'true');
    toggles.forEach((button) => {
      button.addEventListener('click', () => {
        setCollapsed(rootEl.dataset.tocCollapsed !== 'true', true);
        // 列宽过渡约 520ms，结束后按新布局重新校准高亮。
        window.setTimeout(requestUpdate, 600);
      });
    });
  }

  /* 浮动列目录按钮：宽屏由右侧常驻目录承担，按钮只在窄屏且内联目录参与渲染时可用。 */
  const tocJumpButton = document.getElementById('toc-jump');

  const isInlineTocOnly = () =>
    inlineToc !== null
    && typeof window.matchMedia === 'function'
    && window.matchMedia(INLINE_TOC_MQ).matches
    // 阅读模式下大屏改用右侧常驻目录，此时内联目录被 CSS 隐藏，按钮须同步隐藏。
    && window.getComputedStyle(inlineToc).display !== 'none';

  const syncTocJumpButton = () => {
    if (!tocJumpButton) return;
    tocJumpButton.hidden = !isInlineTocOnly();
  };

  if (tocJumpButton && inlineToc) {
    const toc = inlineToc;

    /** 目录是否已在视口内：在视口内只开关，不做跳转。 */
    const isInlineTocInView = () => {
      const rect = toc.getBoundingClientRect();
      const height = rect.height || 0;
      return rect.top < window.innerHeight && rect.top + height > 0;
    };

    tocJumpButton.addEventListener('click', () => {
      if (!isInlineTocOnly()) return;
      if (isInlineTocInView()) {
        // 目录就在眼前：原地点一下开、再点一下关，不记录返回位置。
        toggleInlineToc(!toc.open);
        return;
      }
      // 不在可视范围：先通知浮动列把跳转前的位置入栈，再展开目录并滚过去。
      window.dispatchEvent(new CustomEvent('astro-whono:toc-jump'));
      const scrollToToc = () =>
        toc.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start'
        });
      // 展开会改变目录高度，滚动放到下一帧，落点才准。
      window.requestAnimationFrame(scrollToToc);
      // 过渡结束后再校准一次：展开抬高页高，末尾的滚动可能被夹紧。
      toggleInlineToc(true, () => window.requestAnimationFrame(scrollToToc));
    });
    syncTocJumpButton();
  }

  // 带 hash 打开或切换 hash 时同样高亮。
  const flashByHash = () => {
    if (window.location.hash.length <= 1) return;
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch (_) {}
    const heading = document.getElementById(id);
    if (heading instanceof HTMLElement && heading.matches('h2[id], h3[id]')) {
      flashSection(heading);
    }
  };

  flashByHash();
  window.addEventListener('hashchange', flashByHash);

  /* 首屏入场：head 内联脚本先按收起态渲染，绘制完成后撤掉并展开。 */
  if (rootEl.dataset.tocIntro === 'true') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          delete rootEl.dataset.tocIntro;
          window.setTimeout(requestUpdate, 600);
        }, 600);
      });
    });
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', () => {
    requestUpdate();
    syncTocJumpButton();
  });
  window.addEventListener('astro-whono:reading-mode-change', () => {
    requestUpdate();
    syncTocJumpButton();
    // 阅读模式列宽过渡约 520ms，结束后再校准一次。
    window.setTimeout(() => {
      requestUpdate();
      syncTocJumpButton();
    }, 600);
  });
  update();
};

initArticleToc();

export {};
