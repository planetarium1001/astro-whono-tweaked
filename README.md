# astro-whono-tweaked

基于 [cxro/astro-whono](https://github.com/cxro/astro-whono)（MIT）的 Astro 博客主题模板。沿用上游的双栏壳层、后台控制台与 Markdown 扩展，在其上做面向长文阅读的增量改造，并把主题更新做成可重复执行的合并流程。

- 本仓库：<https://github.com/planetarium1001/astro-whono-tweaked>
- 示例站点：<https://planetarium1001.github.io/astro-whono-tweaked/>
- 上游项目：<https://github.com/cxro/astro-whono>

## 特性

| 特性 | 说明 |
| --- | --- |
| 双栏壳层 | 侧栏 224px，滚动条槽位固定；页面外缘间隙与窄屏标题宽度可配 |
| 五类内容 | `blog`、`projects`、`bits`、`devlog`、`about`，另有跨集合归档 |
| 后台控制台 | `/admin/`，开发环境可读写：概览、主题、写作、图片、快照 |
| 长文阅读 | 文章目录、阅读模式、浮动操作列、阅读位置记忆、主题切换涟漪 |
| 浏览数据槽位 | 预置 PV / UV 位置与样式，数字由站点自行接入 |
| 备案信息 | 页脚居中显示工信部与公安联网备案号 |
| 主题同步 | `npm run theme:update` 按文件三方合并，站点自有路径不覆盖 |
| 构建守卫 | 类型、快照漂移、布局几何、触控尺寸、字体字符集 |
| 字体子集 | 自托管 WOFF2，按内容与模板字符集生成 |

## 快速开始

环境要求：Node.js ≥ 22.12.0（见 `.nvmrc` 与 `package.json` 的 `engines`）。

```bash
npm install
npm run dev       # 开发服务器，后台入口 /admin/
npm run build     # 输出到 dist/
npm run preview   # 预览构建结果
```

### 从模板创建

在仓库页面点「Use this template」创建自己的仓库，得到独立历史。之后用 `npm run theme:update` 获取主题更新，无需共享 git 历史。

### 克隆指定分支

只取 `main` 一个分支在本地写作：

```bash
git clone --branch main --single-branch https://github.com/planetarium1001/astro-whono-tweaked.git my-site
cd my-site
npm install
npm run dev
```

克隆得到的 `origin` 指向主题仓库，不能向它推送。要变成自己的站点，先清掉主题历史再重新初始化：

```bash
rm -rf .git
git init -b main
git add -A
git commit -m "chore: 从 astro-whono-tweaked 初始化"
git remote add origin git@github.com:<你的账号>/<你的仓库>.git
git push -u origin main
```

清掉历史不影响主题更新：`theme.json` 记录主题仓库与基准提交，`theme:update` 不依赖 git 历史。

想保留主题历史、用 git 合并而不是 `theme:update`，就不要删 `.git`，只改远程地址：

```bash
git remote set-url origin git@github.com:<你的账号>/<你的仓库>.git
git push -u origin main
```

### Fork 本仓库

Fork 后 `main` 与主题同源历史，可直接合并：

```bash
git remote add theme https://github.com/planetarium1001/astro-whono-tweaked.git
git fetch theme main
git merge theme/main
```

## 主题设置与后台

设置以 JSON 保存在 `src/data/settings/`，按领域分成五个文件。

| 文件 | 内容 |
| --- | --- |
| `site.json` | 站点标题与描述、站点语言、页脚版权、备案信息、favicon、社交链接、后台概览可见性、窄屏站点标题宽度上限（`titleMaxPercent`）、页面外缘间隙（`pageGapPx`） |
| `shell.json` | 侧栏站点名（`brandTitle`）、窄屏标题（`titleNarrow`）、引用文案、导航项的标签、装饰符、顺序与可见性 |
| `home.json` | 首页引导语、更多入口、Hero 图 |
| `page.json` | 各列表页标题与副标题、动态页默认作者、列表页 RSS 开关 |
| `ui.json` | 代码块行号、阅读模式入口、浮动操作列、浏览数据、侧栏动作、文章元信息、侧栏分隔线、字体角色 |

推荐用后台主题页（`/admin/theme/`）修改，直接编辑 JSON 同样有效，字段缺失或非法时回落到默认值。`npm run dev` 下的后台可读写，生产产物中的后台是只读静态壳。

窄屏标题与侧栏站点名同组：`shell.titleNarrow` 留空时与 `shell.brandTitle` 一致，`site.titleMaxPercent` 限制它在窄屏（≤ 900px）下的可渲染宽度。开发环境下修改 `ui.json` 的字体需要重启。

浏览数据（PV / UV）只渲染位置与样式，备案号默认不显示，字段说明见 [docs/analytics.md](docs/analytics.md)。

## 主题同步

`theme:update` 读取 `theme.json` 记录的主题仓库、分支与基准提交，拉取主题新版本，按文件做三方合并：

```bash
npm run theme:update -- --check   # 只报告将要发生的变更，不写入
npm run theme:update              # 执行合并，并更新 theme.json 的基准提交
```

| 情况 | 处理 |
| --- | --- |
| 站点未改动该文件 | 直接取主题新版本 |
| 主题未改动该文件 | 保留站点版本 |
| 双方都改动 | `git merge-file` 合并，冲突保留标记并列出 |
| 文件为二进制 | 整文件取舍；双方都改过则保留站点版本并报冲突 |
| 站点自有路径 | 不覆盖，仅在报告中列出 |

站点自有路径包括 `src/content/`、`src/data/settings/`、`public/images/`、`public/author/`、`public/fonts/`、`tools/`、`tests/fixtures/`、`README.md`、`.github/workflows/pages.yml` 与 `theme.json`。

存在冲突时命令以非零状态退出，且不更新 `theme.json`；解决后重跑。主题删除的文件不会自动移除，报告会列出待确认项。合并完成后建议执行 `npm run verify`。

## 内容模型

| 集合 | 源文件 | 路由 |
| --- | --- | --- |
| 博客 `blog` | `src/content/blog/*.md` | `/blog/`、`/blog/<slug>/` |
| 项目 `projects` | `src/content/projects/*.md` | `/projects/`（页内锚点） |
| 动态 `bits` | `src/content/bits/*.md` | `/bits/`（页内锚点） |
| 更新 `devlog` | `src/content/devlog/*.md` | `/devlog/`（页内锚点） |
| 关于 `about` | `src/content/about/index.md` | `/about/` |

`/archive/` 是跨博客、项目、更新的全站时间线，按年月分组，不含动态。

三种写作入口：后台写作页新建与编辑；在对应目录直接新增 `.md`；`npm run new:bit` 生成动态草稿。frontmatter 字段、图片路径约定与 Markdown 扩展写法见 [docs/writing.md](docs/writing.md)。

## 目录结构

```
src/content/        内容源文件，按集合分目录
src/pages/          路由；admin/ 与 api/admin/ 仅开发环境可用
src/layouts/        BaseLayout、ArticleLayout
src/components/     展示组件；admin/ 为后台界面
src/lib/            设置解析、内容读取与后台逻辑；admin-console/ 为后台专用
src/scripts/        前台脚本；admin-*/ 为后台专用
src/styles/         样式入口与各组件样式
src/plugins/        Markdown 渲染管线：remark / rehype 插件与 HTML 白名单
src/utils/          格式化、日期、slug 规则等通用工具
src/data/settings/  主题设置 JSON
public/             静态资源：fonts/、author/ 等
scripts/            维护脚本：字体子集、各项校验、new:bit、theme:update
tools/              字体字符集基线与指纹
tests/              Vitest 用例与页面快照
docs/               仓库文档
```

分层与数据流见 [docs/architecture.md](docs/architecture.md)。

## 开发与验证

```bash
npm run check     # 类型检查与源码类守卫
npm test          # Vitest
npm run verify    # check、test、build 与产物类校验依次执行
npm run ci        # 等价于 verify，CI 使用
```

`npm run verify` 依次执行 `astro check` 与 `check:svelte`（编译全部 Svelte 组件）、`check:admin-content-source-boundary`（后台内容模块的引用边界）、`check:home-critical-css`（首屏 critical CSS 快照未漂移）、`check:image-references`（图片引用可解析）、`check:font-charset`（字符集与子集一致），然后运行用例、构建、刷新 fixtures，并执行 `check:prod-artifacts`（产物清单、后台只读壳、RSS / sitemap / robots）、`check:layout-geometry`（壳层几何不变量）、`check:touch-targets`（交互元素最终尺寸不小于 44px）。

产物类校验读取 `dist/`，必须在构建后执行；`SITE_URL` 为空时 sitemap 不生成，产物守卫会失败。

字体子集按内容字符集生成：改动内容后运行 `npm run check:font-charset` 确认，必要时用 `npm run font:build` 重新生成（需要 `pyftsubset` 与放在 `tools/fonts-src/` 的源字体）。改动侧栏或壳层尺寸后，需要同步 `src/pages/index.astro` 中 `homeHeadCriticalCss` 的对应声明。

校验脚本清单、测试组织与命名规范见 [docs/development.md](docs/development.md)。

## 部署

### 分支模型

| 分支 | 内容 | 用途 |
| --- | --- | --- |
| `main` | 主题代码、每类一到数条种子内容、中性默认设置 | 模板与更新来源 |
| `demo` | 完整示例内容、示例截图与站点设置 | 部署到 GitHub Pages |

改动方向是单向的：主题改动先在 `main` 完成，再在 `demo` 检出上执行 `npm run theme:update` 同步过去（`demo` 的 `theme.json` 指向本仓库的 `main`）。不要创建 `demo` 合并回 `main` 的请求——两个分支在内容、设置与测试快照上刻意不同，合并会把模板重新变成示例站，并在 `tests/fixtures/` 与 `theme.json` 上产生冲突。详见 [docs/upstream.md](docs/upstream.md)。

### 工作流

仓库自带两个 GitHub Actions 工作流，都不需要配置 secret。

| 工作流 | 触发 | 作用 | 权限 |
| --- | --- | --- | --- |
| `ci.yml` | push / PR 到 `main`、`demo` | `npm ci` 后执行 `npm run ci` | `contents: read` |
| `pages.yml` | push 到 `demo`、手动触发 | 构建并发布到 GitHub Pages | `contents: read`、`pages: write`、`id-token: write` |

`pages.yml` 固定在 `demo` 分支运行，工作流文件本身留在默认分支，因此仍可从 Actions 页面手动触发。`main` 不参与部署。

### 构建期环境变量

| 变量 | 作用 |
| --- | --- |
| `SITE_URL` | 站点 origin，用于 RSS、canonical、og 与 sitemap。为空时 RSS 回落到 `https://example.invalid`，canonical 与 og:url、og:image 省略，sitemap 不生成 |
| `ASTRO_WHONO_BASE_PATH` | 部署子路径，默认 `/`。项目页部署在仓库子路径时由 Pages 工作流推导 |

产物守卫断言 sitemap 存在，因此 CI 与发布构建必须提供 `SITE_URL`；本地仅预览时可省略。

### 配置 GitHub Pages

1. 仓库设为 public。Free 计划下私有仓库无法使用 Pages。
2. Settings → Pages → Source 选 **GitHub Actions**。不要选「Deploy from a branch」：该路径会走 GitHub 内置的 Jekyll 构建，对 Astro 项目必然失败。
3. Settings → Environments → `github-pages` → **Deployment branches and tags** → 加入部署分支（本仓库为 `demo`）。该策略默认只放行默认分支；不放行时 `deploy` 作业会在没有任何步骤执行的情况下立即失败，而 `build` 仍然成功。
4. 触发一次部署：向部署分支推送，或在 Actions → `pages` → Run workflow。

### 部署自己的站点

`pages.yml` 默认只部署 `demo`：`on.push.branches` 与 `actions/checkout` 的 `ref` 都指向它。内容放在 `main` 时要把这两处一起改掉，否则部署的仍是 `demo` 的内容：

- `on.push.branches` 改为自己的部署分支；
- `actions/checkout` 去掉 `ref: demo`，让它检出发起运行的那个提交。

改完后同样要在 `github-pages` 环境里放行新的部署分支。站点地址由工作流按仓库名推导：项目页发布在 `https://<owner>.github.io/<repo>/`，仓库名为 `<owner>.github.io` 时发布在根路径。绑定自定义域名后，把工作流中的 `SITE_URL` 与 `ASTRO_WHONO_BASE_PATH` 改为固定值（`https://你的域名` 与 `/`），否则资源路径会带上仓库子路径而 404。

其他静态托管：构建产物 `dist/` 可直接发布，仓库自带 Netlify 配置（`npm run build` + 发布 `dist`）。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 目录分层、集合与路由、壳层与布局几何、首屏快照、字体子集流程 |
| [docs/development.md](docs/development.md) | 环境、命令、验证流水线、fixture 与守卫脚本、命名规范 |
| [docs/writing.md](docs/writing.md) | 各集合 frontmatter、图片路径、末尾链接组与 Markdown 扩展 |
| [docs/admin-console.md](docs/admin-console.md) | 后台五个模块、主题页分组、校验与排序规则 |
| [docs/analytics.md](docs/analytics.md) | 浏览数据槽位契约、统计接入、备案字段 |
| [docs/upstream.md](docs/upstream.md) | 与上游的关系、增量范围、同步方向 |
| [docs/llm-view-stats-prompt.md](docs/llm-view-stats-prompt.md) | 浏览数据取数脚本的提示词模板 |

## 致谢

本仓库是对 [cxro/astro-whono](https://github.com/cxro/astro-whono)（MIT）的增量改造，站点由 [Astro](https://astro.build/) 构建。

## 许可

MIT，见 [LICENSE](LICENSE)。
