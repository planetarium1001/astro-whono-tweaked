import { describe, expect, it } from 'vitest';
import {
  buildAdminContentEditorIslandProps,
  createEmptyAdminContentEditorOutlines,
  getAdminContentEditorPageRegistration,
  getAdminContentEditorStyleSlots,
  loadAdminContentEditorBaseStyleHrefs,
  loadAdminContentEditorStyleHrefs,
  type AdminContentEditorEndpoints,
  type AdminContentEditorStyleSlot
} from '../src/components/admin/admin-content-editor-registry';
import { ADMIN_CONTENT_EDITOR_ISLAND_KEYS } from '../src/components/admin/admin-content-editor-registry';
import { ADMIN_CONTENT_WRITE_COLLECTION_KEYS } from '../src/lib/admin-console/content-collections';
import type {
  AdminAboutEditorPayload,
  AdminBitsEditorPayload,
  AdminBlogEditorPayload,
} from '../src/lib/admin-console/content-shared';
import { getAdminContentCollectionCapability } from '../src/lib/admin-console/content-collections';

const endpoints: AdminContentEditorEndpoints = {
  endpoint: '/api/admin/content/entry/',
  exportEndpoint: '/api/admin/content/export/',
  deleteEndpoint: '/api/admin/content/delete/',
  previewEndpoint: '/api/admin/preview/',
  imageUploadEndpoint: '/api/admin/images/upload/'
};

const BlogPayload: AdminBlogEditorPayload = {
  collection: 'blog',
  entryId: 'blog-entry',
  publicEntryId: 'blog-entry',
  defaultPublicSlug: 'blog-entry',
  revision: 'blog-rev',
  relativePath: 'src/content/blog/blog-entry.md',
  writable: true,
  readonlyReason: null,
  bodyText: 'blog body',
  values: {
    title: 'blog title',
    description: 'blog description',
    date: '2026-06-01',
    publishedAt: '',
    updatedAt: '',
    tagsText: 'tag',
    draft: false,
    slug: '',
    cover: '',
    badge: ''
  }
};

const bitsPayload: AdminBitsEditorPayload = {
  collection: 'bits',
  entryId: 'bits-entry',
  publicEntryId: 'bits-entry',
  defaultPublicSlug: 'bits-entry',
  revision: 'bits-rev',
  relativePath: 'src/content/bits/bits-entry.md',
  writable: true,
  readonlyReason: null,
  bodyText: 'Bits body',
  values: {
    title: 'Bits title',
    description: '',
    date: '2026-06-01T10:00:00+08:00',
    tagsText: '',
    draft: false,
    authorName: '',
    authorAvatar: '',
    imagesText: ''
  }
};

const aboutPayload: AdminAboutEditorPayload = {
  collection: 'about',
  entryId: 'index',
  publicEntryId: 'index',
  defaultPublicSlug: 'index',
  revision: 'about-rev',
  relativePath: 'src/content/about/index.md',
  writable: true,
  readonlyReason: null,
  bodyText: 'About body',
  values: {}
};

describe('admin content editor page registry', () => {
  it('declares page-level affordances for blog, bits, and about', () => {
    const blog = getAdminContentEditorPageRegistration('blog');
    const bits = getAdminContentEditorPageRegistration('bits');
    const about = getAdminContentEditorPageRegistration('about');

    expect(blog.island).toBe('blog');
    expect(blog.styleSlots).toEqual([
      'article',
      'adminContentEditor',
      'adminContentEditorFrontmatter',
      'adminContentEditorImageInsert',
      'adminContentEditorGalleryInsert'
    ]);
    expect(blog.outlineKind).toBe('blog');
    expect(blog.resolveReturnHref({
      withBase: (path) => `/base${path}`,
      collectionHref: '/base/admin/content/?collection=blog'
    })).toBe('/base/admin/content/');
    expect(blog.infoTrigger).toEqual({
      attribute: 'data-admin-article-info-trigger',
      label: '修改信息',
      panelId: 'admin-editor-frontmatter-panel'
    });
    expect(blog.usesImagePicker).toBe(false);

    expect(bits.island).toBe('bits');
    expect(bits.styleSlots).toEqual([
      'adminContentEditor',
      'adminContentEditorBits',
      'adminContentEditorFrontmatter',
      'adminImageShared'
    ]);
    expect(bits.outlineKind).toBe('list');
    expect(bits.resolveReturnHref({
      withBase: (path) => `/base${path}`,
      collectionHref: '/base/admin/content/?collection=bits'
    })).toBe('/base/admin/content/?collection=bits');
    expect(bits.infoTrigger?.attribute).toBe('data-admin-bits-info-trigger');
    expect(bits.usesImagePicker).toBe(true);

    expect(about.island).toBe('about');
    expect(about.styleSlots).toEqual(['about', 'adminContentEditor', 'adminContentEditorAbout']);
    expect(about.outlineKind).toBe('none');
    expect(about.resolveReturnHref({
      withBase: (path) => `/base${path}`,
      collectionHref: '/base/admin/content/?collection=about'
    })).toBe('/base/admin/content/?collection=about');
    expect(about.infoTrigger).toBeNull();
    expect(about.usesImagePicker).toBe(false);
  });

  it('derives image picker affordance from collection capabilities', () => {
    const collections = ADMIN_CONTENT_WRITE_COLLECTION_KEYS;

    for (const collection of collections) {
      expect(getAdminContentEditorPageRegistration(collection).usesImagePicker)
        .toBe(getAdminContentCollectionCapability(collection).imagePicker);
    }
  });

  it('keeps style slot loading ordered and injectable', async () => {
    const requested: AdminContentEditorStyleSlot[] = [];
    const loadStyleSlot = async (slot: AdminContentEditorStyleSlot) => {
      requested.push(slot);
      return `${slot}.css`;
    };

    await expect(loadAdminContentEditorBaseStyleHrefs(loadStyleSlot)).resolves.toEqual(['adminContentEditor.css']);
    await expect(loadAdminContentEditorStyleHrefs(getAdminContentEditorStyleSlots('about'), loadStyleSlot))
      .resolves.toEqual(['about.css', 'adminContentEditor.css', 'adminContentEditorAbout.css']);
    expect(requested).toEqual([
      'adminContentEditor',
      'about',
      'adminContentEditor',
      'adminContentEditorAbout'
    ]);
  });

  it('keeps registered editor islands within the supported island loader keys', () => {
    expect(ADMIN_CONTENT_EDITOR_ISLAND_KEYS).toEqual(['blog', 'projects', 'bits', 'devlog', 'about']);
    expect(ADMIN_CONTENT_EDITOR_ISLAND_KEYS).toContain(getAdminContentEditorPageRegistration('blog').island);
    expect(ADMIN_CONTENT_EDITOR_ISLAND_KEYS).toContain(getAdminContentEditorPageRegistration('bits').island);
    expect(ADMIN_CONTENT_EDITOR_ISLAND_KEYS).toContain(getAdminContentEditorPageRegistration('about').island);
  });

  it('builds island props without mixing collection-specific fields', () => {
    const outlines = {
      BlogOutlineItems: [
        {
          entryId: 'blog-entry',
          title: 'blog title',
          editHref: '/admin/content/blog/_edit/blog-entry/',
          dateLabel: '2026-06-01',
          sourceError: null
        }
      ],
      bitsOutlineItems: [
        {
          entryId: 'bits-entry',
          title: 'Bits title',
          editHref: '/admin/content/bits/_edit/bits-entry/',
          dateLabel: '2026-06-01',
          sourceError: null
        }
      ]
    };

    const BlogProps = buildAdminContentEditorIslandProps({
      payload: BlogPayload,
      endpoints,
      returnHref: '/admin/content/',
      defaultAuthor: { name: 'Default', avatar: '/avatar.png' },
      outlines,
      initialArticleInfoOpen: true
    });
    expect(BlogProps).toMatchObject({
      entryId: 'blog-entry',
      returnHref: '/admin/content/',
      initialFrontmatter: BlogPayload.values,
      initialBody: 'blog body',
      BlogOutlineItems: outlines.BlogOutlineItems,
      initialArticleInfoOpen: true
    });
    expect('defaultAuthor' in BlogProps).toBe(false);

    const bitsProps = buildAdminContentEditorIslandProps({
      payload: bitsPayload,
      endpoints,
      returnHref: '/admin/content/?collection=bits',
      defaultAuthor: { name: 'Default', avatar: '/avatar.png' },
      outlines,
      initialArticleInfoOpen: false
    });
    expect(bitsProps).toMatchObject({
      entryId: 'bits-entry',
      returnHref: '/admin/content/?collection=bits',
      initialFrontmatter: bitsPayload.values,
      initialBody: 'Bits body',
      defaultAuthor: { name: 'Default', avatar: '/avatar.png' },
      bitsOutlineItems: outlines.bitsOutlineItems
    });
    expect('initialArticleInfoOpen' in bitsProps).toBe(false);

    const aboutProps = buildAdminContentEditorIslandProps({
      payload: aboutPayload,
      endpoints,
      returnHref: '/admin/content/?collection=about',
      defaultAuthor: { name: 'Default', avatar: '/avatar.png' },
      outlines: createEmptyAdminContentEditorOutlines(),
      initialArticleInfoOpen: true
    });
    expect(aboutProps).toEqual({
      endpoint: endpoints.endpoint,
      exportEndpoint: endpoints.exportEndpoint,
      previewEndpoint: endpoints.previewEndpoint,
      returnHref: '/admin/content/?collection=about',
      entryId: 'index',
      revision: 'about-rev',
      initialBody: 'About body'
    });
    expect('imageUploadEndpoint' in aboutProps).toBe(false);
  });
});
