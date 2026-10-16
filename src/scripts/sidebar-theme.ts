const THEME_KEY = 'theme';
const THEME_MODE_KEY = 'theme-mode';
type Theme = 'light' | 'dark';
type ThemeMode = Theme | 'system';
type LegacyMediaQueryList = {
  addListener?: (listener: () => void) => void;
};

const root = document.documentElement;
const themeBtn = document.getElementById('theme-toggle');
const colorSchemeMq = window.matchMedia('(prefers-color-scheme: dark)');

const isTheme = (value: string | null): value is Theme =>
  value === 'light' || value === 'dark';

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'system' || isTheme(value);

const getSystemTheme = (): Theme => colorSchemeMq.matches ? 'dark' : 'light';

const resolveTheme = (mode: ThemeMode): Theme =>
  mode === 'system' ? getSystemTheme() : mode;

const readThemeMode = (): ThemeMode => {
  try {
    const storedMode = localStorage.getItem(THEME_MODE_KEY);
    if (isThemeMode(storedMode)) return storedMode;

    const legacyTheme = localStorage.getItem(THEME_KEY);
    if (isTheme(legacyTheme)) return legacyTheme;
  } catch (_) {}

  return 'system';
};

const writeThemeMode = (mode: ThemeMode) => {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
    if (mode === 'system') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, mode);
    }
  } catch (_) {}
};

const getNextThemeMode = (mode: ThemeMode): ThemeMode => {
  if (mode === 'system') return 'light';
  if (mode === 'light') return 'dark';
  return 'system';
};

const getThemeModeLabel = (mode: ThemeMode, theme: Theme): string => {
  if (mode === 'system') {
    return `跟随系统（${theme === 'dark' ? '深色模式' : '浅色模式'}）`;
  }

  return theme === 'dark' ? '深色模式' : '浅色模式';
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

let activeThemeMode: ThemeMode = readThemeMode();

const applyTheme = (theme: Theme, mode: ThemeMode = activeThemeMode) => {
  root.dataset.theme = theme;
  root.dataset.themeMode = mode;
  const dark = theme === 'dark';
  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', mode === 'system' ? 'mixed' : (dark ? 'true' : 'false'));
    const label = getThemeModeLabel(mode, theme);
    setControlLabel(themeBtn, label);
  }
};

const setThemeMode = (mode: ThemeMode, persist = true) => {
  activeThemeMode = mode;
  applyTheme(resolveTheme(mode), mode);
  if (persist) writeThemeMode(mode);
};

const listenSystemThemeChange = (listener: () => void) => {
  if (typeof colorSchemeMq.addEventListener === 'function') {
    colorSchemeMq.addEventListener('change', listener);
    return;
  }

  // 兼容只实现 addListener 的旧版 Safari / WebView。
  const legacyColorSchemeMq = colorSchemeMq as unknown as LegacyMediaQueryList;
  legacyColorSchemeMq.addListener?.(listener);
};

/**
 * 主题切换涟漪：切到亮色时新快照自按钮中心放大（`::view-transition-new(root)`），
 * 切到暗色时旧快照反向收缩回按钮中心（`::view-transition-old(root)`）；
 * 不支持 View Transitions 或偏好减少动效时直接切换。
 */
type ViewTransitionLike = { ready: Promise<void> };
type StartViewTransitionLike = (callback: () => void) => ViewTransitionLike;

const RIPPLE_DURATION_MS = 1040;
const RIPPLE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getStartViewTransition = (): StartViewTransitionLike | null => {
  const candidate = (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  if (typeof candidate !== 'function') return null;
  // 必须以 document 为 this 调用，不能取裸函数。
  return (candidate as StartViewTransitionLike).bind(document);
};

// 圆心取主题切换按钮自身的中心；按钮缺失或量不到尺寸时回退到视口顶部中点。
const resolveRippleOrigin = () => {
  const rect = themeBtn?.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  return { x: window.innerWidth / 2, y: 0 };
};

/**
 * 涟漪方向标记（`<html>` 的 `data-theme-ripple`）：`expand` 动画新快照，`converge` 动画旧快照，
 * 两个方向的层叠顺序不同（样式见 `global.css`）。
 */
const RIPPLE_ATTR = 'themeRipple';

const applyThemeWithRipple = (apply: () => void, targetTheme: Theme) => {
  const startViewTransition = getStartViewTransition();
  if (!startViewTransition || prefersReducedMotion()) {
    apply();
    return;
  }

  const { x, y } = resolveRippleOrigin();
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  const center = `${x}px ${y}px`;
  const circle = (r: number) => `circle(${Math.ceil(r)}px at ${center})`;

  // 只有有效主题发生变化才会走到这里：切到亮色 = 发散（新快照从小圆放大到整屏），
  // 切到暗色 = 收缩（旧快照从整屏收到按钮中心）。
  const expanding = targetTheme === 'light';
  root.dataset[RIPPLE_ATTR] = expanding ? 'expand' : 'converge';

  /** 过渡期间把 `color-scheme` 钉在旧主题：View Transition 不拍滚动条快照，否则滚动条会先变新主题。 */
  const previousScheme = root.dataset.theme === 'dark' ? 'dark' : 'light';
  const inlineColorScheme = root.style.colorScheme;
  root.style.colorScheme = previousScheme;

  const clearRippleFlag = () => {
    delete root.dataset[RIPPLE_ATTR];
    if (inlineColorScheme) root.style.colorScheme = inlineColorScheme;
    else root.style.removeProperty('color-scheme');
  };

  const transition = startViewTransition(apply);
  transition.ready
    .then(() => {
      const animation = document.documentElement.animate(
        {
          clipPath: expanding
            ? [circle(0), circle(radius)]
            : [circle(radius), circle(0)]
        },
        {
          duration: RIPPLE_DURATION_MS,
          easing: RIPPLE_EASING,
          pseudoElement: expanding
            ? '::view-transition-new(root)'
            : '::view-transition-old(root)'
        }
      );
      animation.finished.then(clearRippleFlag, clearRippleFlag);
    })
    .catch(clearRippleFlag);
};

const initTheme = () => {
  setThemeMode(activeThemeMode, false);
  themeBtn?.addEventListener('click', () => {
    const nextMode = getNextThemeMode(activeThemeMode);
    const currentTheme = resolveTheme(activeThemeMode);
    const nextTheme = resolveTheme(nextMode);
    const apply = () => setThemeMode(nextMode);

    // 有效主题未变（如亮色 → 跟随系统且系统为浅色）时不跑涟漪，直接切换模式。
    if (nextTheme === currentTheme) {
      apply();
      return;
    }

    applyThemeWithRipple(apply, nextTheme);
  });

  const syncSystemTheme = () => {
    if (activeThemeMode === 'system') setThemeMode('system', false);
  };

  listenSystemThemeChange(syncSystemTheme);
};

initTheme();

export {};
