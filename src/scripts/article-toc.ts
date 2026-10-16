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

  const closeInlineToc = (link: Element) => {
    const details = link.closest<HTMLDetailsElement>('details.article-toc--inline');
    if (details?.open) details.open = false;
  };

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
      // 先收起折叠目录再滚动，避免落点偏移。
      closeInlineToc(link);
      // 覆盖层随正文滚动，可在平滑滚动前铺好。
      flashSection(heading);
      // 通知浮动列把跳转前的位置入栈。
      window.dispatchEvent(new CustomEvent('astro-whono:reading-jump'));

      window.requestAnimationFrame(() => {
        heading.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start'
        });
        // 聚焦标题，便于读屏落到该小节。
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        try {
          window.history.pushState(null, '', `#${id}`);
        } catch (_) {}
      });
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
  const inlineToc = document.querySelector<HTMLDetailsElement>('details.article-toc--inline');

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
    tocJumpButton.addEventListener('click', () => {
      if (!isInlineTocOnly()) return;
      // 先通知浮动列把跳转前的位置入栈，再展开目录：返回位置是点按钮之前的阅读位置。
      window.dispatchEvent(new CustomEvent('astro-whono:toc-jump'));
      inlineToc.open = true;
      // 展开会改变目录高度，滚动放到下一帧，落点才准。
      window.requestAnimationFrame(() => {
        inlineToc.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start'
        });
      });
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
