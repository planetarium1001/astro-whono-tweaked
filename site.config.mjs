const rawSiteUrl = (process.env.SITE_URL ?? '').trim();
const siteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/+$/, '') : '';
const hasSiteUrl = siteUrl.length > 0;
const fallbackSiteUrl = 'https://example.invalid';
const siteUrlWarningFlag = 'ASTRO_WHONO_SITE_URL_WARNING_SHOWN';

if (
  !hasSiteUrl &&
  process.env.NODE_ENV === 'production' &&
  process.env[siteUrlWarningFlag] !== '1'
) {
  process.env[siteUrlWarningFlag] = '1';
  console.warn(
    '[astro-whono] SITE_URL is not set. RSS will use example.invalid; canonical/og will be omitted; sitemap will not be generated and robots will not include Sitemap.'
  );
}

export const site = {
  url: hasSiteUrl ? siteUrl : fallbackSiteUrl,
  title: 'Astro Whono Tweaked',
  brandTitle: 'Astro Whono Tweaked',
  author: 'Planetarium',
  authorAvatar: 'author/avatar.webp',
  description: '基于 cxro/astro-whono 的极简双栏 Astro 主题模板，面向长文阅读做了增量改造。'
};

// 前端每页条目数：列表页写入 `[data-entry-filters][data-page-size]`，客户端分页读取。
export const PAGE_SIZE_BLOG = 12;
export const PAGE_SIZE_BITS = 20;
export const PAGE_SIZE_ARCHIVE = 20;

export { hasSiteUrl, siteUrl };
