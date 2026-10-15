import { describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createJsonRequest,
  setupAdminContentWriteFixture
} from './admin-content-write-fixture';

describe('admin content projects/devlog write contract', () => {
  const getTempRoot = setupAdminContentWriteFixture();

  it('writes projects frontmatter fields through the shared entry api', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('projects', 'demo-project');
    // 字段袋只有基础字段
    expect(Object.keys(current.values).sort()).toEqual(
      ['title', 'subtitle', 'description', 'type', 'icon', 'image', 'date', 'draft'].sort()
    );

    const nextValues = {
      ...current.values,
      title: 'Edited Project',
      subtitle: 'Edited subtitle',
      type: '实验',
      date: '2026-02-03'
    };

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'projects',
        entryId: 'demo-project',
        revision: current.revision,
        frontmatter: nextValues,
        body: current.bodyText
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(
      expect.arrayContaining(['title', 'subtitle', 'type', 'date'])
    );
    expect(payload.result.changedFields).not.toEqual(
      expect.arrayContaining(['tags', 'repo', 'repoLabel', 'demo', 'demoLabel'])
    );

    const saved = await readFile(path.join(getTempRoot(), 'src', 'content', 'projects', 'demo-project.md'), 'utf8');
    expect(saved).toContain('title: Edited Project');
    expect(saved).toContain('type: 实验');
    expect(saved).toContain('Project body');
    // 仓库/演示链接留在正文的末尾链接组里，不写回 frontmatter
    expect(saved).toContain('[仓库](https://example.com/repo)');
    expect(saved).toContain('[演示](https://example.com/demo)');
    const frontmatterText = /^---\n([\s\S]*?)\n---/.exec(saved)?.[1] ?? '';
    for (const field of ['tags', 'repo', 'repoLabel', 'demo', 'demoLabel']) {
      expect(frontmatterText).not.toMatch(new RegExp(`^${field}:`, 'm'));
    }
  });

  // image 与 icon 同构：只有值变化才产生补丁，未登记进字段矩阵的 frontmatter 字段不会被丢弃。
  it('writes the projects image field as a diff patch and keeps unlisted frontmatter fields', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const sourcePath = path.join(getTempRoot(), 'src', 'content', 'projects', 'demo-project.md');
    await writeFile(
      sourcePath,
      [
        '---',
        'title: Demo Project',
        'subtitle: Demo subtitle',
        'description: Demo description',
        'type: 开源',
        'icon: images/projects/demo/icon.webp',
        'date: 2026-02-01T00:00:00.000Z',
        'draft: false',
        'legacyField: keep-me',
        '---',
        '',
        'Project body',
        ''
      ].join('\n'),
      'utf8'
    );

    const current = await readAdminContentEntryEditorPayload('projects', 'demo-project');
    expect(Object.keys(current.values).sort()).toEqual(
      ['title', 'subtitle', 'description', 'type', 'icon', 'image', 'date', 'draft'].sort()
    );
    expect('image' in current.values ? current.values.image : undefined).toBe('');

    const nextValues = { ...current.values, image: 'images/projects/demo/cover.webp' };
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'projects',
        entryId: 'demo-project',
        revision: current.revision,
        frontmatter: nextValues,
        body: current.bodyText
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    // 只有 image 变化：其余字段不产生补丁。
    expect(payload.result.changedFields).toEqual(['image']);

    const saved = await readFile(sourcePath, 'utf8');
    const frontmatterText = /^---\n([\s\S]*?)\n---/.exec(saved)?.[1] ?? '';
    expect(frontmatterText).toMatch(/^image: images\/projects\/demo\/cover\.webp$/m);
    expect(frontmatterText).toMatch(/^icon: images\/projects\/demo\/icon\.webp$/m);
    expect(frontmatterText).toMatch(/^legacyField: keep-me$/m);
    expect(saved).toContain('Project body');

    // 原样再存一次：无变化即无补丁。
    const reread = await readAdminContentEntryEditorPayload('projects', 'demo-project');
    expect('image' in reread.values ? reread.values.image : undefined).toBe('images/projects/demo/cover.webp');
    const second = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'projects',
        entryId: 'demo-project',
        revision: reread.revision,
        frontmatter: reread.values,
        body: reread.bodyText
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(second.status).toBe(200);
    const secondPayload = JSON.parse(await second.text());
    expect(secondPayload.ok).toBe(true);
    expect(secondPayload.result.changedFields).toEqual([]);
  });

  it('no longer exposes tags/repo/demo in the projects editor values', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');

    const current = await readAdminContentEntryEditorPayload('projects', 'demo-project');
    for (const field of ['tagsText', 'repo', 'repoLabel', 'demo', 'demoLabel']) {
      expect(
        Object.prototype.hasOwnProperty.call(current.values, field),
        `${field} 应已从 projects 字段袋移除`
      ).toBe(false);
    }
  });

  // devlog 外链写在正文里：frontmatter 不写 links，也不会把 links 写回 frontmatter。
  it('writes devlog frontmatter + body markdown links, and never writes a links field', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('devlog', 'demo-devlog');
    expect(
      Object.prototype.hasOwnProperty.call(current.values, 'linksText'),
      'devlog 编辑器值里不应再有 linksText（行编辑器已随字段取消）'
    ).toBe(false);

    const nextValues = {
      ...current.values,
      title: 'Edited Devlog',
      kind: 'fix'
    };
    const nextBody = [
      '正文第一段。',
      '',
      '[站内](https://example.com/blog) · [仓库](https://example.com/repo)'
    ].join('\n');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'devlog',
        entryId: 'demo-devlog',
        revision: current.revision,
        frontmatter: nextValues,
        body: nextBody
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(expect.arrayContaining(['title', 'kind', 'body']));

    const saved = await readFile(path.join(getTempRoot(), 'src', 'content', 'devlog', 'demo-devlog.md'), 'utf8');
    expect(saved).toContain('title: Edited Devlog');
    expect(saved).toContain('kind: fix');
    // 链接在正文里（markdown 写法），而不是 frontmatter
    expect(saved).toContain('[站内](https://example.com/blog)');
    expect(saved).toContain('[仓库](https://example.com/repo)');
    expect(saved, 'frontmatter 不应再出现 links:').not.toMatch(/^links:/m);
  });
});

// 客户端保存体若只给 blog/bits 附 frontmatter，projects/devlog 的保存会被服务端
// 以「frontmatter 必须是对象」拒绝，这里直接断言客户端构造的请求体形态。
describe('client write request body for new collections', () => {
  it.each(['projects', 'devlog'] as const)('attaches frontmatter for %s', async (collection) => {
    const { buildContentWriteRequestBody } = await import(
      '../src/components/admin/editor/shared/content-editor-client'
    );

    const values = collection === 'projects'
      ? {
          title: 'P',
          subtitle: '',
          description: '',
          type: '',
          icon: '',
          image: '',
          date: '2026-02-01',
          draft: false
        }
      : {
          title: 'D',
          date: '2026-02-02',
          project: 'P',
          kind: '',
          description: '',
          draft: false
        };

    const body = buildContentWriteRequestBody({
      endpoint: '/api/admin/content/entry/',
      collection,
      entryId: 'demo',
      revision: 'rev',
      frontmatter: values,
      body: 'body text'
    } as never);

    expect(body).toMatchObject({ collection, entryId: 'demo', revision: 'rev' });
    expect(body.frontmatter).toEqual(values);
    expect(body.body).toBe('body text');
  });
});

// entry-transport 的载荷守卫缺少 projects/devlog 分支时，
// 这两个集合的删除（单条与批量）与保存回读会全部拿到 null。
describe('entry transport guards for new collections', () => {
  it.each(['projects', 'devlog'] as const)('resolves %s payloads from a response body', async (collection) => {
    const { getPayloadEditorPayload, getPayloadEditorValues, getPayloadEditorBody } = await import(
      '../src/scripts/admin-content/entry-transport'
    );

    const values = collection === 'projects'
      ? {
          title: 'P',
          subtitle: '',
          description: '',
          type: '',
          icon: '',
          image: '',
          date: '2026-02-01',
          draft: false
        }
      : {
          title: 'D',
          date: '2026-02-02',
          project: 'P',
          kind: '',
          description: '',
          draft: false
        };

    const response = {
      payload: {
        collection,
        entryId: 'demo',
        publicEntryId: 'demo',
        defaultPublicSlug: 'demo',
        revision: 'rev',
        relativePath: `src/content/${collection}/demo.md`,
        writable: true,
        readonlyReason: null,
        bodyText: 'body text',
        values
      }
    };

    expect(getPayloadEditorPayload(response)?.collection).toBe(collection);
    expect(getPayloadEditorValues(response, collection)).toEqual(values);
    expect(getPayloadEditorBody(response, collection)).toBe('body text');
  });
});

// bits 的 create 属性不能被 ContentListActions 匹配，
// 否则一次点击会同时打开两个创建弹窗（bits 由 BitsCreateAction 独占）。
describe('create trigger ownership', () => {
  it('keeps the bits create attribute out of the generic list-actions selector', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'src', 'components', 'admin', 'editor', 'list-actions', 'ContentListActions.svelte'),
      'utf8'
    );

    const selectorBlock = source.slice(
      source.indexOf('const CREATE_TRIGGER_SELECTOR'),
      source.indexOf('const ALL_CREATE_TRIGGER_SELECTOR')
    );

    expect(selectorBlock).toContain('data-admin-content-create-action');
    expect(selectorBlock).toContain('data-admin-content-projects-create-action');
    expect(selectorBlock).toContain('data-admin-content-devlog-create-action');
    expect(selectorBlock).not.toContain('data-admin-content-bits-create-action');

    // 但 disabled 的解除必须覆盖 bits，否则 SSR 的 disabled 永远摘不掉。
    const allBlock = source.slice(
      source.indexOf('const ALL_CREATE_TRIGGER_SELECTOR'),
      source.indexOf('const CREATE_DIALOG_TITLES')
    );
    expect(allBlock).toContain('data-admin-content-bits-create-action');
  });
});
