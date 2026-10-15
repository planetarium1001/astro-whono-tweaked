import {
  ADMIN_IMAGE_DEFAULT_LIST_LIMIT,
  isAdminImageOrigin,
  isAdminImageScopeKey,
  type AdminImageOrigin,
  type AdminImageScopeKey
} from './image-contract';
import {
  normalizeAdminImageBrowseGroup,
  normalizeAdminImageBrowseSubgroup
} from './image-browse';
import {
  normalizeBitsAvatarPath,
  normalizeHeroImageSrc,
  toSafeHttpUrl
} from '../../utils/format';
import {
  normalizeBitsImageSource,
  normalizeBitsLocalImageSource
} from '../bits-image-source';

export type AdminImageFieldContext =
  | 'bits.images'
  | 'home.heroImageSrc'
  | 'page.bits.defaultAuthor.avatar'
  | 'projects.icon';

export type AdminImageDirectory =
  | ''
  | 'public'
  | 'public/author'
  | 'public/images'
  | 'src/assets'
  | 'src/content';

export type AdminImageDirectoryOption = {
  value: AdminImageDirectory;
  label: string;
  description: string;
};

export type AdminImageListRequest = {
  field: AdminImageFieldContext | null;
  /** 已知目录前缀或其子目录，例如 `public/images/bits`（只做前缀校验，不做精确白名单）。 */
  directory: string;
  owner: string;
  origin: AdminImageOrigin | '';
  scope: AdminImageScopeKey | '';
  group: string;
  subgroup: string;
  query: string;
  page: number;
  limit: number;
};

export type AdminImageMetaInput =
  | {
      field: AdminImageFieldContext;
      value: string;
      path?: string;
    }
  | {
      path: string;
      field?: AdminImageFieldContext;
      value?: string;
    };

type AdminImageFieldConfig = {
  allowedOrigins: readonly AdminImageOrigin[];
  preferredPrefixes: readonly string[];
  toValue: (assetPath: string, origin: AdminImageOrigin) => string | null;
};

export const IMAGE_LOCAL_EXT_RE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

/** 仓库内相对图片路径的统一校验文案，元数据读取与路径解析共用。 */
export const ADMIN_IMAGE_LOCAL_PATH_MESSAGE =
  '图片路径必须是 public/**、src/assets/** 或 src/content/** 下的规范仓库相对图片路径';

const FIELD_CONFIG: Record<AdminImageFieldContext, AdminImageFieldConfig> = {
  'bits.images': {
    allowedOrigins: ['public'],
    preferredPrefixes: ['public/images/bits/', 'public/images/', 'public/author/', 'public/'],
    toValue: (assetPath, origin) => (origin === 'public' ? assetPath.slice('public/'.length) : null)
  },
  'home.heroImageSrc': {
    allowedOrigins: ['src/assets', 'public'],
    preferredPrefixes: ['src/assets/', 'public/images/', 'public/'],
    toValue: (assetPath, origin) => {
      if (origin === 'src/assets') return assetPath;
      if (origin === 'public') return `/${assetPath.slice('public/'.length)}`;
      return null;
    }
  },
  'page.bits.defaultAuthor.avatar': {
    allowedOrigins: ['public'],
    preferredPrefixes: ['public/author/', 'public/images/', 'public/'],
    toValue: (assetPath, origin) => (origin === 'public' ? assetPath.slice('public/'.length) : null)
  },
  'projects.icon': {
    allowedOrigins: ['public'],
    preferredPrefixes: ['public/images/projects/', 'public/images/', 'public/'],
    toValue: (assetPath, origin) => (origin === 'public' ? `/${assetPath.slice('public/'.length)}` : null)
  }
};

const ADMIN_IMAGE_FIELD_CONTEXTS = Object.freeze(Object.keys(FIELD_CONFIG) as AdminImageFieldContext[]);
const ADMIN_IMAGE_ALL_ORIGINS = ['public', 'src/assets', 'src/content'] as const satisfies readonly AdminImageOrigin[];

export const ADMIN_IMAGE_DIRECTORY_OPTIONS = [
  {
    value: '',
    label: '全部资源',
    description: '查看站点里可用的本地图片。'
  },
  {
    value: 'public/author',
    label: '头像资源',
    description: '查看作者头像和默认头像图片。'
  },
  {
    value: 'public/images',
    label: '页面插图',
    description: '查看首页和普通页面使用的插图。'
  },
  {
    value: 'public',
    label: '公开图片',
    description: '查看 public 下的全部公开图片。'
  },
  {
    value: 'src/assets',
    label: '站点素材',
    description: '查看站点主题和首页使用的本地素材。'
  },
  {
    value: 'src/content',
    label: '文章附件',
    description: '查看文章或笔记同目录下的图片附件。'
  }
] as const satisfies readonly AdminImageDirectoryOption[];

export class AdminImageError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminImageError';
    this.status = status;
  }
}

const normalizePositiveInteger = (
  value: string | null,
  { fallback, min = 1, max = Number.MAX_SAFE_INTEGER }: { fallback: number; min?: number; max?: number }
): number => {
  const parsed = Number.parseInt((value ?? '').trim(), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const normalizeSearchQuery = (value: string | null): string => (value ?? '').trim().toLowerCase();

export const normalizeAdminImageOwnerValue = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\\/g, '/');

export const isAdminImageFieldContext = (value: string): value is AdminImageFieldContext =>
  value in FIELD_CONFIG;

/** 统一空白、反斜杠与末尾斜杠。 */
const normalizeDirectoryInput = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');

/**
 * 请求参数里的 `dir`：保留子目录原文（如 `public/images/bits`），只做前缀校验。
 * 不收敛到已知目录选项，否则子目录会被降级成父目录。
 */
const normalizeAdminImageRequestDirectory = (value: string | null | undefined): string => {
  const normalized = normalizeDirectoryInput(value);
  if (!normalized) return '';
  return normalizeAdminImageDirectory(normalized) ? normalized : '';
};

/**
 * 把值收敛到已知目录选项。用最长前缀匹配，因为 `public/images/bits` 这类子目录
 * 是 `public/images` 的前缀延伸，新增子目录不必同步扩展 `AdminImageDirectory`。
 */
export const normalizeAdminImageDirectory = (value: string | null | undefined): AdminImageDirectory => {
  const normalized = normalizeDirectoryInput(value);
  if (!normalized) return '';

  const matched = ADMIN_IMAGE_DIRECTORY_OPTIONS
    .map((option) => option.value)
    .filter((candidate) => candidate && (normalized === candidate || normalized.startsWith(`${candidate}/`)))
    .sort((left, right) => right.length - left.length)[0];

  return matched ?? '';
};

export const getAdminImageFieldValue = (
  field: AdminImageFieldContext | null,
  assetPath: string,
  origin: AdminImageOrigin
): string | null => {
  if (!field) return assetPath;
  const config = FIELD_CONFIG[field];
  if (!config.allowedOrigins.includes(origin)) return null;
  return config.toValue(assetPath, origin);
};

export const getAdminImageFieldAllowedOrigins = (
  field: AdminImageFieldContext | null
): readonly AdminImageOrigin[] => (field ? FIELD_CONFIG[field].allowedOrigins : ADMIN_IMAGE_ALL_ORIGINS);

export const getAdminImageFieldSortRank = (
  field: AdminImageFieldContext | null,
  assetPath: string
): number => {
  if (!field) return 999;
  const prefixes = FIELD_CONFIG[field].preferredPrefixes;
  const index = prefixes.findIndex((prefix) => assetPath.startsWith(prefix));
  return index === -1 ? prefixes.length : index;
};

export const getAdminImageCompatibleFieldValues = (
  assetPath: string,
  origin: AdminImageOrigin
): string[] =>
  Array.from(
    new Set(
      ADMIN_IMAGE_FIELD_CONTEXTS
        .map((field) => getAdminImageFieldValue(field, assetPath, origin))
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );

export const normalizeAdminLocalImageSource = normalizeBitsLocalImageSource;

export const normalizeAdminBitsImageSource = normalizeBitsImageSource;

const withAdminPreviewBase = (base: string, path: string): string => {
  const normalizedBase = base.trim().replace(/\/+$/, '');
  const basePath = normalizedBase && normalizedBase !== '/' ? `/${normalizedBase.replace(/^\/+/, '')}` : '';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!basePath || normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`)) {
    return normalizedPath;
  }
  return `${basePath}${normalizedPath}`;
};

const normalizeRenderedLocalImagePreviewPath = (value: string): { path: string; search: string } | null => {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (
    !normalized
    || !normalized.startsWith('/')
    || normalized.startsWith('//')
    || normalized.includes('#')
  ) {
    return null;
  }

  const searchIndex = normalized.indexOf('?');
  const pathPart = searchIndex === -1 ? normalized : normalized.slice(0, searchIndex);
  const search = searchIndex === -1 ? '' : normalized.slice(searchIndex);
  if (!pathPart || /(^|\/)\.\.(?:\/|$)/.test(pathPart)) return null;

  return IMAGE_LOCAL_EXT_RE.test(pathPart) ? { path: pathPart, search } : null;
};

export const getAdminRenderedImagePreviewSrc = (value: string, base = '/'): string | null => {
  const safeRemoteUrl = toSafeHttpUrl(value);
  if (safeRemoteUrl.startsWith('https://')) return safeRemoteUrl;

  const localPath = normalizeRenderedLocalImagePreviewPath(value);
  return localPath ? `${withAdminPreviewBase(base, localPath.path)}${localPath.search}` : null;
};

export const getAdminImageFieldPreviewSrc = (
  field: AdminImageFieldContext,
  value: string,
  base = '/'
): string | null => {
  if (field === 'bits.images') {
    const normalized = normalizeAdminBitsImageSource(value);
    if (!normalized) return null;
    return normalized.startsWith('https://') ? normalized : withAdminPreviewBase(base, normalized);
  }

  if (field === 'page.bits.defaultAuthor.avatar') {
    const normalized = normalizeBitsAvatarPath(value);
    return normalized ? withAdminPreviewBase(base, normalized) : null;
  }

  const normalized = normalizeHeroImageSrc(value);
  if (!normalized) return null;
  if (normalized.startsWith('https://')) return normalized;
  if (normalized.startsWith('src/assets/')) return null;
  return withAdminPreviewBase(base, normalized);
};

export const getAdminImageListRequest = (searchParams: URLSearchParams): AdminImageListRequest => {
  const rawField = (searchParams.get('field') ?? '').trim();
  const field = isAdminImageFieldContext(rawField) ? rawField : null;
  const rawOrigin = (searchParams.get('origin') ?? '').trim();
  const origin = isAdminImageOrigin(rawOrigin) && getAdminImageFieldAllowedOrigins(field).includes(rawOrigin)
    ? rawOrigin
    : '';
  const rawScope = (searchParams.get('scope') ?? '').trim().toLowerCase();
  const scope = !field && isAdminImageScopeKey(rawScope) ? rawScope : '';

  return {
    field,
    // 保留调用方请求的目录原文（可以是已知前缀的子目录，如 public/images/bits）；
    // 只做协议与空白归一化，不做精确白名单。
    directory: normalizeAdminImageRequestDirectory(searchParams.get('dir')),
    owner: normalizeAdminImageOwnerValue(searchParams.get('owner')),
    origin,
    scope,
    group: normalizeAdminImageBrowseGroup(searchParams.get('group')),
    subgroup: normalizeAdminImageBrowseSubgroup(searchParams.get('sub')),
    query: normalizeSearchQuery(searchParams.get('q')),
    page: normalizePositiveInteger(searchParams.get('page'), { fallback: 1 }),
    limit: normalizePositiveInteger(searchParams.get('limit'), {
      fallback: ADMIN_IMAGE_DEFAULT_LIST_LIMIT,
      max: 60
    })
  };
};

export const getAdminImageMetaRequest = (searchParams: URLSearchParams): AdminImageMetaInput => {
  const rawPath = (searchParams.get('path') ?? '').trim();
  if (rawPath) {
    return { path: rawPath };
  }

  const rawField = (searchParams.get('field') ?? '').trim();
  if (!isAdminImageFieldContext(rawField)) {
    throw new AdminImageError('field 参数非法，无法读取图片元数据');
  }

  return {
    field: rawField,
    value: (searchParams.get('value') ?? '').trim()
  };
};
