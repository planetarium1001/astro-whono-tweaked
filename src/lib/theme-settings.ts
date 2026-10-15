import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { site as legacySite } from '../../site.config.mjs';
import { asThemeFontIdForRole, type ThemeFontId } from './fonts/registry';
import {
  getHeroImageLocalFilePath,
  getSiteFaviconLocalFilePath,
  getSiteFilingIconLocalFilePath,
  normalizeSiteFilingIconPath,
  getSiteFaviconSizesFromPath,
  normalizeBitsAvatarPath,
  normalizeHeroImageSrc,
  normalizeSiteFaviconPath,
  type SiteFaviconSlot
} from '../utils/format';
import {
  ADMIN_ARTICLE_META_DATE_LABEL_DEFAULT,
  ADMIN_ARTICLE_META_DATE_LABEL_MAX_LENGTH,
  ADMIN_HERO_IMAGE_ALT_DEFAULT,
  ADMIN_HERO_IMAGE_ALT_MAX_LENGTH,
  ADMIN_HOME_INTRO_LINK_DEFAULT,
  ADMIN_HOME_INTRO_LINK_KEY_SET,
  ADMIN_HOME_INTRO_LINK_LIMIT,
  ADMIN_LOCALE_RE,
  ADMIN_NAV_IDS,
  ADMIN_NAV_ORDER_MAX,
  ADMIN_NAV_ORDER_MIN,
  ADMIN_NAV_ORNAMENT_DEFAULT,
  ADMIN_NAV_ORNAMENT_MAX_LENGTH,
  ADMIN_OVERVIEW_HIDDEN_MESSAGE_DEFAULT,
  ADMIN_OVERVIEW_HIDDEN_MESSAGE_MAX_LENGTH,
  ADMIN_HERO_PRESET_SET,
  ADMIN_SOCIAL_ORDER_MAX,
  ADMIN_SOCIAL_ORDER_MIN,
  ADMIN_SOCIAL_PRESET_IDS,
  ADMIN_SITE_PAGE_GAP_DEFAULT,
  ADMIN_SITE_PAGE_GAP_MAX,
  ADMIN_SITE_PAGE_GAP_MIN,
  ADMIN_SITE_TITLE_PERCENT_DEFAULT,
  ADMIN_SITE_TITLE_PERCENT_MAX,
  ADMIN_SITE_TITLE_PERCENT_MIN,
  canonicalizeAdminThemeSettings,
  createAdminWritableThemeSettingsGroups,
  fillAdminThemeSettingsGroupCompatibilityDefaults,
  getAdminFooterStartYearMax,
  getAdminNavOrderIssues,
  getAdminThemeSettingsGroupFileName,
  getAdminThemeSettingsMismatchPaths,
  getAdminSocialOrderIssues,
  ADMIN_FILINGS_NUMBER_MAX_LENGTH,
  ADMIN_ICP_FILING_HOSTS,
  ADMIN_POLICE_FILING_HOSTS,
  ADMIN_SIDEBAR_DIVIDER_DEFAULT,
  ADMIN_VIEW_STATS_LABEL_MAX_LENGTH,
  ADMIN_VIEW_STATS_PV_LABEL_DEFAULT,
  ADMIN_VIEW_STATS_UV_LABEL_DEFAULT,
  ADMIN_TYPOGRAPHY_DEFAULT,
  isAdminNavOrderValue,
  isAdminSocialOrderValue,
  isAdminSidebarDividerVariant,
  normalizeAdminSocialIconKey,
} from './admin-console/theme-shared';

type SettingSource = 'new' | 'legacy' | 'default';

export type SidebarNavId = 'blog' | 'projects' | 'bits' | 'devlog' | 'archive' | 'about';
export type HeroPresetId = 'default' | 'none';
export type SidebarDividerVariant = 'default' | 'subtle' | 'none';
// ThemeFontId 从字体注册表条目 id 派生：添加字体只需在 registry.ts 增加条目，无需改这里。
export type { ThemeFontId } from './fonts/registry';
export type TypographyRole = 'readable' | 'copy' | 'mono' | 'brand';
export type HomeIntroLinkKey =
  | 'archive'
  | 'blog'
  | 'projects'
  | 'bits'
  | 'devlog'
  | 'about'
  /** 直达归档页的标签选择器（作用域默认「全部」，可再切到博客） */
  | 'tag'
  /** 直达博客列表页的标签选择器 */
  | 'blogTag';
export type SiteSocialPresetId = 'github' | 'x' | 'email';
type SiteSocialKind = 'preset' | 'custom';
export type SiteSocialIconKey =
  | 'github'
  | 'x'
  | 'email'
  | 'weibo'
  | 'facebook'
  | 'instagram'
  | 'telegram'
  | 'mastodon'
  | 'bilibili'
  | 'youtube'
  | 'linkedin'
  | 'website';

interface SidebarNavItem {
  id: SidebarNavId;
  label: string;
  ornament: string | null;
  visible: boolean;
  order: number;
}

export interface ListRssSettings {
  /** 总开关：关掉后三个列表页一起隐藏。 */
  enabled: boolean;
  blog: boolean;
  bits: boolean;
  archive: boolean;
}

interface SiteFooterSettings {
  startYear: number;
  showCurrentYear: boolean;
  copyright: string;
}

interface SiteSocialCustomItem {
  id: string;
  label: string;
  href: string;
  iconKey: SiteSocialIconKey;
  visible: boolean;
  order: number;
}

export interface SiteSocialPresetOrder {
  github: number;
  x: number;
  email: number;
}

export interface ResolvedSocialItem {
  id: string;
  label: string;
  href: string;
  iconKey: SiteSocialIconKey;
  kind: SiteSocialKind;
  visible: boolean;
  order: number;
}

interface SiteSocialLinks {
  github: string | null;
  x: string | null;
  email: string | null;
  presetOrder: SiteSocialPresetOrder;
  custom: SiteSocialCustomItem[];
  resolvedSocialItems: ResolvedSocialItem[];
}

interface SiteAdminOverviewSettings {
  publicVisible: boolean;
  hiddenMessage: string;
}

export type { SiteFaviconSlot } from '../utils/format';

interface SiteFaviconSettings {
  svg: string | null;
  png: string | null;
  appleTouchIcon: string | null;
}

interface SiteFaviconLink {
  rel: 'icon' | 'apple-touch-icon';
  href: string;
  type?: string;
  sizes?: string;
}

interface SiteFilingSettings {
  number: string | null;
  link: string | null;
}

export interface SiteFilingsSettings {
  icp: SiteFilingSettings;
  police: SiteFilingSettings & {
    icon: string | null;
  };
}

interface SiteSettings {
  title: string;
  description: string;
  defaultLocale: string;
  /**
   * 窄屏顶栏里站点标题可渲染宽度的上限（占页面宽度的百分比）。
   * 默认 35%，范围 10–100，由后台「主题 → 站点设置」维护。
   */
  titleMaxPercent: number;
  /**
   * 页面外缘间隙：内容盒到浏览器边缘的视觉距离（px）。
   * 默认与下限 32，上限 160，由后台「主题 → 站点设置」维护；
   * 渲染时换算成 --page-inline = 间隙 - SCROLLBAR_GUTTER_INLINE_PX，作为壳层的结束内边距。
   */
  pageGapPx: number;
  footer: SiteFooterSettings;
  filings: SiteFilingsSettings;
  adminOverview: SiteAdminOverviewSettings;
  favicon: SiteFaviconSettings;
  socialLinks: SiteSocialLinks;
}

interface ShellSettings {
  brandTitle: string;
  /**
   * 窄屏顶栏标题；为空、缺失或全空白时为 null，由渲染层回落到 `brandTitle`。
   * 与 `brandTitle` 同组，同走白名单富文本渲染与纯文本提取。
   */
  titleNarrow: string | null;
  quote: string;
  nav: SidebarNavItem[];
}

interface HomeSettings {
  introLead: string;
  introMore: string;
  introMoreLinks: HomeIntroLinkKey[];
  showIntroLead: boolean;
  showIntroMore: boolean;
  heroPresetId: HeroPresetId;
  heroImageSrc: string | null;
  heroImageAlt: string;
}

interface PageHeadingSettings {
  title: string | null;
  subtitle: string | null;
}

interface BitsDefaultAuthorSettings {
  name: string;
  avatar: string;
}

interface BitsPageSettings extends PageHeadingSettings {
  defaultAuthor: BitsDefaultAuthorSettings;
}

interface PageSettings {
  blog: PageHeadingSettings;
  projects: PageHeadingSettings;
  archive: PageHeadingSettings;
  bits: BitsPageSettings;
  devlog: PageHeadingSettings;
  about: PageHeadingSettings;
  /**
   * 列表页描述行里的 RSS 链接开关（后台「内页设置 → RSS 订阅」）：
   * `enabled` 是总开关，其余三个页面各自可单独勾选、互不干扰。
   * 侧栏的 RSS 按钮由 `ui.sidebarActions.showRssLink` 单独控制。
   */
  listRss: ListRssSettings;
}

export interface ArticleMetaSettings {
  showDate: boolean;
  dateLabel: string;
  showTags: boolean;
  showWordCount: boolean;
  showReadingTime: boolean;
}

type ArticleMetaDisplayContext = 'home' | 'list' | 'detail';

interface SidebarActionsSettings {
  showRssLink: boolean;
  showThemeToggle: boolean;
  showAdminEntry: boolean;
}

export interface TypographySettings {
  readable: ThemeFontId;
  copy: ThemeFontId;
  mono: ThemeFontId;
  brand: ThemeFontId;
}

interface FloatStackSettings {
  showResumeReading: boolean;
  showScrollTop: boolean;
}

export interface ViewStatsSettings {
  showPv: boolean;
  pvLabel: string;
  showUv: boolean;
  uvLabel: string;
  onArticleMeta: boolean;
  onIndexPages: boolean;
}

interface UiSettings {
  codeBlock: {
    showLineNumbers: boolean;
  };
  readingMode: {
    showEntry: boolean;
  };
  floatStack: FloatStackSettings;
  viewStats: ViewStatsSettings;
  sidebarActions: SidebarActionsSettings;
  articleMeta: ArticleMetaSettings;
  layout: {
    sidebarDivider: SidebarDividerVariant;
  };
  typography: TypographySettings;
}

interface ThemeSettings {
  site: SiteSettings;
  shell: ShellSettings;
  home: HomeSettings;
  page: PageSettings;
  ui: UiSettings;
}

interface ThemeSettingsSources {
  site: {
    title: SettingSource;
    description: SettingSource;
    defaultLocale: SettingSource;
    footerStartYear: SettingSource;
    footerShowCurrentYear: SettingSource;
    footerCopyright: SettingSource;
    filingsIcpNumber: SettingSource;
    filingsIcpLink: SettingSource;
    filingsPoliceNumber: SettingSource;
    filingsPoliceLink: SettingSource;
    filingsPoliceIcon: SettingSource;
    adminOverviewPublicVisible: SettingSource;
    adminOverviewHiddenMessage: SettingSource;
    faviconSvg: SettingSource;
    faviconPng: SettingSource;
    faviconAppleTouchIcon: SettingSource;
    socialLinksGithub: SettingSource;
    socialLinksX: SettingSource;
    socialLinksEmail: SettingSource;
    socialLinksGithubOrder: SettingSource;
    socialLinksXOrder: SettingSource;
    socialLinksEmailOrder: SettingSource;
    socialLinksCustom: SettingSource;
  };
  shell: {
    brandTitle: SettingSource;
    titleNarrow: SettingSource;
    quote: SettingSource;
    nav: SettingSource;
  };
  home: {
    introLead: SettingSource;
    introMore: SettingSource;
    introMoreLinks: SettingSource;
    showIntroLead: SettingSource;
    showIntroMore: SettingSource;
    heroPresetId: SettingSource;
    heroImageSrc: SettingSource;
    heroImageAlt: SettingSource;
  };
  page: {
    BlogTitle: SettingSource;
    BlogSubtitle: SettingSource;
    projectsTitle: SettingSource;
    projectsSubtitle: SettingSource;
    archiveTitle: SettingSource;
    archiveSubtitle: SettingSource;
    bitsTitle: SettingSource;
    bitsSubtitle: SettingSource;
    bitsDefaultAuthorName: SettingSource;
    bitsDefaultAuthorAvatar: SettingSource;
    devlogTitle: SettingSource;
    devlogSubtitle: SettingSource;
    aboutTitle: SettingSource;
    aboutSubtitle: SettingSource;
  };
  ui: {
    codeBlockShowLineNumbers: SettingSource;
    readingModeShowEntry: SettingSource;
    floatStackShowResumeReading: SettingSource;
    floatStackShowScrollTop: SettingSource;
    viewStatsShowPv: SettingSource;
    viewStatsPvLabel: SettingSource;
    viewStatsShowUv: SettingSource;
    viewStatsUvLabel: SettingSource;
    viewStatsOnArticleMeta: SettingSource;
    viewStatsOnIndexPages: SettingSource;
    sidebarActionsShowRssLink: SettingSource;
    sidebarActionsShowThemeToggle: SettingSource;
    sidebarActionsShowAdminEntry: SettingSource;
    articleMetaShowDate: SettingSource;
    articleMetaDateLabel: SettingSource;
    articleMetaShowTags: SettingSource;
    articleMetaShowWordCount: SettingSource;
    articleMetaShowReadingTime: SettingSource;
    layoutSidebarDivider: SettingSource;
    typographyReadable: SettingSource;
    typographyCopy: SettingSource;
    typographyMono: SettingSource;
    typographyBrand: SettingSource;
  };
}

const ARTICLE_META_TAG_LIMITS: Record<ArticleMetaDisplayContext, number> = {
  home: 1,
  list: 3,
  detail: 3
};

interface ThemeSettingsResolved {
  settings: ThemeSettings;
  sources: ThemeSettingsSources;
}

interface EditableSiteSocialLinks {
  github: string | null;
  x: string | null;
  email: string | null;
  presetOrder: SiteSocialPresetOrder;
  custom: SiteSocialCustomItem[];
}

interface EditableSiteSettings extends Omit<SiteSettings, 'socialLinks'> {
  socialLinks: EditableSiteSocialLinks;
}

export interface EditableThemeSettings extends Omit<ThemeSettings, 'site'> {
  site: EditableSiteSettings;
}

export interface ThemeSettingsEditablePayload {
  revision: string;
  settings: EditableThemeSettings;
  sources: ThemeSettingsSources;
}

type EditableThemeSettingsSnapshot = EditableThemeSettings;

export type ThemeSettingsFileGroup = 'site' | 'shell' | 'home' | 'page' | 'ui';

export interface ThemeSettingsReadDiagnostic {
  group: ThemeSettingsFileGroup;
  path: string;
  code: 'invalid-json' | 'invalid-root' | 'read-failed' | 'schema-mismatch';
  message: string;
  detail?: string;
  line?: number;
  column?: number;
}

export interface ThemeSettingsEditableErrorState {
  ok: false;
  mode: 'invalid-settings';
  message: string;
  errors: string[];
  diagnostics: ThemeSettingsReadDiagnostic[];
}

type ThemeSettingsEditableState =
  | {
      ok: true;
      payload: ThemeSettingsEditablePayload;
    }
  | ThemeSettingsEditableErrorState;

const DEFAULT_SETTINGS_DIR = join(process.cwd(), 'src', 'data', 'settings');
const INTERNAL_TEST_SETTINGS_DIR_ENV = 'ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR';
const INTERNAL_TEST_SETTINGS_FLAG_ENV = 'ASTRO_WHONO_INTERNAL_TEST_SETTINGS';
const SETTINGS_FILE_GROUPS: readonly ThemeSettingsFileGroup[] = ['site', 'shell', 'home', 'page', 'ui'];
const SETTINGS_RELATIVE_PATHS: Record<ThemeSettingsFileGroup, string> = {
  site: 'src/data/settings/site.json',
  shell: 'src/data/settings/shell.json',
  home: 'src/data/settings/home.json',
  page: 'src/data/settings/page.json',
  ui: 'src/data/settings/ui.json'
};

const isInternalThemeSettingsDirOverrideEnabled = (): boolean =>
  process.env[INTERNAL_TEST_SETTINGS_FLAG_ENV] === '1' || process.env.VITEST === 'true';

const resolveInternalThemeSettingsDirOverride = (): string | null => {
  if (!isInternalThemeSettingsDirOverrideEnabled()) return null;
  const rawValue = process.env[INTERNAL_TEST_SETTINGS_DIR_ENV]?.trim();
  return rawValue ? rawValue : null;
};

/**
 * 滚动条槽宽，与 global.css 的 --scrollbar-gutter-inline 保持一致。
 * 「页面外缘间隙」是内容盒到浏览器边缘的距离，布局按 --page-inline = 间隙 - 这一份换算。
 */
export const SCROLLBAR_GUTTER_INLINE_PX = 15;

export const getThemeSettingsDir = (): string => resolveInternalThemeSettingsDirOverride() ?? DEFAULT_SETTINGS_DIR;

export const getThemeSettingsFilePath = (group: ThemeSettingsFileGroup): string =>
  join(getThemeSettingsDir(), getAdminThemeSettingsGroupFileName(group));

const THEME_SETTINGS_INVALID_MESSAGE =
  '检测到 settings JSON 配置文件损坏，Theme Console 已停止读取并禁止保存，请先修复对应文件后再重试';

const LEGACY_INTRO_LEAD =
  '这是一个开源写作主题与示例内容库:包含 随笔/blog、归档/archive 与 絮语/bits，使用与配置请见 README 。';
const LEGACY_INTRO_MORE = '更多文章请访问';
const LEGACY_BLOG_TITLE = '随笔';
const LEGACY_ARCHIVE_TITLE = '归档';
const LEGACY_BLOG_SUBTITLE = '随笔与杂记';
const LEGACY_BITS_TITLE = '絮语';
const LEGACY_BITS_SUBTITLE = '生活不只是长篇';
const LEGACY_PROJECTS_TITLE = '项目';
const LEGACY_DEVLOG_TITLE = '更新';
const LEGACY_ABOUT_TITLE = '关于';
const LEGACY_QUOTE = 'A minimal Astro theme\nfor blogs, notes, and docs.\nDesigned for reading,\nopen-source.';
const LEGACY_FOOTER_START_YEAR = 2025;
const LEGACY_FOOTER_SHOW_CURRENT_YEAR = true;
const LEGACY_FOOTER_COPYRIGHT = 'Whono · Theme Demo · by cxro';
const DEFAULT_PRESET_SOCIAL_ORDER: SiteSocialPresetOrder = {
  github: 1,
  x: 2,
  email: 3
};
const LEGACY_SOCIAL_LINKS: SiteSocialLinks = {
  github: 'https://github.com/planetarium1001/astro-whono-tweaked',
  x: null,
  email: 'Whono@linux.do',
  presetOrder: { ...DEFAULT_PRESET_SOCIAL_ORDER },
  custom: [],
  resolvedSocialItems: []
};
const LEGACY_NAV: SidebarNavItem[] = [
  { id: 'blog', label: '博客', ornament: ADMIN_NAV_ORNAMENT_DEFAULT, visible: true, order: 1 },
  { id: 'projects', label: '项目', ornament: ADMIN_NAV_ORNAMENT_DEFAULT, visible: true, order: 2 },
  { id: 'bits', label: '动态', ornament: ADMIN_NAV_ORNAMENT_DEFAULT, visible: true, order: 3 },
  { id: 'devlog', label: '更新', ornament: ADMIN_NAV_ORNAMENT_DEFAULT, visible: true, order: 4 },
  { id: 'archive', label: '归档', ornament: ADMIN_NAV_ORNAMENT_DEFAULT, visible: true, order: 5 },
  { id: 'about', label: '关于', ornament: ADMIN_NAV_ORNAMENT_DEFAULT, visible: true, order: 6 }
];
const LEGACY_NAV_ORDER = new Map<SidebarNavId, number>(LEGACY_NAV.map((item) => [item.id, item.order]));

const cloneNavItems = (items: readonly SidebarNavItem[]): SidebarNavItem[] =>
  items.map((item) => ({ ...item }));

const cloneSocialCustomItems = (items: readonly SiteSocialCustomItem[]): SiteSocialCustomItem[] =>
  items.map((item) => ({ ...item }));

const clonePresetSocialOrder = (value: Readonly<SiteSocialPresetOrder>): SiteSocialPresetOrder => ({
  ...value
});

const cloneResolvedSocialItems = (items: readonly ResolvedSocialItem[]): ResolvedSocialItem[] =>
  items.map((item) => ({ ...item }));

const cloneHomeIntroLinks = (items: readonly HomeIntroLinkKey[]): HomeIntroLinkKey[] => [...items];

const cloneThemeSettingsSources = (sources: ThemeSettingsSources): ThemeSettingsSources => ({
  site: { ...sources.site },
  shell: { ...sources.shell },
  home: { ...sources.home },
  page: { ...sources.page },
  ui: { ...sources.ui }
});

const cloneThemeSettingsReadDiagnostics = (
  diagnostics: readonly ThemeSettingsReadDiagnostic[]
): ThemeSettingsReadDiagnostic[] => diagnostics.map((diagnostic) => ({ ...diagnostic }));

const DEFAULT_SITE: SiteSettings = {
  title: 'Whono',
  description: '一个 Astro 主题的展示站：轻量、可维护、可复用。',
  defaultLocale: 'zh-CN',
  titleMaxPercent: ADMIN_SITE_TITLE_PERCENT_DEFAULT,
  pageGapPx: ADMIN_SITE_PAGE_GAP_DEFAULT,
  footer: {
    startYear: LEGACY_FOOTER_START_YEAR,
    showCurrentYear: LEGACY_FOOTER_SHOW_CURRENT_YEAR,
    copyright: LEGACY_FOOTER_COPYRIGHT
  },
  filings: {
    icp: { number: null, link: null },
    police: { number: null, link: null, icon: null }
  },
  adminOverview: {
    publicVisible: true,
    hiddenMessage: ADMIN_OVERVIEW_HIDDEN_MESSAGE_DEFAULT
  },
  favicon: {
    svg: null,
    png: null,
    appleTouchIcon: null
  },
  socialLinks: {
    github: null,
    x: null,
    email: null,
    presetOrder: clonePresetSocialOrder(DEFAULT_PRESET_SOCIAL_ORDER),
    custom: [],
    resolvedSocialItems: []
  }
};

const DEFAULT_SHELL: ShellSettings = {
  brandTitle: 'Whono',
  titleNarrow: null,
  quote: LEGACY_QUOTE,
  nav: cloneNavItems(LEGACY_NAV)
};

const DEFAULT_HOME: HomeSettings = {
  introLead: LEGACY_INTRO_LEAD,
  introMore: LEGACY_INTRO_MORE,
  introMoreLinks: cloneHomeIntroLinks(ADMIN_HOME_INTRO_LINK_DEFAULT),
  showIntroLead: true,
  showIntroMore: true,
  heroPresetId: 'default',
  heroImageSrc: null,
  heroImageAlt: ADMIN_HERO_IMAGE_ALT_DEFAULT
};

const DEFAULT_PAGE: PageSettings = {
  blog: {
    title: LEGACY_BLOG_TITLE,
    subtitle: LEGACY_BLOG_SUBTITLE
  },
  projects: {
    title: LEGACY_PROJECTS_TITLE,
    subtitle: '散者归之，各归其地'
  },
  archive: {
    title: LEGACY_ARCHIVE_TITLE,
    subtitle: '按年份分组的归档目录'
  },
  bits: {
    title: LEGACY_BITS_TITLE,
    subtitle: LEGACY_BITS_SUBTITLE,
    defaultAuthor: {
      name: 'Whono',
      avatar: 'author/avatar.webp'
    }
  },
  devlog: {
    title: LEGACY_DEVLOG_TITLE,
    subtitle: '逐条记录项目的每一次改动'
  },
  about: {
    title: LEGACY_ABOUT_TITLE,
    subtitle: null
  },
  listRss: {
    enabled: true,
    blog: true,
    bits: true,
    archive: true
  }
};

const DEFAULT_UI: UiSettings = {
  codeBlock: {
    showLineNumbers: true
  },
  readingMode: {
    showEntry: true
  },
  floatStack: {
    showResumeReading: true,
    showScrollTop: true
  },
  viewStats: {
    showPv: false,
    pvLabel: ADMIN_VIEW_STATS_PV_LABEL_DEFAULT,
    showUv: false,
    uvLabel: ADMIN_VIEW_STATS_UV_LABEL_DEFAULT,
    onArticleMeta: true,
    onIndexPages: true
  },
  sidebarActions: {
    showRssLink: true,
    showThemeToggle: true,
    showAdminEntry: false
  },
  articleMeta: {
    showDate: true,
    dateLabel: ADMIN_ARTICLE_META_DATE_LABEL_DEFAULT,
    showTags: true,
    showWordCount: true,
    showReadingTime: true
  },
  layout: {
    sidebarDivider: ADMIN_SIDEBAR_DIVIDER_DEFAULT
  },
  typography: {
    ...ADMIN_TYPOGRAPHY_DEFAULT
  }
};

const NAV_IDS: ReadonlySet<SidebarNavId> = new Set(['blog', 'projects', 'bits', 'devlog', 'archive', 'about']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GITHUB_HOSTS = ['github.com'];
const X_HOSTS = ['x.com', 'twitter.com'];
const SOCIAL_CUSTOM_LIMIT = 8;
const PRESET_SOCIAL_ITEMS: readonly {
  id: SiteSocialPresetId;
  label: string;
  iconKey: SiteSocialIconKey;
}[] = [
  { id: 'github', label: 'GitHub', iconKey: 'github' },
  { id: 'x', label: 'X', iconKey: 'x' },
  { id: 'email', label: 'Email', iconKey: 'email' }
];

const SIDEBAR_HREFS: Record<SidebarNavId, string> = {
  blog: '/blog/',
  projects: '/projects/',
  bits: '/bits/',
  devlog: '/devlog/',
  archive: '/archive/',
  about: '/about/'
};

let cachedSettings: ThemeSettingsResolved | null = null;
const shouldCacheThemeSettings = import.meta.env.PROD;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.trim() : undefined;

const asNonEmptyString = (value: unknown): string | undefined => {
  const next = asString(value);
  return next ? next : undefined;
};

const asLocale = (value: unknown): string | undefined => {
  const next = asNonEmptyString(value);
  return next && ADMIN_LOCALE_RE.test(next) ? next : undefined;
};

const asSingleLineString = (value: unknown, maxLength?: number): string | undefined => {
  const next = asNonEmptyString(value);
  if (!next) return undefined;
  if (next.includes('\n') || next.includes('\r')) return undefined;
  if (typeof maxLength === 'number' && next.length > maxLength) return undefined;
  return next;
};

const asTrimmedSingleLineString = (value: unknown, maxLength?: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const next = value.trim();
  if (next.includes('\n') || next.includes('\r')) return undefined;
  if (typeof maxLength === 'number' && next.length > maxLength) return undefined;
  return next;
};

const asNullableSingleLineString = (value: unknown, maxLength?: number): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('\n') || trimmed.includes('\r')) return undefined;
  if (typeof maxLength === 'number' && trimmed.length > maxLength) return undefined;
  return trimmed;
};

const asInteger = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Number.isInteger(value) ? value : undefined;
};

const asFooterStartYear = (value: unknown): number | undefined => {
  const next = asInteger(value);
  if (next === undefined) return undefined;
  const currentYear = new Date().getFullYear();
  return next >= 1900 && next <= currentYear ? next : undefined;
};

/**
 * 窄屏站点标题宽度百分比（`site.titleMaxPercent`）。
 * 非整数 / 越界一律视为「没配」，由默认值兜底（后台表单会给出校验提示）。
 */
const asSiteTitlePercent = (value: unknown): number | undefined => {
  const next = asInteger(value);
  if (next === undefined) return undefined;
  return next >= ADMIN_SITE_TITLE_PERCENT_MIN && next <= ADMIN_SITE_TITLE_PERCENT_MAX
    ? next
    : undefined;
};

/**
 * 页面外缘间隙（`site.pageGapPx`）。
 * 非整数 / 越界一律视为「没配」，由默认值兜底（后台表单会给出校验提示）。
 */
const asSitePageGap = (value: unknown): number | undefined => {
  const next = asInteger(value);
  if (next === undefined) return undefined;
  return next >= ADMIN_SITE_PAGE_GAP_MIN && next <= ADMIN_SITE_PAGE_GAP_MAX
    ? next
    : undefined;
};

const asPresetSocialOrderValue = (value: unknown): number | undefined => {
  const next = asInteger(value);
  return next !== undefined && isAdminSocialOrderValue(next) ? next : undefined;
};

const asNullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null;

  const next = asString(value);
  if (next === undefined) return undefined;
  return next || null;
};

const asHttpsUrl = (value: unknown, allowedHosts?: readonly string[]): string | null | undefined => {
  if (value === null) return null;

  const next = asString(value);
  if (next === undefined) return undefined;
  if (!next) return null;

  try {
    const parsed = new URL(next);
    if (parsed.protocol !== 'https:') return undefined;
    if (allowedHosts?.length) {
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = allowedHosts.some(
        (host) => hostname === host || hostname === `www.${host}` || hostname.endsWith(`.${host}`)
      );
      if (!isAllowed) return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const asEmailAddress = (value: unknown): string | null | undefined => {
  if (value === null) return null;

  const next = asString(value);
  if (next === undefined) return undefined;
  if (!next) return null;

  const normalized = next.replace(/^mailto:/i, '').trim();
  return EMAIL_RE.test(normalized) ? normalized : undefined;
};

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const asNavId = (value: unknown): SidebarNavId | undefined => {
  if (typeof value !== 'string') return undefined;
  return NAV_IDS.has(value as SidebarNavId) ? (value as SidebarNavId) : undefined;
};

const asHeroPresetId = (value: unknown): HeroPresetId | undefined => {
  if (typeof value !== 'string') return undefined;
  return ADMIN_HERO_PRESET_SET.has(value as HeroPresetId) ? (value as HeroPresetId) : undefined;
};

const asSidebarDividerVariant = (value: unknown): SidebarDividerVariant | undefined => {
  if (typeof value !== 'string') return undefined;
  return isAdminSidebarDividerVariant(value) ? value : undefined;
};

const asTypographyFontId = (role: TypographyRole, value: unknown): ThemeFontId | undefined =>
  asThemeFontIdForRole(role, value);

const asHeroImageSrc = (value: unknown): string | null | undefined => {
  const normalized = normalizeHeroImageSrc(value);
  if (normalized === undefined || normalized === null) return normalized;

  const localFilePath = getHeroImageLocalFilePath(normalized);
  if (!localFilePath) return normalized;

  return existsSync(join(process.cwd(), ...localFilePath.split('/'))) ? normalized : undefined;
};

// 只做格式校验；文件是否存在交给保存期校验（阻断新的坏引用）与渲染期回退——
// 手改 JSON / 切分支导致的文件缺失不应把后台锁进 invalid-settings。
const asSiteFaviconPath = (slot: SiteFaviconSlot, value: unknown): string | null | undefined =>
  normalizeSiteFaviconPath(slot, value);

const asBitsAvatarPath = (value: unknown): string | undefined => {
  return normalizeBitsAvatarPath(value);
};

const asHomeIntroLinkKey = (value: unknown): HomeIntroLinkKey | undefined => {
  if (typeof value !== 'string') return undefined;
  return ADMIN_HOME_INTRO_LINK_KEY_SET.has(value as HomeIntroLinkKey) ? (value as HomeIntroLinkKey) : undefined;
};

const asSocialIconKey = (value: unknown): SiteSocialIconKey | undefined => {
  return normalizeAdminSocialIconKey(value);
};

export const getVisibleArticleMetaTags = (
  tags: readonly string[] | null | undefined,
  context: ArticleMetaDisplayContext
): string[] => {
  if (!Array.isArray(tags)) return [];

  return tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, ARTICLE_META_TAG_LIMITS[context]);
};

const resolveValue = <T>(
  nextValue: T | undefined,
  legacyValue: T | undefined,
  defaultValue: T
): { value: T; source: SettingSource } => {
  if (nextValue !== undefined) return { value: nextValue, source: 'new' };
  if (legacyValue !== undefined) return { value: legacyValue, source: 'legacy' };
  return { value: defaultValue, source: 'default' };
};

const toReadErrorDetail = (error: unknown): string =>
  error instanceof Error ? error.message.trim() : String(error).trim();

const extractDiagnosticLocation = (
  detail?: string
): { line?: number; column?: number } => {
  if (!detail) return {};

  const match = detail.match(/\(line\s+(\d+)\s+column\s+(\d+)\)\s*$/i);
  if (!match) return {};

  const line = Number.parseInt(match[1] ?? '', 10);
  const column = Number.parseInt(match[2] ?? '', 10);
  const location: { line?: number; column?: number } = {};
  if (Number.isFinite(line)) {
    location.line = line;
  }
  if (Number.isFinite(column)) {
    location.column = column;
  }
  return location;
};

const createThemeSettingsReadDiagnostic = (
  group: ThemeSettingsFileGroup,
  code: ThemeSettingsReadDiagnostic['code'],
  detail?: string
): ThemeSettingsReadDiagnostic => {
  const path = SETTINGS_RELATIVE_PATHS[group];
  const message =
    code === 'invalid-json'
      ? `${path} 不是合法 JSON`
      : code === 'invalid-root'
        ? `${path} 的根节点必须是 JSON 对象`
        : code === 'schema-mismatch'
          ? `${path} 存在无效或非规范配置值`
          : `${path} 读取失败`;
  const location = extractDiagnosticLocation(detail);

  return {
    group,
    path,
    code,
    message,
    ...(detail ? { detail } : {}),
    ...location
  };
};

const readSettingsObject = (
  name: ThemeSettingsFileGroup,
  diagnostics: ThemeSettingsReadDiagnostic[] = []
): Record<string, unknown> | undefined => {
  const filePath = getThemeSettingsFilePath(name);
  if (!existsSync(filePath)) return undefined;

  try {
    const raw = readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const diagnostic = createThemeSettingsReadDiagnostic(name, 'invalid-json', toReadErrorDetail(error));
      console.warn(`[astro-whono] Failed to parse ${filePath}:`, error);
      diagnostics.push(diagnostic);
      return undefined;
    }

    if (!isRecord(parsed)) {
      const diagnostic = createThemeSettingsReadDiagnostic(name, 'invalid-root');
      console.warn(`[astro-whono] Invalid settings root for ${filePath}: expected JSON object`);
      diagnostics.push(diagnostic);
      return undefined;
    }

    return parsed;
  } catch (error) {
    const diagnostic = createThemeSettingsReadDiagnostic(name, 'read-failed', toReadErrorDetail(error));
    console.warn(`[astro-whono] Failed to read ${filePath}:`, error);
    diagnostics.push(diagnostic);
    return undefined;
  }
};

const readThemeSettingsObjects = (
  diagnostics: ThemeSettingsReadDiagnostic[] = []
): Partial<Record<ThemeSettingsFileGroup, Record<string, unknown>>> => {
  const settingsObjects: Partial<Record<ThemeSettingsFileGroup, Record<string, unknown>>> = {};
  for (const group of SETTINGS_FILE_GROUPS) {
    const settingsObject = readSettingsObject(group, diagnostics);
    if (settingsObject) {
      settingsObjects[group] = settingsObject;
    }
  }
  return settingsObjects;
};

const collectThemeSettingsSchemaDiagnostics = (
  rawSettings: Partial<Record<ThemeSettingsFileGroup, Record<string, unknown>>>,
  resolved: ThemeSettingsResolved
): ThemeSettingsReadDiagnostic[] => {
  const editableSnapshot = buildEditableThemeSettingsSnapshot(resolved);
  const canonicalGroups = createAdminWritableThemeSettingsGroups(editableSnapshot);
  const diagnostics: ThemeSettingsReadDiagnostic[] = [];

  for (const group of SETTINGS_FILE_GROUPS) {
    const rawGroup = rawSettings[group];
    if (!rawGroup) continue;

    const comparableRawGroup = fillAdminThemeSettingsGroupCompatibilityDefaults(group, rawGroup, canonicalGroups[group]);
    const mismatchPaths = getAdminThemeSettingsMismatchPaths(comparableRawGroup, canonicalGroups[group], 'exact');
    if (!mismatchPaths.length) continue;

    const summarizedPaths = mismatchPaths.slice(0, 6);
    const suffix = mismatchPaths.length > summarizedPaths.length ? ' 等' : '';
    diagnostics.push(
      createThemeSettingsReadDiagnostic(
        group,
        'schema-mismatch',
        `以下字段会在读取时被静默修补：${summarizedPaths.join(', ')}${suffix}`
      )
    );
  }

  return diagnostics;
};

export const getThemeSettingsReadDiagnostics = (
  resolved: ThemeSettingsResolved = getThemeSettings()
): ThemeSettingsReadDiagnostic[] => {
  const diagnostics: ThemeSettingsReadDiagnostic[] = [];
  const rawSettings = readThemeSettingsObjects(diagnostics);
  if (diagnostics.length === 0) {
    diagnostics.push(...collectThemeSettingsSchemaDiagnostics(rawSettings, resolved));
  }

  return cloneThemeSettingsReadDiagnostics(diagnostics);
};

export const getThemeSettingsRevision = (resolved: ThemeSettingsResolved = getThemeSettings()): string =>
  hashEditableThemeSettingsSnapshot(buildEditableThemeSettingsSnapshot(resolved));

const claimAvailableOrder = (
  usedOrders: Set<number>,
  preferredOrder: number,
  fallbackOrder: number,
  isValidOrder: (value: number) => boolean,
  minOrder: number,
  maxOrder: number
): number => {
  if (isValidOrder(preferredOrder) && !usedOrders.has(preferredOrder)) {
    usedOrders.add(preferredOrder);
    return preferredOrder;
  }

  if (isValidOrder(fallbackOrder) && !usedOrders.has(fallbackOrder)) {
    usedOrders.add(fallbackOrder);
    return fallbackOrder;
  }

  for (let order = minOrder; order <= maxOrder; order += 1) {
    if (usedOrders.has(order)) continue;
    usedOrders.add(order);
    return order;
  }

  usedOrders.add(fallbackOrder);
  return fallbackOrder;
};

const sortSidebarNavItems = (items: readonly SidebarNavItem[]): SidebarNavItem[] =>
  [...items].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return ADMIN_NAV_IDS.indexOf(a.id) - ADMIN_NAV_IDS.indexOf(b.id);
  });

const normalizeSidebarNavItems = (items: readonly SidebarNavItem[]): SidebarNavItem[] => {
  const normalized = cloneNavItems(items);
  const hasOrderIssues = getAdminNavOrderIssues(
    normalized.map((item) => ({
      key: item.id,
      order: item.order
    }))
  ).length > 0;

  if (!hasOrderIssues) {
    return sortSidebarNavItems(normalized);
  }

  const usedOrders = new Set<number>();
  const nextItems = normalized.map((item) => ({
    ...item,
    order: claimAvailableOrder(
      usedOrders,
      item.order,
      LEGACY_NAV_ORDER.get(item.id) ?? ADMIN_NAV_IDS.indexOf(item.id) + 1,
      isAdminNavOrderValue,
      ADMIN_NAV_ORDER_MIN,
      ADMIN_NAV_ORDER_MAX
    )
  }));

  return sortSidebarNavItems(nextItems);
};

const normalizeSocialOrderState = (
  presetOrder: Readonly<SiteSocialPresetOrder>,
  customItems: readonly SiteSocialCustomItem[]
): { presetOrder: SiteSocialPresetOrder; customItems: SiteSocialCustomItem[] } => {
  const nextPresetOrder = clonePresetSocialOrder(presetOrder);
  const nextCustomItems = cloneSocialCustomItems(customItems);
  const hasOrderIssues = getAdminSocialOrderIssues(
    nextPresetOrder,
    nextCustomItems.map((item, index) => ({
      key: String(index),
      order: item.order
    }))
  ).length > 0;

  if (!hasOrderIssues) {
    return {
      presetOrder: nextPresetOrder,
      customItems: nextCustomItems
    };
  }

  const usedOrders = new Set<number>();

  ADMIN_SOCIAL_PRESET_IDS.forEach((id) => {
    nextPresetOrder[id] = claimAvailableOrder(
      usedOrders,
      nextPresetOrder[id],
      DEFAULT_PRESET_SOCIAL_ORDER[id],
      isAdminSocialOrderValue,
      ADMIN_SOCIAL_ORDER_MIN,
      ADMIN_SOCIAL_ORDER_MAX
    );
  });

  nextCustomItems.forEach((item, index) => {
    item.order = claimAvailableOrder(
      usedOrders,
      item.order,
      PRESET_SOCIAL_ITEMS.length + index + 1,
      isAdminSocialOrderValue,
      ADMIN_SOCIAL_ORDER_MIN,
      ADMIN_SOCIAL_ORDER_MAX
    );
  });

  return {
    presetOrder: nextPresetOrder,
    customItems: nextCustomItems
  };
};

const parseSidebarNav = (value: unknown): SidebarNavItem[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const merged = new Map<SidebarNavId, SidebarNavItem>(
    LEGACY_NAV.map((item) => [item.id, { ...item }])
  );
  let hasOverride = false;

  for (const row of value) {
    if (!isRecord(row)) continue;
    const id = asNavId(row.id);
    if (!id) continue;
    const current = merged.get(id);
    if (!current) continue;

    const label = asNonEmptyString(row.label) ?? current.label;
    const ornament = asNullableSingleLineString(row.ornament, ADMIN_NAV_ORNAMENT_MAX_LENGTH);
    const visible = asBoolean(row.visible) ?? current.visible;
    const rawOrder = asInteger(row.order);
    const order = rawOrder !== undefined && isAdminNavOrderValue(rawOrder) ? rawOrder : current.order;

    merged.set(id, {
      id,
      label,
      ornament: ornament === undefined ? current.ornament : ornament,
      visible,
      order
    });
    hasOverride = true;
  }

  if (!hasOverride) return undefined;
  return Array.from(merged.values()).sort((a, b) => a.order - b.order);
};

const parseSocialCustomItems = (value: unknown): SiteSocialCustomItem[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalized: SiteSocialCustomItem[] = [];
  const seenIds = new Set<string>();

  for (const [index, row] of value.entries()) {
    if (!isRecord(row)) continue;

    const label = asNonEmptyString(row.label);
    const href = asHttpsUrl(row.href);
    if (!label || !href) continue;

    const baseId = asNonEmptyString(row.id) ?? `custom-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);
    const rawOrder = asInteger(row.order);

    normalized.push({
      id,
      label,
      href,
      iconKey: asSocialIconKey(row.iconKey) ?? 'website',
      visible: asBoolean(row.visible) ?? true,
      order: rawOrder !== undefined && isAdminSocialOrderValue(rawOrder) ? rawOrder : index + 1
    });

    if (normalized.length >= SOCIAL_CUSTOM_LIMIT) break;
  }

  return normalized;
};

const parseHomeIntroLinks = (value: unknown): HomeIntroLinkKey[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalized: HomeIntroLinkKey[] = [];
  const seen = new Set<HomeIntroLinkKey>();

  for (const item of value) {
    const linkKey = asHomeIntroLinkKey(item);
    if (!linkKey || seen.has(linkKey)) continue;
    normalized.push(linkKey);
    seen.add(linkKey);

    if (normalized.length >= ADMIN_HOME_INTRO_LINK_LIMIT) break;
  }

  return normalized.length ? normalized : undefined;
};

const buildResolvedSocialItems = (
  socialLinks: Pick<SiteSocialLinks, 'github' | 'x' | 'email' | 'presetOrder'>,
  customItems: readonly SiteSocialCustomItem[]
): ResolvedSocialItem[] => {
  const presetItems = PRESET_SOCIAL_ITEMS.flatMap((item, index) => {
    const href =
      item.id === 'email'
        ? socialLinks.email
          ? `mailto:${socialLinks.email}`
          : null
        : socialLinks[item.id];

    if (!href) return [];

    return [
      {
        id: item.id,
        label: item.label,
        href,
        iconKey: item.iconKey,
        kind: 'preset' as const,
        visible: true,
        order: socialLinks.presetOrder[item.id],
        sortIndex: index
      }
    ];
  });

  const customResolved = customItems.map((item, index) => ({
    ...item,
    kind: 'custom' as const,
    sortIndex: PRESET_SOCIAL_ITEMS.length + index
  }));

  return [...presetItems, ...customResolved]
    .sort((a, b) => a.order - b.order || a.sortIndex - b.sortIndex)
    .map(({ sortIndex: _sortIndex, ...item }) => item);
};

export const getThemeSettings = (): ThemeSettingsResolved => {
  if (shouldCacheThemeSettings && cachedSettings) return cachedSettings;

  const siteJson = readSettingsObject('site');
  const shellJson = readSettingsObject('shell');
  const homeJson = readSettingsObject('home');
  const pageJson = readSettingsObject('page');
  const uiJson = readSettingsObject('ui');

  const siteFooterJson = isRecord(siteJson?.footer) ? siteJson.footer : undefined;
  const siteAdminOverviewJson = isRecord(siteJson?.adminOverview) ? siteJson.adminOverview : undefined;
  const siteFilingsJson = isRecord(siteJson?.filings) ? siteJson.filings : undefined;
  const siteFilingsIcpJson = isRecord(siteFilingsJson?.icp) ? siteFilingsJson.icp : undefined;
  const siteFilingsPoliceJson = isRecord(siteFilingsJson?.police) ? siteFilingsJson.police : undefined;
  const siteFaviconJson = isRecord(siteJson?.favicon) ? siteJson.favicon : undefined;
  const siteSocialLinksJson = isRecord(siteJson?.socialLinks) ? siteJson.socialLinks : undefined;
  const siteSocialPresetOrderJson = isRecord(siteSocialLinksJson?.presetOrder) ? siteSocialLinksJson.presetOrder : undefined;
  const pageListRssJson = isRecord(pageJson?.listRss) ? pageJson.listRss : undefined;
  const resolveListRss = (key: keyof ListRssSettings) =>
    resolveValue(asBoolean(pageListRssJson?.[key]), undefined, DEFAULT_PAGE.listRss[key]);
  const listRssEnabled = resolveListRss('enabled');
  const listRssBlog = resolveListRss('blog');
  const listRssBits = resolveListRss('bits');
  const listRssArchive = resolveListRss('archive');
  const pageBlogJson = isRecord(pageJson?.blog) ? pageJson.blog : undefined;
  const pageProjectsJson = isRecord(pageJson?.projects) ? pageJson.projects : undefined;
  const pageArchiveJson = isRecord(pageJson?.archive) ? pageJson.archive : undefined;
  const pageBitsJson = isRecord(pageJson?.bits) ? pageJson.bits : undefined;
  const pageBitsDefaultAuthorJson = isRecord(pageBitsJson?.defaultAuthor) ? pageBitsJson.defaultAuthor : undefined;
  const pageDevlogJson = isRecord(pageJson?.devlog) ? pageJson.devlog : undefined;
  const pageAboutJson = isRecord(pageJson?.about) ? pageJson.about : undefined;

  const title = resolveValue(
    asNonEmptyString(siteJson?.title),
    asNonEmptyString(legacySite.title),
    DEFAULT_SITE.title
  );
  const description = resolveValue(
    asNonEmptyString(siteJson?.description),
    asNonEmptyString(legacySite.description),
    DEFAULT_SITE.description
  );
  const defaultLocale = resolveValue(
    asLocale(siteJson?.defaultLocale),
    undefined,
    DEFAULT_SITE.defaultLocale
  );
  const footerCopyright = resolveValue(
    asNonEmptyString(siteFooterJson?.copyright),
    LEGACY_FOOTER_COPYRIGHT,
    DEFAULT_SITE.footer.copyright
  );
  const footerStartYear = resolveValue(
    asFooterStartYear(siteFooterJson?.startYear),
    LEGACY_FOOTER_START_YEAR,
    DEFAULT_SITE.footer.startYear
  );
  const footerShowCurrentYear = resolveValue(
    asBoolean(siteFooterJson?.showCurrentYear),
    LEGACY_FOOTER_SHOW_CURRENT_YEAR,
    DEFAULT_SITE.footer.showCurrentYear
  );
  const siteTitlePercent = resolveValue(
    asSiteTitlePercent(siteJson?.titleMaxPercent),
    undefined,
    DEFAULT_SITE.titleMaxPercent
  );
  const sitePageGap = resolveValue(
    asSitePageGap(siteJson?.pageGapPx),
    undefined,
    DEFAULT_SITE.pageGapPx
  );
  const adminOverviewPublicVisible = resolveValue(
    asBoolean(siteAdminOverviewJson?.publicVisible),
    undefined,
    DEFAULT_SITE.adminOverview.publicVisible
  );
  const adminOverviewHiddenMessage = resolveValue(
    asSingleLineString(siteAdminOverviewJson?.hiddenMessage, ADMIN_OVERVIEW_HIDDEN_MESSAGE_MAX_LENGTH),
    undefined,
    DEFAULT_SITE.adminOverview.hiddenMessage
  );
  const filingsIcpNumber = resolveValue<string | null>(
    asNullableSingleLineString(siteFilingsIcpJson?.number, ADMIN_FILINGS_NUMBER_MAX_LENGTH),
    undefined,
    DEFAULT_SITE.filings.icp.number
  );
  const filingsIcpLink = resolveValue<string | null>(
    asHttpsUrl(siteFilingsIcpJson?.link, ADMIN_ICP_FILING_HOSTS),
    undefined,
    DEFAULT_SITE.filings.icp.link
  );
  const filingsPoliceNumber = resolveValue<string | null>(
    asNullableSingleLineString(siteFilingsPoliceJson?.number, ADMIN_FILINGS_NUMBER_MAX_LENGTH),
    undefined,
    DEFAULT_SITE.filings.police.number
  );
  const filingsPoliceLink = resolveValue<string | null>(
    asHttpsUrl(siteFilingsPoliceJson?.link, ADMIN_POLICE_FILING_HOSTS),
    undefined,
    DEFAULT_SITE.filings.police.link
  );
  const filingsPoliceIcon = resolveValue<string | null>(
    normalizeSiteFilingIconPath(siteFilingsPoliceJson?.icon),
    undefined,
    DEFAULT_SITE.filings.police.icon
  );
  const faviconSvg = resolveValue<string | null>(
    asSiteFaviconPath('svg', siteFaviconJson?.svg),
    undefined,
    DEFAULT_SITE.favicon.svg
  );
  const faviconPng = resolveValue<string | null>(
    asSiteFaviconPath('png', siteFaviconJson?.png),
    undefined,
    DEFAULT_SITE.favicon.png
  );
  const faviconAppleTouchIcon = resolveValue<string | null>(
    asSiteFaviconPath('appleTouchIcon', siteFaviconJson?.appleTouchIcon),
    undefined,
    DEFAULT_SITE.favicon.appleTouchIcon
  );
  const socialLinksGithub = resolveValue(
    asHttpsUrl(siteSocialLinksJson?.github, GITHUB_HOSTS),
    LEGACY_SOCIAL_LINKS.github,
    DEFAULT_SITE.socialLinks.github
  );
  const socialLinksX = resolveValue(
    asHttpsUrl(siteSocialLinksJson?.x, X_HOSTS),
    LEGACY_SOCIAL_LINKS.x,
    DEFAULT_SITE.socialLinks.x
  );
  const socialLinksEmail = resolveValue(
    asEmailAddress(siteSocialLinksJson?.email),
    LEGACY_SOCIAL_LINKS.email,
    DEFAULT_SITE.socialLinks.email
  );
  const socialLinksGithubOrder = resolveValue(
    asPresetSocialOrderValue(siteSocialPresetOrderJson?.github),
    LEGACY_SOCIAL_LINKS.presetOrder.github,
    DEFAULT_SITE.socialLinks.presetOrder.github
  );
  const socialLinksXOrder = resolveValue(
    asPresetSocialOrderValue(siteSocialPresetOrderJson?.x),
    LEGACY_SOCIAL_LINKS.presetOrder.x,
    DEFAULT_SITE.socialLinks.presetOrder.x
  );
  const socialLinksEmailOrder = resolveValue(
    asPresetSocialOrderValue(siteSocialPresetOrderJson?.email),
    LEGACY_SOCIAL_LINKS.presetOrder.email,
    DEFAULT_SITE.socialLinks.presetOrder.email
  );
  const socialLinksCustom = resolveValue(
    parseSocialCustomItems(siteSocialLinksJson?.custom),
    undefined,
    DEFAULT_SITE.socialLinks.custom
  );

  const brandTitle = resolveValue(
    asNonEmptyString(shellJson?.brandTitle),
    asNonEmptyString(legacySite.brandTitle),
    DEFAULT_SHELL.brandTitle
  );
  // 窄屏标题与侧栏站点名同组：空 / 全空白与非字符串视为未设置，回落 null 由渲染层接 `brandTitle`。
  // siteJson 的同名键是旧位置，作为兼容来源保留。
  const titleNarrow = resolveValue<string | null>(
    asNonEmptyString(shellJson?.titleNarrow),
    asNonEmptyString(siteJson?.titleNarrow),
    DEFAULT_SHELL.titleNarrow
  );
  const quote = resolveValue(
    asNonEmptyString(shellJson?.quote),
    LEGACY_QUOTE,
    DEFAULT_SHELL.quote
  );
  const nav = resolveValue(
    parseSidebarNav(shellJson?.nav),
    cloneNavItems(LEGACY_NAV),
    cloneNavItems(DEFAULT_SHELL.nav)
  );

  const introLead = resolveValue(
    asNonEmptyString(homeJson?.introLead),
    LEGACY_INTRO_LEAD,
    DEFAULT_HOME.introLead
  );
  const introMore = resolveValue(
    asNonEmptyString(homeJson?.introMore),
    LEGACY_INTRO_MORE,
    DEFAULT_HOME.introMore
  );
  const introMoreLinks = resolveValue(
    parseHomeIntroLinks(homeJson?.introMoreLinks),
    undefined,
    cloneHomeIntroLinks(DEFAULT_HOME.introMoreLinks)
  );
  const showIntroLead = resolveValue(
    asBoolean(homeJson?.showIntroLead),
    undefined,
    DEFAULT_HOME.showIntroLead
  );
  const showIntroMore = resolveValue(
    asBoolean(homeJson?.showIntroMore),
    undefined,
    DEFAULT_HOME.showIntroMore
  );
  const heroPresetId = resolveValue(
    asHeroPresetId(homeJson?.heroPresetId),
    DEFAULT_HOME.heroPresetId,
    DEFAULT_HOME.heroPresetId
  );
  const heroImageSrc = resolveValue<string | null>(
    asHeroImageSrc(homeJson?.heroImageSrc),
    undefined,
    DEFAULT_HOME.heroImageSrc
  );
  const heroImageAlt = resolveValue(
    asSingleLineString(homeJson?.heroImageAlt, ADMIN_HERO_IMAGE_ALT_MAX_LENGTH),
    undefined,
    DEFAULT_HOME.heroImageAlt
  );

  const BlogTitle = resolveValue(
    asNullableString(pageBlogJson?.title),
    undefined,
    DEFAULT_PAGE.blog.title
  );
  const BlogSubtitle = resolveValue(
    asNullableString(pageBlogJson?.subtitle),
    LEGACY_BLOG_SUBTITLE,
    DEFAULT_PAGE.blog.subtitle
  );
  const projectsTitle = resolveValue(
    asNullableString(pageProjectsJson?.title),
    undefined,
    DEFAULT_PAGE.projects.title
  );
  const projectsSubtitle = resolveValue<string | null>(
    asNullableString(pageProjectsJson?.subtitle),
    undefined,
    DEFAULT_PAGE.projects.subtitle
  );
  const archiveTitle = resolveValue(
    asNullableString(pageArchiveJson?.title),
    undefined,
    DEFAULT_PAGE.archive.title
  );
  const archiveSubtitle = resolveValue(
    asNullableString(pageArchiveJson?.subtitle),
    undefined,
    DEFAULT_PAGE.archive.subtitle
  );
  const bitsTitle = resolveValue(
    asNullableString(pageBitsJson?.title),
    undefined,
    DEFAULT_PAGE.bits.title
  );
  const bitsSubtitle = resolveValue(
    asNullableString(pageBitsJson?.subtitle),
    LEGACY_BITS_SUBTITLE,
    DEFAULT_PAGE.bits.subtitle
  );
  const bitsDefaultAuthorName = resolveValue(
    asNonEmptyString(pageBitsDefaultAuthorJson?.name),
    asNonEmptyString(legacySite.author),
    DEFAULT_PAGE.bits.defaultAuthor.name
  );
  const bitsDefaultAuthorAvatar = resolveValue(
    asBitsAvatarPath(pageBitsDefaultAuthorJson?.avatar),
    asBitsAvatarPath(legacySite.authorAvatar),
    DEFAULT_PAGE.bits.defaultAuthor.avatar
  );
  const devlogTitle = resolveValue(
    asNullableString(pageDevlogJson?.title),
    undefined,
    DEFAULT_PAGE.devlog.title
  );
  const devlogSubtitle = resolveValue<string | null>(
    asNullableString(pageDevlogJson?.subtitle),
    undefined,
    DEFAULT_PAGE.devlog.subtitle
  );
  const aboutTitle = resolveValue(
    asNullableString(pageAboutJson?.title),
    undefined,
    DEFAULT_PAGE.about.title
  );
  const aboutSubtitle = resolveValue<string | null>(
    asNullableString(pageAboutJson?.subtitle),
    undefined,
    DEFAULT_PAGE.about.subtitle
  );

  const uiCodeBlock = isRecord(uiJson?.codeBlock) ? uiJson.codeBlock : undefined;
  const uiReadingMode = isRecord(uiJson?.readingMode) ? uiJson.readingMode : undefined;
  const uiFloatStack = isRecord(uiJson?.floatStack) ? uiJson.floatStack : undefined;
  const uiViewStats = isRecord(uiJson?.viewStats) ? uiJson.viewStats : undefined;
  const uiSidebarActions = isRecord(uiJson?.sidebarActions) ? uiJson.sidebarActions : undefined;
  const uiArticleMeta = isRecord(uiJson?.articleMeta) ? uiJson.articleMeta : undefined;
  const uiLayout = isRecord(uiJson?.layout) ? uiJson.layout : undefined;
  const uiTypography = isRecord(uiJson?.typography) ? uiJson.typography : undefined;

  const showLineNumbers = resolveValue(
    asBoolean(uiCodeBlock?.showLineNumbers),
    DEFAULT_UI.codeBlock.showLineNumbers,
    DEFAULT_UI.codeBlock.showLineNumbers
  );
  const showReadingEntry = resolveValue(
    asBoolean(uiReadingMode?.showEntry),
    DEFAULT_UI.readingMode.showEntry,
    DEFAULT_UI.readingMode.showEntry
  );
  const showResumeReading = resolveValue(
    asBoolean(uiFloatStack?.showResumeReading),
    DEFAULT_UI.floatStack.showResumeReading,
    DEFAULT_UI.floatStack.showResumeReading
  );
  const showScrollTop = resolveValue(
    asBoolean(uiFloatStack?.showScrollTop),
    DEFAULT_UI.floatStack.showScrollTop,
    DEFAULT_UI.floatStack.showScrollTop
  );
  const showViewStatsPv = resolveValue(
    asBoolean(uiViewStats?.showPv),
    DEFAULT_UI.viewStats.showPv,
    DEFAULT_UI.viewStats.showPv
  );
  const viewStatsPvLabel = resolveValue(
    asTrimmedSingleLineString(uiViewStats?.pvLabel, ADMIN_VIEW_STATS_LABEL_MAX_LENGTH),
    undefined,
    DEFAULT_UI.viewStats.pvLabel
  );
  const showViewStatsUv = resolveValue(
    asBoolean(uiViewStats?.showUv),
    DEFAULT_UI.viewStats.showUv,
    DEFAULT_UI.viewStats.showUv
  );
  const viewStatsUvLabel = resolveValue(
    asTrimmedSingleLineString(uiViewStats?.uvLabel, ADMIN_VIEW_STATS_LABEL_MAX_LENGTH),
    undefined,
    DEFAULT_UI.viewStats.uvLabel
  );
  const viewStatsOnArticleMeta = resolveValue(
    asBoolean(uiViewStats?.onArticleMeta),
    DEFAULT_UI.viewStats.onArticleMeta,
    DEFAULT_UI.viewStats.onArticleMeta
  );
  const viewStatsOnIndexPages = resolveValue(
    asBoolean(uiViewStats?.onIndexPages),
    DEFAULT_UI.viewStats.onIndexPages,
    DEFAULT_UI.viewStats.onIndexPages
  );
  const showRssLink = resolveValue(
    asBoolean(uiSidebarActions?.showRssLink),
    undefined,
    DEFAULT_UI.sidebarActions.showRssLink
  );
  const showThemeToggle = resolveValue(
    asBoolean(uiSidebarActions?.showThemeToggle),
    undefined,
    DEFAULT_UI.sidebarActions.showThemeToggle
  );
  const showAdminEntry = resolveValue(
    asBoolean(uiSidebarActions?.showAdminEntry),
    undefined,
    DEFAULT_UI.sidebarActions.showAdminEntry
  );
  const showArticleDate = resolveValue(
    asBoolean(uiArticleMeta?.showDate),
    undefined,
    DEFAULT_UI.articleMeta.showDate
  );
  const articleDateLabel = resolveValue(
    asTrimmedSingleLineString(uiArticleMeta?.dateLabel, ADMIN_ARTICLE_META_DATE_LABEL_MAX_LENGTH),
    undefined,
    DEFAULT_UI.articleMeta.dateLabel
  );
  const showArticleTags = resolveValue(
    asBoolean(uiArticleMeta?.showTags),
    undefined,
    DEFAULT_UI.articleMeta.showTags
  );
  const showArticleWordCount = resolveValue(
    asBoolean(uiArticleMeta?.showWordCount),
    undefined,
    DEFAULT_UI.articleMeta.showWordCount
  );
  const showArticleReadingTime = resolveValue(
    asBoolean(uiArticleMeta?.showReadingTime),
    undefined,
    DEFAULT_UI.articleMeta.showReadingTime
  );
  const sidebarDivider = resolveValue(
    asSidebarDividerVariant(uiLayout?.sidebarDivider),
    undefined,
    DEFAULT_UI.layout.sidebarDivider
  );
  const typographyReadable = resolveValue(
    asTypographyFontId('readable', uiTypography?.readable),
    undefined,
    DEFAULT_UI.typography.readable
  );
  const typographyCopy = resolveValue(
    asTypographyFontId('copy', uiTypography?.copy),
    undefined,
    DEFAULT_UI.typography.copy
  );
  const typographyMono = resolveValue(
    asTypographyFontId('mono', uiTypography?.mono),
    undefined,
    DEFAULT_UI.typography.mono
  );
  const typographyBrand = resolveValue(
    asTypographyFontId('brand', uiTypography?.brand),
    undefined,
    DEFAULT_UI.typography.brand
  );

  const normalizedNav = normalizeSidebarNavItems(nav.value);
  const normalizedSocialOrderState = normalizeSocialOrderState(
    {
      github: socialLinksGithubOrder.value,
      x: socialLinksXOrder.value,
      email: socialLinksEmailOrder.value
    },
    socialLinksCustom.value
  );
  const customSocialItems = cloneSocialCustomItems(normalizedSocialOrderState.customItems);
  const presetSocialOrder = clonePresetSocialOrder(normalizedSocialOrderState.presetOrder);
  const resolvedSocialItems = buildResolvedSocialItems(
    {
      github: socialLinksGithub.value,
      x: socialLinksX.value,
      email: socialLinksEmail.value,
      presetOrder: presetSocialOrder
    },
    customSocialItems
  );

  const resolved: ThemeSettingsResolved = {
    settings: {
      site: {
        title: title.value,
        description: description.value,
        defaultLocale: defaultLocale.value,
        titleMaxPercent: siteTitlePercent.value,
        pageGapPx: sitePageGap.value,
        footer: {
          startYear: footerStartYear.value,
          showCurrentYear: footerShowCurrentYear.value,
          copyright: footerCopyright.value
        },
        adminOverview: {
          publicVisible: adminOverviewPublicVisible.value,
          hiddenMessage: adminOverviewHiddenMessage.value
        },
        filings: {
          icp: {
            number: filingsIcpNumber.value,
            link: filingsIcpLink.value
          },
          police: {
            number: filingsPoliceNumber.value,
            link: filingsPoliceLink.value,
            icon: filingsPoliceIcon.value
          }
        },
        favicon: {
          svg: faviconSvg.value,
          png: faviconPng.value,
          appleTouchIcon: faviconAppleTouchIcon.value
        },
        socialLinks: {
          github: socialLinksGithub.value,
          x: socialLinksX.value,
          email: socialLinksEmail.value,
          presetOrder: clonePresetSocialOrder(presetSocialOrder),
          custom: cloneSocialCustomItems(customSocialItems),
          resolvedSocialItems: cloneResolvedSocialItems(resolvedSocialItems)
        }
      },
      shell: {
        brandTitle: brandTitle.value,
        titleNarrow: titleNarrow.value,
        quote: quote.value,
        nav: cloneNavItems(normalizedNav)
      },
      home: {
        introLead: introLead.value,
        introMore: introMore.value,
        introMoreLinks: cloneHomeIntroLinks(introMoreLinks.value),
        showIntroLead: showIntroLead.value,
        showIntroMore: showIntroMore.value,
        heroPresetId: heroPresetId.value,
        heroImageSrc: heroImageSrc.value,
        heroImageAlt: heroImageAlt.value
      },
      page: {
        blog: {
          title: BlogTitle.value,
          subtitle: BlogSubtitle.value
        },
        projects: {
          title: projectsTitle.value,
          subtitle: projectsSubtitle.value
        },
        archive: {
          title: archiveTitle.value,
          subtitle: archiveSubtitle.value
        },
        bits: {
          title: bitsTitle.value,
          subtitle: bitsSubtitle.value,
          defaultAuthor: {
            name: bitsDefaultAuthorName.value,
            avatar: bitsDefaultAuthorAvatar.value
          }
        },
        devlog: {
          title: devlogTitle.value,
          subtitle: devlogSubtitle.value
        },
        about: {
          title: aboutTitle.value,
          subtitle: aboutSubtitle.value
        },
        listRss: {
          enabled: listRssEnabled.value,
          blog: listRssBlog.value,
          bits: listRssBits.value,
          archive: listRssArchive.value
        }
      },
      ui: {
        codeBlock: {
          showLineNumbers: showLineNumbers.value
        },
        readingMode: {
          showEntry: showReadingEntry.value
        },
        floatStack: {
          showResumeReading: showResumeReading.value,
          showScrollTop: showScrollTop.value
        },
        viewStats: {
          showPv: showViewStatsPv.value,
          pvLabel: viewStatsPvLabel.value,
          showUv: showViewStatsUv.value,
          uvLabel: viewStatsUvLabel.value,
          onArticleMeta: viewStatsOnArticleMeta.value,
          onIndexPages: viewStatsOnIndexPages.value
        },
        sidebarActions: {
          showRssLink: showRssLink.value,
          showThemeToggle: showThemeToggle.value,
          showAdminEntry: showAdminEntry.value
        },
        articleMeta: {
          showDate: showArticleDate.value,
          dateLabel: articleDateLabel.value,
          showTags: showArticleTags.value,
          showWordCount: showArticleWordCount.value,
          showReadingTime: showArticleReadingTime.value
        },
        layout: {
          sidebarDivider: sidebarDivider.value
        },
        typography: {
          readable: typographyReadable.value,
          copy: typographyCopy.value,
          mono: typographyMono.value,
          brand: typographyBrand.value
        }
      }
    },
    sources: {
      site: {
        title: title.source,
        description: description.source,
        defaultLocale: defaultLocale.source,
        footerStartYear: footerStartYear.source,
        footerShowCurrentYear: footerShowCurrentYear.source,
        footerCopyright: footerCopyright.source,
        adminOverviewPublicVisible: adminOverviewPublicVisible.source,
        adminOverviewHiddenMessage: adminOverviewHiddenMessage.source,
        filingsIcpNumber: filingsIcpNumber.source,
        filingsIcpLink: filingsIcpLink.source,
        filingsPoliceNumber: filingsPoliceNumber.source,
        filingsPoliceLink: filingsPoliceLink.source,
        filingsPoliceIcon: filingsPoliceIcon.source,
        faviconSvg: faviconSvg.source,
        faviconPng: faviconPng.source,
        faviconAppleTouchIcon: faviconAppleTouchIcon.source,
        socialLinksGithub: socialLinksGithub.source,
        socialLinksX: socialLinksX.source,
        socialLinksEmail: socialLinksEmail.source,
        socialLinksGithubOrder: socialLinksGithubOrder.source,
        socialLinksXOrder: socialLinksXOrder.source,
        socialLinksEmailOrder: socialLinksEmailOrder.source,
        socialLinksCustom: socialLinksCustom.source
      },
      shell: {
        brandTitle: brandTitle.source,
        titleNarrow: titleNarrow.source,
        quote: quote.source,
        nav: nav.source
      },
      home: {
        introLead: introLead.source,
        introMore: introMore.source,
        introMoreLinks: introMoreLinks.source,
        showIntroLead: showIntroLead.source,
        showIntroMore: showIntroMore.source,
        heroPresetId: heroPresetId.source,
        heroImageSrc: heroImageSrc.source,
        heroImageAlt: heroImageAlt.source
      },
      page: {
        BlogTitle: BlogTitle.source,
        BlogSubtitle: BlogSubtitle.source,
        projectsTitle: projectsTitle.source,
        projectsSubtitle: projectsSubtitle.source,
        archiveTitle: archiveTitle.source,
        archiveSubtitle: archiveSubtitle.source,
        bitsTitle: bitsTitle.source,
        bitsSubtitle: bitsSubtitle.source,
        bitsDefaultAuthorName: bitsDefaultAuthorName.source,
        bitsDefaultAuthorAvatar: bitsDefaultAuthorAvatar.source,
        devlogTitle: devlogTitle.source,
        devlogSubtitle: devlogSubtitle.source,
        aboutTitle: aboutTitle.source,
        aboutSubtitle: aboutSubtitle.source
      },
      ui: {
        codeBlockShowLineNumbers: showLineNumbers.source,
        readingModeShowEntry: showReadingEntry.source,
        floatStackShowResumeReading: showResumeReading.source,
        floatStackShowScrollTop: showScrollTop.source,
        viewStatsShowPv: showViewStatsPv.source,
        viewStatsPvLabel: viewStatsPvLabel.source,
        viewStatsShowUv: showViewStatsUv.source,
        viewStatsUvLabel: viewStatsUvLabel.source,
        viewStatsOnArticleMeta: viewStatsOnArticleMeta.source,
        viewStatsOnIndexPages: viewStatsOnIndexPages.source,
        sidebarActionsShowRssLink: showRssLink.source,
        sidebarActionsShowThemeToggle: showThemeToggle.source,
        sidebarActionsShowAdminEntry: showAdminEntry.source,
        articleMetaShowDate: showArticleDate.source,
        articleMetaDateLabel: articleDateLabel.source,
        articleMetaShowTags: showArticleTags.source,
        articleMetaShowWordCount: showArticleWordCount.source,
        articleMetaShowReadingTime: showArticleReadingTime.source,
        layoutSidebarDivider: sidebarDivider.source,
        typographyReadable: typographyReadable.source,
        typographyCopy: typographyCopy.source,
        typographyMono: typographyMono.source,
        typographyBrand: typographyBrand.source
      }
    }
  };

  // DEV 下关闭模块级缓存，避免手改 settings JSON 或切分支后继续读到旧值。
  if (shouldCacheThemeSettings) {
    cachedSettings = resolved;
  }
  return resolved;
};

export const toEditableThemeSettingsPayload = (
  resolved: ThemeSettingsResolved
): ThemeSettingsEditablePayload => {
  const snapshot = buildEditableThemeSettingsSnapshot(resolved);

  return {
    revision: hashEditableThemeSettingsSnapshot(snapshot),
    settings: snapshot,
    sources: cloneThemeSettingsSources(resolved.sources)
  };
};

const canonicalizeEditableThemeSettingsSnapshot = (
  snapshot: EditableThemeSettingsSnapshot
): EditableThemeSettingsSnapshot =>
  canonicalizeAdminThemeSettings(snapshot, {
    footerStartYearMax: getAdminFooterStartYearMax()
  });

const buildEditableThemeSettingsSnapshot = (
  resolved: ThemeSettingsResolved
): EditableThemeSettingsSnapshot =>
  canonicalizeEditableThemeSettingsSnapshot({
    site: {
      title: resolved.settings.site.title,
      description: resolved.settings.site.description,
      defaultLocale: resolved.settings.site.defaultLocale,
      titleMaxPercent: resolved.settings.site.titleMaxPercent,
      pageGapPx: resolved.settings.site.pageGapPx,
      footer: {
        ...resolved.settings.site.footer
      },
      adminOverview: {
        ...resolved.settings.site.adminOverview
      },
      filings: {
        icp: { ...resolved.settings.site.filings.icp },
        police: { ...resolved.settings.site.filings.police }
      },
      favicon: {
        ...resolved.settings.site.favicon
      },
      socialLinks: {
        github: resolved.settings.site.socialLinks.github,
        x: resolved.settings.site.socialLinks.x,
        email: resolved.settings.site.socialLinks.email,
        presetOrder: clonePresetSocialOrder(resolved.settings.site.socialLinks.presetOrder),
        custom: cloneSocialCustomItems(resolved.settings.site.socialLinks.custom)
      }
    },
    shell: {
      brandTitle: resolved.settings.shell.brandTitle,
      titleNarrow: resolved.settings.shell.titleNarrow,
      quote: resolved.settings.shell.quote,
      nav: cloneNavItems(resolved.settings.shell.nav)
    },
    home: {
      ...resolved.settings.home,
      introMoreLinks: cloneHomeIntroLinks(resolved.settings.home.introMoreLinks)
    },
    page: {
      listRss: { ...resolved.settings.page.listRss },
      blog: { ...resolved.settings.page.blog },
      projects: { ...resolved.settings.page.projects },
      archive: { ...resolved.settings.page.archive },
      bits: {
        title: resolved.settings.page.bits.title,
        subtitle: resolved.settings.page.bits.subtitle,
        defaultAuthor: {
          ...resolved.settings.page.bits.defaultAuthor
        }
      },
      devlog: { ...resolved.settings.page.devlog },
      about: { ...resolved.settings.page.about }
    },
    ui: {
      codeBlock: { ...resolved.settings.ui.codeBlock },
      readingMode: { ...resolved.settings.ui.readingMode },
      floatStack: { ...resolved.settings.ui.floatStack },
      viewStats: { ...resolved.settings.ui.viewStats },
      sidebarActions: { ...resolved.settings.ui.sidebarActions },
      articleMeta: { ...resolved.settings.ui.articleMeta },
      layout: { ...resolved.settings.ui.layout },
      typography: { ...resolved.settings.ui.typography }
    }
  });

const hashEditableThemeSettingsSnapshot = (snapshot: EditableThemeSettingsSnapshot): string => {
  const hash = createHash('sha1');
  hash.update(JSON.stringify(snapshot));
  return hash.digest('hex');
};

export const getEditableThemeSettingsPayload = (
  resolved: ThemeSettingsResolved = getThemeSettings()
): ThemeSettingsEditablePayload => toEditableThemeSettingsPayload(resolved);

export const getEditableThemeSettingsState = (
  resolved?: ThemeSettingsResolved
): ThemeSettingsEditableState => {
  const currentResolved = resolved ?? getThemeSettings();
  const diagnostics = getThemeSettingsReadDiagnostics(currentResolved);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      mode: 'invalid-settings',
      message: THEME_SETTINGS_INVALID_MESSAGE,
      errors: diagnostics.map((diagnostic) => diagnostic.message),
      diagnostics
    };
  }

  return {
    ok: true,
    payload: getEditableThemeSettingsPayload(currentResolved)
  };
};

export const resetThemeSettingsCache = (): void => {
  cachedSettings = null;
};

// 文件缺失的槽位按主题默认回退（渲染兜底，不阻断构建、不锁后台）。抑制只发生在标签页图标组
// （svg/png）内部：自定义后继续输出默认 SVG 会让桌面浏览器优先选中默认图标；触摸图标与其不竞争，独立回退。
const resolveRenderableFaviconPath = (value: string | null): string | null => {
  if (!value) return null;
  const projectRoot = process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();
  return existsSync(join(projectRoot, ...getSiteFaviconLocalFilePath(value).split('/'))) ? value : null;
};

export const getSiteFaviconLinks = (favicon: SiteFaviconSettings): SiteFaviconLink[] => {
  const svg = resolveRenderableFaviconPath(favicon.svg);
  const png = resolveRenderableFaviconPath(favicon.png);
  const appleTouchIcon = resolveRenderableFaviconPath(favicon.appleTouchIcon);

  const links: SiteFaviconLink[] = [];
  if (!svg && !png) {
    links.push(
      { rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: 'favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: 'favicon-32x32.png' }
    );
  } else {
    if (svg) {
      links.push({ rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: svg });
    }
    if (png) {
      const sizes = getSiteFaviconSizesFromPath(png);
      links.push({ rel: 'icon', type: 'image/png', ...(sizes ? { sizes } : {}), href: png });
    }
  }

  if (appleTouchIcon) {
    const sizes = getSiteFaviconSizesFromPath(appleTouchIcon);
    links.push({ rel: 'apple-touch-icon', ...(sizes ? { sizes } : {}), href: appleTouchIcon });
  } else {
    links.push({ rel: 'apple-touch-icon', sizes: '180x180', href: 'apple-touch-icon.png' });
  }
  return links;
};

/**
 * 备案图标：https 外链原样返回；public 相对路径仅在文件存在时返回，防止输出裂图。
 */
export const getSiteFilingIcon = (
  icon: string | null
): { href: string; external: boolean } | null => {
  if (!icon) return null;
  if (/^https:\/\//i.test(icon)) return { href: icon, external: true };

  const projectRoot = process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();
  const exists = existsSync(join(projectRoot, ...getSiteFilingIconLocalFilePath(icon).split('/')));
  return exists ? { href: icon, external: false } : null;
};

export const getSidebarHref = (id: SidebarNavId): string => SIDEBAR_HREFS[id];
