<script lang="ts">
import { onMount, tick } from 'svelte';
import type {
  AdminBitsEditorValues,
  AdminContentEditorPayload,
  AdminBlogEditorValues,
  AdminDevlogEditorValues,
  AdminProjectsEditorValues
} from '../../../../lib/admin-console/content-editor-payload';
import {
  isAdminContentDeletableCollectionKey,
  type AdminContentDeletableCollectionKey
} from '../../../../lib/admin-console/content-delete-contract';
import type { BitsCardAuthorInput } from '../../../../lib/bits-card-view-model';
import {
  getPayloadDeleteResult,
  getPayloadEditorPayload,
  getPayloadErrors,
  getPayloadIssues,
  isPayloadOk,
  parseResponseBody,
  type AdminContentIssue
} from '../../../../scripts/admin-content/entry-transport';
import {
  closeClosestAdminDetailsMenu,
  initAdminDetailsMenus
} from '../../../../scripts/admin-content/details-menu';
import { createWithBase } from '../../../../utils/format';
import {
  BLOG_PUBLIC_SLUG_RE,
  buildContentEntryId,
  contentSourceEntryIdToPublicEntryId,
  flattenEntryIdToSlug
} from '../../../../utils/slug-rules';
import ArticleInfoDialog from '../frontmatter/ArticleInfoDialog.svelte';
import {
  CONTENT_LIST_ACTION_FEEDBACK_DELETED,
  CONTENT_LIST_ACTION_FEEDBACK_SAVED,
  storeContentListActionFeedback,
  takeContentListActionFeedback,
  type ContentListActionFeedback
} from '../shared/content-list-feedback';
import type { AdminStatusFeedbackOptions, StatusState } from './content-action-feedback';
import { dispatchAdminContentStatus } from './content-action-status-events';
import { createContentEntry, saveContentEntry } from '../shared/content-editor-client';
import { isBitsEditorValues, isBlogEditorValues } from '../shared/content-editor-adapters';

type DialogMode = 'edit' | 'create';
type ContentInfoCollection = Extract<
  AdminContentDeletableCollectionKey,
  'blog' | 'projects' | 'bits' | 'devlog'
>;
type ContentInfoFrontmatter =
  | AdminBlogEditorValues
  | AdminProjectsEditorValues
  | AdminBitsEditorValues
  | AdminDevlogEditorValues;
type ContentInfoPayload = Extract<AdminContentEditorPayload, { collection: ContentInfoCollection }>;

/**
 * 新建触发属性。不要加入 `data-admin-content-bits-create-action`：bits 由
 * BitsCreateAction.svelte 独占，两套 document 级 click 处理器匹配同一属性时会同时弹窗。
 */
const CREATE_TRIGGER_SELECTOR = [
  '[data-admin-content-create-action]',
  '[data-admin-content-projects-create-action]',
  '[data-admin-content-devlog-create-action]'
].join(', ');

/** SSR 会给所有 create 按钮写 `disabled`，这里要按集合分别解除。 */
const ALL_CREATE_TRIGGER_SELECTOR = [
  CREATE_TRIGGER_SELECTOR,
  '[data-admin-content-bits-create-action]'
].join(', ');

type Props = {
  base?: string;
  endpoint: string;
  createEndpoint: string;
  deleteEndpoint: string;
  bitsDefaultAuthor?: BitsCardAuthorInput;
};

let { base = '/', endpoint, createEndpoint, deleteEndpoint, bitsDefaultAuthor = {} }: Props = $props();

let dialog = $state<ArticleInfoDialog | null>(null);
let open = $state(false);
let dialogMode = $state<DialogMode>('edit');
let busy = $state(false);
let loadingEntry = $state(false);
let loadRequestId = 0;
let selectedCollection = $state<ContentInfoCollection>('blog');
let selectedEntryId = $state('');
let selectedDefaultPublicSlug = $state('');
let createEntryId = $state('');
let createEntryIdEdited = $state(false);
let revision = $state('');
let baselineFrontmatter = $state<ContentInfoFrontmatter | null>(null);
let frontmatter = $state<ContentInfoFrontmatter | null>(null);
let issues = $state<AdminContentIssue[]>([]);
let errors = $state<string[]>([]);

const createEmptyBlogFrontmatter = (): AdminBlogEditorValues => ({
  title: '',
  description: '',
  date: '',
  publishedAt: '',
  updatedAt: '',
  tagsText: '',
  draft: false,
  slug: '',
  cover: '',
  badge: ''
});

const createEmptyProjectsFrontmatter = (): AdminProjectsEditorValues => ({
  title: '',
  subtitle: '',
  description: '',
  type: '',
  icon: '',
  image: '',
  date: '',
  draft: false
});

const createEmptyDevlogFrontmatter = (): AdminDevlogEditorValues => ({
  title: '',
  date: '',
  project: '',
  kind: '',
  description: '',
  draft: false
});

const createEmptyBitsFrontmatter = (): AdminBitsEditorValues => ({
  title: '',
  description: '',
  date: '',
  tagsText: '',
  draft: false,
  authorName: '',
  authorAvatar: '',
  imagesText: ''
});

const createEmptyInfoFrontmatter = (collection: ContentInfoCollection): ContentInfoFrontmatter => {
  if (collection === 'bits') return createEmptyBitsFrontmatter();
  if (collection === 'projects') return createEmptyProjectsFrontmatter();
  if (collection === 'devlog') return createEmptyDevlogFrontmatter();
  return createEmptyBlogFrontmatter();
};

const createNewInfoFrontmatter = (collection: ContentInfoCollection): ContentInfoFrontmatter => {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const empty = createEmptyInfoFrontmatter(collection);
  // 新建条目先落成草稿。
  return { ...empty, date, draft: true } as ContentInfoFrontmatter;
};

const CREATE_DIALOG_TITLES: Record<ContentInfoCollection, string> = {
  blog: '新建文章',
  projects: '新建项目',
  bits: '新建动态',
  devlog: '新建更新'
};

const cloneInfoFrontmatter = <Values extends ContentInfoFrontmatter>(value: Values): Values => ({ ...value });

const isEqualInfoFrontmatter = (
  left: ContentInfoFrontmatter | null,
  right: ContentInfoFrontmatter | null
): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const isContentInfoCollection = (value: string): value is ContentInfoCollection =>
  value === 'blog' || value === 'projects' || value === 'bits' || value === 'devlog';

const dirty = $derived(!isEqualInfoFrontmatter(frontmatter, baselineFrontmatter));
const canSave = $derived(
  Boolean(frontmatter)
  && !busy
  && (
    dialogMode === 'create'
      ? createEntryId.trim().length > 0 && (frontmatter?.title.trim().length ?? 0) > 0
      : dirty
  )
);
const withBase = $derived(createWithBase(base));

const getShortDateSlugPart = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return 'yymmdd';

  const year = match[1] ?? '0000';
  const month = match[2] ?? '00';
  const day = match[3] ?? '00';
  return `${year.slice(-2)}${month}${day}`;
};

const getCreateSlugFallbackPlaceholder = (): string =>
  `blog-${getShortDateSlugPart(frontmatter?.date ?? '')}-xxxx`;

const getCreateSlugPlaceholderPreview = (): string => {
  const candidate = flattenEntryIdToSlug(contentSourceEntryIdToPublicEntryId(createEntryId) || createEntryId);
  return BLOG_PUBLIC_SLUG_RE.test(candidate) ? candidate : getCreateSlugFallbackPlaceholder();
};

const getCreateSlugPlaceholder = (): string =>
  `留空自动生成：${getCreateSlugPlaceholderPreview()}`;

const getEditSlugPlaceholder = (): string => {
  const fallbackSlug = selectedEntryId ? flattenEntryIdToSlug(selectedEntryId) : '';
  const defaultSlug = selectedDefaultPublicSlug || fallbackSlug;
  return defaultSlug ? `留空使用默认：${defaultSlug}` : '';
};

const slugPlaceholder = $derived(
  dialogMode === 'create'
    ? getCreateSlugPlaceholder()
    : getEditSlugPlaceholder()
);

const clearStatus = () => {
  dispatchAdminContentStatus('idle', '');
};
const setStatus = (
  state: StatusState,
  text: string,
  options: AdminStatusFeedbackOptions = {}
) => {
  dispatchAdminContentStatus(state, text, options);
};

/**
 * 新条目的源文件名固定为 `YYYY-MM-DD-title`；日期缺失或非法时用当天。
 */
const deriveCreateEntryId = (date: string, title: string): string => {
  const trimmed = title.trim();
  if (!trimmed) return '';
  const parsed = new Date(`${date.trim()}T00:00:00Z`);
  return buildContentEntryId(Number.isNaN(parsed.valueOf()) ? new Date() : parsed, trimmed);
};

const syncCreateEntryIdFromTitle = () => {
  if (dialogMode !== 'create' || createEntryIdEdited || !frontmatter) return;
  createEntryId = deriveCreateEntryId(frontmatter.date, frontmatter.title);
};

const updateCreateEntryId = (value: string) => {
  createEntryId = value;
  createEntryIdEdited = true;
  setStatus('ready', '源文件名已修改', { autoClear: true });
};

const buildEntryEndpoint = (collection: AdminContentDeletableCollectionKey, entryId: string): string => {
  const url = new URL(endpoint, window.location.href);
  url.searchParams.set('collection', collection);
  url.searchParams.set('entryId', entryId);
  return url.toString();
};

const reloadContentList = (feedback: ContentListActionFeedback) => {
  storeContentListActionFeedback(feedback);
  window.location.reload();
};

const closeDialog = () => {
  if (loadingEntry) {
    loadRequestId += 1;
    loadingEntry = false;
    busy = false;
    clearStatus();
  }
  open = false;
};

const openCreateDialog = async (trigger: HTMLElement, collection: ContentInfoCollection) => {
  if (busy) {
    errors = [];
    setStatus('warn', '操作进行中');
    return;
  }

  const nextFrontmatter = createNewInfoFrontmatter(collection);
  dialogMode = 'create';
  busy = false;
  loadingEntry = false;
  open = false;
  selectedCollection = collection;
  selectedEntryId = '';
  selectedDefaultPublicSlug = '';
  createEntryId = '';
  createEntryIdEdited = false;
  revision = '';
  baselineFrontmatter = cloneInfoFrontmatter(nextFrontmatter);
  frontmatter = cloneInfoFrontmatter(nextFrontmatter);
  issues = [];
  errors = [];
  clearStatus();

  await tick();
  dialog?.captureReturnFocus(trigger);
  open = true;
};

const resetToBaseline = () => {
  if (!baselineFrontmatter) return;
  frontmatter = cloneInfoFrontmatter(baselineFrontmatter);
  if (dialogMode === 'create') {
    createEntryId = '';
    createEntryIdEdited = false;
  }
  issues = [];
  errors = [];
  setStatus('ready', '已还原', { autoClear: true });
};

const closeActionMenu = (trigger: HTMLElement) => {
  closeClosestAdminDetailsMenu(trigger, '.admin-content-item__more');
};

const getRowTitle = (trigger: HTMLElement, entryId: string): string => {
  const row = trigger.closest<HTMLElement>('[data-admin-content-item]');
  return row?.querySelector<HTMLElement>('[data-admin-content-row-title]')?.textContent?.trim() || entryId;
};

const getRowCollectionLabel = (trigger: HTMLElement): string =>
  trigger
    .closest<HTMLElement>('.admin-content-module')
    ?.querySelector<HTMLElement>('.admin-content-module__head h3 span')
    ?.textContent
    ?.trim()
  || '该分类';

const getDeletePayload = (
  payload: unknown,
  collection: AdminContentDeletableCollectionKey,
  entryId: string
): AdminContentEditorPayload | null => {
  const entryPayload = getPayloadEditorPayload(payload);
  if (!entryPayload || entryPayload.collection !== collection || entryPayload.entryId !== entryId) return null;
  if (typeof entryPayload.revision !== 'string' || typeof entryPayload.relativePath !== 'string') return null;
  return entryPayload;
};

const getInfoPayload = (
  payload: unknown,
  collection: ContentInfoCollection,
  entryId: string
): ContentInfoPayload | null => {
  const entryPayload = getPayloadEditorPayload(payload);
  if (!entryPayload || entryPayload.collection !== collection || entryPayload.entryId !== entryId) return null;
  if (!isBlogEditorValues(entryPayload.values) && !isBitsEditorValues(entryPayload.values)) return null;
  return entryPayload;
};

const openEditor = async (collection: ContentInfoCollection, entryId: string, trigger: HTMLElement) => {
  const requestId = loadRequestId + 1;
  loadRequestId = requestId;
  dialogMode = 'edit';
  busy = true;
  loadingEntry = true;
  open = false;
  selectedCollection = collection;
  selectedEntryId = entryId;
  selectedDefaultPublicSlug = '';
  createEntryId = '';
  createEntryIdEdited = false;
  revision = '';
  baselineFrontmatter = null;
  frontmatter = createEmptyInfoFrontmatter(collection);
  issues = [];
  errors = [];
  setStatus('loading', '正在加载');

  await tick();
  if (requestId !== loadRequestId) return;
  dialog?.captureReturnFocus(trigger);
  open = true;

  try {
    const response = await fetch(buildEntryEndpoint(collection, entryId), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    const payload = await parseResponseBody(response);
    const entryPayload = getInfoPayload(payload, collection, entryId);
    if (requestId !== loadRequestId) return;

    if (!response.ok || !isPayloadOk(payload) || !entryPayload) {
      const payloadErrors = getPayloadErrors(payload);
      errors = payloadErrors;
      issues = getPayloadIssues(payload);
      loadingEntry = false;
      open = false;
      frontmatter = null;
      setStatus('error', payloadErrors.length > 0 ? '加载失败' : '加载失败，可进入编辑页处理');
      return;
    }

    revision = entryPayload.revision;
    selectedDefaultPublicSlug = entryPayload.defaultPublicSlug;
    baselineFrontmatter = cloneInfoFrontmatter(entryPayload.values);
    frontmatter = cloneInfoFrontmatter(entryPayload.values);
    loadingEntry = false;
    await tick();
    if (requestId !== loadRequestId) return;
    clearStatus();
  } catch {
    if (requestId !== loadRequestId) return;
    errors = [];
    loadingEntry = false;
    open = false;
    frontmatter = null;
    setStatus('error', '加载失败，请稍后重试');
  } finally {
    if (requestId === loadRequestId) {
      loadingEntry = false;
      busy = false;
    }
  }
};

const saveEditor = async () => {
  if (!frontmatter || !selectedEntryId || busy) return;
  const collection = selectedCollection;

  busy = true;
  issues = [];
  errors = [];
  setStatus('loading', '正在保存');

  try {
    const saveCollection = collection === 'blog' && isBlogEditorValues(frontmatter)
      ? 'blog'
      : collection === 'bits' && isBitsEditorValues(frontmatter)
        ? 'bits'
        : null;
    const saveOutcome = saveCollection
      ? await saveContentEntry({
        endpoint,
        collection: saveCollection,
        entryId: selectedEntryId,
        revision,
        frontmatter
      })
      : null;

    if (!saveOutcome) {
      errors = [];
      setStatus('error', '保存响应异常，请检查开发日志');
      return;
    }

    if (saveOutcome.revision && saveOutcome.responseOk) revision = saveOutcome.revision;

    if (!saveOutcome.responseOk || !saveOutcome.payloadOk) {
      issues = saveOutcome.issues;
      const payloadErrors = saveOutcome.errors;
      errors = payloadErrors;
      const state = saveOutcome.status === 409 ? 'warn' : 'error';
      const fallbackText = saveOutcome.status === 409 ? '检测到外部更新' : '保存失败，请检查当前表单与磁盘状态';
      setStatus(state, payloadErrors.length > 0 ? (saveOutcome.status === 409 ? '检测到外部更新' : '保存失败') : fallbackText);
      return;
    }

    const result = saveOutcome.result;
    const latestValues = saveOutcome.latestValues;
    let nextFrontmatter: ContentInfoFrontmatter | null = null;
    if (collection === 'blog' && isBlogEditorValues(latestValues)) {
      nextFrontmatter = latestValues;
    } else if (collection === 'bits' && isBitsEditorValues(latestValues)) {
      nextFrontmatter = latestValues;
    }

    if (!result || !nextFrontmatter) {
      errors = [];
      setStatus('error', '保存响应异常，请检查开发日志');
      return;
    }

    baselineFrontmatter = cloneInfoFrontmatter(nextFrontmatter);
    frontmatter = cloneInfoFrontmatter(nextFrontmatter);
    if (saveOutcome.revision) revision = saveOutcome.revision;
    if (result.changed) {
      reloadContentList(CONTENT_LIST_ACTION_FEEDBACK_SAVED);
      return;
    }
    setStatus('ready', '没有变化', { autoClear: true });
  } catch {
    errors = [];
    setStatus('error', '保存请求失败，请稍后重试');
  } finally {
    busy = false;
  }
};

const saveCreate = async () => {
  if (!frontmatter || busy) return;
  const createFrontmatter = { ...frontmatter, draft: true } as ContentInfoFrontmatter;
  frontmatter = createFrontmatter;

  busy = true;
  issues = [];
  errors = [];
  setStatus('loading', '正在创建');

  try {
    const outcome = await createContentEntry({
      endpoint: createEndpoint,
      collection: selectedCollection,
      entryId: createEntryId,
      frontmatter: createFrontmatter
    } as Parameters<typeof createContentEntry>[0]);

    if (!outcome.responseOk || !outcome.payloadOk || !outcome.editHref) {
      issues = outcome.issues;
      errors = outcome.errors;
      setStatus('error', outcome.errors.length > 0 ? '创建失败' : '创建响应异常，请检查开发日志');
      return;
    }

    setStatus('ok', '已创建，进入编辑页');
    window.location.assign(withBase(outcome.editHref));
  } catch {
    errors = [];
    setStatus('error', '创建请求失败，请稍后重试');
  } finally {
    busy = false;
  }
};

const saveDialog = () => {
  if (dialogMode === 'create') {
    void saveCreate();
    return;
  }
  void saveEditor();
};

const deleteEntry = async (trigger: HTMLElement) => {
  if (busy) {
    errors = [];
    setStatus('warn', '操作进行中');
    return;
  }

  const rawCollection = trigger.dataset.collection?.trim() ?? '';
  const entryId = trigger.dataset.entryId?.trim() ?? '';
  const expectedRelativePath = trigger.dataset.relativePath?.trim() ?? '';

  if (!isAdminContentDeletableCollectionKey(rawCollection) || !entryId || !expectedRelativePath) {
    errors = [];
    setStatus('error', '删除信息不完整，请刷新后重试');
    return;
  }

  busy = true;
  errors = [];
  issues = [];
  setStatus('loading', '正在确认删除');

  try {
    // 列表中的 revision 可能已经过期，确认前先读取一次最新文件状态。
    const loadResponse = await fetch(buildEntryEndpoint(rawCollection, entryId), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    const loadPayload = await parseResponseBody(loadResponse);
    const entryPayload = getDeletePayload(loadPayload, rawCollection, entryId);

    if (!loadResponse.ok || !isPayloadOk(loadPayload) || !entryPayload) {
      const payloadErrors = getPayloadErrors(loadPayload);
      errors = payloadErrors;
      issues = getPayloadIssues(loadPayload);
      setStatus('error', payloadErrors.length > 0 ? '删除确认失败' : '删除确认失败，请刷新后重试');
      return;
    }

    if (entryPayload.relativePath !== expectedRelativePath) {
      errors = [];
      setStatus('warn', '列表已过期，请刷新后再删除');
      return;
    }

    const title = getRowTitle(trigger, entryId);
    const confirmed = window.confirm([
      `确认删除《${title}》？`,
      '',
      `类型：${getRowCollectionLabel(trigger)}`,
      `源文件：${entryPayload.relativePath}`,
      '',
      '文件会移到 .trash/content/，之后可从回收站手动恢复。'
    ].join('\n'));

    if (!confirmed) {
      setStatus('ready', '已取消删除', { autoClear: true });
      return;
    }

    setStatus('loading', '正在删除');
    const deleteResponse = await fetch(deleteEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8'
      },
      cache: 'no-store',
      body: JSON.stringify({
        collection: rawCollection,
        entryId,
        revision: entryPayload.revision,
        expectedRelativePath: entryPayload.relativePath
      })
    });
    const deletePayload = await parseResponseBody(deleteResponse);

    if (!deleteResponse.ok || !isPayloadOk(deletePayload)) {
      const payloadErrors = getPayloadErrors(deletePayload);
      errors = payloadErrors;
      issues = getPayloadIssues(deletePayload);
      const state = deleteResponse.status === 409 ? 'warn' : 'error';
      const fallbackText = deleteResponse.status === 409 ? '检测到外部更新' : '删除失败，请检查控制台日志';
      setStatus(state, payloadErrors.length > 0 ? (deleteResponse.status === 409 ? '检测到外部更新' : '删除失败') : fallbackText);
      return;
    }

    const result = getPayloadDeleteResult(deletePayload);
    if (!result || !result.deleted || !result.trashedPath) {
      errors = [];
      setStatus('error', '删除响应异常，请检查开发日志');
      return;
    }

    reloadContentList(CONTENT_LIST_ACTION_FEEDBACK_DELETED);
  } catch {
    errors = [];
    setStatus('error', '删除请求失败，请稍后重试');
  } finally {
    busy = false;
  }
};

const handleClick = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return;

  const createTrigger = event.target.closest<HTMLElement>(CREATE_TRIGGER_SELECTOR);
  if (createTrigger) {
    event.preventDefault();
    const requestedCollection = createTrigger.dataset.createCollection?.trim() ?? 'blog';
    void openCreateDialog(
      createTrigger,
      isContentInfoCollection(requestedCollection) ? requestedCollection : 'blog'
    );
    return;
  }

  const deleteTrigger = event.target.closest<HTMLElement>('[data-admin-content-delete-action]');
  if (deleteTrigger) {
    event.preventDefault();
    closeActionMenu(deleteTrigger);
    void deleteEntry(deleteTrigger);
    return;
  }

  const trigger = event.target.closest<HTMLElement>('[data-admin-content-info-action]');
  if (!trigger) return;

  const collection = trigger.dataset.collection?.trim() ?? '';
  const entryId = trigger.dataset.entryId?.trim() ?? '';
  if (!isContentInfoCollection(collection) || !entryId) return;

  event.preventDefault();
  closeActionMenu(trigger);
  void openEditor(collection, entryId, trigger);
};

onMount(() => {
  const feedback = takeContentListActionFeedback();
  if (feedback === CONTENT_LIST_ACTION_FEEDBACK_SAVED) {
    setStatus('ok', '已保存', { autoClear: true });
  } else if (feedback === CONTENT_LIST_ACTION_FEEDBACK_DELETED) {
    setStatus('ok', '已移到回收站', { autoClear: true });
  }
});

$effect(() => {
  document.querySelectorAll<HTMLButtonElement>(ALL_CREATE_TRIGGER_SELECTOR).forEach((button) => {
    button.disabled = busy;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-admin-content-delete-action]').forEach((button) => {
    button.disabled = busy;
  });
});

$effect(() => {
  if (frontmatter?.title) {
    syncCreateEntryIdFromTitle();
  }
});

$effect(() => {
  const cleanupDetailsMenus = initAdminDetailsMenus({
    selector: '.admin-content-item__more'
  });
  document.addEventListener('click', handleClick);
  return () => {
    cleanupDetailsMenus();
    document.removeEventListener('click', handleClick);
  };
});
</script>

{#if frontmatter}
  <ArticleInfoDialog
    bind:this={dialog}
    bind:value={frontmatter}
    collection={selectedCollection}
    {open}
    {issues}
    disabled={busy}
    loading={loadingEntry}
    {dirty}
    {canSave}
    entryId={dialogMode === 'create' ? createEntryId : selectedEntryId}
    showEntryId={dialogMode === 'create'}
    {slugPlaceholder}
    dialogTitle={dialogMode === 'create'
      ? CREATE_DIALOG_TITLES[selectedCollection]
      : selectedCollection === 'bits'
        ? '修改信息'
        : '条目信息'}
    fieldsAriaLabel={selectedCollection === 'bits' ? '标题、摘要与作者' : '随笔字段'}
    {bitsDefaultAuthor}
    fieldScope={selectedCollection === 'bits' ? 'bits-summary' : 'all'}
    draftLocked={dialogMode === 'create'}
    draftLockHelp={dialogMode === 'create' ? '默认草稿，完善正文后发布。' : ''}
    saveLabel={dialogMode === 'create' ? '创建' : '保存'}
    onEntryIdInput={updateCreateEntryId}
    onClose={closeDialog}
    onReset={resetToBaseline}
    onSave={saveDialog}
  />
{/if}

{#if errors.length > 0}
  <div class="admin-content-action-errors" role="alert">
    {#each errors as error}
      <p>{error}</p>
    {/each}
  </div>
{/if}
