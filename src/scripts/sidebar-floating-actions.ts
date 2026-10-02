// 右下角浮动按钮列：回到顶部、回到上次阅读位置（退出阅读由 sidebar-reading.ts 控制）。
// 位置记忆分两层：跨次打开按路径存 localStorage，本次会话用位置栈（目录跳转、
// 回到顶部前入栈）。每条记「最近标题 + 段内偏移」与「滚动比例」，锚点优先、比例兜底。

const STACK_SIZE = 12;
const STORAGE_KEY = 'astro-whono:reading-position';
const SAVE_INTERVAL_MS = 1500;
const MIN_SCROLL_PX = 240;
const MIN_DELTA_RATIO = 0.18;

type SavedPosition = {
  headingId: string | null;
  offset: number;
  ratio: number;
  ts: number;
};

const stackButton = document.getElementById('scroll-top');
const resumeButton = document.getElementById('resume-reading');

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollToY = (y: number) => {
  window.scrollTo({
    top: Math.max(0, Math.round(y)),
    behavior: prefersReducedMotion() ? 'auto' : 'smooth'
  });
};

const readStore = (): Record<string, SavedPosition> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, SavedPosition>) : {};
  } catch (_) {
    return {};
  }
};

const writeStore = (store: Record<string, SavedPosition>) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
  }
};

const pruneStore = (store: Record<string, SavedPosition>) => {
  const entries = Object.entries(store);
  if (entries.length <= 60) return store;
  entries.sort((a, b) => (b[1]?.ts ?? 0) - (a[1]?.ts ?? 0));
  return Object.fromEntries(entries.slice(0, 60));
};

const initFloatingStack = () => {
  const stack = document.querySelector<HTMLElement>('[data-float-stack]');
  if (!stack || !stackButton) return;

  const pageKey = `${window.location.pathname}${window.location.search}`;
  const headings = Array.from(document.querySelectorAll<HTMLElement>('.prose :is(h2, h3)[id]'));

  const currentY = () => window.scrollY || document.documentElement.scrollTop || 0;

  const maxScroll = () =>
    Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

  // 当前位置所属章节与整体比例
  const capturePosition = (): SavedPosition => {
    const y = currentY();
    let headingId: string | null = null;
    let offset = 0;

    headings.forEach((heading) => {
      const top = heading.getBoundingClientRect().top + y;
      if (top <= y + 4) {
        headingId = heading.id;
        offset = y - top;
      }
    });

    return {
      headingId,
      offset,
      ratio: Math.min(1, Math.max(0, y / maxScroll())),
      ts: Date.now()
    };
  };

  const resolveTargetY = (position: SavedPosition) => {
    if (position.headingId) {
      const heading = document.getElementById(position.headingId);
      if (heading instanceof HTMLElement) {
        return heading.getBoundingClientRect().top + currentY() + (position.offset ?? 0);
      }
    }
    return (position.ratio ?? 0) * maxScroll();
  };

  const labelFor = (position: SavedPosition) => {
    let text = '';
    if (position.headingId) {
      const heading = document.getElementById(position.headingId);
      text = heading?.textContent?.trim() ?? '';
    }
    return text ? `回到上次阅读位置：${text}` : '回到上次阅读位置';
  };

  const positionStack: SavedPosition[] = [];

  const pushCurrentPosition = () => {
    // 页面开头没有回退价值
    if (currentY() < 80) return;
    const current = capturePosition();
    const last = positionStack[positionStack.length - 1];
    // 位置几乎没变则不入栈，避免连点堆积历史
    if (last && Math.abs(last.ratio - current.ratio) * maxScroll() < MIN_SCROLL_PX) return;
    positionStack.push(current);
    if (positionStack.length > STACK_SIZE) positionStack.shift();
  };

  let stored = readStore();
  let storedPosition: SavedPosition | null = stored[pageKey] ?? null;
  let saveTimer: number | undefined;

  const saveCurrentPosition = () => {
    const y = currentY();
    if (y < MIN_SCROLL_PX) return;
    stored = pruneStore({ ...stored, [pageKey]: capturePosition() });
    writeStore(stored);
  };

  const scheduleSave = () => {
    if (saveTimer !== undefined) return;
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined;
      saveCurrentPosition();
    }, SAVE_INTERVAL_MS);
  };

  const syncResumeButton = () => {
    if (!resumeButton) return;

    const next = positionStack[positionStack.length - 1] ?? storedPosition;
    if (!next) {
      resumeButton.hidden = true;
      return;
    }

    const delta = Math.abs(resolveTargetY(next) - currentY());
    const visible = positionStack.length > 0 || delta > Math.max(MIN_SCROLL_PX, window.innerHeight * MIN_DELTA_RATIO);
    resumeButton.hidden = !visible;
    if (visible) {
      const label = labelFor(next);
      resumeButton.setAttribute('aria-label', label);
      resumeButton.setAttribute('title', label);
    }
  };

  const syncScrollTopButton = () => {
    // 一屏看完时没有回到顶部可言，直接隐藏
    const scrollable = maxScroll() > 48;
    stackButton.hidden = !scrollable;
    stackButton.setAttribute(
      'aria-disabled',
      !scrollable || currentY() <= 8 ? 'true' : 'false'
    );
  };

  const syncAll = () => {
    syncResumeButton();
    syncScrollTopButton();
  };

  stackButton.addEventListener('click', () => {
    if (stackButton.getAttribute('aria-disabled') === 'true') return;
    pushCurrentPosition();
    scrollToY(0);
    syncAll();
  });

  resumeButton?.addEventListener('click', () => {
    const fromStored = positionStack.length === 0;
    const target = positionStack.pop() ?? storedPosition;
    if (!target) return;
    // 记下当前位置，便于再跳回来
    pushCurrentPosition();
    if (fromStored) {
      // 跨次记忆已用掉，避免下次打开又提示同一位置
      storedPosition = null;
      if (stored[pageKey]) {
        delete stored[pageKey];
        writeStore(stored);
      }
    }
    scrollToY(resolveTargetY(target));
    syncAll();
  });

  // 目录跳转前入栈（article-toc.ts 在滚动前派发）
  window.addEventListener('astro-whono:reading-jump', () => {
    pushCurrentPosition();
    syncAll();
  });

  window.addEventListener('scroll', () => {
    scheduleSave();
    syncScrollTopButton();
  }, { passive: true });

  window.addEventListener('resize', syncAll);
  window.addEventListener('load', syncAll);
  window.addEventListener('pagehide', saveCurrentPosition);
  window.addEventListener('astro-whono:reading-mode-change', () => {
    // 布局过渡结束后位置才有效，延后一拍校准
    window.setTimeout(syncAll, 600);
  });

  // 图片/字体加载会改变页面高度，需重算能否回到顶部
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => syncAll()).observe(document.body);
  }

  syncAll();
};

initFloatingStack();

export {};
