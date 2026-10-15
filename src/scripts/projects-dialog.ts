import { initCardDialogs } from './dialog-controller';

/**
 * `/projects/` 卡片点击后打开弹窗；`<=640px` 时 CSS 把弹窗变成底部抽屉。
 * 关闭方式为关闭按钮、点遮罩与 Esc（原生 `<dialog>` 的 `cancel`）。
 */
initCardDialogs({
  cardSelector: '[data-project-card]',
  openSelector: '[data-project-open]',
  closeSelector: '[data-project-close]',
  panelSelector: '[data-project-dialog-panel]',
  dialogIdAttribute: 'data-project-dialog',
  focusSelector: '.project-dialog__title',
  scrollResetSelector: '.project-dialog__content',
  hashDialogIdPrefix: 'project-dialog-'
});
