import { canAnimate } from './visibility-fade';

/**
 * `/devlog/` 抽屉展开与收缩：整行可点，`#<entryId>` 锚点进入时自动展开。
 *
 * 展开用实测高度过渡，reduced-motion 或环境没有 WAAPI（jsdom）时直接切换。
 */
const ROWS = Array.from(document.querySelectorAll<HTMLElement>('[data-devlog-row]'));

if (ROWS.length > 0) {
  const PANEL_MS = 240;
  const PANEL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

  /** 正在播放的高度动画；重复点击时先取消，避免两次动画叠出错误高度。 */
  const running = new WeakMap<HTMLElement, Animation>();

  const playHeight = (panel: HTMLElement, from: number, to: number): Promise<void> => {
    running.get(panel)?.cancel();
    panel.style.overflow = 'hidden';
    const animation = panel.animate(
      [
        { height: `${from}px`, opacity: from === 0 ? 0 : 1 },
        { height: `${to}px`, opacity: to === 0 ? 0 : 1 }
      ],
      { duration: PANEL_MS, easing: PANEL_EASING, fill: 'both' }
    );
    running.set(panel, animation);
    return animation.finished.then(
      () => {
        if (running.get(panel) === animation) running.delete(panel);
      },
      () => {}
    );
  };

  const clearInlineStyles = (panel: HTMLElement) => {
    for (const animation of panel.getAnimations?.() ?? []) animation.cancel();
    panel.style.overflow = '';
    panel.style.height = '';
  };

  const setExpanded = (row: HTMLElement, expanded: boolean) => {
    const toggle = row.querySelector<HTMLButtonElement>('[data-devlog-toggle]');
    const panel = row.querySelector<HTMLElement>('[data-devlog-panel]');
    const label = row.querySelector<HTMLElement>('[data-devlog-action-label]');
    if (!toggle || !panel) return;

    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    row.classList.toggle('is-open', expanded);
    if (label) label.textContent = expanded ? '收起' : '展开';

    if (expanded) {
      panel.hidden = false;
      const height = panel.offsetHeight;
      if (canAnimate(panel) && height > 0) {
        void playHeight(panel, 0, height).then(() => clearInlineStyles(panel));
      }
      return;
    }

    const height = panel.offsetHeight;
    if (canAnimate(panel) && height > 0) {
      void playHeight(panel, height, 0).then(() => {
        panel.hidden = true;
        clearInlineStyles(panel);
      });
      return;
    }
    panel.hidden = true;
    clearInlineStyles(panel);
  };

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const toggle = target?.closest<HTMLButtonElement>('[data-devlog-toggle]');
    if (!toggle) return;
    const row = toggle.closest<HTMLElement>('[data-devlog-row]');
    if (!row) return;
    event.preventDefault();
    setExpanded(row, toggle.getAttribute('aria-expanded') !== 'true');
  });

  /** `/devlog/#<entryId>` 自动展开。 */
  const openFromHash = () => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim();
    if (!id) return;
    const row = document.querySelector<HTMLElement>(`[data-devlog-row][data-devlog-id="${CSS.escape(id)}"]`);
    if (!row) return;
    setExpanded(row, true);
    row.scrollIntoView({ block: 'nearest' });
  };

  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}
