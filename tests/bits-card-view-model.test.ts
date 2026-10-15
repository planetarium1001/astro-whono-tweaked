import { describe, expect, it } from 'vitest';
import {
  BITS_CARD_BODY_LINES,
  BITS_CARD_CHARS_PER_LINE,
  BITS_CARD_FULL_RENDER_LIMIT,
  BITS_CARD_VISIBLE_IMAGE_LIMIT,
  buildBitsCardViewModel,
  deriveBitsCardText
} from '../src/lib/bits-card-view-model';
import { toTagKey } from '../src/lib/tags';
import { truncateTextAtWord } from '../src/utils/excerpt';

describe('bits card view model', () => {
  it('shares the full-render character budget with bits cards', () => {
    expect(BITS_CARD_FULL_RENDER_LIMIT).toBe(BITS_CARD_BODY_LINES * BITS_CARD_CHARS_PER_LINE);

    expect(deriveBitsCardText('短内容 **Markdown**')).toMatchObject({
      shouldRenderFull: true,
      truncated: false
    });
    expect(deriveBitsCardText('a'.repeat(BITS_CARD_FULL_RENDER_LIMIT + 1))).toMatchObject({
      shouldRenderFull: false,
      truncated: true,
      excerpt: `${'a'.repeat(BITS_CARD_FULL_RENDER_LIMIT)}…`
    });
  });

  it('keeps short bodies intact so a few lines render without truncation', () => {
    const body = '今天把卡片正文的截断重做了一遍，判定完整渲染的字数与可见行数的预算对上了。';

    expect(deriveBitsCardText(body)).toMatchObject({
      excerpt: body,
      shouldRenderFull: true,
      truncated: false
    });
  });

  it('truncates on a whitespace boundary instead of splitting a word', () => {
    const head = `${'word '.repeat(40)}tail`;
    const derived = deriveBitsCardText(head);

    expect(derived.truncated).toBe(true);
    // 仍是原正文的前缀，只是在空白处收尾，另接一个省略号
    expect(derived.excerpt.endsWith('…')).toBe(true);
    expect(head.startsWith(derived.excerpt.replace(/…$/, ''))).toBe(true);
    expect(derived.excerpt.replace(/…$/, '').trimEnd()).toBe(derived.excerpt.replace(/…$/, ''));
    expect(derived.excerpt).not.toContain('wor…');
  });

  it('treats a <!--more--> cut as author intent rather than truncation', () => {
    const derived = deriveBitsCardText(`摘要段落\n\n<!--more-->\n\n${'正文'.repeat(300)}`);

    expect(derived).toMatchObject({ shouldRenderFull: false, truncated: false });
    expect(derived.excerpt).toBe('摘要段落');
  });

  it('derives author, tags, date and media for preview cards', () => {
    const viewModel = buildBitsCardViewModel({
      id: 'demo-bit',
      slug: 'demo',
      bodyText: 'Hello',
      tags: ['loc:Shanghai', 'daily'],
      date: new Date(2026, 4, 27, 8, 30),
      images: [
        { src: 'bits/a.webp', width: '800', height: 600, alt: 'A' },
        { src: 'https://example.com/b.webp', width: 'bad', height: '0' },
        { src: 'http://example.com/c.webp', width: 800, height: 600 }
      ],
      author: { name: 'Alice', avatar: 'author/alice.webp' },
      defaultAuthor: { name: 'Whono', avatar: 'author/default.webp' },
      base: '/blog/'
    });

    expect(viewModel.slug).toBe('demo');
    expect(viewModel.authorName).toBe('Alice');
    expect(viewModel.authorAvatar).toBe('/blog/author/alice.webp');
    expect(viewModel.placeTag).toEqual({
      label: 'Shanghai',
      key: toTagKey('loc:Shanghai'),
      href: '/blog/bits/?tags=loc%3Ashanghai'
    });
    expect(viewModel.normalTagItems).toEqual([
      { label: 'daily', key: 'daily', href: '/blog/bits/?tags=daily' }
    ]);
    expect(viewModel.dateLabel).toBe('2026-05-27 08:30');
    expect(viewModel.imageItems).toEqual([
      { src: '/blog/bits/a.webp', width: 800, height: 600, alt: 'A' },
      { src: 'https://example.com/b.webp', alt: '' }
    ]);
  });

  it('keeps every card tag filterable through /bits/?tags=<key>', () => {
    const viewModel = buildBitsCardViewModel({
      id: 'tagged',
      bodyText: 'Hello',
      tags: ['Content Console', 'loc:New York'],
      base: '/'
    });

    expect(viewModel.normalTagItems).toEqual([
      { label: 'Content Console', key: 'content-console', href: '/bits/?tags=content-console' }
    ]);
    const placeKey = toTagKey('loc:New York');
    expect(viewModel.placeTag).toEqual({
      label: 'New York',
      key: placeKey,
      href: `/bits/?tags=${encodeURIComponent(placeKey)}`
    });
  });

  it('falls back to a plain tag when the key is not routable', () => {
    const viewModel = buildBitsCardViewModel({
      id: 'demo-bit',
      bodyText: 'Hello',
      tags: ['..'],
      base: '/'
    });

    expect(viewModel.hasTags).toBe(true);
    expect(viewModel.normalTagItems).toEqual([{ label: '..', key: '', href: null }]);
  });

  it('folds images beyond the single visible row into moreCount', () => {
    const viewModel = buildBitsCardViewModel({
      id: 'demo-bit',
      bodyText: 'Hello',
      images: Array.from({ length: 6 }, (_, index) => ({ src: `bits/${index}.webp` })),
      base: '/'
    });

    expect(BITS_CARD_VISIBLE_IMAGE_LIMIT).toBe(4);
    expect(viewModel.totalImages).toBe(6);
    expect(viewModel.visibleImages).toHaveLength(BITS_CARD_VISIBLE_IMAGE_LIMIT);
    expect(viewModel.moreCount).toBe(2);
    expect(viewModel.firstImage).toBeNull();
  });

  it('only uses firstImage when there is exactly one image', () => {
    const single = buildBitsCardViewModel({
      id: 'demo-bit',
      bodyText: 'Hello',
      images: [{ src: 'bits/only.webp' }],
      base: '/'
    });
    const pair = buildBitsCardViewModel({
      id: 'demo-bit',
      bodyText: 'Hello',
      images: [{ src: 'bits/a.webp' }, { src: 'bits/b.webp' }],
      base: '/'
    });

    expect(single.firstImage).toMatchObject({ src: '/bits/only.webp' });
    expect(single.moreCount).toBe(0);
    expect(pair.firstImage).toBeNull();
    expect(pair.moreCount).toBe(0);
  });

  it('uses the default author avatar when the editor author avatar is empty', () => {
    const viewModel = buildBitsCardViewModel({
      id: 'demo-bit',
      bodyText: 'Hello',
      author: { name: '', avatar: '' },
      defaultAuthor: { name: 'Whono', avatar: 'author/default.webp' },
      base: '/blog/'
    });

    expect(viewModel.authorName).toBe('Whono');
    expect(viewModel.authorAvatar).toBe('/blog/author/default.webp');
  });
  it('摘要优先收在句末标点之后，否则回退到空白处', () => {
    // 句末标点足够靠后：收成完整句子，不补省略号
    expect(truncateTextAtWord('第一句。第二句。第三句。', 9)).toBe('第一句。第二句。');
    // 没有句末标点：回退到最后一个空白，避免把西文单词截成两半
    expect(truncateTextAtWord('hello world foo', 14)).toBe('hello world…');
    // 没超出预算时原样返回
    expect(truncateTextAtWord('短', 10)).toBe('短');
  });
});
