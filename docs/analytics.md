# 访问统计与备案配置

主题只渲染位置、样式与 DOM 槽位，数字由站点自行接入。开关、前缀文案与显示位置在后台主题页的「内页设置 → 浏览数据」中设置，内置默认关闭；未接入取数脚本时槽位保持隐藏，不占位、不引起重排。

## 槽位契约

主题在服务端渲染下列结构，脚本读取属性后填值。

```html
<span class="meta-line__item view-stats" data-view-stats
      data-view-scope="article" data-view-path="/blog/hello/"
      data-view-route="/blog/hello/" data-view-title="Hello">
  <span class="view-stats__item" data-view-stat="pv" hidden>
    <span class="view-stats__label">浏览</span>
    <span class="view-stats__value" data-view-stat-value></span>
  </span>
  <span class="view-stats__item" data-view-stat="uv" hidden>…访客…</span>
</span>
```

| 属性 | 含义 |
| --- | --- |
| `data-view-scope` | 页面类型：`article` / `home` / `blog` / `archive` / `projects` / `bits` / `devlog` / `about` |
| `data-view-path` | `Astro.url.pathname`，含部署 base，与统计服务记录的 URL 一致 |
| `data-view-route` | 去掉 base 的逻辑路由 |
| `data-view-title` | 剥掉标签的纯文本标题 |

文章详情页的槽位在元信息行内，其余页面在页脚版权之上独占一行。可用的 helper 在 `src/lib/view-stats.ts`：

| 名称 | 作用 |
| --- | --- |
| `resolveViewStats(stat?, root?)` | 取当前页面的槽位 |
| `setViewStatValue(item, value)` | 写入并摘掉 `hidden`，数字自动千分位 |
| `formatViewStatValue(value)` | 仅格式化，不写 DOM |
| `VIEW_STATS_READY_EVENT` | 槽位挂载完成后在 `document` 上派发 |

## 接入步骤

| 要做的事 | 改哪里 |
| --- | --- |
| 上报访问 | `src/layouts/BaseLayout.astro` 的 `<head>` 内加入 tracker 脚本 |
| 填充数字 | `src/scripts/view-stats.ts`，唯一接入点，默认空实现 |
| 开关与位置 | 后台主题页的「浏览数据」，写入 `src/data/settings/ui.json` |

自建接口返回 `{ pv, uv }` 时按下列两步填值：

```js
import { resolveViewStats, setViewStatValue } from '../lib/view-stats';

const root = document.querySelector('[data-view-stats]');
const path = root?.dataset.viewPath ?? location.pathname;
const { pv, uv } = await fetch(`https://stats.example.com/api?path=${encodeURIComponent(path)}`)
  .then((r) => r.json());
for (const item of resolveViewStats('pv')) setViewStatValue(item, pv);
for (const item of resolveViewStats('uv')) setViewStatValue(item, uv);
```

用大模型辅助编写该文件时，把 [llm-view-stats-prompt.md](llm-view-stats-prompt.md) 的全文复制给模型，填好最后一节即可。

## Umami

1. 建站：Umami 中 Add website，记录 website id。
2. 上报：在 `src/layouts/BaseLayout.astro` 的 `<head>` 内加入 tracker，`src` 指向实例地址。

   ```html
   <script defer src="https://stats.example.com/script.js" data-website-id="你的-website-id"></script>
   ```

   脚本默认上报到自身地址，不同源时用 `data-host-url` 指定，`data-domains` 可限定统计域名，其余属性见 [Tracker configuration](https://docs.umami.is/docs/tracker-configuration)。加完在 Realtime 中确认上报生效。
3. 开分享：该 website → Edit → Share URL → Add，勾选需要公开的视图，得到 `https://stats.example.com/share/<slug>/<name>`。
4. 填脚本：按 `src/scripts/view-stats.ts` 中的 Umami 片段填入实例地址与 slug。`GET /api/share/{slug}` 免认证，返回资源引用、参数与作用域受限的 token，再用它请求 `GET /api/websites/{id}/stats?...&path=<路径>`。字段位置以实例为准，可对照分享页的 Network 面板。
5. 开开关：后台主题页勾选开关与显示位置，`npm run dev` 验证。

本地实例上线时需注意：

- 混合内容与私有网络：站点为 `https://` 时浏览器会拒绝请求 `http://` 或内网地址（`localhost`、`192.168.x.x`）。本机开发不受影响；上线需为 Umami 配置 https 域名或隧道服务。
- 跨域：读接口是否返回 `Access-Control-Allow-Origin` 取决于实例配置，先执行 `curl -sI -H "Origin: https://你的域名" "https://stats.example.com/api/share/<slug>"` 确认；未放行时加一层同源代理（Cloudflare Worker、Nginx 反代 `/stats/*`），脚本改请求代理地址即可。
- 分享范围：share 免登录只读，持有链接即可查看勾选的全部视图（路径、来源、国家等），仅勾选必要视图，停用后及时删除。

## 取数口径

账号级 API key 为全量读写凭据，不得用于前端；浏览器端只使用免认证的只读通道。除 share 通道外，官方另有两类路径：嵌入分享页 iframe、定时拉取。

[官方口径](https://docs.umami.is/docs/metric-definitions)规定：

- `visitors` 为唯一 session 数，session 盐每月轮换，不等于历史累计唯一访客，跨时间窗口不可相加；
- `totaltime` 为平均停留时长，仅统计浏览多页的访问，单页跳出不计入，不宜作为平均阅读时长。

主题因此只固定 `pv` / `uv` 两个槽位。停留时长、跳出率等聚合指标可在自己的脚本中追加节点，样式沿用 `.view-stats`。

## 其他统计服务

busuanzi、vercount 一类服务由脚本写入自身约定的 DOM（如 `busuanzi_value_page_pv`），与主题槽位互不通用：

- 直接使用其脚本：在页面中放置它的容器与脚本，并关闭后台「浏览数据」，否则会残留一组永不填值的空槽位。

  ```html
  <span id="busuanzi_container_page_pv">本文浏览 <span id="busuanzi_value_page_pv"></span> 次</span>
  <script defer src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>
  ```

- 自建 [vercount](https://github.com/EvanNotFound/vercount)（相同的 span id，Go 加 Redis）：可继续使用其脚本，也可调用其接口后填入主题槽位。

## 备案信息

工信部备案号与公安联网备案号在后台「站点设置 → 备案信息」中填写，默认不显示，渲染在页脚最底部（版权行之下、居中）。两项都为空时整块不输出。

| 字段 | 说明 |
| --- | --- |
| 工信部备案号 | 如 `皖ICP备12345678号-1`。链接留空时指向 [工信部备案管理系统](https://beian.miit.gov.cn/)；广东填主体备案号，其他省份填网站备案号 |
| 公安备案号 | 如 `皖公网安备12345678901234号`。链接留空时取号内最长的数字串（至少 6 位）拼成 `https://beian.mps.gov.cn/#/query/webSearch?code=<编号>` |
| 工信部备案链接 | 可选覆盖，留空用备案系统首页 |
| 公安备案链接 | 可选覆盖，平台给出的地址优先 |
| 公安备案图标 | `https://` 图片地址或 `public/**` 相对路径；留空只显示文字，文件缺失时不输出图标 |

依据《非经营性互联网信息服务备案管理办法》，备案编号须在主页底部中央标明并链接工信部备案管理系统。公安联网备案须在网站开通之日起 30 日内通过 [全国互联网安全管理服务平台](https://beian.mps.gov.cn/#/)办理，编号与图标均由该平台下发，审核通过后 30 日内放到网页底部。

链接仅允许 `beian.miit.gov.cn`（ICP）与 `beian.mps.gov.cn`、`beian.gov.cn`（公安，兼容旧写法），白名单常量是 `ADMIN_ICP_FILING_HOSTS` 与 `ADMIN_POLICE_FILING_HOSTS`；备案号长度上限是 `ADMIN_FILINGS_NUMBER_MAX_LENGTH`，页脚图标尺寸由 `--site-footer-filing-icon-size` 控制。
