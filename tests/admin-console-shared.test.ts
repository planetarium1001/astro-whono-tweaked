import { describe, expect, it } from 'vitest';
import {
  canonicalizeAdminThemeSettings,
  createAdminThemeSettingsCanonicalMismatchIssues,
  fillAdminThemeSettingsCompatibilityDefaults,
  getAdminNavOrderIssues,
  getAdminSocialOrderIssues,
  validateAdminThemeSettings
} from '../src/lib/admin-console/shared';
import {
  getAdminImageFieldPreviewSrc,
  getAdminRenderedImagePreviewSrc
} from '../src/lib/admin-console/image-params';
import { ADMIN_SITE_TITLE_MAX_LENGTH } from '../src/lib/admin-console/theme-shared';
import { getEditableThemeSettingsPayload, type EditableThemeSettings } from '../src/lib/theme-settings';
import {
  buildSearchHaystack,
  getBitsAvatarLocalFilePath,
  getHeroImageLocalFilePath,
  getSiteFaviconLocalFilePath,
  getSiteFaviconSizesFromPath,
  normalizeBitsAvatarPath,
  normalizeHeroImageSrc,
  normalizeSiteFaviconPath,
  tokenizeSearchQuery
} from '../src/utils/format';

describe('admin-console/shared', () => {
  it('reports duplicate and range issues for social orders', () => {
    expect(
      getAdminSocialOrderIssues(
        { github: 1, x: 1, email: 99 },
        [{ key: 'custom-1', order: 2 }, { key: 'custom-2', order: 2 }]
      )
    ).toEqual([
      { type: 'duplicate', scope: 'preset', key: 'github', order: 1 },
      { type: 'duplicate', scope: 'preset', key: 'x', order: 1 },
      { type: 'range', scope: 'preset', key: 'email', order: 99 },
      { type: 'duplicate', scope: 'custom', key: 'custom-1', order: 2 },
      { type: 'duplicate', scope: 'custom', key: 'custom-2', order: 2 }
    ]);
  });

  it('reports duplicate and range issues for nav orders', () => {
    expect(
      getAdminNavOrderIssues([
        { key: 'blog', order: 1 },
        { key: 'bits', order: 1 },
        { key: 'about', order: 0 }
      ])
    ).toEqual([
      { type: 'duplicate', key: 'blog', order: 1 },
      { type: 'duplicate', key: 'bits', order: 1 },
      { type: 'range', key: 'about', order: 0 }
    ]);
  });

  it('normalizes valid hero image sources and rejects invalid local paths', () => {
    expect(normalizeHeroImageSrc('@/assets/hero/cover.webp')).toBe('src/assets/hero/cover.webp');
    expect(normalizeHeroImageSrc('public/images/hero.png')).toBe('/images/hero.png');
    expect(normalizeHeroImageSrc('https://example.com/hero.avif')).toBe('https://example.com/hero.avif');
    expect(normalizeHeroImageSrc('/images/hero.png?size=2')).toBeUndefined();
    expect(normalizeHeroImageSrc('../hero.png')).toBeUndefined();
    expect(getHeroImageLocalFilePath('src/assets/hero/cover.webp')).toBe('src/assets/hero/cover.webp');
    expect(getHeroImageLocalFilePath('/images/hero.png')).toBe('public/images/hero.png');
  });

  it('normalizes bits avatar paths and rejects invalid values', () => {
    expect(normalizeBitsAvatarPath(' author/avatar.webp ')).toBe('author/avatar.webp');
    expect(normalizeBitsAvatarPath('')).toBe('');
    expect(normalizeBitsAvatarPath('/author/avatar.webp')).toBeUndefined();
    expect(normalizeBitsAvatarPath('public/author/avatar.webp')).toBeUndefined();
    expect(normalizeBitsAvatarPath('https://example.com/avatar.webp')).toBeUndefined();
    expect(normalizeBitsAvatarPath('author/avatar.webp?v=2')).toBeUndefined();
    expect(getBitsAvatarLocalFilePath('author/avatar.webp')).toBe('public/author/avatar.webp');
  });

  it('normalizes site favicon paths per slot and parses sizes from file names', () => {
    expect(normalizeSiteFaviconPath('png', 'public/images/site/favicon-64x64-a1b2c3d4.png')).toBe(
      '/images/site/favicon-64x64-a1b2c3d4.png'
    );
    expect(normalizeSiteFaviconPath('png', ' /favicon-32x32.png ')).toBe('/favicon-32x32.png');
    expect(normalizeSiteFaviconPath('svg', '/favicon.svg')).toBe('/favicon.svg');
    expect(normalizeSiteFaviconPath('png', null)).toBeNull();
    expect(normalizeSiteFaviconPath('png', '')).toBeNull();
    expect(normalizeSiteFaviconPath('png', '/favicon.svg')).toBeUndefined();
    expect(normalizeSiteFaviconPath('svg', '/favicon.png')).toBeUndefined();
    expect(normalizeSiteFaviconPath('png', 'https://example.com/favicon.png')).toBeUndefined();
    expect(normalizeSiteFaviconPath('png', '/images/site/../secret.png')).toBeUndefined();
    expect(normalizeSiteFaviconPath('png', '/favicon.png?v=2')).toBeUndefined();
    expect(getSiteFaviconLocalFilePath('/images/site/favicon-64x64-a1b2c3d4.png')).toBe(
      'public/images/site/favicon-64x64-a1b2c3d4.png'
    );
    expect(getSiteFaviconSizesFromPath('/images/site/favicon-64x64-a1b2c3d4.png')).toBe('64x64');
    expect(getSiteFaviconSizesFromPath('/favicon-32x32.png')).toBe('32x32');
    expect(getSiteFaviconSizesFromPath('/images/site/favicon-a1b2c3d4.svg')).toBeNull();
  });

  it('normalizes admin image field preview sources through field contracts', () => {
    expect(getAdminImageFieldPreviewSrc('bits.images', 'bits/demo.webp', '/blog/')).toBe('/blog/bits/demo.webp');
    expect(getAdminImageFieldPreviewSrc('bits.images', 'https://example.com/demo.webp')).toBe(
      'https://example.com/demo.webp'
    );
    expect(getAdminImageFieldPreviewSrc('bits.images', 'http://example.com/demo.webp')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('bits.images', 'data:image/png;base64,demo.png')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('bits.images', '//example.com/demo.webp')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('bits.images', '../demo.webp')).toBeNull();

    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', '/images/hero.png', '/blog/')).toBe('/blog/images/hero.png');
    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', 'src/assets/hero.png')).toBeNull();
    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', 'https://example.com/hero.webp')).toBe(
      'https://example.com/hero.webp'
    );
    expect(getAdminImageFieldPreviewSrc('home.heroImageSrc', 'http://example.com/hero.webp')).toBeNull();

    expect(getAdminImageFieldPreviewSrc('page.bits.defaultAuthor.avatar', 'author/avatar.svg', '/blog/')).toBe(
      '/blog/author/avatar.svg'
    );
  });

  it('normalizes rendered admin image preview sources before assigning img src', () => {
    expect(getAdminRenderedImagePreviewSrc('/_astro/hero.hash.png', '/blog/')).toBe('/blog/_astro/hero.hash.png');
    expect(getAdminRenderedImagePreviewSrc('/_astro/hero.hash.png?origWidth=1200&origHeight=800', '/blog/')).toBe(
      '/blog/_astro/hero.hash.png?origWidth=1200&origHeight=800'
    );
    expect(getAdminRenderedImagePreviewSrc('/blog/_astro/hero.hash.png', '/blog/')).toBe('/blog/_astro/hero.hash.png');
    expect(getAdminRenderedImagePreviewSrc('/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png')).toBe(
      '/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png'
    );
    expect(getAdminRenderedImagePreviewSrc('/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png?origWidth=1200')).toBe(
      '/@fs/D:/Server-Related/dev/astro-whono/src/assets/hero.png?origWidth=1200'
    );
    expect(getAdminRenderedImagePreviewSrc('https://example.com/hero.webp')).toBe('https://example.com/hero.webp');
    expect(getAdminRenderedImagePreviewSrc('http://example.com/hero.webp')).toBeNull();
    expect(getAdminRenderedImagePreviewSrc('data:image/png;base64,hero.png')).toBeNull();
    expect(getAdminRenderedImagePreviewSrc('//example.com/hero.webp')).toBeNull();
    expect(getAdminRenderedImagePreviewSrc('/_astro/hero.hash.png#preview')).toBeNull();
  });

  it('tokenizes search query and builds normalized haystack text', () => {
    expect(tokenizeSearchQuery(' Astro   主题  astro ')).toEqual(['astro', '主题']);
    expect(
      buildSearchHaystack([' Title ', ' Description ', ['TagA', ' TagB '], '', null, 'Body'])
    ).toBe('title description taga tagb body');
  });

  it('canonicalizes admin settings snapshots and reports contract mismatches', () => {
    const raw = structuredClone(getEditableThemeSettingsPayload().settings) as Record<string, any>;
    raw.site.title = `  ${raw.site.title}  `;
    raw.site.footer.startYear = String(raw.site.footer.startYear);
    raw.site.socialLinks.email = `mailto:${raw.site.socialLinks.email}`;
    raw.site.socialLinks.custom = [
      {
        id: 'custom-home',
        label: '',
        href: 'https://example.com',
        iconKey: 'globe',
        visible: 1,
        order: '4'
      }
    ];
    delete raw.page.about.subtitle;

    const canonical = canonicalizeAdminThemeSettings(raw, {
      footerStartYearMax: 2030,
      normalizeCustomSocialLabel: (value, iconKey) => String(value ?? '').trim() || iconKey
    });

    expect(canonical.site.title).toBe(getEditableThemeSettingsPayload().settings.site.title);
    expect(canonical.site.footer.startYear).toBe(getEditableThemeSettingsPayload().settings.site.footer.startYear);
    expect(canonical.site.socialLinks.email).toBe(getEditableThemeSettingsPayload().settings.site.socialLinks.email);
    expect(canonical.site.socialLinks.custom[0]).toMatchObject({
      iconKey: 'website',
      label: 'website',
      visible: true,
      order: 4
    });
    expect(validateAdminThemeSettings(canonical, { footerStartYearMax: 2030 })).toEqual([]);
    expect(
      createAdminThemeSettingsCanonicalMismatchIssues(raw, canonical).map((issue) => issue.path)
    ).toEqual(
      expect.arrayContaining([
        'site.title',
        'site.footer.startYear',
        'site.socialLinks.email',
        'site.socialLinks.custom[0].iconKey',
        'site.socialLinks.custom[0].label',
        'site.socialLinks.custom[0].visible',
        'site.socialLinks.custom[0].order',
        'page.about.subtitle'
      ])
    );
  });

  it('fills compatibility defaults for legacy admin overview and sidebar action snapshots', () => {
    const canonical = getEditableThemeSettingsPayload().settings;
    const legacySnapshot = structuredClone(canonical) as Record<string, any>;
    delete legacySnapshot.site.adminOverview;
    legacySnapshot.ui.sidebarActions = {
      showThemeToggle: canonical.ui.sidebarActions.showThemeToggle
    };

    const compatible = fillAdminThemeSettingsCompatibilityDefaults(
      legacySnapshot,
      canonical
    ) as Record<string, any>;

    const mismatchPaths = createAdminThemeSettingsCanonicalMismatchIssues(compatible, canonical).map((issue) => issue.path);
    expect(mismatchPaths).not.toContain('site.adminOverview');
    expect(mismatchPaths).not.toContain('ui.sidebarActions');
    expect(mismatchPaths).not.toContain('ui.sidebarActions.showRssLink');
    expect(mismatchPaths).not.toContain('ui.sidebarActions.showAdminEntry');
  });

  it('canonicalizes typography font ids against the registry per role', () => {
    const raw = structuredClone(getEditableThemeSettingsPayload().settings) as Record<string, any>;
    raw.ui.typography.readable = 'lxgw-wenkai-lite';
    raw.ui.typography.copy = 'system-mono';
    raw.ui.typography.mono = 'bogus-font';
    raw.ui.typography.brand = 'system-mono';

    const canonical = canonicalizeAdminThemeSettings(raw);

    expect(canonical.ui.typography).toEqual({
      readable: 'lxgw-wenkai-lite',
      copy: 'lxgw-wenkai-lite',
      mono: 'system-mono',
      brand: 'serif-georgia'
    });

    const mismatchPaths = createAdminThemeSettingsCanonicalMismatchIssues(raw, canonical).map((issue) => issue.path);
    expect(mismatchPaths).toEqual(
      expect.arrayContaining(['ui.typography.copy', 'ui.typography.mono', 'ui.typography.brand'])
    );
    expect(mismatchPaths).not.toContain('ui.typography.readable');
  });

  it('fills compatibility defaults for legacy snapshots missing typography', () => {
    const canonical = getEditableThemeSettingsPayload().settings;
    const legacySnapshot = structuredClone(canonical) as Record<string, any>;
    delete legacySnapshot.ui.typography;

    const compatible = fillAdminThemeSettingsCompatibilityDefaults(legacySnapshot, canonical);
    const mismatchPaths = createAdminThemeSettingsCanonicalMismatchIssues(compatible, canonical).map((issue) => issue.path);
    expect(mismatchPaths).not.toContain('ui.typography');

    const partialSnapshot = structuredClone(canonical) as Record<string, any>;
    partialSnapshot.ui.typography = { readable: canonical.ui.typography.readable };
    const partialCompatible = fillAdminThemeSettingsCompatibilityDefaults(partialSnapshot, canonical);
    const partialMismatchPaths = createAdminThemeSettingsCanonicalMismatchIssues(partialCompatible, canonical).map(
      (issue) => issue.path
    );
    expect(partialMismatchPaths).not.toContain('ui.typography.copy');
    expect(partialMismatchPaths).not.toContain('ui.typography.mono');
    expect(partialMismatchPaths).not.toContain('ui.typography.brand');
  });

  it('validates typography font ids per role', () => {
    const settings = structuredClone(getEditableThemeSettingsPayload().settings) as Record<string, any>;
    settings.ui.typography.copy = 'system-mono';
    settings.ui.typography.mono = 'bogus-font';

    const paths = validateAdminThemeSettings(settings as EditableThemeSettings).map((issue) => issue.path);
    expect(paths).toContain('ui.typography.copy');
    expect(paths).toContain('ui.typography.mono');
    expect(paths).not.toContain('ui.typography.readable');
  });

  it('validates admin overview public display settings', () => {
    const settings = structuredClone(getEditableThemeSettingsPayload().settings);
    settings.site.adminOverview.publicVisible = false;
    settings.site.adminOverview.hiddenMessage = '暂未公开';
    settings.ui.sidebarActions.showAdminEntry = true;

    expect(validateAdminThemeSettings(settings)).toEqual([]);

    settings.site.adminOverview.hiddenMessage = '';
    expect(validateAdminThemeSettings(settings).map((issue) => issue.path)).toContain(
      'site.adminOverview.hiddenMessage'
    );
  });

  it('canonicalizes favicon slot paths and keeps invalid inputs for validation', () => {
    const raw = structuredClone(getEditableThemeSettingsPayload().settings) as Record<string, any>;
    raw.site.favicon = {
      svg: null,
      png: ' public/images/site/favicon-64x64-a1b2c3d4.png ',
      appleTouchIcon: 'https://example.com/apple-touch-icon.png'
    };

    const canonical = canonicalizeAdminThemeSettings(raw);

    expect(canonical.site.favicon).toEqual({
      svg: null,
      png: '/images/site/favicon-64x64-a1b2c3d4.png',
      appleTouchIcon: 'https://example.com/apple-touch-icon.png'
    });

    const paths = validateAdminThemeSettings(canonical).map((issue) => issue.path);
    expect(paths).toContain('site.favicon.appleTouchIcon');
    expect(paths).not.toContain('site.favicon.png');
  });

  it('validates favicon file existence through localFileExists', () => {
    const settings = structuredClone(getEditableThemeSettingsPayload().settings);
    settings.site.favicon = {
      svg: null,
      png: '/images/site/favicon-64x64-a1b2c3d4.png',
      appleTouchIcon: null
    };

    const missing = validateAdminThemeSettings(settings, { localFileExists: () => false });
    expect(missing.map((issue) => issue.path)).toContain('site.favicon.png');
    expect(missing.find((issue) => issue.path === 'site.favicon.png')?.message).toContain(
      'public/images/site/favicon-64x64-a1b2c3d4.png'
    );

    const present = validateAdminThemeSettings(settings, { localFileExists: () => true });
    expect(present.map((issue) => issue.path)).not.toContain('site.favicon.png');
  });

  it('fills compatibility defaults for legacy snapshots missing the favicon block', () => {
    const canonical = getEditableThemeSettingsPayload().settings;
    const legacySnapshot = structuredClone(canonical) as Record<string, any>;
    delete legacySnapshot.site.favicon;

    const compatible = fillAdminThemeSettingsCompatibilityDefaults(legacySnapshot, canonical);
    const mismatchPaths = createAdminThemeSettingsCanonicalMismatchIssues(compatible, canonical).map(
      (issue) => issue.path
    );
    expect(mismatchPaths).not.toContain('site.favicon');

    const partialSnapshot = structuredClone(canonical) as Record<string, any>;
    partialSnapshot.site.favicon = { png: canonical.site.favicon.png };
    const partialCompatible = fillAdminThemeSettingsCompatibilityDefaults(partialSnapshot, canonical);
    const partialMismatchPaths = createAdminThemeSettingsCanonicalMismatchIssues(partialCompatible, canonical).map(
      (issue) => issue.path
    );
    expect(partialMismatchPaths).not.toContain('site.favicon.svg');
    expect(partialMismatchPaths).not.toContain('site.favicon.appleTouchIcon');
  });
});

/**
 * 窄屏站点标题宽度是页面宽度百分比（默认 35%），在单位层钉住默认值 / 夹取 / 校验。
 * 该值最终写到 `<html>` 的 `--site-title-max-inline`，写错会让窄屏标题过宽或消失。
 */
describe('admin-console/shared：窄屏站点标题宽度百分比', () => {
  const baseSettings = () => structuredClone(getEditableThemeSettingsPayload().settings);

  it('默认值 35%，缺失时补齐', () => {
    const payload = getEditableThemeSettingsPayload().settings;
    expect(payload.site.titleMaxPercent).toBe(35);

    const raw = baseSettings() as Record<string, any>;
    delete raw.site.titleMaxPercent;
    expect(canonicalizeAdminThemeSettings(raw).site.titleMaxPercent).toBe(35);
  });

  it('字符串数字会被规范化，越界会被夹取到 10–100', () => {
    const raw = baseSettings() as Record<string, any>;
    raw.site.titleMaxPercent = '48';
    expect(canonicalizeAdminThemeSettings(raw).site.titleMaxPercent).toBe(48);

    raw.site.titleMaxPercent = 5;
    expect(canonicalizeAdminThemeSettings(raw).site.titleMaxPercent).toBe(10);

    raw.site.titleMaxPercent = 400;
    expect(canonicalizeAdminThemeSettings(raw).site.titleMaxPercent).toBe(100);

    raw.site.titleMaxPercent = 'abc';
    expect(canonicalizeAdminThemeSettings(raw).site.titleMaxPercent).toBe(35);
  });

  it('校验会拦住非整数与越界值', () => {
    const raw = baseSettings() as Record<string, any>;
    const ok = canonicalizeAdminThemeSettings(raw);
    expect(validateAdminThemeSettings(ok).map((issue) => issue.path)).not.toContain('site.titleMaxPercent');

    const broken = { ...ok, site: { ...ok.site, titleMaxPercent: 2 } };
    expect(validateAdminThemeSettings(broken).map((issue) => issue.path)).toContain('site.titleMaxPercent');
  });
});

/**
 * 页面外缘间隙是内容盒到浏览器边缘的视觉距离（px，默认与下限都是 32，上限 160），
 * 在单位层钉住默认值 / 夹取 / 校验。它最终决定 `<html>` 上的内边距。
 */
describe('admin-console/shared：页面外缘间隙', () => {
  const baseSettings = () => structuredClone(getEditableThemeSettingsPayload().settings);

  it('默认值 32，缺失时补齐', () => {
    const payload = getEditableThemeSettingsPayload().settings;
    expect(payload.site.pageGapPx).toBe(32);

    const raw = baseSettings() as Record<string, any>;
    delete raw.site.pageGapPx;
    expect(canonicalizeAdminThemeSettings(raw).site.pageGapPx).toBe(32);
  });

  it('字符串数字会被规范化，越界会被夹取到 32–160', () => {
    const raw = baseSettings() as Record<string, any>;
    raw.site.pageGapPx = '80';
    expect(canonicalizeAdminThemeSettings(raw).site.pageGapPx).toBe(80);

    raw.site.pageGapPx = 31;
    expect(canonicalizeAdminThemeSettings(raw).site.pageGapPx).toBe(32);

    raw.site.pageGapPx = 400;
    expect(canonicalizeAdminThemeSettings(raw).site.pageGapPx).toBe(160);

    raw.site.pageGapPx = 'abc';
    expect(canonicalizeAdminThemeSettings(raw).site.pageGapPx).toBe(32);
  });

  it('校验会拦住非整数与越界值', () => {
    const raw = baseSettings() as Record<string, any>;
    const ok = canonicalizeAdminThemeSettings(raw);
    expect(validateAdminThemeSettings(ok).map((issue) => issue.path)).not.toContain('site.pageGapPx');

    const tooSmall = { ...ok, site: { ...ok.site, pageGapPx: 20 } };
    expect(validateAdminThemeSettings(tooSmall).map((issue) => issue.path)).toContain('site.pageGapPx');

    const tooLarge = { ...ok, site: { ...ok.site, pageGapPx: 200 } };
    expect(validateAdminThemeSettings(tooLarge).map((issue) => issue.path)).toContain('site.pageGapPx');

    const notInteger = { ...ok, site: { ...ok.site, pageGapPx: 32.5 } };
    expect(validateAdminThemeSettings(notInteger).map((issue) => issue.path)).toContain('site.pageGapPx');
  });
});

/**
 * RSS 订阅设置：一个总开关（`enabled`）加 `/blog/` `/bits/` `/archive/` 三个互不干扰的页面开关。
 */
describe('admin-console/shared：列表页 RSS 开关', () => {
  const baseSettings = () => structuredClone(getEditableThemeSettingsPayload().settings);

  it('缺省时四个都是开（默认值），并可被输入覆盖', () => {
    // 不断言磁盘上的当前值：后台保存过之后它可能是用户调过的状态
    //（总开关被关过就是 enabled: false），这里只钉默认值与规范化。
    const raw = baseSettings() as Record<string, any>;
    delete raw.page.listRss;
    expect(canonicalizeAdminThemeSettings(raw).page.listRss).toEqual({
      enabled: true,
      blog: true,
      bits: true,
      archive: true
    });

    raw.page.listRss = { enabled: false, blog: true, bits: false, archive: true };
    expect(canonicalizeAdminThemeSettings(raw).page.listRss).toEqual({
      enabled: false,
      blog: true,
      bits: false,
      archive: true
    });

    // 非布尔值 → 逐个回落到默认（开）
    raw.page.listRss = { enabled: 'yes', blog: 0, bits: null, archive: 'no' };
    expect(canonicalizeAdminThemeSettings(raw).page.listRss).toEqual({
      enabled: true,
      blog: true,
      bits: true,
      archive: true
    });
  });

  it('校验会逐个拦住非布尔值', () => {
    const ok = canonicalizeAdminThemeSettings(baseSettings());
    const paths = validateAdminThemeSettings(ok).map((issue) => issue.path);
    expect(paths).not.toContain('page.listRss.enabled');

    const broken = {
      ...ok,
      page: {
        ...ok.page,
        listRss: { ...ok.page.listRss, bits: 'no' as unknown as boolean }
      }
    };
    expect(validateAdminThemeSettings(broken).map((issue) => issue.path)).toContain('page.listRss.bits');
  });

  it('rejects a narrow site title beyond the length limit', () => {
    const ok = getEditableThemeSettingsPayload().settings;
    const tooLong = {
      ...ok,
      site: { ...ok.site, titleNarrow: 'a'.repeat(ADMIN_SITE_TITLE_MAX_LENGTH + 1) }
    };
    expect(validateAdminThemeSettings(tooLong).map((issue) => issue.path)).toContain('site.titleNarrow');

    const atLimit = {
      ...ok,
      site: { ...ok.site, titleNarrow: 'a'.repeat(ADMIN_SITE_TITLE_MAX_LENGTH) }
    };
    expect(validateAdminThemeSettings(atLimit).map((issue) => issue.path)).not.toContain('site.titleNarrow');
  });
});
