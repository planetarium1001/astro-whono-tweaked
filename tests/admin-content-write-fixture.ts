import { afterEach, beforeEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const createJsonRequest = (url: string, payload: unknown) =>
  new Request(url, {
    method: 'POST',
    headers: {
      origin: new URL(url).origin,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

export const omitPublishedAt = (values: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...values };
  delete next.publishedAt;
  return next;
};

export const omitUpdatedAt = (values: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...values };
  delete next.updatedAt;
  return next;
};

export const toAbsoluteTestPath = (root: string, relativePath: string): string =>
  path.join(root, ...relativePath.split('/'));

export const readJson = async (response: Response): Promise<Record<string, any>> =>
  JSON.parse(await response.text());

/**
 * 临时工程根：每个用例新建目录并写入 ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT，用例后清理。
 * 返回读取当前根目录的函数；hook 注册顺序保证它在调用方的 beforeEach 之前先跑。
 */
export const setupTempProjectRoot = (prefix: string): (() => string) => {
  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), prefix));
    process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT = tempRoot;
  });

  afterEach(async () => {
    delete process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT;
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
  });

  return () => tempRoot;
};

export const setupAdminContentWriteFixture = (): (() => string) => {
  const getTempRoot = setupTempProjectRoot('astro-whono-content-');

  beforeEach(async () => {
    const tempRoot = getTempRoot();

    await mkdir(path.join(tempRoot, 'src', 'content', 'blog'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'projects'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'bits'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'devlog'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'about'), { recursive: true });
    await mkdir(path.join(tempRoot, 'public', 'author'), { recursive: true });

    await writeFile(path.join(tempRoot, 'public', 'author', 'alice.webp'), 'avatar');
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'blog', 'demo.md'),
      ['---', 'title: Demo blog', 'date: 2026-03-18', 'draft: false', '---', '', '# blog', '', '正文保持不变。', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'blog', 'admin-console-guide copy.md'),
      ['---', 'title: Space Name blog', 'date: 2026-03-21', 'draft: false', '---', '', '# Space Name', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'blog', 'other.md'),
      ['---', 'title: Other blog', 'date: 2026-03-20', 'slug: existing-blog', '---', '', '# Other', '', 'duplicate guard', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'bits', 'demo.md'),
      [
        '---',
        'date: 2025-02-03T01:01:45+08:00',
        'tags:',
        '  - Markdown',
        'images:',
        '  - src: bits/demo.webp',
        '    width: 800',
        '    height: 600',
        '---',
        '',
        'Bits body',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'projects', 'demo-project.md'),
      [
        '---',
        'title: Demo Project',
        'subtitle: Demo subtitle',
        'description: Demo description',
        'type: 开源',
        'date: 2026-02-01',
        'draft: false',
        '---',
        '',
        'Project body',
        '',
        // 仓库/演示等外链写在正文末尾的链接组里，frontmatter 不写 tags/repo/demo
        '[仓库](https://example.com/repo)',
        '[演示](https://example.com/demo)',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'devlog', 'demo-devlog.md'),
      [
        '---',
        'title: Demo Devlog',
        'date: 2026-02-02',
        'project: Demo Project',
        'kind: feature',
        'description: Demo devlog description',
        'draft: false',
        '---',
        '',
        'Devlog body',
        '',
        // 外链写在正文 markdown 里，frontmatter 不写 links
        '[仓库](https://example.com/repo)',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'about', 'index.md'),
      ['---', '---', '', 'about body', ''].join('\n'),
      'utf8'
    );
  });

  return getTempRoot;
};
