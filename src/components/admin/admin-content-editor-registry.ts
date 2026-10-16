import type { AdminContentWriteCollectionKey } from '../../lib/admin-console/content-collections';
import { getAdminContentCollectionCapability } from '../../lib/admin-console/content-collections';
import { getAdminContentEntryEditHref } from '../../lib/admin-console/content-routes';
import type { AdminAboutEditorPayload } from '../../lib/admin-console/content-about-contract';
import {
  type AdminBitsEditorPayload,
  type AdminContentWorkspaceEditorPayload,
  type AdminBlogEditorPayload,
  type AdminDevlogEditorPayload,
  type AdminProjectsEditorPayload,
} from '../../lib/admin-console/content-editor-payload';
import type { BitsCardAuthorInput } from '../../lib/bits-card-view-model';
import {
  loadAdminContentSourceIndex,
  loadAdminContentSourceManifest
} from '../../lib/admin-console/content-source-index';
import type { BitsEditorIslandProps } from './editor/bits/bits-editor-island-props';
import type { BlogEditorShellProps } from './editor/blog/editor-shell-props';
import type {
  EditorOutlineBlogSourceItem,
  EditorOutlineListSourceItem
} from './editor/markdown/editor-outline-helpers';
import type { AboutEditorIslandProps } from './editor/fixed-page/about-editor-island-props';

type WithBase = (path: string) => string;

export type AdminContentEditorEndpoints = {
  endpoint: string;
  exportEndpoint: string;
  deleteEndpoint: string;
  previewEndpoint: string;
  imageUploadEndpoint: string;
};

export type AdminContentEditorStyleSlot =
  | 'adminContentEditor'
  | 'adminContentEditorAbout'
  | 'adminContentEditorBits'
  | 'adminContentEditorFrontmatter'
  | 'adminContentEditorGalleryInsert'
  | 'adminContentEditorImageInsert'
  | 'adminImageShared'
  | 'about'
  | 'article';

type AdminContentEditorOutlineKind = 'none' | 'blog' | 'list';

type AdminContentEditorInfoTrigger = {
  attribute: 'data-admin-article-info-trigger' | 'data-admin-bits-info-trigger';
  label: string;
  panelId: string;
};

export type AdminContentEditorIslandKey = 'blog' | 'projects' | 'bits' | 'devlog' | 'about';

/** 编辑器岛键；顺序即后台内容编辑页的集合顺序。 */
export const ADMIN_CONTENT_EDITOR_ISLAND_KEYS = [
  'blog',
  'projects',
  'bits',
  'devlog',
  'about'
] as const satisfies readonly AdminContentEditorIslandKey[];

export type AdminContentEditorOutlines = {
  BlogOutlineItems: EditorOutlineBlogSourceItem[];
  bitsOutlineItems: EditorOutlineListSourceItem[];
};

type AdminContentEditorIslandProps =
  | BlogEditorShellProps
  | BitsEditorIslandProps
  | AboutEditorIslandProps;

type BuildBaseIslandPropsInput<Payload extends AdminContentWorkspaceEditorPayload> = {
  payload: Payload;
  endpoints: AdminContentEditorEndpoints;
  returnHref: string;
};

type BuildListIslandPropsInput = BuildBaseIslandPropsInput<
  AdminBlogEditorPayload | AdminProjectsEditorPayload | AdminDevlogEditorPayload
> & {
  initialArticleInfoOpen: boolean;
};

/** blog 是列表集合中唯一渲染目录/大纲的集合。 */
type BuildBlogIslandPropsInput = BuildListIslandPropsInput & {
  BlogOutlineItems: EditorOutlineBlogSourceItem[];
};

type BuildBitsIslandPropsInput = BuildBaseIslandPropsInput<AdminBitsEditorPayload> & {
  defaultAuthor: BitsCardAuthorInput;
  bitsOutlineItems: EditorOutlineListSourceItem[];
};

type BuildAboutIslandPropsInput = BuildBaseIslandPropsInput<AdminAboutEditorPayload>;

type BuildIslandPropsInput<Payload extends AdminContentWorkspaceEditorPayload> =
  Payload extends AdminBlogEditorPayload
    ? BuildBlogIslandPropsInput
    : Payload extends AdminProjectsEditorPayload
      ? BuildListIslandPropsInput
      : Payload extends AdminBitsEditorPayload
        ? BuildBitsIslandPropsInput
        : Payload extends AdminDevlogEditorPayload
          ? BuildListIslandPropsInput
          : BuildAboutIslandPropsInput;

type AdminContentEditorPageRegistration<
  Collection extends AdminContentWriteCollectionKey = AdminContentWriteCollectionKey,
  Payload extends AdminContentWorkspaceEditorPayload = AdminContentWorkspaceEditorPayload
> = {
  collection: Collection;
  workspaceClassName: string;
  articleClassName: string;
  island: AdminContentEditorIslandKey;
  styleSlots: readonly AdminContentEditorStyleSlot[];
  outlineKind: AdminContentEditorOutlineKind;
  infoTrigger: AdminContentEditorInfoTrigger | null;
  usesImagePicker: boolean;
  resolveReturnHref: (input: {
    withBase: WithBase;
    collectionHref: string;
  }) => string;
  buildIslandProps: (input: BuildIslandPropsInput<Payload>) => AdminContentEditorIslandProps;
};

export type AdminContentEditorOutlineRegistration = {
  collection: AdminContentWriteCollectionKey;
  outlineKind: AdminContentEditorOutlineKind;
};

const loadArticleStylesHref = async (): Promise<string> => {
  const { default: articleStylesHref } = await import('../../styles/article.css?url');
  return articleStylesHref;
};

const loadAboutStylesHref = async (): Promise<string> => {
  const { default: aboutStylesHref } = await import('../../styles/about.css?url');
  return aboutStylesHref;
};

const loadAdminImageSharedStylesHref = async (): Promise<string> => {
  const { default: adminImageSharedStylesHref } = await import('../../styles/components/admin/images/shared.css?url');
  return adminImageSharedStylesHref;
};

const STYLE_SLOT_LOADERS = {
  adminContentEditor: async () =>
    (await import('../../styles/components/admin/content/edit-core.css?url')).default,
  adminContentEditorAbout: async () =>
    (await import('../../styles/components/admin/content/edit-about.css?url')).default,
  adminContentEditorBits: async () =>
    (await import('../../styles/components/admin/content/edit-bits.css?url')).default,
  adminContentEditorFrontmatter: async () =>
    (await import('../../styles/components/admin/content/edit-frontmatter.css?url')).default,
  adminContentEditorGalleryInsert: async () =>
    (await import('../../styles/components/admin/content/edit-gallery-insert.css?url')).default,
  adminContentEditorImageInsert: async () =>
    (await import('../../styles/components/admin/content/edit-image-insert.css?url')).default,
  adminImageShared: loadAdminImageSharedStylesHref,
  about: loadAboutStylesHref,
  article: loadArticleStylesHref
} as const satisfies Record<AdminContentEditorStyleSlot, () => Promise<string>>;

const ADMIN_CONTENT_EDITOR_BASE_STYLE_SLOTS = ['adminContentEditor'] as const satisfies readonly AdminContentEditorStyleSlot[];

const loadAdminContentEditorStyleSlot = async (
  slot: AdminContentEditorStyleSlot
): Promise<string> =>
  STYLE_SLOT_LOADERS[slot]();

export const loadAdminContentEditorStyleHrefs = async (
  slots: readonly AdminContentEditorStyleSlot[],
  loadStyleSlot: (slot: AdminContentEditorStyleSlot) => Promise<string> = loadAdminContentEditorStyleSlot
): Promise<string[]> =>
  Promise.all(slots.map((slot) => loadStyleSlot(slot)));

export const loadAdminContentEditorBaseStyleHrefs = async (
  loadStyleSlot?: (slot: AdminContentEditorStyleSlot) => Promise<string>
): Promise<string[]> =>
  loadAdminContentEditorStyleHrefs(ADMIN_CONTENT_EDITOR_BASE_STYLE_SLOTS, loadStyleSlot);

const loadBlogOutlineItems = async (withBase: WithBase): Promise<EditorOutlineBlogSourceItem[]> => {
  const manifest = await loadAdminContentSourceManifest();
  return (await loadAdminContentSourceIndex(manifest, 'blog'))
    .map((item) => ({
      entryId: item.id,
      title: item.title,
      editHref: withBase(getAdminContentEntryEditHref('blog', item.id)),
      dateLabel: item.dateLabel,
      sourceError: item.sourceError
    }));
};

const loadBitsOutlineItems = async (withBase: WithBase): Promise<EditorOutlineListSourceItem[]> => {
  const manifest = await loadAdminContentSourceManifest();
  return (await loadAdminContentSourceIndex(manifest, 'bits'))
    .map((item) => ({
      entryId: item.id,
      title: item.title,
      editHref: withBase(getAdminContentEntryEditHref('bits', item.id)),
      dateLabel: item.dateLabel,
      sourceError: item.sourceError
    }));
};

export const createEmptyAdminContentEditorOutlines = (): AdminContentEditorOutlines => ({
  BlogOutlineItems: [],
  bitsOutlineItems: []
});

export const loadAdminContentEditorOutlines = async (
  registration: AdminContentEditorOutlineRegistration,
  withBase: WithBase
): Promise<AdminContentEditorOutlines> => {
  if (registration.outlineKind === 'blog') {
    return {
      BlogOutlineItems: await loadBlogOutlineItems(withBase),
      bitsOutlineItems: []
    };
  }

  if (registration.outlineKind === 'list') {
    return {
      BlogOutlineItems: [],
      bitsOutlineItems: await loadBitsOutlineItems(withBase)
    };
  }

  return createEmptyAdminContentEditorOutlines();
};

const buildListEditorIslandProps = ({
  payload,
  endpoints,
  returnHref,
  initialArticleInfoOpen
}: BuildListIslandPropsInput): BlogEditorShellProps => ({
  collection: payload.collection,
  ...endpoints,
  returnHref,
  entryId: payload.entryId,
  relativePath: payload.relativePath,
  defaultPublicSlug: payload.defaultPublicSlug,
  revision: payload.revision,
  initialFrontmatter: payload.values,
  initialBody: payload.bodyText,
  initialArticleInfoOpen
});

/** blog 额外带目录条目；projects / devlog 没有目录，不进入岛属性。 */
const buildBlogEditorIslandProps = ({
  BlogOutlineItems,
  ...listInput
}: BuildBlogIslandPropsInput): BlogEditorShellProps => ({
  ...buildListEditorIslandProps(listInput),
  BlogOutlineItems
});

const buildBitsEditorIslandProps = ({
  payload,
  endpoints,
  returnHref,
  defaultAuthor,
  bitsOutlineItems
}: BuildBitsIslandPropsInput): BitsEditorIslandProps => ({
  ...endpoints,
  returnHref,
  entryId: payload.entryId,
  relativePath: payload.relativePath,
  defaultPublicSlug: payload.defaultPublicSlug,
  revision: payload.revision,
  initialFrontmatter: payload.values,
  initialBody: payload.bodyText,
  defaultAuthor,
  bitsOutlineItems
});

const buildAboutEditorIslandProps = ({
  payload,
  endpoints,
  returnHref
}: BuildAboutIslandPropsInput): AboutEditorIslandProps => ({
  endpoint: endpoints.endpoint,
  exportEndpoint: endpoints.exportEndpoint,
  previewEndpoint: endpoints.previewEndpoint,
  returnHref,
  entryId: payload.entryId,
  revision: payload.revision,
  initialBody: payload.bodyText
});

const CONTENT_EDITOR_PAGE_REGISTRY = {
  blog: {
    collection: 'blog',
    workspaceClassName: 'admin-content-edit-page--blog',
    articleClassName: 'admin-content-editor--svelte',
    island: 'blog',
    styleSlots: [
      'article',
      'adminContentEditor',
      'adminContentEditorFrontmatter',
      'adminContentEditorImageInsert',
      'adminContentEditorGalleryInsert'
    ],
    outlineKind: 'blog',
    infoTrigger: {
      attribute: 'data-admin-article-info-trigger',
      label: '修改信息',
      panelId: 'admin-editor-frontmatter-panel'
    },
    usesImagePicker: getAdminContentCollectionCapability('blog').imagePicker,
    resolveReturnHref: ({ withBase }) => withBase('/admin/content/'),
    buildIslandProps: buildBlogEditorIslandProps
  },
  bits: {
    collection: 'bits',
    workspaceClassName: 'admin-content-edit-page--bits',
    articleClassName: 'admin-content-editor--bits',
    island: 'bits',
    styleSlots: [
      'adminContentEditor',
      'adminContentEditorBits',
      'adminContentEditorFrontmatter',
      'adminImageShared'
    ],
    outlineKind: 'list',
    infoTrigger: {
      attribute: 'data-admin-bits-info-trigger',
      label: '修改信息',
      panelId: 'admin-editor-frontmatter-panel'
    },
    usesImagePicker: getAdminContentCollectionCapability('bits').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildBitsEditorIslandProps
  },
  projects: {
    collection: 'projects',
    workspaceClassName: 'admin-content-edit-page--projects',
    articleClassName: 'admin-content-editor--projects',
    island: 'projects',
    styleSlots: [
      'article',
      'adminContentEditor',
      'adminContentEditorFrontmatter',
      'adminContentEditorImageInsert',
      'adminContentEditorGalleryInsert'
    ],
    outlineKind: 'none',
    infoTrigger: {
      attribute: 'data-admin-article-info-trigger',
      label: '修改信息',
      panelId: 'admin-editor-frontmatter-panel'
    },
    usesImagePicker: getAdminContentCollectionCapability('projects').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildListEditorIslandProps
  },
  devlog: {
    collection: 'devlog',
    workspaceClassName: 'admin-content-edit-page--devlog',
    articleClassName: 'admin-content-editor--devlog',
    island: 'devlog',
    styleSlots: [
      'article',
      'adminContentEditor',
      'adminContentEditorFrontmatter',
      'adminContentEditorImageInsert',
      'adminContentEditorGalleryInsert'
    ],
    outlineKind: 'none',
    infoTrigger: {
      attribute: 'data-admin-article-info-trigger',
      label: '修改信息',
      panelId: 'admin-editor-frontmatter-panel'
    },
    usesImagePicker: getAdminContentCollectionCapability('devlog').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildListEditorIslandProps
  },
  about: {
    collection: 'about',
    workspaceClassName: 'admin-content-edit-page--about',
    articleClassName: 'admin-content-editor--about',
    island: 'about',
    styleSlots: ['about', 'adminContentEditor', 'adminContentEditorAbout'],
    outlineKind: 'none',
    infoTrigger: null,
    usesImagePicker: getAdminContentCollectionCapability('about').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildAboutEditorIslandProps
  }
} as const satisfies {
  [Collection in AdminContentWriteCollectionKey]: AdminContentEditorPageRegistration<
    Collection,
    Extract<AdminContentWorkspaceEditorPayload, { collection: Collection }>
  >;
};

export const getAdminContentEditorPageRegistration = <Collection extends AdminContentWriteCollectionKey>(
  collection: Collection
): (typeof CONTENT_EDITOR_PAGE_REGISTRY)[Collection] =>
  CONTENT_EDITOR_PAGE_REGISTRY[collection];

export const getAdminContentEditorStyleSlots = (
  collection: AdminContentWriteCollectionKey
): readonly AdminContentEditorStyleSlot[] =>
  getAdminContentEditorPageRegistration(collection).styleSlots;

export const buildAdminContentEditorIslandProps = ({
  payload,
  endpoints,
  returnHref,
  defaultAuthor,
  outlines,
  initialArticleInfoOpen
}: {
  payload: AdminContentWorkspaceEditorPayload;
  endpoints: AdminContentEditorEndpoints;
  returnHref: string;
  defaultAuthor: BitsCardAuthorInput;
  outlines: AdminContentEditorOutlines;
  initialArticleInfoOpen: boolean;
}): AdminContentEditorIslandProps => {
  if (payload.collection === 'blog') {
    return CONTENT_EDITOR_PAGE_REGISTRY.blog.buildIslandProps({
      payload,
      endpoints,
      returnHref,
      BlogOutlineItems: outlines.BlogOutlineItems,
      initialArticleInfoOpen
    });
  }

  if (payload.collection === 'projects' || payload.collection === 'devlog') {
    return CONTENT_EDITOR_PAGE_REGISTRY[payload.collection].buildIslandProps({
      payload,
      endpoints,
      returnHref,
      initialArticleInfoOpen
    });
  }

  if (payload.collection === 'bits') {
    return CONTENT_EDITOR_PAGE_REGISTRY.bits.buildIslandProps({
      payload,
      endpoints,
      returnHref,
      defaultAuthor,
      bitsOutlineItems: outlines.bitsOutlineItems
    });
  }

  return CONTENT_EDITOR_PAGE_REGISTRY.about.buildIslandProps({
    payload,
    endpoints,
    returnHref
  });
};
