// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sortSocialOrderItems, type SocialOrderItem } from '../src/scripts/admin-console/social-order';

/**
 * 后台社交链接列表的排序规则：可见行按序号在前，不可见行其次，
 * 结构隐藏行（尚未填写的 X 预置行）最后，且隐藏行仍参与编号。
 */

const row = (id: string, hidden = false): HTMLElement => {
  const element = document.createElement('div');
  element.dataset.id = id;
  if (hidden) element.dataset.rowHidden = 'true';
  return element;
};

const item = (
  id: string,
  order: number,
  options: { visible?: boolean; hidden?: boolean; tie?: number } = {}
): SocialOrderItem => ({
  row: row(id, options.hidden ?? false),
  type: options.hidden ? 'preset' : 'custom',
  visible: options.visible ?? true,
  order,
  tie: options.tie ?? 0
});

const ids = (items: readonly SocialOrderItem[]): string[] => items.map((entry) => entry.row.dataset.id ?? '');

describe('后台社交链接排序', () => {
  it('可见行按序号升序，与传入顺序无关', () => {
    const sorted = sortSocialOrderItems([
      item('github', 1),
      item('email', 3),
      item('weibo', 2)
    ]);
    expect(ids(sorted)).toEqual(['github', 'weibo', 'email']);
  });

  it('不可见行排在可见行之后', () => {
    const sorted = sortSocialOrderItems([
      item('hidden-link', 1, { visible: false }),
      item('github', 9)
    ]);
    expect(ids(sorted)).toEqual(['github', 'hidden-link']);
  });

  it('结构隐藏行排在最后，即使它的序号最小', () => {
    const sorted = sortSocialOrderItems([
      item('x', 1, { hidden: true }),
      item('github', 5),
      item('email', 6)
    ]);
    expect(ids(sorted)).toEqual(['github', 'email', 'x']);
  });

  it('同号时保持原有先后', () => {
    const sorted = sortSocialOrderItems([
      item('first', 2, { tie: 0 }),
      item('second', 2, { tie: 1 }),
      item('third', 2, { tie: 2 })
    ]);
    expect(ids(sorted)).toEqual(['first', 'second', 'third']);
  });

  it('隐藏行仍然在结果里，保证可见行编号连续', () => {
    const sorted = sortSocialOrderItems([item('github', 1), item('x', 2, { hidden: true }), item('email', 2)]);
    expect(sorted).toHaveLength(3);
    expect(ids(sorted)).toEqual(['github', 'email', 'x']);
  });

  it('不修改传入数组', () => {
    const input = [item('b', 2), item('a', 1)];
    sortSocialOrderItems(input);
    expect(ids(input)).toEqual(['b', 'a']);
  });
});
