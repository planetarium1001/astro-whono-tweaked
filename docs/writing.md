# 写作与内容约定

## 集合与写作入口

| 集合 | 源文件 | 路由 |
| --- | --- | --- |
| `blog` | `src/content/blog/*.md` | `/blog/`、`/blog/<slug>/` |
| `projects` | `src/content/projects/*.md` | `/projects/`（页内锚点） |
| `bits` | `src/content/bits/*.md` | `/bits/`（页内锚点） |
| `devlog` | `src/content/devlog/*.md` | `/devlog/`（页内锚点） |
| `about` | `src/content/about/index.md` | `/about/` |

三种写作入口：

- 后台写作页（`/admin/content/`）：新建与编辑，按标题生成条目 ID；仅开发环境可写。
- 在对应集合目录直接新增 `.md`，文件名遵循 [development.md](development.md) 的 `YYYY-MM-DD-title` 规范。
- `npm run new:bit`：在 `src/content/bits/` 生成一条带当前时间与 `draft: true` 的动态草稿。

`draft: true` 只在本地开发中用于预览，生产构建、公开列表与 RSS 会过滤。

## frontmatter 字段

`blog`：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题 |
| `date` | 是 | `YYYY-MM-DD` 或带时区的 ISO 8601 |
| `description` | 否 | 摘要，留空时按正文截取 |
| `tags` | 否 | 字符串数组，默认空 |
| `draft` | 否 | 默认 `false` |
| `publishedAt` | 否 | 带时区的 ISO 8601 |
| `updatedAt` | 否 | `YYYY-MM-DD` 或带时区的 ISO 8601，不得早于 `date` |
| `slug` | 否 | 小写 kebab-case（允许 CJK），覆盖默认路径 |
| `cover` | 否 | 分享图，作为详情页的 `og:image`：相对路径会补上部署子路径并绝对化，也可以直接填完整 `https://` 地址；未填时用主题默认图 `/og-default.png` |
| `badge` | 否 | 标题角标，纯文本 |

`bits`：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `date` | 是 | 日期或日期时间，`z.coerce.date()` 解析 |
| `title`、`description` | 否 | 动态可以无标题 |
| `tags` | 否 | 字符串数组，默认空 |
| `draft` | 否 | 默认 `false` |
| `slug` | 否 | 小写 kebab-case（允许 CJK） |
| `images` | 否 | 数组，每项 `src` 必填，`width`、`height`、`alt` 可选 |
| `author` | 否 | `name`、`avatar` 可选，未填时用 `page.json` 的动态页默认作者 |

`projects`：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题 |
| `date` | 是 | 日期 |
| `subtitle`、`description` | 否 | 副标题与摘要 |
| `type` | 否 | 自由字符串，渲染为标题前的胶囊 |
| `icon` | 否 | 卡片图标 |
| `image` | 否 | 卡片缩略图，文字从其右侧绕排 |
| `draft` | 否 | 默认 `false` |

`projects` 没有 `tags`、`repo`、`demo` 字段，仓库与演示等外链写在正文末尾链接组。

`devlog`：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题 |
| `date` | 是 | 日期 |
| `project` | 是 | 自由字符串，不做链接 |
| `kind` | 否 | 自由字符串，建议 `feature` / `fix` / `improvement` / `breaking` / `docs` |
| `description` | 否 | 摘要 |
| `draft` | 否 | 默认 `false` |

`devlog` 没有 `links` 字段，外链写进正文末尾链接组。

`about` 的 schema 不约束字段，正文写在 `src/content/about/index.md`。

## 图片路径

图片文件放在 `public/` 下，建议按集合与条目分目录：`public/images/{collection}/{slug}/`。

| 位置 | 写法 | 示例 |
| --- | --- | --- |
| 正文 Markdown 与 HTML | 以 `/` 开头，按 `public/` 解析 | `/images/blog/hello/cover.webp` |
| `bits` 的 `images[].src`、`author.avatar` | 不带前导斜杠，不带 `public/` | `images/bits/note/a.webp` |
| `projects` 的 `icon`、`image` | 不带前导斜杠，不带 `public/` | `images/projects/demo/icon.svg` |
| 远程图片 | `https://` 地址 | `https://example.com/a.webp` |

正文引用可以带前导斜杠，也可以写相对路径（`./assets/a.webp`）。frontmatter 的图片字段值带 `/`、`public/`、`http://`、`..`、`?`、`#` 或非图片扩展名时 schema 会报错。`badge` 是纯文本角标，不按图片路径校验。

## 末尾链接组

`projects` 与 `devlog` 的正文末尾可以写一组外链，渲染为右对齐的链接行。

```markdown
项目正文的最后一段。

[仓库](https://github.com/cxro/astro-whono) · [演示](https://example.com)
```

规则：

- 链接组前留一个空行，与正文分成两段。
- 链接组是正文末尾连续若干行，每行只由 markdown 链接与分隔符（空白或 `·|、,，/`）构成，一行可放多个链接。
- 渲染时链接按书写顺序排列，之间只留间隔，不输出分隔符。
- 链接组不参与摘要派生，也不会在正文中重复出现。
- `blog` 不使用这套写法，正文中间的链接按普通 markdown 渲染。

## Markdown 扩展

### 提示块

```markdown
:::tip[提示]
支持 note、tip、info、warning 四种类型，标签可省略。
:::
```

### 图注

```html
<figure class="figure figure--md figure--center">
  <img src="/images/blog/hello/a.webp" alt="示例">
  <figcaption>图注文字</figcaption>
</figure>
```

必须同时写 `figure` 基础类：样式选择器是 `figure.figure--*`，只写修饰类不会生效。尺寸类 `figure--sm`、`figure--md`、`figure--lg`、`figure--full` 与对齐类 `figure--left`、`figure--center`、`figure--right` 可各取一个，省略时按居中默认排版。

### 画廊

```html
<ul class="gallery cols-2">
  <li>
    <figure>
      <img src="/images/blog/hello/a.webp" alt="">
      <figcaption>图注</figcaption>
    </figure>
  </li>
</ul>
```

`ul` 需要带 `gallery`，列数再追加 `cols-2` 或 `cols-3`；只有 `gallery` 时按缺省网格排列，不带 `gallery` 则按普通无序列表渲染。

### 公式

行内公式用 `$$x + y$$`，块级公式把 `$$` 单独成行：

```markdown
行内公式 $$a^2 + b^2 = c^2$$。

$$
\int_0^1 x^2 \, dx
$$
```

单个 `$` 不作为公式定界符，代码块与行内代码里的 `$$` 原样输出。

### 代码块

用围栏代码块并标注语言，渲染时套上工具栏，显示语言与行数、内置复制按钮，行号由后台「代码块行号」开关控制。

````markdown
```ts
export const add = (a: number, b: number): number => a + b;
```
````

### 折叠内容

```markdown
<details>
  <summary>标题</summary>

  折叠的正文。

</details>
```

### 关于页指令

下列指令只在关于页（`src/content/about/index.md`）中生效：

```markdown
::site-info{name="站点名" url="https://example.com" description="一句话简介" avatar="author/avatar.webp"}

:::friend{name="友站" url="https://example.com" avatar="author/avatar.webp"}
友站简介
:::

:::faq{question="问题标题"}
回答正文
:::

::contact-links
```

连续的 `friend` 渲染为友链卡片列表，连续的 `faq` 渲染为问答列表，`::contact-links` 输出站点联系方式。
