const body = document.body;

// 阅读模式入口在右下角浮动列里，同一按钮兼顾进入与退出
const readerBtn = document.getElementById('reader-toggle');

// 与 layout.css 的 520ms 过渡对齐，余量用于撤掉 data-reading-anim
const READING_ANIM_MS = 560;
const READING_ANIM_ATTR = 'data-reading-anim';
// 窄屏顶栏用 max-height 收起，需量出真实高度才能走满全程
const MOBILE_SIDEBAR_HEIGHT_VAR = '--mobile-sidebar-height';
const SIDEBAR_ID = 'site-sidebar';
const MOBILE_MQ = '(max-width: 900px)';

let readingAnimTimer: number | undefined;
let mobileSidebarHeight = 0;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isMobileLayout = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_MQ).matches;

// 只在展开态更新缓存，收起态（高度 0）不覆盖
const measureMobileSidebar = () => {
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;
  const height = Math.ceil(sidebar.getBoundingClientRect().height);
  if (height > 0) mobileSidebarHeight = height;
};

// 过渡期间给侧栏打标记：桌面端裁剪收缩外溢，窄屏端同时量高并强制一次布局
const startReadingAnim = () => {
  if (!body || prefersReducedMotion()) return;

  body.setAttribute(READING_ANIM_ATTR, 'true');

  if (isMobileLayout()) {
    measureMobileSidebar();
    const sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar && mobileSidebarHeight > 0) {
      sidebar.style.setProperty(MOBILE_SIDEBAR_HEIGHT_VAR, `${mobileSidebarHeight}px`);
    }
    // 强制一次布局：max-height 由 none 跳到 0 不可插值，须先按量到的上限算一帧
    if (sidebar) void sidebar.offsetHeight;
  }

  if (readingAnimTimer !== undefined) window.clearTimeout(readingAnimTimer);
  readingAnimTimer = window.setTimeout(() => {
    readingAnimTimer = undefined;
    body.removeAttribute(READING_ANIM_ATTR);
  }, READING_ANIM_MS);
};

const setControlLabel = (element: HTMLElement, label: string) => {
  element.setAttribute('aria-label', label);
  if (element.hasAttribute('data-tooltip')) {
    element.setAttribute('data-tooltip', label);
    element.removeAttribute('title');
    return;
  }
  element.setAttribute('title', label);
};

const isReaderOn = () => body?.dataset.reading === 'immersive';
const isImmersivePage = body?.classList.contains('immersive-page');

const notifyReadingModeChange = () => {
  window.dispatchEvent(new CustomEvent('astro-whono:reading-mode-change'));
};

// 非文章/小记页无阅读模式，直接隐藏入口而非禁用
const setReaderAvailable = (available: boolean) => {
  if (!readerBtn) return;
  readerBtn.hidden = !available;
  readerBtn.setAttribute('aria-pressed', 'false');
  if (available) setControlLabel(readerBtn, '阅读模式');
};

const applyReader = (on: boolean) => {
  if (!body) return;
  const changed = isReaderOn() !== on;

  // 须在切换 data-reading 之前调用：窄屏收起依赖其中量到的高度
  if (changed) {
    startReadingAnim();
  }

  if (on) {
    body.dataset.reading = 'immersive';
  } else {
    delete body.dataset.reading;
  }

  if (readerBtn) {
    readerBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    setControlLabel(readerBtn, on ? '退出阅读' : '阅读模式');
  }
  notifyReadingModeChange();
};

const initReader = () => {
  if (!readerBtn) return;

  setReaderAvailable(isImmersivePage);
  if (!isImmersivePage) return;

  applyReader(false);

  readerBtn.addEventListener('click', () => {
    applyReader(!isReaderOn());
  });

  // 顶栏高度会随换行/旋转变化，展开态下重新量缓存
  window.addEventListener('resize', () => {
    if (!isReaderOn()) measureMobileSidebar();
  });
};

initReader();

export {};
