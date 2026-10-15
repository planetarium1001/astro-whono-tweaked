import { describe, expect, it } from 'vitest';
import {
  BLOG_PUBLIC_SLUG_RE,
  FALLBACK_ENTRY_ID_SLUG,
  MAX_ENTRY_ID_SLUG_LENGTH,
  buildContentEntryId,
  isWindowsReservedFileBaseName,
  slugifyEntryTitle,
  stableShortHash
} from '../src/utils/slug-rules';

/**
 * 内容 entryId 的命名规范 `YYYY-MM-DD-title`：标题里的特殊字符与空格必须被消除。
 * 逐条钉住实测表，并补边界：空 slug、超长截断、Windows 保留名、幂等性，
 * 以及公开 slug 允许 CJK（`BLOG_PUBLIC_SLUG_RE`）。
 */

describe('slugifyEntryTitle', () => {
  it.each([
    ['图片系统切换到 public/images/{collection}/{slug}/', '图片系统切换到-public-images-collection-slug'],
    ['Content Console 使用指南', 'content-console-使用指南'],
    ['夜间施工流水线', '夜间施工流水线'],
    ['已废弃 public/bits 扁平池', '已废弃-public-bits-扁平池'],
    ['C++ & Rust: 对比 (2026)', 'c-rust-对比-2026'],
    ['多  个   空格', '多-个-空格'],
    ['emoji 🎉 测试', 'emoji-测试']
  ])('%s → %s', (input, expected) => {
    expect(slugifyEntryTitle(input)).toBe(expected);
  });

  it('全角字符先做 NFKC 归一再 slug 化', () => {
    expect(slugifyEntryTitle('ＡＢＣ　测试')).toBe('abc-测试');
  });

  it('纯符号 / emoji 的标题 slug 化为空（由调用方兜底）', () => {
    expect(slugifyEntryTitle('!!! ??? 🎉')).toBe('');
    expect(slugifyEntryTitle('   ')).toBe('');
  });

  it('幂等：对已经合规的 entryId 再 slug 化不改变结果', () => {
    for (const id of ['2026-06-13-content-console-使用指南', 'bits-2026-02-03-2230', 'admin-console-guide']) {
      expect(slugifyEntryTitle(id)).toBe(id);
    }
  });

  it('超长标题截断到上限并追加短哈希（不同长标题不会撞成一个 id）', () => {
    const long = 'a'.repeat(MAX_ENTRY_ID_SLUG_LENGTH + 40);
    const other = `${'a'.repeat(MAX_ENTRY_ID_SLUG_LENGTH + 39)}b`;

    const first = slugifyEntryTitle(long);
    const second = slugifyEntryTitle(other);

    // 120 字符 + '-' + 6 位短哈希
    expect(first.length).toBe(MAX_ENTRY_ID_SLUG_LENGTH + 1 + 6);
    expect(first.slice(0, MAX_ENTRY_ID_SLUG_LENGTH)).toBe('a'.repeat(MAX_ENTRY_ID_SLUG_LENGTH));
    // 哈希对象是未截断的 slug（否则截断后再哈希会自我指涉）
    expect(first.endsWith(stableShortHash(long))).toBe(true);
    expect(first).not.toBe(second);
  });
});

describe('buildContentEntryId', () => {
  it('`YYYY-MM-DD-title`，日期取 UTC 分量', () => {
    expect(buildContentEntryId(new Date('2026-06-13T00:00:00Z'), 'Content Console 使用指南')).toBe(
      '2026-06-13-content-console-使用指南'
    );
    // UTC 分量：东八区的 2026-06-13T00:00+08:00 是 UTC 的 06-12
    expect(buildContentEntryId(new Date('2026-06-13T00:00:00+08:00'), '标题')).toBe('2026-06-12-标题');
  });

  it('slug 为空 → untitled', () => {
    expect(buildContentEntryId(new Date('2026-01-01T00:00:00Z'), '🎉🎉')).toBe(
      `2026-01-01-${FALLBACK_ENTRY_ID_SLUG}`
    );
  });

  it('超长标题产出的 id 仍然可用（slug 部分被截断）', () => {
    const entryId = buildContentEntryId(new Date('2026-01-01T00:00:00Z'), 'b'.repeat(400));
    expect(entryId.startsWith('2026-01-01-')).toBe(true);
    expect(entryId.length).toBeLessThan(MAX_ENTRY_ID_SLUG_LENGTH + 20);
  });

  it('Windows 保留名会被规避（前缀日期已足够，再兜一层）', () => {
    expect(isWindowsReservedFileBaseName('nul')).toBe(true);
    expect(isWindowsReservedFileBaseName('COM1')).toBe(true);
    expect(isWindowsReservedFileBaseName('2026-01-01-nul')).toBe(false);
    // 直接构造出保留名时追加 -entry
    expect(buildContentEntryId(new Date('2026-01-01T00:00:00Z'), 'x').startsWith('2026-01-01-x')).toBe(true);
  });

  it('产出总能通过公开 slug 校验（含 CJK）', () => {
    for (const title of ['中文标题', 'Content Console 使用指南', 'C++ & Rust: 对比 (2026)', '🎉']) {
      const entryId = buildContentEntryId(new Date('2026-06-13T00:00:00Z'), title);
      expect(BLOG_PUBLIC_SLUG_RE.test(entryId), `${entryId} 应能作为公开 slug`).toBe(true);
    }
  });
});

describe('BLOG_PUBLIC_SLUG_RE（放开 CJK）', () => {
  it('允许 CJK 与数字，仍要求小写 kebab-case', () => {
    expect(BLOG_PUBLIC_SLUG_RE.test('2026-06-13-content-console-使用指南')).toBe(true);
    expect(BLOG_PUBLIC_SLUG_RE.test('2026-01-05-代码高亮测试')).toBe(true);
    expect(BLOG_PUBLIC_SLUG_RE.test('content-console-guide')).toBe(true);

    expect(BLOG_PUBLIC_SLUG_RE.test('AbC')).toBe(false);
    expect(BLOG_PUBLIC_SLUG_RE.test('a b')).toBe(false);
    expect(BLOG_PUBLIC_SLUG_RE.test('a--b')).toBe(false);
    expect(BLOG_PUBLIC_SLUG_RE.test('')).toBe(false);
    expect(BLOG_PUBLIC_SLUG_RE.test('-a')).toBe(false);
    expect(BLOG_PUBLIC_SLUG_RE.test('emoji-🎉')).toBe(false);
  });
});
