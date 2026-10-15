import { describe, expect, it } from 'vitest';
import {
  applyExpressionToParams,
  buildExpressionTokens,
  createEmptyExpression,
  evaluateExpression,
  formatExpression,
  getPendingOp,
  hasAnyTag,
  listTagKeys,
  parseExpression,
  removeTag,
  setSegmentOp,
  switchLastNonEmptySegmentToOr,
  switchPendingOp,
  toggleTag,
  type TagSegment
} from '../src/scripts/tag-expression';

/**
 * 标签筛选是复合逻辑表达式，而不是「一组标签 + 一个全局 AND/OR」：
 * 切换 `+` 与 `/` 时把前面选中的部分用 `()` 括起来，再在后面追加新的逻辑段。
 *
 * 在单位层钉住四处：切换运算符时的括号结构（`(a + b) / c`）、反复切换不堆括号、
 * 复合求值（段内先算再自左向右结合）、URL 读写（单段 `tags=&mode=`，复合 `tags=&ops=`）。
 */

const expression = (...segments: TagSegment[]): TagSegment[] => segments;

describe('tag-expression：括号结构与切换语义', () => {
  it('选标签 → 段内同一运算符；切换 +// → 把已选部分括起来再追加', () => {
    let next = createEmptyExpression();
    next = toggleTag(next, 'a');
    next = toggleTag(next, 'b');
    expect(formatExpression(next)).toBe('a + b');

    // 切换成 `/`：已选的两个被括起来，后面跟一个新的 `/`（等待继续选）
    next = switchPendingOp(next, 'or');
    expect(formatExpression(next)).toBe('( a + b ) /');
    expect(getPendingOp(next)).toBe('or');

    next = toggleTag(next, 'c');
    expect(formatExpression(next)).toBe('( a + b ) / c');

    // 再切回 `+`：左边整块再被括一层（运算顺序一眼可见）
    next = switchPendingOp(next, 'and');
    expect(formatExpression(next)).toBe('( ( a + b ) / c ) +');
    next = toggleTag(next, 'd');
    expect(formatExpression(next)).toBe('( ( a + b ) / c ) + d');
  });

  it('反复切换但不选标签：只改待选段的运算符，不会堆括号', () => {
    let next = toggleTag(createEmptyExpression(), 'a');
    next = switchPendingOp(next, 'or');
    next = switchPendingOp(next, 'and');
    next = switchPendingOp(next, 'or');
    expect(formatExpression(next)).toBe('a /');

    next = switchPendingOp(next, 'and');
    expect(formatExpression(next)).toBe('a +');
    expect(getPendingOp(next)).toBe('and');

    next = toggleTag(next, 'b');
    expect(formatExpression(next)).toBe('a + b');
  });

  it('相邻同运算符的段会合并（等价表达式不显示多余括号）', () => {
    // a → 切 `/` → b → 再切 `/` → c：两段都是 or，合并成一段扁平 OR
    let next = toggleTag(createEmptyExpression(), 'a');
    next = switchPendingOp(next, 'or');
    next = toggleTag(next, 'b');
    next = switchPendingOp(next, 'or');
    next = toggleTag(next, 'c');
    expect(formatExpression(next)).toBe('a / b / c');

    // 混合运算符时括号必须保留（读完顺序才是求值顺序）
    let mixed = toggleTag(createEmptyExpression(), 'a');
    mixed = switchPendingOp(mixed, 'or');
    mixed = toggleTag(mixed, 'b');
    mixed = switchPendingOp(mixed, 'and');
    mixed = toggleTag(mixed, 'c');
    expect(formatExpression(mixed)).toBe('( a / b ) + c');
  });

  it('记号流里的运算符指向它右侧那一段（页头控件条的连接符按钮据此改 op）', () => {
    const tokens = buildExpressionTokens(
      expression({ op: 'and', keys: ['a', 'b'] }, { op: 'or', keys: ['c'] })
    );
    expect(tokens).toEqual([
      { type: 'paren', side: '(' },
      { type: 'tag', key: 'a', segmentIndex: 0 },
      { type: 'op', op: 'and', segmentIndex: 0 },
      { type: 'tag', key: 'b', segmentIndex: 0 },
      { type: 'paren', side: ')' },
      { type: 'op', op: 'or', segmentIndex: 1 },
      { type: 'tag', key: 'c', segmentIndex: 1 }
    ]);
  });

  it('setSegmentOp 改指定段；switchLastNonEmptySegmentToOr 给 0 命中提示用', () => {
    const base = expression({ op: 'and', keys: ['a', 'b'] }, { op: 'or', keys: ['c'] });
    // 第一段改成 or：两段同 op → 合并成一段扁平 OR
    expect(formatExpression(setSegmentOp(base, 0, 'or'))).toBe('a / b / c');
    // 第二段改成 and：与第一段等价 → 合并成一段
    expect(formatExpression(setSegmentOp(base, 1, 'and'))).toBe('a + b + c');
    // 「0 命中 → 切换到 /」把最后一个非空段改成 or
    expect(formatExpression(switchLastNonEmptySegmentToOr(expression({ op: 'and', keys: ['a', 'b'] })))).toBe('a / b');
    // 复合表达式：只把最后一个非空段改成 or（前面已经定型的部分不动）
    expect(
      formatExpression(
        switchLastNonEmptySegmentToOr(expression({ op: 'and', keys: ['a', 'b'] }, { op: 'and', keys: ['c'] }))
      )
    ).toBe('( a + b ) / c');
  });
});

describe('tag-expression：复合求值', () => {
  const expr = expression({ op: 'and', keys: ['a', 'b'] }, { op: 'or', keys: ['c'] }); // (a+b)/c

  it('段内先算（and 要求全部命中、or 要求任一命中）', () => {
    expect(evaluateExpression(expr, ['a', 'b'])).toBe(true); // (a+b) 命中
    expect(evaluateExpression(expr, ['a', 'b', 'c'])).toBe(true);
    expect(evaluateExpression(expr, ['a', 'c'])).toBe(true); // (a+b) 不命中，但 c 命中
    expect(evaluateExpression(expr, ['a'])).toBe(false);
    expect(evaluateExpression(expr, ['c'])).toBe(true);
    expect(evaluateExpression(expr, [])).toBe(false);
  });

  it('没选任何标签时不参与筛选（恒真）', () => {
    expect(hasAnyTag(createEmptyExpression())).toBe(false);
    expect(evaluateExpression(createEmptyExpression(), [])).toBe(true);
  });

  it('三段：(a+b)/c+d 与左结合一致', () => {
    const three = expression(
      { op: 'and', keys: ['a', 'b'] },
      { op: 'or', keys: ['c'] },
      { op: 'and', keys: ['d'] }
    );
    expect(evaluateExpression(three, ['a', 'b', 'd'])).toBe(true); // (a+b)=T → T||c=T → T&&d=T
    expect(evaluateExpression(three, ['a', 'c', 'd'])).toBe(true); // (a+b)=F → F||c=T → T&&d=T
    expect(evaluateExpression(three, ['a', 'c'])).toBe(false); // 最后一段 d 不命中
    expect(evaluateExpression(three, ['d'])).toBe(false); // 第一段不命中、c 也不命中
  });
});

describe('tag-expression：URL 读写', () => {
  const usable = (key: string) => key !== '';

  it('单段写 tags=&mode= 格式，保证深链接兼容', () => {
    const params = new URLSearchParams();
    applyExpressionToParams(params, expression({ op: 'or', keys: ['a', 'b'] }));
    expect(params.get('tags')).toBe('a,b');
    expect(params.get('mode')).toBe('or');
    expect(params.get('ops')).toBeNull();

    const params2 = new URLSearchParams('tags=a,b&mode=or');
    expect(formatExpression(parseExpression(params2, usable))).toBe('a / b');
  });

  it('复合表达式写 tags=&ops=，并能原样读回', () => {
    const source = expression({ op: 'and', keys: ['a', 'b'] }, { op: 'or', keys: ['c'] });
    const params = new URLSearchParams();
    applyExpressionToParams(params, source);
    expect(params.get('tags')).toBe('a,b,c');
    expect(params.get('ops')).toBe('and,and,or');
    expect(params.get('mode')).toBeNull();

    const parsed = parseExpression(params, usable);
    expect(formatExpression(parsed)).toBe('( a + b ) / c');
    expect(listTagKeys(parsed)).toEqual(['a', 'b', 'c']);
  });

  it('非法的 ops / mode 参数退化到安全状态', () => {
    // 只有 tags、没有 ops：按单段处理
    expect(formatExpression(parseExpression(new URLSearchParams('tags=x'), usable))).toBe('x');
    // ops 缺位按 mode / 默认 and 补齐：a 单独成段 → a && (b && c)，显示为 a + b + c
    expect(formatExpression(parseExpression(new URLSearchParams('tags=a,b,c&ops=or'), usable))).toBe('a + b + c');
    // 没有任何有效标签 → 空表达式
    expect(hasAnyTag(parseExpression(new URLSearchParams('tags=,,&ops=or'), usable))).toBe(false);
    const cleared = new URLSearchParams('tags=a&mode=or&ops=or');
    applyExpressionToParams(cleared, createEmptyExpression());
    expect(cleared.toString()).toBe('');
  });

  it('切换标签取消选中，removeTag 移除', () => {
    let next = toggleTag(createEmptyExpression(), 'a');
    next = toggleTag(next, 'b');
    next = toggleTag(next, 'b'); // 再点一次 = 取消
    expect(listTagKeys(next)).toEqual(['a']);
    next = removeTag(next, 'a');
    expect(hasAnyTag(next)).toBe(false);
  });
});
