/**
 * 卡片弹窗的通用交互：点卡片主体打开 `<dialog>`，关闭按钮 / Esc / 点遮罩关闭，打开后焦点进入弹窗。
 * `/projects/` 与 `/bits/` 共用，差异只有标记前缀与是否支持 `#<id>` 锚点自动展开。
 */
type CardDialogWiring = {
  /** 卡片选择器，仅用于判断当前页面是否存在此类卡片 */
  cardSelector: string;
  /** 打开触发器选择器 */
  openSelector: string;
  /** 关闭按钮选择器 */
  closeSelector: string;
  /** 弹窗面板选择器 */
  panelSelector: string;
  /** 打开触发器上保存弹窗完整 id 的属性名 */
  dialogIdAttribute: string;
  /** 打开后聚焦的元素选择器，在弹窗内查找 */
  focusSelector: string;
  /** 关闭时归零滚动位置的元素选择器，在弹窗内查找 */
  scrollResetSelector: string;
  /** `#<entryId>` 锚点自动展开弹窗时的弹窗 id 前缀；不传则不做锚点展开 */
  hashDialogIdPrefix?: string;
};

export const initCardDialogs = (wiring: CardDialogWiring) => {
  if (!document.querySelector(wiring.cardSelector)) return;

  const getDialog = (id: string) => document.getElementById(id) as HTMLDialogElement | null;

  const openDialog = (dialog: HTMLDialogElement) => {
    if (dialog.open) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      const focusTarget = dialog.querySelector<HTMLElement>(wiring.focusSelector);
      window.requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
      return;
    }
    dialog.setAttribute('open', '');
  };

  const closeDialog = (dialog: HTMLDialogElement) => {
    if (!dialog.open) return;
    if (typeof dialog.close === 'function') {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  };

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const openTrigger = target.closest<HTMLElement>(wiring.openSelector);
    if (openTrigger) {
      event.preventDefault();
      const dialogId = (openTrigger.getAttribute(wiring.dialogIdAttribute) ?? '').trim();
      const dialog = dialogId ? getDialog(dialogId) : null;
      if (dialog) openDialog(dialog);
      return;
    }

    const closeTrigger = target.closest<HTMLElement>(wiring.closeSelector);
    if (closeTrigger) {
      const dialog = closeTrigger.closest<HTMLDialogElement>(wiring.panelSelector);
      if (dialog) closeDialog(dialog);
      return;
    }

    // 点遮罩关闭：`<dialog>` 自身即为遮罩区域。
    if (target instanceof HTMLDialogElement && target.matches(wiring.panelSelector)) {
      closeDialog(target);
    }
  });

  document.querySelectorAll<HTMLDialogElement>(wiring.panelSelector).forEach((dialog) => {
    dialog.addEventListener('cancel', () => closeDialog(dialog));
    dialog.addEventListener('close', () => {
      dialog.scrollTop = 0;
      const content = dialog.querySelector<HTMLElement>(wiring.scrollResetSelector);
      if (content) content.scrollTop = 0;
    });
  });

  const { hashDialogIdPrefix } = wiring;
  if (hashDialogIdPrefix) {
    /** `#<entryId>` 锚点进入时自动展开对应弹窗，归档标题跳转依赖它。 */
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim();
      if (!id) return;
      const dialog = getDialog(`${hashDialogIdPrefix}${id}`);
      if (dialog) openDialog(dialog);
    };

    openFromHash();
    window.addEventListener('hashchange', openFromHash);
  }
};
