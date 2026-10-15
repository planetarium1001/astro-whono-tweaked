/** 侧栏导航行与社交链接行的拖放重排，按 DOM 顺序重写序号输入框。 */

export type DragSortOptions = {
  /* 行列表容器，仅直接子元素参与排序。 */
  list: HTMLElement;
  rowSelector: string;
  handleSelector: string;
  orderInputSelector: string;
  onReorder?: () => void;
};

const collectRows = (list: HTMLElement, rowSelector: string): HTMLElement[] =>
  Array.from(list.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches(rowSelector)
  );

export const initDragSort = ({
  list,
  rowSelector,
  handleSelector,
  orderInputSelector,
  onReorder
}: DragSortOptions): void => {
  let draggingRow: HTMLElement | null = null;
  let overRow: HTMLElement | null = null;
  let moved = false;

  const isListRow = (node: Element | null): node is HTMLElement =>
    node instanceof HTMLElement && node.parentElement === list && node.matches(rowSelector);

  const getHandle = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const handle = target.closest(handleSelector);
    return handle instanceof HTMLElement && list.contains(handle) ? handle : null;
  };

  /* 按当前 DOM 顺序把序号写为 1..N，数字即输入框的值。 */
  const renumber = (): void => {
    collectRows(list, rowSelector).forEach((row, index) => {
      const orderInput = row.querySelector(orderInputSelector);
      if (orderInput instanceof HTMLInputElement) orderInput.value = String(index + 1);
    });
  };

  const clearOverRow = (): void => {
    if (overRow) delete overRow.dataset.dragSortOver;
    overRow = null;
  };

  /* 拖拽结束：清理状态，发生过重排时重编号并通知外部刷新。 */
  const finishDrag = (): void => {
    const row = draggingRow;
    draggingRow = null;
    if (row) delete row.dataset.dragSortDragging;
    clearOverRow();
    if (row && moved) {
      renumber();
      onReorder?.();
    }
    moved = false;
  };

  const markOverRow = (row: HTMLElement, position: 'before' | 'after'): void => {
    if (overRow !== row) {
      clearOverRow();
      overRow = row;
    }
    row.dataset.dragSortOver = position;
  };

  const startDrag = (event: DragEvent): void => {
    const handle = getHandle(event.target);
    if (!handle) return;
    const row = handle.closest(rowSelector);
    if (!isListRow(row)) return;

    // 锁定或保存中时序号输入被禁用，此时不响应拖拽。
    const orderInput = row.querySelector(orderInputSelector);
    if (orderInput instanceof HTMLInputElement && orderInput.disabled) {
      event.preventDefault();
      return;
    }

    draggingRow = row;
    moved = false;
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) {
      dataTransfer.effectAllowed = 'move';
      // Firefox 需要写入数据才会启动拖拽。
      dataTransfer.setData('text/plain', '');
      dataTransfer.setDragImage(row, 18, Math.max(Math.round(row.offsetHeight / 2), 1));
    }
    // 拖拽影像已生成，再叠加拖动样式。
    row.dataset.dragSortDragging = 'true';
  };

  const dragOver = (event: DragEvent): void => {
    const row = draggingRow;
    if (!row) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    const target = event.target;
    const hovered = target instanceof Element ? target.closest(rowSelector) : null;
    if (!isListRow(hovered) || hovered === row) return;

    const rect = hovered.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    markOverRow(hovered, insertBefore ? 'before' : 'after');

    const reference = insertBefore ? hovered : hovered.nextSibling;
    // 已在目标位置时不再移动，避免拖拽期间抖动。
    if (reference !== row && reference !== row.nextSibling) {
      list.insertBefore(row, reference);
      moved = true;
    }
  };

  const endDrag = (event: DragEvent): void => {
    if (!draggingRow) return;
    event.preventDefault();
    finishDrag();
  };

  const moveByKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const handle = getHandle(event.target);
    if (!handle) return;
    const row = handle.closest(rowSelector);
    if (!isListRow(row)) return;

    const rows = collectRows(list, rowSelector);
    const index = rows.indexOf(row);
    if (index < 0) return;
    const neighbour = rows[event.key === 'ArrowUp' ? index - 1 : index + 1];
    if (!neighbour) return;

    event.preventDefault();
    if (event.key === 'ArrowUp') {
      list.insertBefore(row, neighbour);
    } else {
      list.insertBefore(row, neighbour.nextSibling);
    }

    renumber();
    onReorder?.();
    // 移动后保持焦点，便于连续操作。
    handle.focus({ preventScroll: true });
  };

  list.addEventListener('dragstart', startDrag);
  list.addEventListener('dragover', dragOver);
  list.addEventListener('drop', endDrag);
  list.addEventListener('dragend', () => {
    finishDrag();
  });
  list.addEventListener('keydown', moveByKeyboard);
};
