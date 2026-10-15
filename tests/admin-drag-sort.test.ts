// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { initDragSort } from '../src/scripts/admin-console/drag-sort';

/**
 * 后台主题页两处列表（侧栏导航、社交链接）的拖拽排序。
 * jsdom 的 getBoundingClientRect 全为 0，因此 dragover 的插入位置完全由 clientY 决定：
 * 负值落在目标行上半区（插到其前），非负值落在下半区（插到其后）。
 */

const ROW_SELECTOR = '.row';
const HANDLE_SELECTOR = '[data-drag-sort-handle]';
const ORDER_SELECTOR = '[data-order]';

const createList = (ids: string[]): HTMLElement => {
  document.body.innerHTML = `
    <div id="list">
      ${ids
        .map(
          (id) => `<div class="row" data-id="${id}">
            <input data-order value="9">
            <span role="button" tabindex="0" data-drag-sort-handle></span>
          </div>`
        )
        .join('')}
    </div>`;
  return document.querySelector<HTMLElement>('#list')!;
};

const rows = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(ROW_SELECTOR));
const idOrder = (): string[] => rows().map((row) => row.dataset.id ?? '');
const orderValues = (): string[] =>
  rows().map((row) => row.querySelector<HTMLInputElement>(ORDER_SELECTOR)!.value);
const handleOf = (id: string): HTMLElement =>
  rows()
    .find((row) => row.dataset.id === id)!
    .querySelector<HTMLElement>(HANDLE_SELECTOR)!;
const rowOf = (id: string): HTMLElement => rows().find((row) => row.dataset.id === id)!;

const startDrag = (target: Element): Event => {
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { effectAllowed: '', setData: () => {}, setDragImage: () => {} }
  });
  target.dispatchEvent(event);
  return event;
};

const dragOver = (target: Element, clientY: number): void => {
  target.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY }));
};

const drop = (target: Element): void => {
  target.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
};

const pressArrow = (target: Element, key: 'ArrowUp' | 'ArrowDown'): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

describe('后台列表拖拽排序', () => {
  let onReorder: Mock<() => void>;

  const setup = (ids: string[]) => {
    const list = createList(ids);
    onReorder = vi.fn<() => void>();
    initDragSort({
      list,
      rowSelector: ROW_SELECTOR,
      handleSelector: HANDLE_SELECTOR,
      orderInputSelector: ORDER_SELECTOR,
      onReorder
    });
    return list;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('拖到目标行上半区时插到其前，并按新顺序重写序号', () => {
    setup(['a', 'b', 'c']);

    startDrag(handleOf('c'));
    dragOver(rowOf('a'), -1);
    drop(rowOf('a'));

    expect(idOrder()).toEqual(['c', 'a', 'b']);
    expect(orderValues()).toEqual(['1', '2', '3']);
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it('拖到目标行下半区时插到其后', () => {
    setup(['a', 'b', 'c']);

    startDrag(handleOf('a'));
    dragOver(rowOf('b'), 10);
    drop(rowOf('b'));

    expect(idOrder()).toEqual(['b', 'a', 'c']);
    expect(orderValues()).toEqual(['1', '2', '3']);
  });

  it('没有实际重排时不重写序号也不通知外部', () => {
    setup(['a', 'b', 'c']);

    startDrag(handleOf('a'));
    drop(rowOf('a'));

    expect(idOrder()).toEqual(['a', 'b', 'c']);
    // 初始值刻意不是 1..N，未被重排就不该被改写
    expect(orderValues()).toEqual(['9', '9', '9']);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('只在抓手处发起拖拽', () => {
    setup(['a', 'b', 'c']);
    const input = rowOf('a').querySelector<HTMLInputElement>(ORDER_SELECTOR)!;

    startDrag(input);
    dragOver(rowOf('c'), 10);
    drop(rowOf('c'));

    expect(idOrder()).toEqual(['a', 'b', 'c']);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('序号输入被禁用时阻止拖拽', () => {
    setup(['a', 'b', 'c']);
    rowOf('a').querySelector<HTMLInputElement>(ORDER_SELECTOR)!.disabled = true;

    const event = startDrag(handleOf('a'));
    dragOver(rowOf('c'), 10);
    drop(rowOf('c'));

    expect(event.defaultPrevented).toBe(true);
    expect(idOrder()).toEqual(['a', 'b', 'c']);
  });

  it('焦点在抓手上时可用方向键移动并重编号', () => {
    setup(['a', 'b', 'c']);

    pressArrow(handleOf('c'), 'ArrowUp');

    expect(idOrder()).toEqual(['a', 'c', 'b']);
    expect(orderValues()).toEqual(['1', '2', '3']);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(handleOf('c'));

    pressArrow(handleOf('c'), 'ArrowDown');

    expect(idOrder()).toEqual(['a', 'b', 'c']);
    expect(orderValues()).toEqual(['1', '2', '3']);
    expect(onReorder).toHaveBeenCalledTimes(2);
  });

  it('键盘移到边界时不越界', () => {
    setup(['a', 'b', 'c']);

    pressArrow(handleOf('a'), 'ArrowUp');
    pressArrow(handleOf('c'), 'ArrowDown');

    expect(idOrder()).toEqual(['a', 'b', 'c']);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('初始化之后追加的行同样可以拖拽', () => {
    const list = setup(['a', 'b']);
    const added = document.createElement('div');
    added.className = 'row';
    added.dataset.id = 'c';
    added.innerHTML = `<input data-order value="9"><span role="button" tabindex="0" data-drag-sort-handle></span>`;
    list.append(added);

    startDrag(handleOf('c'));
    dragOver(rowOf('a'), -1);
    drop(rowOf('a'));

    expect(idOrder()).toEqual(['c', 'a', 'b']);
    expect(orderValues()).toEqual(['1', '2', '3']);
  });
});
