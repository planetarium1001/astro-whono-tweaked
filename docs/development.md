# 开发

## 环境要求

Node.js ≥ 22.12.0，版本基线写在 `.nvmrc`（当前 22.22.0）并与 `package.json` 的 `engines` 一致，CI 优先读取 `.nvmrc`。包管理器使用 npm，依赖锁定在 `package-lock.json`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器，后台与 `/api/admin/*` 可用 |
| `npm run dev:clean` | 清理 Vite 缓存后启动 |
| `npm run build` | 构建静态产物到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run check` | 类型检查与源码类守卫 |
| `npm test` | Vitest 用例 |
| `npm run verify` | check、test、build 与产物类校验依次执行 |
| `npm run new:bit` | 生成一条动态草稿 |
| `npm run theme:update` | 从主题仓库同步更新，见 [../README.md](../README.md) 的「同步主题更新」 |
| `npm run font:charset`、`npm run font:subset`、`npm run font:build` | 字体字符集与子集 |

构建期生成 RSS、canonical 与 sitemap 需要提供 `SITE_URL`，产物类守卫也依赖它。构建期环境变量见 [../README.md](../README.md) 的「构建期环境变量」。

## 校验脚本

`npm run check` 依次执行类型检查与下列源码类守卫，它们只读取源文件或设置 JSON：

| 脚本 | 断言内容 |
| --- | --- |
| `astro check` | 类型与模板诊断 |
| `check:svelte` | 用 `svelte/compiler` 编译全部 `.svelte` 组件，覆盖 `astro check` 与构建都不编译的后台编辑器岛 |
| `check:admin-content-source-boundary` | 后台内容模块不越界引用源文件索引与服务端专用模块 |
| `check:home-critical-css` | `src/pages/index.astro` 的 `homeHeadCriticalCss` 快照与 `src/styles` 未漂移 |
| `check:image-references` | 全站图片引用可解析，覆盖 Markdown、HTML `src`、`srcset` 与 frontmatter 字段 |
| `check:font-charset` | `tools/charset-common.txt` 与内容、模板、设置中实际使用的字符集一致 |

`npm run verify` 在此基础上追加：Vitest 用例；`npm run build`；`test:fixtures` 用构建产物刷新 `tests/fixtures/`；`check:prod-artifacts` 断言产物文件清单、后台只读壳与 RSS、sitemap、robots 的内容；`check:layout-geometry` 解析 `dist/_astro/*.css` 与页面内联样式，断言壳层几何不变量；`check:touch-targets` 解析产物 CSS 的声明顺序，断言交互元素的最终生效尺寸不小于 44px。

未纳入 `check` 与 `verify` 的脚本按需单独运行：

| 脚本 | 用途 |
| --- | --- |
| `check:markdown-smoke` | Markdown 渲染契约，需要已构建的 `dist/` |
| `check:admin-editor-emoji-boundary` | 编辑器工具栏与 emoji 选择器的引用边界 |
| `smoke:cloud-images` | 云端图片，需要对象存储凭据，未设置 `ASTRO_WHONO_CLOUD_SMOKE=1` 时跳过 |
| `audit:prod` | 生产依赖的已知漏洞 |

## 字体子集

仓库提交的是子集化后的 WOFF2 字体，按 latin / cjk-common / cjk-ext 三段切分，`global.css` 用 `unicode-range` 按需加载，clone 后无需额外步骤。

字符集由 `src/content`、`src/pages`、`src/components`、`src/layouts`、`src/data/settings`、`site.config.mjs` 的文本与 `tools/charset-base.txt`（3500 常用字）共同生成，写入 `tools/charset-common.txt`，不要手改。

`npm run font:charset` 只重算字符集，`npm run font:build` 等于 `font:charset` 加 `font:subset`。`font:subset` 每次都会重建全部子集，成功后把字符集指纹写入 `tools/charset-common.sha256`，供 `check:font-charset` 校验 woff2 未过期。

重新生成子集需要 Python 3 与 `pyftsubset`（`python -m pip install fonttools brotli zopfli`，并确保 Python Scripts 目录在 `PATH` 中），源字体放在 `tools/fonts-src/`。缺字时把字符补进 `tools/charset-base.txt` 后重跑，`check:font-charset` 会指出不一致。

## 测试组织

Vitest 配置在 `vitest.config.ts`，用例位于 `tests/*.test.ts`，默认运行在 Node 环境。需要 DOM 的用例在文件首行声明 `// @vitest-environment jsdom`，不使用全局环境切换。

| 目录与文件 | 覆盖范围 |
| --- | --- |
| `tests/admin-content-*.test.ts`、`tests/admin-images-*.test.ts` | 后台内容与图片契约、读写流程、批量操作 |
| `tests/admin-editor-*.test.ts` | 编辑器转换、检索、大纲与恢复 |
| `tests/*-client.test.ts` | 前台列表页、目录、筛选等客户端行为 |
| `tests/markdown-*.test.ts`、`tests/about-directives.test.ts` | Markdown 管线与指令渲染 |
| `tests/theme-settings.test.ts`、`tests/filings.test.ts`、`tests/view-stats.test.ts` | 设置解析、备案与浏览数据 |
| `tests/fixtures/` | 由构建产物生成的页面快照，供客户端行为用例读取 |
| `src/test-fixtures/*.md` | Markdown 冒烟夹具，渲染结果由 `check:markdown-smoke` 断言 |

写入类用例通过 `tests/admin-content-write-fixture.ts` 在系统临时目录搭出内容目录，并用环境变量把设置目录与项目根指向临时位置，测试结束即清理，不触碰仓库内的真实内容。

## 内容命名规范

内容源文件名即条目 ID，规范为 `YYYY-MM-DD-title`：

- 日期取 UTC 分量，与 frontmatter 的 `date` 对齐。
- 标题段经 NFKC 归一化、转小写、空白与符号折叠为单个连字符，允许中文；超出长度上限时截断并追加稳定短哈希。
- 标题段为空时回退为 `untitled`，命中 Windows 保留设备名时追加 `-entry`。

构造逻辑集中在 `src/utils/slug-rules.ts` 的 `buildContentEntryId()`，后台写作页新建条目时调用它。`npm run new:bit` 按 `YYYY-MM-DD-HHMM` 生成动态草稿。博客详情的公开 slug 默认由条目 ID 去掉日期前缀得到，可用 frontmatter 的 `slug` 覆盖，取值须为小写 kebab-case（允许 CJK），且不得与 `/blog/` 下的静态路由冲突。

## CI

两个工作流见 `.github/workflows/`，均不需要配置 secret。

| 工作流 | 触发 | 作用 |
| --- | --- | --- |
| `ci.yml` | push 与 PR 到 `main`、`demo` | 按 `.nvmrc` 安装 Node、`npm ci`，以 `SITE_URL=https://astro-whono.example.com` 执行 `npm run ci`（等同 `verify`） |
| `pages.yml` | push 到 `demo`、手动触发 | 检出 `demo`、构建 `dist/` 并发布到 GitHub Pages |

依赖安装后 CI 必须提供 `SITE_URL`：`astro.config.mjs` 只在 `SITE_URL` 非空时注册 sitemap 集成，而产物守卫会断言 `dist/sitemap-*.xml` 存在。

## 双分支发布模型

`main` 是模板分支，只保留每类一到数条种子内容；`demo` 是完整示例站点，并承载 Pages 部署。工作流文件本身留在默认分支，`pages.yml` 因此也可从 Actions 页面手动触发。

Pages 构建在项目页场景下把 `SITE_URL` 定为 `https://<owner>.github.io`，把 `ASTRO_WHONO_BASE_PATH` 定为 `/<repo>/`，仓库名为 `<owner>.github.io` 时 base 取 `/`。绑定自定义域名后需把这两项改为固定域名与 `/`。
