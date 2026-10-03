// 浏览数据（PV / UV）接入点：主题已渲染槽位与样式，这里只负责取数并填值。
//
// 槽位结构（未填值时带 hidden，不占位）：
//
//   <span class="meta-line__item view-stats" data-view-stats
//         data-view-scope="article" data-view-path="/archive/hello/"
//         data-view-route="/archive/hello/" data-view-title="Hello">
//     <span class="view-stats__item" data-view-stat="pv" hidden>
//       <span class="view-stats__label">浏览</span>
//       <span class="view-stats__value" data-view-stat-value></span>
//     </span>
//     <span class="view-stats__item" data-view-stat="uv" hidden>…</span>
//   </span>
//
// scope 为页面类型（article / archive / bits / memo / essay / about / home）；
// path 为含部署 base 的浏览器路径，route 为去掉 base 的逻辑路由，title 为纯文本标题。
// 开关在 Theme Console → 内页设置 →「浏览数据」；开关打开但未填值时页面不显示任何内容。
//
// Umami：账号 API key 不可用于前端，走免认证的 share 通道。
//   在 Umami 里为该网站创建 Share URL，取链接里的 slug：
//
//   import { resolveViewStats, setViewStatValue } from '../lib/view-stats';
//
//   const UMAMI = 'https://你的 umami 地址';
//   const SLUG = '分享链接里的 slug';
//   const root = document.querySelector<HTMLElement>('[data-view-stats]');
//
//   if (root) {
//     const share = await fetch(`${UMAMI}/api/share/${SLUG}`).then((r) => r.json());
//     const path = root.dataset.viewPath ?? location.pathname;
//     const stats = await fetch(
//       `${UMAMI}/api/websites/${share.websiteId}/stats` +
//         `?startAt=0&endAt=${Date.now()}&path=${encodeURIComponent(path)}`,
//       { headers: { Authorization: `Bearer ${share.token}` } }
//     ).then((r) => r.json());
//
//     for (const item of resolveViewStats('pv')) setViewStatValue(item, stats.pageviews);
//     for (const item of resolveViewStats('uv')) setViewStatValue(item, stats.visitors);
//   }
//
//   token 与 websiteId 的字段位置以实例为准：打开分享页 → DevTools → Network 对照。
//   跨域被拦时加同源代理转发（见 README「浏览数据」），本文件逻辑不变。
//
// 自建接口：返回 { pv, uv } 时按上面两步填值即可。
// busuanzi / vercount 一类只认自身 DOM 的服务不使用槽位：改用它的容器与脚本，
// 并关闭后台的「浏览数据」开关。

export {};
