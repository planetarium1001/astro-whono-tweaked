import { OP_CHAR, type ExpressionToken } from './tag-expression';

/**
 * 页头筛选控件：已选胶囊条、搜索面板开关、副标题计数。本模块只建节点与改文案，不绑事件；
 * 事件委托由调用方挂在 `[data-entry-tag-open]` / `[data-entry-tag-remove]` / `[data-entry-tag-clear]` 上。
 */

/** 条首标签图标：与 dialog / 页头同一枚 lucide `tag`（脚本创建的节点）。 */
const TAG_ICON_MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"'
  + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  + ' aria-hidden="true" focusable="false" class="icon"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2'
  + ' 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0'
  + ' 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>';

type SelectedChipItem = {
  /** 数据键（标签 key / 项目名），会写到 `data-entry-tag-remove` 上 */
  key: string;
  /** 展示文案（不含前缀） */
  label: string;
};

type CreateSelectedChipBarOptions = {
  /** 胶囊清单；与 `tokens` 二选一（`tokens` 优先）。 */
  items?: readonly SelectedChipItem[];
  /** `标签` / `项目`：用于 aria-label 文案 */
  itemNoun: string;
  /** 胶囊文案前缀，默认 `#`（`/devlog/` 的项目不是标签，传空串） */
  labelPrefix?: string;
  /** 按表达式记号流渲染：段内显示胶囊，跨段用 `(` `)` 包住左边。 */
  tokens?: readonly ExpressionToken[];
  /** token 里的 key → 展示文案（默认原样） */
  labelOf?: (key: string) => string;
};

/** 单个已选胶囊：`#标签 ×`（`#标签` 打开选择器、`×` 移除）。 */
const createSelectedChip = ({
  item,
  itemNoun,
  labelPrefix = '#'
}: {
  item: SelectedChipItem;
  itemNoun: string;
  labelPrefix?: string;
}): HTMLElement => {
  const chip = document.createElement('span');
  chip.className = 'entry-tag-chip';

  // `#标签` 是按钮：点击继续筛选（打开选择器），与 `×` 各司其职
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'entry-tag-chip__label';
  label.dataset.entryTagOpen = '';
  label.setAttribute('aria-haspopup', 'dialog');
  label.setAttribute('aria-expanded', 'false');
  label.setAttribute('aria-label', `继续筛选：打开${itemNoun}选择器（已选 ${item.label}）`);
  label.title = '继续筛选';
  label.textContent = `${labelPrefix}${item.label}`;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'entry-tag-chip__remove';
  remove.dataset.entryTagRemove = item.key;
  remove.setAttribute('aria-label', `移除${itemNoun} ${item.label}`);
  remove.textContent = '×';

  chip.append(label, remove);
  return chip;
};

/** 表达式里的运算符按钮，文案即 `+` / `/`；`segmentIndex` 指向该运算符右侧那一段。 */
const createExpressionOpButton = (op: 'and' | 'or', segmentIndex: number): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'entry-tag-op';
  button.dataset.entryTagOp = op;
  button.dataset.entryTagOpSegment = String(segmentIndex);
  button.textContent = OP_CHAR[op];
  button.setAttribute(
    'aria-label',
    op === 'or' ? '这一段是任一标签（OR），点击改为同时包含' : '这一段是同时包含（AND），点击改为任一标签'
  );
  button.title = op === 'or' ? '任一标签（OR）' : '同时包含（AND）';
  return button;
};

const createParen = (side: '(' | ')'): HTMLElement => {
  const span = document.createElement('span');
  span.className = 'entry-tag-paren';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = side;
  return span;
};

/** 已选条（第一行）：标签图标 + 各已选胶囊，胶囊之间是 `+` / `/` 连接符。 */
export const createSelectedChipBar = (options: CreateSelectedChipBarOptions): HTMLElement => {
  const { items, itemNoun, labelPrefix = '#', tokens, labelOf } = options;
  const container = document.createElement('span');
  container.className = 'entry-tag-apply';
  container.dataset.entryTagStatus = '';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', `已选${itemNoun}`);

  const icon = document.createElement('span');
  icon.className = 'entry-tag-apply__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = TAG_ICON_MARKUP;
  container.append(icon);

  if (tokens) {
    const label = labelOf ?? ((key: string) => key);
    for (const token of tokens) {
      if (token.type === 'tag') {
        container.append(
          createSelectedChip({
            item: { key: token.key, label: label(token.key) },
            itemNoun,
            labelPrefix
          })
        );
        continue;
      }
      if (token.type === 'op') {
        container.append(createExpressionOpButton(token.op, token.segmentIndex));
        continue;
      }
      container.append(createParen(token.side));
    }
    return container;
  }

  for (const item of items ?? []) {
    container.append(createSelectedChip({ item, itemNoun, labelPrefix }));
  }

  return container;
};

/** 第二行右侧的两个动作：复用改版前的 `.page-subtitle__action` / `.page-subtitle__link`。 */
export const createSelectedChipActions = (itemNoun: string): HTMLElement => {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'page-subtitle__action';
  open.dataset.entryTagOpen = '';
  open.setAttribute('aria-haspopup', 'dialog');
  open.setAttribute('aria-expanded', 'false');
  open.textContent = `切换${itemNoun}`;

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'page-subtitle__link';
  clear.dataset.entryTagClear = '';
  clear.textContent = '清除筛选';

  const actions = document.createElement('span');
  actions.className = 'page-subtitle__item page-subtitle__actions';
  actions.dataset.entryTagActions = '';
  actions.append(open, clear);
  return actions;
};

/**
 * 两行布局开关：`.page-heading--tag-bar` 让副标题与第一行胶囊左对齐，并隐藏副标题里的 `#标签` 入口；
 * 该类的 `display: grid` 会被 `lists.css` 压回 flex，由 check:layout-geometry 校验。
 */
const syncSelectedChipLayout = (
  pageHeading: HTMLElement | null,
  tagTrigger: HTMLElement | null,
  active: boolean
) => {
  pageHeading?.classList.toggle('page-heading--tag-bar', active);
  if (tagTrigger) tagTrigger.hidden = active;
};

const STATUS_SELECTOR = '[data-entry-tag-status]';
const ACTIONS_SELECTOR = '[data-entry-tag-actions]';

/** 页头两行控件的挂载点。 */
export type SelectedChipHost = {
  /** 第一行：标题行。 */
  titleRow: HTMLElement | null;
  /** 第二行：副标题。 */
  subtitle: HTMLElement | null;
  /** 页头容器，用于两行布局开关。 */
  pageHeading: HTMLElement | null;
  /** 副标题里的 `#标签` 入口，两行布局时隐藏。 */
  tagTrigger: HTMLElement | null;
};

/** 挂载第一行控件条与第二行动作，并切到两行布局。 */
export const mountSelectedChipBar = (
  host: SelectedChipHost,
  bar: HTMLElement,
  actions: HTMLElement
): void => {
  // 复用节点会让「依次滑入」动画在每次重渲染时重播，因此整体替换
  const existing = host.titleRow?.querySelector<HTMLElement>(STATUS_SELECTOR);
  if (existing) existing.replaceWith(bar);
  else host.titleRow?.append(bar);

  if (host.subtitle) {
    const existingActions = host.subtitle.querySelector<HTMLElement>(ACTIONS_SELECTOR);
    if (existingActions) existingActions.replaceWith(actions);
    else host.subtitle.append(actions);
  }
  syncSelectedChipLayout(host.pageHeading, host.tagTrigger, true);
};

/** 摘掉动作按钮并回到单行页头布局；返回第一行控件条本身（不删除）。 */
export const unmountSelectedChipBar = (host: SelectedChipHost): HTMLElement | null => {
  const existing = host.titleRow?.querySelector<HTMLElement>(STATUS_SELECTOR) ?? null;
  host.subtitle?.querySelector<HTMLElement>(ACTIONS_SELECTOR)?.remove();
  syncSelectedChipLayout(host.pageHeading, host.tagTrigger, false);
  return existing;
};

/** 副标题里的「共 N 篇 / 条」及其后的限定词。 */
const SUBTITLE_COUNT_RE = /共\s*\d+\s*(?:篇|条)(内容|絮语|动态|文章|更新)?/;

/** 刷新副标题里的「共 N 篇 / 条」；`count` 为 null 时恢复模板原文。 */
export const syncSubtitleCount = (
  textEl: HTMLElement | null,
  template: string,
  count: number | null,
  { defaultUnit, keep }: { defaultUnit: '篇' | '条'; keep?: string }
): void => {
  if (!textEl || !template) return;
  if (count === null) {
    textEl.textContent = template;
    return;
  }
  const match = SUBTITLE_COUNT_RE.exec(template);
  if (!match) {
    textEl.textContent = `共 ${count} ${defaultUnit}`;
    return;
  }
  const unit = match[0].includes('条') ? '条' : '篇';
  const trailing = match[1] === keep ? match[1] : '';
  textEl.textContent = template.replace(SUBTITLE_COUNT_RE, `共 ${count} ${unit}${trailing}`);
};

/** 页头搜索面板的开合：同步 `is-open`、`aria-expanded` / `aria-hidden` 与输入框的 Tab 可达性。 */
export const setSearchPanelOpen = (
  searchRoot: HTMLElement | null,
  parts: {
    toggle: HTMLElement | null;
    panel: HTMLElement | null;
    input: HTMLInputElement | null;
  },
  open: boolean
): void => {
  if (!searchRoot) return;
  searchRoot.classList.toggle('is-open', open);
  parts.toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  parts.panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (parts.input) parts.input.tabIndex = open ? 0 : -1;
};
