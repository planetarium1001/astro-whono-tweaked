# 与上游的关系

本仓库基于 [cxro/astro-whono](https://github.com/cxro/astro-whono)（MIT），保留上游的双栏壳层、后台控制台、Markdown 扩展与字体子集化流程，在其上做增量改造。仓库保留了上游的提交历史，初始提交来自上游。

上游的集合划分与本仓库不同（历史上使用 `posts`、`essay`、`bits`、`kids` 等目录），本仓库统一为 `blog`、`projects`、`bits`、`devlog`、`about` 五个集合，以本仓库的 [architecture.md](architecture.md) 为准。

## 分支与同步方向

| 分支 | 角色 |
| --- | --- |
| `main` | 模板与主题更新来源 |
| `demo` | 完整示例站，部署到 GitHub Pages |

主题改动在 `main` 完成后单向同步到 `demo`。同步在 `demo` 检出上执行：

```bash
git checkout demo
npm run theme:update        # 加 --check 只报告
```

`demo` 的 `theme.json` 指向本仓库的 `main` 分支，`theme:update` 按文件三方合并，`src/content/`、`src/data/settings/`、`tests/fixtures/`、`theme.json`、`README.md` 等站点自有路径不被覆盖，因此示例内容、示例设置与快照保持不变。

反向合并（`demo` 合回 `main`）会把示例站内容带回模板分支，并在内容、设置、快照与 `theme.json` 上产生冲突，不采用。

另一个方向是上游 → 本仓库，属于手工操作，见下节。

## 相对上游的增量

| 改造 | 内容 |
| --- | --- |
| 文章目录 | 宽屏（≥ 1280px）作为壳层第 4 列，阅读模式下门槛降到 1024px；滚动高亮当前小节，跳转后目标小节短暂高亮；收起状态存 localStorage 并在首次绘制前生效 |
| 浮动操作列 | 文章与列表页右下角常驻阅读模式、回到上次阅读位置、回到顶部，按需出现 |
| 阅读位置记忆 | 按路径存 localStorage（最近标题加段内偏移，滚动比例兜底），本次会话内用位置栈原路返回 |
| 主题切换涟漪 | 以点击处为圆心圆形展开；不支持 View Transitions API 或系统偏好减少动效时直接切换 |
| 侧栏与壳层 | 侧栏由 320px 收窄到 224px，壳层宽度随视口自适应，前后台共用同一组间距 token；`html` 固定滚动条槽位 |
| 页面外缘间隙 | 后台可配 `site.pageGapPx`，构建期把 `--page-gap-inline`、`--page-inline` 与窄屏标题宽度以 `<html>` 内联属性输出 |
| 浏览数据槽位 | 文章元信息行与页脚之上预留 PV / UV 槽位，见 [analytics.md](analytics.md) |
| 备案信息 | 页脚居中显示工信部与公安联网备案号，链接与图标可配置 |
| 卡片弹窗 | 项目与动态卡片整卡可点，弹窗展示完整正文、标签与图片；项目卡片增加 `image` 缩略图与统一头部 |
| 末尾链接组 | `projects` 与 `devlog` 的外链写在正文末尾，渲染为右对齐链接行，见 [writing.md](writing.md) |
| 主题发布 | `theme.json` 与 `npm run theme:update` 把主题更新做成可重复执行的三方合并，站点自有路径不覆盖，见 [../README.md](../README.md) 的「主题同步」 |
| 动态草稿 | 未保留上游的絮语草稿生成器，改用 `npm run new:bit` |

## 吸收上游改动

上游的新版本按普通 git 合并引入：

```bash
git remote add upstream https://github.com/cxro/astro-whono.git
git fetch upstream --tags
git checkout main
git merge upstream/main
npm run check
```

合并后在 `main` 上验证，再按上文的方向同步到 `demo`。

## 合并后的检查

`npm run check` 包含首屏 critical CSS 的漂移检查。`src/pages/index.astro` 的 `homeHeadCriticalCss` 是手写快照，在 head 中位于 `global.css` 之后，同优先级声明会长期覆盖真实样式；上游若改动了侧栏或壳层尺寸，该检查会报错，需要把对应的声明同步进快照。改动这些尺寸后，`npm run check:layout-geometry` 与构建产物上的几何断言也需通过。

上游改动 `src/plugins/` 下的 Markdown 管线时，实例内容可能包含不再被白名单放行的 HTML；`npm run build` 与 `npm run check:markdown-smoke` 能暴露这类问题。
