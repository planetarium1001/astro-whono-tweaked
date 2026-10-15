import { describe, expect, it } from 'vitest';
import {
  ADMIN_HOME_INTRO_LINK_KEY_SET,
  ADMIN_HOME_INTRO_LINK_OPTIONS,
  getAdminHomeIntroLinkOption
} from '../src/lib/admin-console/theme-shared';

/**
 * 首页导语要能直达 tag，blog 与 archive 两个作用域都要有入口。
 *
 * 入口是「列表页 + `?picker=tag`」；参数是否真的打开选择器由 entry-search-client 覆盖。
 * 这里守选项表与键集合：后台勾选项、`HomeIntroLinkKey` 类型、兜底函数三者必须同步。
 */
describe('首页导语 tag 入口的选项表', () => {
  it('归档与博客两个作用域都有 tag 直达入口', () => {
    const tag = ADMIN_HOME_INTRO_LINK_OPTIONS.find((option) => option.id === 'tag');
    const blogTag = ADMIN_HOME_INTRO_LINK_OPTIONS.find((option) => option.id === 'blogTag');

    expect(tag, '需要归档作用域的 tag 入口').toBeDefined();
    expect(blogTag, '需要博客作用域的 tag 入口').toBeDefined();
    expect(tag!.href).toBe('/archive/?picker=tag');
    expect(blogTag!.href).toBe('/blog/?picker=tag');
    expect(blogTag!.label).not.toBe(tag!.label);
  });

  it('两个 tag 入口都在键集合里（否则后台读写会把它当未知 id 丢掉）', () => {
    expect(ADMIN_HOME_INTRO_LINK_KEY_SET.has('tag')).toBe(true);
    expect(ADMIN_HOME_INTRO_LINK_KEY_SET.has('blogTag')).toBe(true);
  });

  it('每个选项的 href 都是站内路径（withBase 之后仍是相对路径）', () => {
    for (const option of ADMIN_HOME_INTRO_LINK_OPTIONS) {
      expect(option.href.startsWith('/'), `${option.id} 的 href 必须以 / 开头`).toBe(true);
    }
  });

  it('getAdminHomeIntroLinkOption 对两个 tag 键都取到自身（不落到兜底项）', () => {
    expect(getAdminHomeIntroLinkOption('tag').id).toBe('tag');
    expect(getAdminHomeIntroLinkOption('blogTag').id).toBe('blogTag');
    // 兜底：未知键回落到第一项，且不会抛
    expect(getAdminHomeIntroLinkOption('tag').href).not.toBe('');
  });
});
