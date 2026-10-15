import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertAdminOverviewHeader,
  assertAdminContentStaticShell,
  assertAdminImageStaticShell,
  assertAdminImageUploadStaticShell,
  assertAdminPreviewStaticShell,
  assertNoAdminRouteNav,
  assertNoDevAdminUiPreferenceChrome,
  assertAdminSettingsStaticShell,
  DEV_ADMIN_UI_PREFERENCE_MARKERS,
  expect
} from './smoke-utils.mjs';

// 与 astro.config.mjs 的 normalizeDeploymentBase 同语义：根路径为空串，子路径形如 '/blog'。
// dist 目录结构不随 base 嵌套，base 只影响产物内的 URL。
const basePathSegment = String(process.env.ASTRO_WHONO_BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
const basePrefix = basePathSegment ? `/${basePathSegment}` : '';

const stripBasePrefix = (pathname) =>
  basePrefix && pathname.startsWith(`${basePrefix}/`) ? pathname.slice(basePrefix.length) : pathname;

const resolveRequiredSiteUrl = () => {
  const siteUrl = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  expect(siteUrl.length > 0, 'SITE_URL is required for production artifact verification');
  return siteUrl;
};

const readText = (filePath) => {
  expect(existsSync(filePath), `Expected build artifact is missing: ${filePath}`);
  return readFileSync(filePath, 'utf8');
};

const findAdminContentEditArtifactDirs = () => {
  const root = 'dist/admin/content';
  if (!existsSync(root)) return [];

  const matches = [];
  const walk = (dirPath) => {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.name === '_edit') {
        matches.push(fullPath);
      }
      walk(fullPath);
    }
  };

  walk(root);
  return matches;
};

const findBuiltAstroAssets = () => {
  const root = 'dist/_astro';
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(css|js)$/i.test(entry.name))
    .map((entry) => path.join(root, entry.name));
};

const assertNoDevAdminUiPreferenceAssets = () => {
  for (const filePath of findBuiltAstroAssets()) {
    for (const marker of DEV_ADMIN_UI_PREFERENCE_MARKERS) {
      expect(
        !filePath.includes(marker),
        `${filePath} should not be emitted as a DEV-only admin UI preference asset`
      );
    }
    assertNoDevAdminUiPreferenceChrome(filePath, readText(filePath));
  }
};

const EMOJI_PICKER_ARTIFACT_MARKERS = [
  'emoji-picker-element',
  'emoji-picker-element-data',
  '<emoji-picker'
];

const assertNoEmojiPickerAssets = () => {
  for (const filePath of findBuiltAstroAssets()) {
    const content = readText(filePath);
    for (const marker of EMOJI_PICKER_ARTIFACT_MARKERS) {
      expect(
        !content.includes(marker),
        `${filePath} should not contain emoji picker artifacts (${marker})`
      );
    }
  }
};

const PREV_LINK_PATTERN = /<a class="prev-next__link prev-next__link--prev"[^>]*rel="prev">/;
const NEXT_LINK_PATTERN = /<a class="prev-next__link prev-next__link--next"[^>]*rel="next">/;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EXTERNAL_MODULE_SCRIPT_PATTERN = new RegExp(
  `<script type="module" src="(${escapeRegExp(basePrefix)}/_astro/[^"]+)"></script>`,
  'g'
);
const getExternalModuleScriptSrcs = (html) =>
  Array.from(html.matchAll(EXTERNAL_MODULE_SCRIPT_PATTERN), (match) => match[1]);

const runProductionArtifactCheck = async () => {
  const siteUrl = resolveRequiredSiteUrl();

  const requiredArtifacts = [
    'dist/sitemap-index.xml',
    'dist/sitemap-0.xml',
    'dist/robots.txt',
    'dist/rss.xml',
    'dist/blog/rss.xml',
    'dist/index.html',
    'dist/about/index.html',
    'dist/admin/index.html',
    'dist/admin/content/index.html',
    'dist/admin/images/index.html',
    'dist/bits/index.html',
    'dist/admin/data/index.html',
    'dist/admin/theme/index.html',
    'dist/api/admin/settings',
    'dist/api/admin/data/settings',
    'dist/api/admin/content/entry',
    'dist/api/admin/content/create',
    'dist/api/admin/content/export',
    'dist/api/admin/content/delete',
    'dist/api/admin/content/bulk-status',
    'dist/api/admin/content/bulk-delete',
    'dist/api/admin/content/bulk-export',
    'dist/api/admin/preview',
    'dist/api/admin/images/list',
    'dist/api/admin/images/meta',
    'dist/api/admin/images/upload',
    'dist/api/admin/images/rename',
    'dist/api/admin/site-assets/upload'
  ];

  for (const artifactPath of requiredArtifacts) {
    expect(existsSync(artifactPath), `Expected build artifact is missing: ${artifactPath}`);
  }
  expect(
    !existsSync('dist/api/admin/images/cloud/delete'),
    'Removed cloud image delete API artifact should not be generated'
  );

  const robotsTxt = readText('dist/robots.txt');
  expect(
    robotsTxt.includes(`Sitemap: ${siteUrl}${basePrefix}/sitemap-index.xml`),
    'robots.txt is missing the expected Sitemap line'
  );

  const sitemapXml = readText('dist/sitemap-0.xml');
  expect(
    sitemapXml.includes(`<loc>${siteUrl}${basePrefix}/about/</loc>`),
    'Sitemap is missing the expected /about/ location'
  );
  expect(!sitemapXml.includes('/admin/'), 'Admin route leaked into sitemap');
  expect(!sitemapXml.includes('/admin/theme/'), 'Admin theme route leaked into sitemap');
  expect(!sitemapXml.includes('/admin/content/'), 'Admin content route leaked into sitemap');
  expect(!sitemapXml.includes('/admin/images/'), 'Admin images route leaked into sitemap');
  expect(!sitemapXml.includes('/admin/data/'), 'Admin data route leaked into sitemap');

  // 读者端不得有写稿入口：不产出 bits draft partial 路由，读者页也不带写稿钩子。
  expect(
    !existsSync('dist/bits/draft-dialog'),
    'Bits draft partial route should no longer be generated (moved to the admin console)'
  );
  const bitsPublicHtml = readText('dist/bits/index.html');
  expect(
    !bitsPublicHtml.includes('data-new-bit') && !bitsPublicHtml.includes('bits-draft-dialog'),
    'Reader-side bits draft entry leaked back into the public /bits/ page'
  );

  const sitemapLocs = Array.from(
    sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g),
    (match) => match[1].trim()
  ).filter(Boolean);
  const blogDetailLoc = sitemapLocs.find((loc) =>
    // 同样先 decode：CJK slug 在 sitemap 里是百分号编码的
    /^\/blog\/[^/]+\/$/.test(decodeURIComponent(stripBasePrefix(new URL(loc).pathname)))
  );
  expect(blogDetailLoc, 'Blog detail route is missing from the sitemap');

  assertNoEmojiPickerAssets();

  const aboutHtml = readText('dist/about/index.html');
  expect(
    aboutHtml.includes(`<link rel="canonical" href="${siteUrl}${basePrefix}/about/"`),
    'About page canonical no longer matches SITE_URL'
  );
  expect(
    aboutHtml.includes(`<meta property="og:url" content="${siteUrl}${basePrefix}/about/"`),
    'About page og:url no longer matches SITE_URL'
  );
  assertNoDevAdminUiPreferenceChrome('dist/about/index.html', aboutHtml);
  expect(!/\.admin-/.test(aboutHtml), 'Public about page still contains admin CSS rules');
  expect(!/--admin-status-/.test(aboutHtml), 'Public about page still contains admin CSS tokens');

  const indexHtml = readText('dist/index.html');
  // 公开首页外链的 _astro 模块脚本 = 全站共享 chunk 基线（如 BaseLayout 公共脚本
  // 超过 vite assetsInlineLimit 后会从逐页内联翻转为外链共享 chunk）。
  // admin 只读壳允许共享这些公共 chunk，但不得外链任何 admin 专属脚本。
  const publicExternalModuleScripts = new Set(getExternalModuleScriptSrcs(indexHtml));

  const adminHtml = readText('dist/admin/index.html');
  const adminContentHtml = readText('dist/admin/content/index.html');
  const adminImageHtml = readText('dist/admin/images/index.html');
  const adminThemeHtml = readText('dist/admin/theme/index.html');
  const adminDataHtml = readText('dist/admin/data/index.html');
  const readonlyAdminHtmlChecks = [
    ['dist/admin/content/index.html', adminContentHtml, 'Content Console'],
    ['dist/admin/images/index.html', adminImageHtml, 'Images Console'],
    ['dist/admin/theme/index.html', adminThemeHtml, 'Theme Console'],
    ['dist/admin/data/index.html', adminDataHtml, 'Data Console']
  ];
  [
    'dist/admin/content/blog/index.html',
    'dist/admin/content/bits/index.html',
    'dist/admin/content/projects/index.html',
    'dist/admin/content/devlog/index.html'
  ].forEach((filePath) => {
    expect(!existsSync(filePath), `${filePath} should not be generated after collection list routes were removed`);
  });
  const adminContentEditArtifactDirs = findAdminContentEditArtifactDirs();
  expect(
    adminContentEditArtifactDirs.length === 0,
    `Production build should not generate per-entry admin content edit artifacts: ${adminContentEditArtifactDirs.join(', ')}`
  );

  assertAdminOverviewHeader('dist/admin/index.html', adminHtml);
  assertNoDevAdminUiPreferenceChrome('dist/admin/index.html', adminHtml);
  if (adminHtml.includes('data-admin-overview-mode="hidden"')) {
    expect(
      adminHtml.includes('admin-site-overview__hidden-message'),
      'dist/admin/index.html is missing the hidden overview message'
    );
  } else {
    expect(adminHtml.includes('data-admin-overview-mode="public"'), 'dist/admin/index.html is missing the public overview mode marker');
  }
  expect(adminHtml.includes('noindex,nofollow'), 'dist/admin/index.html is missing the noindex robots boundary');
  assertNoAdminRouteNav('dist/admin/index.html', adminHtml);
  expect(!adminHtml.includes('data-admin-root'), 'dist/admin/index.html should stay readonly outside dev');
  expect(!adminHtml.includes('id="admin-bootstrap"'), 'dist/admin/index.html should not emit theme bootstrap payload');
  expect(!adminHtml.includes('data-admin-content-root'), 'dist/admin/index.html should not emit content console payload');
  expect(!adminHtml.includes('data-admin-images-root'), 'dist/admin/index.html should not emit images console payload');
  expect(!adminHtml.includes('id="admin-images-bootstrap"'), 'dist/admin/index.html should not emit images bootstrap payload');
  expect(!adminHtml.includes('data-admin-data-root'), 'dist/admin/index.html should not emit data console payload');
  expect(!adminHtml.includes('id="admin-data-bootstrap"'), 'dist/admin/index.html should not emit data bootstrap payload');
  for (const scriptSrc of getExternalModuleScriptSrcs(adminHtml)) {
    expect(
      publicExternalModuleScripts.has(scriptSrc),
      `dist/admin/index.html links an admin-only external module script (not shared with dist/index.html): ${scriptSrc}`
    );
  }

  for (const [filePath, html, heading] of readonlyAdminHtmlChecks) {
    expect(html.includes(heading), `${filePath} is missing the expected ${heading} route heading`);
    assertNoAdminRouteNav(filePath, html);
    assertNoDevAdminUiPreferenceChrome(filePath, html);
    expect(!html.includes('data-admin-root'), `${filePath} should stay readonly outside dev`);
    expect(!html.includes('id="admin-bootstrap"'), `${filePath} should not emit theme bootstrap payload`);
    expect(!html.includes('data-admin-content-root'), `${filePath} should not emit content console payload`);
    expect(!html.includes('data-admin-images-root'), `${filePath} should not emit images console payload`);
    expect(!html.includes('id="admin-images-bootstrap"'), `${filePath} should not emit images bootstrap payload`);
    expect(!/index@_@astro\.[^"]+\.css/.test(html), `${filePath} still links admin-only CSS`);
    for (const scriptSrc of getExternalModuleScriptSrcs(html)) {
      expect(
        publicExternalModuleScripts.has(scriptSrc),
        `${filePath} links an admin-only external module script (not shared with dist/index.html): ${scriptSrc}`
      );
    }
  }
  assertNoDevAdminUiPreferenceAssets();

  expect(
    /<h1 class="sr-only">[^<]+<\/h1>/.test(indexHtml),
    'Homepage hidden H1 is missing from dist/index.html'
  );
  assertNoDevAdminUiPreferenceChrome('dist/index.html', indexHtml);
  expect(!/\.admin-/.test(indexHtml), 'Homepage still contains admin CSS rules');
  expect(!/--admin-status-/.test(indexHtml), 'Homepage still contains admin CSS tokens');

  // <html style> 引用的每个 --font-* 变量必须在同页有定义；缺定义说明构建期字体下载被静默降级。
  // 默认态 <html> 无 style 属性，本断言空转。
  const htmlStyleMatch = indexHtml.match(/<html[^>]+style="([^"]*)"/);
  const referencedFontVariables = htmlStyleMatch
    ? Array.from(
        htmlStyleMatch[1].matchAll(/var\((--font-[a-z0-9-]+)\)/g),
        (match) => match[1]
      )
    : [];
  for (const variableName of new Set(referencedFontVariables)) {
    expect(
      indexHtml.includes(`${variableName}:`),
      `dist/index.html references ${variableName} but never defines it — the font download likely failed at build time (unreachable provider?). Switch the registry entry to provider 'local' or build on a network that can reach the provider.`
    );
  }

  const pageSettings = existsSync('src/data/settings/page.json')
    ? JSON.parse(readFileSync('src/data/settings/page.json', 'utf8'))
    : null;
  const { site } = await import('../site.config.mjs');
  const rawAvatar = pageSettings?.bits?.defaultAuthor?.avatar ?? site.authorAvatar ?? 'author/avatar.webp';
  expect(
    typeof rawAvatar === 'string' && rawAvatar.trim().length > 0,
    'Bits default author avatar is missing from page settings / site config'
  );

  const normalizedAvatar = rawAvatar.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  const hasInvalidAvatarPath =
    normalizedAvatar.startsWith('/') ||
    normalizedAvatar.startsWith('//') ||
    normalizedAvatar.startsWith('public/') ||
    /^[A-Za-z]+:\/\//.test(normalizedAvatar) ||
    /(^|\/)\.\.(?:\/|$)/.test(normalizedAvatar) ||
    normalizedAvatar.includes('?') ||
    normalizedAvatar.includes('#');

  expect(
    !hasInvalidAvatarPath,
    `Bits default author avatar must stay a relative public/** image path: ${rawAvatar}`
  );
  expect(
    /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(normalizedAvatar),
    `Bits default author avatar must point to an image file: ${rawAvatar}`
  );

  const avatarFilePath = `public/${normalizedAvatar}`;
  if (!existsSync(avatarFilePath)) {
    console.warn(
      `[check:prod-artifacts] Bits default author avatar points to a missing file; the public UI will fall back to initials: ${avatarFilePath}`
    );
  }

  const getRssItemLinks = (xml) =>
    Array.from(xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g), (match) => match[1].trim()).filter(Boolean);

  const normalizeBlogDetailPath = (href) => {
    const url = new URL(href);
    // blog 的公开 slug 允许 CJK，URL.pathname 会对其做百分号编码，而磁盘上的目录名未编码，
    // 不 decode 会在这里误报「产物缺失」。
    const normalizedPath = decodeURIComponent(stripBasePrefix(url.pathname))
      .replace(/\/+$/, '')
      .replace(/^\/+/, '');
    expect(
      normalizedPath.startsWith('blog/') && normalizedPath.split('/').length >= 2,
      `RSS item did not resolve to a /blog/{slug}/ detail page: ${href}`
    );
    return path.join('dist', normalizedPath, 'index.html');
  };

  const defaultRssXml = readText('dist/rss.xml');
  const blogRssXml = readText('dist/blog/rss.xml');

  const defaultRssLinks = getRssItemLinks(defaultRssXml);
  const blogRssLinks = getRssItemLinks(blogRssXml);

  expect(defaultRssLinks.length > 0, 'Default RSS does not contain any item links');
  expect(blogRssLinks.length > 0, 'Blog RSS does not contain any item links');

  const sampleBlogLink = blogRssLinks[0];
  expect(
    sampleBlogLink.startsWith(`${siteUrl}${basePrefix}/blog/`),
    `Blog RSS item link is not absolute or not under /blog/: ${sampleBlogLink}`
  );
  expect(
    defaultRssLinks.includes(sampleBlogLink),
    `Default RSS is missing blog item link: ${sampleBlogLink}`
  );
  expect(
    sitemapXml.includes(`<loc>${sampleBlogLink}</loc>`),
    `Sitemap is missing blog detail link: ${sampleBlogLink}`
  );

  const sampleBlogHtmlPath = normalizeBlogDetailPath(sampleBlogLink);
  const sampleBlogHtml = readText(sampleBlogHtmlPath);
  expect(
    sampleBlogHtml.includes(`<link rel="canonical" href="${sampleBlogLink}"`),
    `Blog detail page canonical does not match RSS item link: ${sampleBlogLink}`
  );
  expect(
    sampleBlogHtml.includes(`<meta property="og:url" content="${sampleBlogLink}"`),
    `Blog detail page og:url does not match RSS item link: ${sampleBlogLink}`
  );
  expect(
    !/\.admin-/.test(sampleBlogHtml),
    `Blog detail page still contains admin CSS rules: ${sampleBlogHtmlPath}`
  );
  expect(
    !/--admin-status-/.test(sampleBlogHtml),
    `Blog detail page still contains admin CSS tokens: ${sampleBlogHtmlPath}`
  );

  const latestBlogLink = blogRssLinks[0];
  const latestBlogHtmlPath = normalizeBlogDetailPath(latestBlogLink);
  const latestBlogHtml = readText(latestBlogHtmlPath);
  expect(
    !PREV_LINK_PATTERN.test(latestBlogHtml),
    `Latest blog detail page should not render a prev link: ${latestBlogHtmlPath}`
  );

  const oldestBlogLink = blogRssLinks.at(-1);
  expect(oldestBlogLink, 'Blog RSS does not contain an oldest item link');
  const oldestBlogHtmlPath = normalizeBlogDetailPath(oldestBlogLink);
  const oldestBlogHtml = readText(oldestBlogHtmlPath);
  expect(
    !NEXT_LINK_PATTERN.test(oldestBlogHtml),
    `Oldest blog detail page should not render a next link: ${oldestBlogHtmlPath}`
  );

  expect(
    !existsSync('dist/archive/rss.xml'),
    'Removed /archive/rss.xml artifact should not be generated'
  );

  // 服务端分页与 tag 分段产物必须不存在。
  const pagedArtifactDirs = [
    'dist/blog/page',
    'dist/archive/page',
    'dist/bits/page',
    'dist/archive/tag'
  ];
  for (const dir of pagedArtifactDirs) {
    expect(
      !existsSync(dir),
      `Server-side pagination artifact should not be generated: ${dir}`
    );
  }

  const adminSettingsArtifact = readText('dist/api/admin/settings');
  assertAdminSettingsStaticShell('dist/api/admin/settings', adminSettingsArtifact);
  const adminDataSettingsArtifact = readText('dist/api/admin/data/settings');
  assertAdminSettingsStaticShell('dist/api/admin/data/settings', adminDataSettingsArtifact, '/api/admin/data/settings/');
  const adminContentEntryArtifact = readText('dist/api/admin/content/entry');
  assertAdminContentStaticShell(
    'dist/api/admin/content/entry',
    adminContentEntryArtifact,
    '/api/admin/content/entry/'
  );
  const adminContentCreateArtifact = readText('dist/api/admin/content/create');
  assertAdminContentStaticShell(
    'dist/api/admin/content/create',
    adminContentCreateArtifact,
    '/api/admin/content/create/'
  );
  const adminContentExportArtifact = readText('dist/api/admin/content/export');
  assertAdminContentStaticShell(
    'dist/api/admin/content/export',
    adminContentExportArtifact,
    '/api/admin/content/export/'
  );
  expect(
    !adminContentExportArtifact.includes('content-disposition')
      && !adminContentExportArtifact.includes('# Admin Console'),
    'dist/api/admin/content/export should not expose source download response data'
  );
  const adminContentDeleteArtifact = readText('dist/api/admin/content/delete');
  assertAdminContentStaticShell(
    'dist/api/admin/content/delete',
    adminContentDeleteArtifact,
    '/api/admin/content/delete/'
  );
  expect(
    !adminContentDeleteArtifact.includes('"trashedPath"')
      && !adminContentDeleteArtifact.includes('.trash/content'),
    'dist/api/admin/content/delete should not expose delete response data'
  );
  const adminContentBulkStatusArtifact = readText('dist/api/admin/content/bulk-status');
  assertAdminContentStaticShell(
    'dist/api/admin/content/bulk-status',
    adminContentBulkStatusArtifact,
    '/api/admin/content/bulk-status/'
  );
  const adminContentBulkDeleteArtifact = readText('dist/api/admin/content/bulk-delete');
  assertAdminContentStaticShell(
    'dist/api/admin/content/bulk-delete',
    adminContentBulkDeleteArtifact,
    '/api/admin/content/bulk-delete/'
  );
  const adminContentBulkExportArtifact = readText('dist/api/admin/content/bulk-export');
  assertAdminContentStaticShell(
    'dist/api/admin/content/bulk-export',
    adminContentBulkExportArtifact,
    '/api/admin/content/bulk-export/'
  );
  const adminPreviewArtifact = readText('dist/api/admin/preview');
  assertAdminPreviewStaticShell(
    'dist/api/admin/preview',
    adminPreviewArtifact,
    '/api/admin/preview/'
  );
  const adminImageListArtifact = readText('dist/api/admin/images/list');
  assertAdminImageStaticShell(
    'dist/api/admin/images/list',
    adminImageListArtifact,
    '/api/admin/images/list/'
  );
  const adminImageMetaArtifact = readText('dist/api/admin/images/meta');
  assertAdminImageStaticShell(
    'dist/api/admin/images/meta',
    adminImageMetaArtifact,
    '/api/admin/images/meta/'
  );
  const adminImageUploadArtifact = readText('dist/api/admin/images/upload');
  assertAdminImageUploadStaticShell(
    'dist/api/admin/images/upload',
    adminImageUploadArtifact,
    '/api/admin/images/upload/'
  );
  const adminSiteAssetUploadArtifact = readText('dist/api/admin/site-assets/upload');
  assertAdminImageUploadStaticShell(
    'dist/api/admin/site-assets/upload',
    adminSiteAssetUploadArtifact,
    '/api/admin/site-assets/upload/'
  );

  console.log('Production artifact verification passed.');
};

const isDirectExecution = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectExecution) {
  try {
    await runProductionArtifactCheck();
  } catch (error) {
    console.error(error instanceof Error && error.stack ? error.stack : error);
    process.exit(1);
  }
}
