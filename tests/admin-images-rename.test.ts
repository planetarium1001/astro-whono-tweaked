import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AdminImageRenameError,
  normalizeAdminImageRenamePath,
  renameAdminImage,
  sanitizeAdminImageRenameTarget
} from '../src/lib/admin-console/image-rename';

/**
 * 图片重命名：改名后引用必须跟着改，否则图片立刻变死链。
 * 在临时工程目录造图与各类引用，跑真实 rename，断言文件名更替、旧路径消失、引用被改写。
 */

describe('admin image rename', () => {
  let root = '';

  const imagePath = 'images/blog/2026-01-01-示例/图一.webp';
  const nextFileName = '图一-重命名.webp';
  const nextPath = 'images/blog/2026-01-01-示例/图一-重命名.webp';

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'astro-whono-image-rename-'));
    await mkdir(path.join(root, 'public', path.dirname(imagePath)), { recursive: true });
    await writeFile(path.join(root, 'public', imagePath), 'fake-image-bytes', 'utf8');

    await mkdir(path.join(root, 'src', 'content', 'blog'), { recursive: true });
    await writeFile(
      path.join(root, 'src', 'content', 'blog', '2026-01-02-demo.md'),
      [
        '---',
        'title: Demo',
        `cover: /${imagePath}`,
        '---',
        '',
        `正文引用：![图注](/${imagePath})`,
        '',
        `<img src="${imagePath}" alt="相对写法" />`,
        '',
        `<picture><source srcset="/${encodeURI(imagePath)} 1x" /></picture>`,
        '',
        '无关内容：images/blog/other-entry/图一.webp 与 图一.webp 不应被改。',
        ''
      ].join('\n'),
      'utf8'
    );

    await mkdir(path.join(root, 'src', 'data', 'settings'), { recursive: true });
    await writeFile(
      path.join(root, 'src', 'data', 'settings', 'home.json'),
      JSON.stringify({ heroImageSrc: `/${imagePath}` }, null, 2),
      'utf8'
    );
    await mkdir(path.join(root, 'src', 'pages'), { recursive: true });
    await writeFile(
      path.join(root, 'src', 'pages', 'index.astro'),
      `<img src="/${imagePath}" alt="" />\n`,
      'utf8'
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('重命名后四类引用全部改写，其它条目不受影响', async () => {
    const result = await renameAdminImage({ from: imagePath, to: nextFileName }, { projectRoot: root });

    expect(result.from).toBe(imagePath);
    expect(result.to).toBe(nextPath);
    expect(result.fileName).toBe(nextFileName);

    // 文件系统：旧名消失、新名出现、内容不变
    expect(existsSync(path.join(root, 'public', imagePath))).toBe(false);
    expect(existsSync(path.join(root, 'public', nextPath))).toBe(true);
    expect(await readFile(path.join(root, 'public', nextPath), 'utf8')).toBe('fake-image-bytes');

    // 正文（frontmatter cover / markdown / 相对写法 / 百分号编码 srcset）
    const markdown = await readFile(path.join(root, 'src', 'content', 'blog', '2026-01-02-demo.md'), 'utf8');
    expect(markdown).toContain(`cover: /${nextPath}`);
    expect(markdown).toContain(`![图注](/${nextPath})`);
    expect(markdown).toContain(`<img src="${nextPath}"`);
    expect(markdown).toContain(`<source srcset="/${encodeURI(nextPath)} 1x"`);
    expect(markdown).not.toContain(imagePath);
    // 其它目录下的同名文件、以及裸文件名都不受影响
    expect(markdown).toContain('images/blog/other-entry/图一.webp 与 图一.webp 不应被改');

    // 设置 JSON 与页面/组件的引用
    const settings = await readFile(path.join(root, 'src', 'data', 'settings', 'home.json'), 'utf8');
    expect(settings).toContain(nextPath);
    expect(settings).not.toContain(imagePath);

    const page = await readFile(path.join(root, 'src', 'pages', 'index.astro'), 'utf8');
    expect(page).toContain(nextPath);

    // 报告里列出被改写的文件与处数
    const files = result.rewritten.map((entry) => entry.file).sort();
    expect(files).toEqual([
      'src/content/blog/2026-01-02-demo.md',
      'src/data/settings/home.json',
      'src/pages/index.astro'
    ]);
    // 4 处正文/摘要引用（frontmatter cover + markdown + 相对 <img> + 编码 srcset）
    // + 1 处设置 JSON + 1 处页面 <img>
    expect(result.rewritten.reduce((sum, entry) => sum + entry.count, 0)).toBe(6);
  });

  it('目标已存在时拒绝且不做任何改动（不静默覆盖）', async () => {
    await writeFile(path.join(root, 'public', nextPath), 'already-there', 'utf8');

    await expect(
      renameAdminImage({ from: imagePath, to: nextFileName }, { projectRoot: root })
    ).rejects.toMatchObject({ code: 'target-exists', status: 409 });

    expect(await readFile(path.join(root, 'public', imagePath), 'utf8')).toBe('fake-image-bytes');
    expect(await readFile(path.join(root, 'public', nextPath), 'utf8')).toBe('already-there');
    const markdown = await readFile(path.join(root, 'src', 'content', 'blog', '2026-01-02-demo.md'), 'utf8');
    expect(markdown).toContain(imagePath);
  });

  it('源文件不存在 → 404；路径不在 public/images 下 → 400', async () => {
    await expect(
      renameAdminImage({ from: 'images/blog/nope/missing.webp', to: 'x.webp' }, { projectRoot: root })
    ).rejects.toMatchObject({ code: 'source-not-found', status: 404 });

    await expect(
      renameAdminImage({ from: 'assets/favicon.svg', to: 'x.svg' }, { projectRoot: root })
    ).rejects.toMatchObject({ code: 'invalid-source', status: 400 });
  });

  it('目标文件名不合法时拒绝（分隔符 / 遍历 / 扩展名变化 / 非法字符）', async () => {
    for (const bad of ['../x.webp', 'a/b.webp', '.hidden', 'x.txt', 'x.webp?', '']) {
      await expect(
        renameAdminImage({ from: imagePath, to: bad }, { projectRoot: root }),
        `${bad} 应被拒绝`
      ).rejects.toBeInstanceOf(AdminImageRenameError);
    }
    // 原文件仍然在
    expect(existsSync(path.join(root, 'public', imagePath))).toBe(true);
  });

  it('省略扩展名时沿用原扩展名', async () => {
    const result = await renameAdminImage({ from: imagePath, to: '图一-新' }, { projectRoot: root });
    expect(result.fileName).toBe('图一-新.webp');
    expect(existsSync(path.join(root, 'public', 'images/blog/2026-01-01-示例/图一-新.webp'))).toBe(true);
  });

  it('路径与文件名的清洗规则', () => {
    expect(normalizeAdminImageRenamePath('/public/images/a/b.webp')).toBe('images/a/b.webp');
    expect(normalizeAdminImageRenamePath('images\\a\\b.webp')).toBe('images/a/b.webp');
    expect(() => normalizeAdminImageRenamePath('images/a/../b.webp')).toThrow(AdminImageRenameError);

    expect(sanitizeAdminImageRenameTarget('中文 名字.webp', 'old.webp')).toBe('中文 名字.webp');
    expect(sanitizeAdminImageRenameTarget('  trimmed  ', 'old.webp')).toBe('trimmed.webp');
    // 只做 NFKC 归一，不改大小写：大小写改名在 macOS/Windows 这类大小写不敏感
    // 文件系统上容易踩坑（旧名与新名指向同一个文件），因此保留用户输入的形态。
    expect(sanitizeAdminImageRenameTarget('ＡＢＣ.webp', 'old.webp')).toBe('ABC.webp');
    expect(() => sanitizeAdminImageRenameTarget('a b', 'old.webp')).not.toThrow();
  });
});
