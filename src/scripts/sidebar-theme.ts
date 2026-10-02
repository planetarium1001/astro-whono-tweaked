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

  // 兼容旧版 Safari / WebView 的 MediaQueryList 监听接口。
  const legacyColorSchemeMq = colorSchemeMq as unknown as LegacyMediaQueryList;
  legacyColorSchemeMq.addListener?.(listener);
};

// 主题切换涟漪：新主题快照以点击处为圆心用 clip-path 展开；
// 不支持 startViewTransition 或偏好减少动效时直接切换。
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
  // 必须以 document 为 this 调用，不能取裸函数
  return (candidate as StartViewTransitionLike).bind(document);
};

// 圆心取指针位置；键盘触发（clientX/Y 为 0）时回退到按钮中心
const resolveRippleOrigin = (event: MouseEvent) => {
  if (event.clientX > 0 || event.clientY > 0) {
    return { x: event.clientX, y: event.clientY };
  }

  const rect = themeBtn?.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  return { x: window.innerWidth / 2, y: 0 };
};

const applyThemeWithRipple = (event: MouseEvent, apply: () => void) => {
  const startViewTransition = getStartViewTransition();
  if (!startViewTransition || prefersReducedMotion()) {
    apply();
    return;
  }

  const { x, y } = resolveRippleOrigin(event);
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = startViewTransition(apply);
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${Math.ceil(radius)}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: RIPPLE_DURATION_MS,
          easing: RIPPLE_EASING,
          pseudoElement: '::view-transition-new(root)'
        }
      );
    })
    .catch(() => {});
};

const initTheme = () => {
  setThemeMode(activeThemeMode, false);
  themeBtn?.addEventListener('click', (event) => {
    const nextMode = getNextThemeMode(activeThemeMode);
    const apply = () => setThemeMode(nextMode);

    // 解析后主题未变（如浅色 → 跟随系统且系统为浅色）时不跑涟漪
    if (resolveTheme(nextMode) === resolveTheme(activeThemeMode)) {
      apply();
      return;
    }

    applyThemeWithRipple(event, apply);
  });

  const syncSystemTheme = () => {
    if (activeThemeMode === 'system') setThemeMode('system', false);
  };

  listenSystemThemeChange(syncSystemTheme);
};

initTheme();

export {};
