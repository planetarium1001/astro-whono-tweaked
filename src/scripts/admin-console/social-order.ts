/* 后台社交链接列表的排序规则
   与 DOM 重排解耦，便于单独验证；行元素只用于读取结构隐藏标记。
*/

export type SocialOrderItem = {
  row: HTMLElement;
  type: 'preset' | 'custom';
  /** 链接已填写（预设行按 href 判断，自定义行按可见开关判断）。 */
  visible: boolean;
  order: number;
  /** 同号时的原始先后。 */
  tie: number;
};

/** 结构上隐藏的行（例如尚未填写的 X 预置行）。 */
export const isHiddenSocialRow = (item: SocialOrderItem): boolean =>
  item.row.dataset.rowHidden === 'true';

/**
 * 排序规则：可见行按序号在前，不可见行其次，结构隐藏行排在最后；
 * 同号保持原有先后。隐藏行仍参与编号，可见行的序号因此保持连续。
 */
export const sortSocialOrderItems = (items: readonly SocialOrderItem[]): SocialOrderItem[] => {
  const byOrder = (a: SocialOrderItem, b: SocialOrderItem): number => a.order - b.order || a.tie - b.tie;
  return [
    ...items.filter((item) => !isHiddenSocialRow(item) && item.visible).sort(byOrder),
    ...items.filter((item) => !isHiddenSocialRow(item) && !item.visible).sort(byOrder),
    ...items.filter(isHiddenSocialRow).sort(byOrder)
  ];
};
