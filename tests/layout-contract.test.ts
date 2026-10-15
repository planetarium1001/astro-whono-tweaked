import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 只能在单位层守住的布局与交互不变量：类型检查、构建与 DOM 断言都覆盖不到。
 * jsdom 不做布局，端到端用例断言不了几何，因此直接读样式与组件源码做契约断言。
 */

const SRC = process.cwd();
const read = (relative: string) => readFile(path.join(SRC, relative), 'utf8');

const DEVLOG_CSS = 'src/styles/devlog-page.css';
const LAYOUT_CSS = 'src/styles/components/layout.css';
const ENTRY_TAGS_CSS = 'src/styles/components/entry-tags.css';
const TAG_HEADER_ASTRO = 'src/components/TagFilterHeader.astro';
const BASE_LAYOUT_ASTRO = 'src/layouts/BaseLayout.astro';

describe('页头：标题 + 两行块（tag 行 / 描述行）', () => {
  const ROW_SELECTOR = String.raw`\.page-header :is\(\.page-heading--tag-slot, \.page-heading--tag-bar\)`;

  it('tag 行与描述行都在第 2 列、行距 0，标题跨两行', async () => {
    const layout = await read(LAYOUT_CSS);
    const grid = /\.page-header \.page-heading--tag-bar\s*\{([^}]*)\}/.exec(layout)?.[1] ?? '';

    expect(grid).toContain('display: grid');
    // tag 行与描述行之间的观感要等于正文行距 → 不留额外行距
    expect(grid).toMatch(/row-gap:\s*0/);

    // 标题跨两行 → 「tag 行 + 描述行」作为一个整体与标题同行
    expect(layout).toMatch(
      new RegExp(`${ROW_SELECTOR} \\.page-title-row > \\.page-title\\s*\\{[^}]*grid-row:\\s*1 \\/ span 2`)
    );
    // 两行都落在第 2 列 → 左缘完全一致
    expect(layout).toMatch(
      new RegExp(`${ROW_SELECTOR} \\.page-title-row > \\.entry-tag-apply\\s*\\{[^}]*grid-column:\\s*2`)
    );
    expect(layout).toMatch(
      new RegExp(`${ROW_SELECTOR} \\.page-subtitle\\s*\\{[^}]*grid-column:\\s*2`)
    );
  });

  it('已选胶囊压到 20px 高（配合行距 0 才像相邻两行正文）', async () => {
    const entryTags = await read(ENTRY_TAGS_CSS);
    const chip = /\.entry-tag-chip\s*\{([^}]*)\}/.exec(entryTags)?.[1] ?? '';
    expect(chip).toMatch(/min-height:\s*20px/);
  });

  // 必须预留 tag 行的位置，否则选择 / 取消标签时描述行会跳动。页头只要有 tag 入口
  // 就锁成两行结构（服务端类 `page-heading--tag-slot`），未选中时第 1 行也占住胶囊高度。
  it('没选标签时也预留 tag 行高度（描述行不跳）', async () => {
    const [layout, header] = await Promise.all([read(LAYOUT_CSS), read(TAG_HEADER_ASTRO)]);

    // 服务端渲染的 slot 类
    expect(header).toMatch(/hasTagEntry && 'page-heading--tag-slot'/);
    // 预留行高
    expect(layout).toMatch(
      /\.page-header \.page-heading--tag-slot:not\(\.page-heading--tag-bar\)\s*\{[^}]*grid-template-rows:\s*var\(--page-tag-slot-height, 20px\) auto/
    );
  });

  // /blog/ /bits/ /archive/ 的页头带 `--with-search`，lists.css 的 0,3,0 规则会覆盖
  // display / align-items / gap，多出 12px 行距；必须用 0,4,0 把这三个属性抢回来。
  it('带搜索框的页头用 0,4,0 抢回 display / align-items / gap', async () => {
    const layout = await read(LAYOUT_CSS);
    const override =
      /\.page-header\.page-header--with-search \.page-heading\.page-heading--tag-bar\s*\{([^}]*)\}/.exec(layout)?.[1] ?? '';

    expect(override).toContain('display: grid');
    expect(override).toMatch(/align-items:\s*center/);
    expect(override).toMatch(/row-gap:\s*0/);
    expect(override).toMatch(/column-gap:\s*10px/);
    // 该 0,4,0 规则按「特异度 + 顺序」生效，必须排在文件里最后
    expect(layout.lastIndexOf('.page-heading.page-heading--tag-bar')).toBeGreaterThan(
      layout.lastIndexOf('.page-heading--tag-slot:not(')
    );
  });

  // 窄屏下 tag 块在标题行里底部对齐，与描述行之间保持宽屏那种行距；
  // 在剩余宽度内换行，标签多时回退成两行。
  it('窄屏：tag 块底部对齐并占满标题右侧的剩余宽度', async () => {
    const entryTags = await read(ENTRY_TAGS_CSS);
    const narrow = entryTags.slice(entryTags.indexOf('@media (max-width: 900px)'));

    expect(narrow).toMatch(/\.page-title-row\s*\{[^}]*width:\s*100%[^}]*align-items:\s*flex-end/);
    expect(narrow).toMatch(
      /\.entry-tag-apply\s*\{[^}]*flex:\s*1 1 0[^}]*min-width:\s*0[^}]*align-self:\s*flex-end/
    );
  });

  // 单行 tag 时胶囊底部要与标题底部齐平：标题的行盒先收紧（否则 body 的 1.75 行高
  // 会把胶囊顶得很低），胶囊再上抬一点。
  it('窄屏：标题行盒收紧 + 胶囊上抬，使胶囊底部与标题底部齐平', async () => {
    const entryTags = await read(ENTRY_TAGS_CSS);
    const narrow = entryTags.slice(entryTags.indexOf('@media (max-width: 900px)'));

    expect(narrow).toMatch(
      /\.page-header \.page-heading--tag-slot \.page-title\s*\{[^}]*line-height:\s*1\.15/
    );
    expect(narrow).toMatch(/\.entry-tag-apply\s*\{[^}]*margin-bottom:\s*0\.25rem/);
  });
});

describe('/devlog/：间距不变量', () => {
  it('正文上下边距 = 收缩状态条目行距的 1/2（同一 token 的 1× vs 2×）', async () => {
    const css = await read(DEVLOG_CSS);

    const padY = Number(/--devlog-row-pad-y:\s*([\d.]+)px/.exec(css)?.[1] ?? Number.NaN);
    expect(Number.isFinite(padY), '需要 --devlog-row-pad-y 这个 token').toBe(true);
    expect(padY).toBeGreaterThan(0);

    // 条目之间没有任何 margin/gap → 行距 = 上下 padding 之和 = 2 × padY
    expect(css).toMatch(/\.devlog-list\s*\{[^}]*gap:\s*0/);

    // 正文的上下边距 = 1/4 × 行距（= padY / 2）
    expect(css).toMatch(
      /\.devlog-panel__inner\s*\{[^}]*padding:\s*calc\(var\(--devlog-row-pad-y\) \/ 2\)[^;]*calc\(var\(--devlog-row-pad-y\) \/ 2\)/
    );
    // 摘要与正文之间不留额外间隙（靠行高形成正常行距）
    expect(css).toMatch(/\.devlog-panel__inner\s*\{[^}]*gap:\s*0/);

    // `.prose p` 自带 `margin: 12px 0`，首尾子元素必须归零，否则 5px 会被撑成 17px
    expect(css).toMatch(
      /\.devlog-panel__inner \.devlog-panel__prose > :first-child[\s\S]{0,180}?margin-block:\s*0/
    );
  });

  it('日期与项目名的间距收紧：日期列改 max-content + 列间距 ≤ 8px', async () => {
    const css = await read(DEVLOG_CSS);

    expect(css, '固定日期列宽已经删掉').not.toContain('--devlog-date-column');
    expect(css).toMatch(/grid-template-columns:\s*max-content auto auto minmax\(0,\s*1fr\) auto/);

    const gap = Number(/--devlog-gap:\s*([\d.]+)px/.exec(css)?.[1] ?? Number.NaN);
    expect(Number.isFinite(gap), '需要 --devlog-gap').toBe(true);
    expect(gap).toBeLessThanOrEqual(8);
  });
});

describe('/devlog/：摘要回退策略', () => {
  it('回退态隐藏全部摘要、正常态不重复显示正文里的摘要', async () => {
    const css = await read(DEVLOG_CSS);

    expect(css).toMatch(
      /\.devlog-list\[data-devlog-excerpts='fallback'\] \.devlog-row__description\s*\{[^}]*display:\s*none/
    );
    expect(css).toMatch(
      /\.devlog-list\[data-devlog-excerpts='inline'\] \.devlog-panel__summary\s*\{[^}]*display:\s*none/
    );
    // 不得使用容器查询逐条隐藏摘要：会让标题一起被压缩
    expect(css).not.toContain('@container');
  });

  it('判定脚本把「任何一条被压缩 → 整体回退」写在列表属性上（窄屏直接回退）', async () => {
    const script = await read('src/scripts/devlog-excerpts.ts');

    expect(script).toContain("list.dataset.devlogExcerpts");
    expect(script).toContain('scrollWidth > description.clientWidth + 1');
    expect(script).toMatch(/descriptions\.some\(/);
    expect(script).toContain('(max-width: 900px)');
    // 摘要在列表里放不下时，正文顶部的完整摘要要放开
    expect(script).toContain('summary.hidden = !fallback');
  });
});

describe('/devlog/：时间线收尾', () => {
  it('最后一条收起时线止于日期，展开后补上这一段并淡入淡出', async () => {
    const css = await read(DEVLOG_CSS);

    // 补丁挂在日期元素上：`top: 100%` 就是日期下沿，不用算行内 baseline 偏移
    expect(css).toMatch(
      /\.devlog-row:is\(:last-child, \.is-last-visible\) \.devlog-row__date::after\s*\{[^}]*top:\s*100%[^}]*width:\s*4px[^}]*background:\s*var\(--bg\)/
    );
    // 补丁裁在行内（不会溢到页脚）
    expect(css).toMatch(
      /\.devlog-row:is\(:last-child, \.is-last-visible\) \.devlog-row__toggle\s*\{[^}]*overflow:\s*hidden/
    );
    // 展开 → 补丁淡出（这一段线露出来）；收起 → 淡入（重新盖住）
    expect(css).toMatch(
      /\.devlog-row:is\(:last-child, \.is-last-visible\)\.is-open \.devlog-row__date::after\s*\{[^}]*opacity:\s*0/
    );
    expect(css).toMatch(/transition:\s*opacity 220ms ease/);
    // 减少动效时不播过渡
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.devlog-row:is\(:last-child, \.is-last-visible\) \.devlog-row__date::after/
    );

    // 按项目筛选后，新的「最后一条」也要收尾（脚本按计划结果同步打标记）
    const filterScript = await read('src/scripts/devlog-filter.ts');
    expect(filterScript).toContain("classList.toggle('is-last-visible'");
    expect(filterScript).toContain('reverse().find((row) => matches(row))');
  });
});

describe('/devlog/：摘要回退的过渡', () => {
  it('先淡出，再过渡正文行高并并行淡入摘要，两段时长都不低于下限', async () => {
    const script = await read('src/scripts/devlog-excerpts.ts');

    expect(script).toContain('FADE_MS');
    expect(script).toMatch(/\[\{ opacity: 1 \}, \{ opacity: 0 \}\]/);
    expect(script).toMatch(/\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);
    expect(script).toContain('prefers-reduced-motion');
    // 摘要淡出走完之后才落 hidden、才跑行高过渡
    expect(script).toContain('Promise.all(fadeOuts.map(');
    // 行高过渡要覆盖正文那一部分
    expect(script).toMatch(/const animateRowHeights = /);
    expect(script).toMatch(/\[\{ height: `\$\{from\}px` \}, \{ height: `\$\{to\}px` \}\]/);
    // 摘要文本并行淡入
    expect(script).toMatch(/const fadeSummariesIn = /);
    // 过渡整体时长下限
    const fade = Number(/const FADE_MS = (\d+)/.exec(script)?.[1] ?? 0);
    const reflow = Number(/const REFLOW_MS = (\d+)/.exec(script)?.[1] ?? 0);
    expect(fade).toBeGreaterThanOrEqual(260);
    expect(reflow).toBeGreaterThanOrEqual(300);
  });
});

describe('/devlog/：窄屏时间线与两行条目', () => {
  it('时间线保持逐行 + 逐面板可见，标题以时间线为左边距', async () => {
    const css = await read(DEVLOG_CSS);
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));

    // 窄屏下行的线与面板的线都保持可见
    expect(narrow).not.toMatch(/\.devlog-row__toggle::before,[\s\S]{0,80}?display:\s*none/);
    expect(narrow).not.toContain('.devlog-list::before');

    // 标题缩进 = 线位置 + 线到内容的间隙 − 行自身左内边距
    expect(narrow).toMatch(
      /\.devlog-row__headline\s*\{[^}]*padding-left:\s*calc\(var\(--devlog-line-x\) \+ var\(--devlog-line-gutter\) - var\(--devlog-row-pad-x\)\)/
    );
    // 日期底色让线在日期处断开
    expect(css).toMatch(/\.devlog-row__date\s*\{[^}]*background:\s*var\(--bg\)/);
  });

  it('窄屏条目是两行：meta + 箭头一行、标题一行', async () => {
    const css = await read(DEVLOG_CSS);
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));

    expect(narrow).toMatch(/\.devlog-row__action\s*\{[^}]*order:\s*0[^}]*margin-left:\s*auto/);
    expect(narrow).toMatch(/\.devlog-row__headline\s*\{[^}]*order:\s*1[^}]*flex:\s*1 0 100%/);
  });
});

describe('tag dialog：逻辑预览长胶囊（无搜索框）', () => {
  it('活动 dialog 不渲染筛选输入框', async () => {
    const [header, entryTags] = await Promise.all([read(TAG_HEADER_ASTRO), read(ENTRY_TAGS_CSS)]);

    expect(header).not.toContain('data-entry-tag-filter');
    expect(entryTags).not.toContain('.entry-tags-dialog__filter');
  });

  it('标题与标签列表之间有一行「长胶囊 + +//」，`+` `/` 在胶囊右边', async () => {
    const header = await read(TAG_HEADER_ASTRO);
    const row = /<div class="entry-tags-dialog__expression-row">([\s\S]*?)\n        <\/div>/.exec(header)?.[1] ?? '';

    expect(row, '需要新增的逻辑预览行').not.toBe('');
    const expressionAt = row.indexOf('data-entry-tag-expression');
    const modeAt = row.indexOf('entry-tags-dialog__mode');
    expect(expressionAt, '预览行里要有长胶囊').toBeGreaterThanOrEqual(0);
    expect(modeAt, '`+` `/` 开关要在这一行里').toBeGreaterThan(expressionAt);

    // 标题行的动作区只剩「清除筛选 + 关闭」
    const actions = /<div class="entry-tags-dialog__actions">([\s\S]*?)\n          <\/div>/.exec(header)?.[1] ?? '';
    expect(actions).not.toContain('entry-tags-dialog__mode');
    expect(actions).toContain('data-entry-tag-clear');
  });

  it('表达式渲染走纯函数模块（括号 + 淡入淡出）', async () => {
    const [script, entryTags] = await Promise.all([read('src/scripts/entry-search.ts'), read(ENTRY_TAGS_CSS)]);

    expect(script).toContain('buildExpressionTokens');
    expect(script).toContain('switchPendingOp');
    expect(entryTags).toMatch(/\.entry-tags-dialog__expression\s*\{[^}]*border-radius:\s*999px/);
    expect(entryTags).toMatch(/\.entry-tags-dialog__expression-chip\s*\{/);
  });
});

describe('窄屏站点标题宽度：后台百分比设置', () => {
  it('样式消费 CSS 变量，默认 35%', async () => {
    const layout = await read(LAYOUT_CSS);
    const narrowTitle =
      /:where\(body:not\(\.admin-page\)\) \.sidebar__title\s*\{([^}]*)\}/.exec(layout)?.[1] ?? '';

    expect(narrowTitle, '需要窄屏的 .sidebar__title 规则').not.toBe('');
    expect(narrowTitle).toMatch(/max-width:\s*var\(--site-title-max-inline,\s*35%\)/);
    // 动作按钮仍然贴右端（否则标题封顶后按钮会跑到中间）
    expect(layout).toMatch(
      /:where\(body:not\(\.admin-page\)\) \.sidebar-actions\s*\{[^}]*margin-left:\s*auto/
    );
  });

  it('BaseLayout 把设置写成 <html> 内联变量', async () => {
    const layout = await read(BASE_LAYOUT_ASTRO);
    expect(layout).toContain('--site-title-max-inline: ${siteTitleMaxPercent}%');
    expect(layout).toContain('settings.site.titleMaxPercent');
    expect(layout).toContain('style={htmlStyleOverride}');
  });
});

describe('页面外缘间隙：后台 px 设置', () => {
  it('BaseLayout 把间隙与换算后的 --page-inline 写成 <html> 内联属性', async () => {
    const [layout, globalCss, themeSettings] = await Promise.all([
      read(BASE_LAYOUT_ASTRO),
      read('src/styles/global.css'),
      read('src/lib/theme-settings.ts')
    ]);

    // 内联的是解析后的数值（不在 CSS 里写 calc）：内联优先级高于 :root 与首屏 critical 快照
    expect(layout).toContain('settings.site.pageGapPx');
    expect(layout).toContain('--page-gap-inline: ${sitePageGapPx}px');
    expect(layout).toContain('--page-inline: ${pageInlinePx}px');
    expect(layout).toContain('const pageInlinePx = sitePageGapPx - SCROLLBAR_GUTTER_INLINE_PX');
    // 槽宽常量在共享的设置模块里只定义一次，注释指向 CSS token；公开布局不依赖后台模块
    expect(themeSettings).toContain('SCROLLBAR_GUTTER_INLINE_PX = 15');
    expect(themeSettings).toContain('--scrollbar-gutter-inline');
    expect(layout).not.toContain('admin-console/theme-shared');
    expect(globalCss).toMatch(/--scrollbar-gutter-inline:\s*15px/);
    // 窄屏把两侧内边距都覆写到 body，后代以 body 为准（内联的 html 值不参与）
    expect(globalCss).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?body:not\(\.admin-page\)[\s\S]*?--page-gap-inline:\s*0px[\s\S]*?--page-inline:\s*0px/
    );
  });

  it('几何守卫从构建页面的 <html> 内联属性读生效值，并断言结束内边距 == 间隙 − 槽宽', async () => {
    const guard = await read('scripts/check-layout-geometry.mjs');

    // 生效值在 <html style> 上：:root 与 critical 快照里的 --page-inline 只是默认值
    expect(guard).toContain('readHtmlInlineVariables');
    expect(guard).toContain("path.join(root, 'dist', 'index.html')");
    expect(guard).toContain("'--page-gap-inline'");
    expect(guard).toMatch(/near\(O,\s*pageGap - gutter\)/);
    // 把手内边距随结构移到目录表头
    expect(guard).toContain("bySelector.get('.article-toc__rail-head')");
    // 比的是内容盒两侧的视觉间隙（起始内边距 == 结束内边距 + 槽宽）
    expect(guard).toMatch(/const rightInset = shellPadEnd \+ gutter;/);
  });

  it('壳层起始内边距取视觉间隙、结束内边距扣掉滚动条槽', async () => {
    const [layoutCss, critical] = await Promise.all([
      read('src/styles/components/layout.css'),
      read('src/pages/index.astro')
    ]);

    // 两侧都用 --page-inline 会让内容盒右缘比左缘多出一个槽的距离
    const shell = /padding-inline:\s*var\(--page-gap-inline\)\s*var\(--page-inline\);/g;
    expect(layoutCss.match(shell), '公开壳层与后台壳层都要按起始/结束分别取值').toHaveLength(2);
    // 首屏快照必须同形，否则首屏会跳一下
    expect(critical).toContain('padding-inline: var(--page-gap-inline) var(--page-inline);');
  });
});

describe('项目卡片与末尾链接行', () => {
  it('整卡可点、链接固定在右下角并抬到覆盖层之上，悬停下划线贴文字', async () => {
    const [card, links] = await Promise.all([
      read('src/styles/projects-page.css'),
      read('src/styles/components/trailing-links.css')
    ]);

    // 按钮的覆盖层铺满卡片（卡片是定位祖先），整卡可点
    expect(card).toMatch(/\.project-card\s*\{[^}]*position:\s*relative/);
    expect(card).toMatch(/\.project-card__main::after\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/);
    // 链接行固定在卡片右下角，并抬到覆盖层之上保持可点
    expect(card).toMatch(/\.project-card \.trailing-links\s*\{[^}]*margin-top:\s*auto/);
    expect(card).toMatch(/\.project-card \.trailing-links\s*\{[^}]*z-index:\s*1/);
    // 触控热区用覆盖层实现，视觉高度就是文字一行
    expect(links).toMatch(/\.trailing-links a::after\s*\{[^}]*height:\s*var\(--tap-min-h\)/);
    expect(links).not.toMatch(/\.trailing-links a\s*\{[^}]*min-height/);
    // 悬停下划线用 text-decoration 贴文字，不画在盒子底边
    expect(links).toMatch(/\.trailing-links a:hover[\s\S]{0,200}?text-decoration:\s*underline/);
    expect(links).toMatch(/\.prose \.trailing-links a\s*\{[^}]*border-bottom:\s*0/);
  });

  it('多列时所有行等高：行高由栅格统一，单卡仍有高度上限', async () => {
    const css = await read('src/styles/projects-page.css');

    // grid-auto-rows: 1fr 让每一行都取最高卡片的高度，避免某一行更高；多列时才需要
    expect(css).toMatch(
      /@media \(min-width: 641px\)\s*\{[^@]*?\.projects-page \.project-grid\s*\{[^}]*grid-auto-rows:\s*1fr/
    );
    expect(css).toMatch(/\.projects-page \.project-grid\s*\{[^}]*align-items:\s*stretch/);
    expect(css).toMatch(/\.project-card\s*\{[^}]*max-height:\s*320px/);
  });

  it('展示图：可选字段渲染成与文字左对齐的缩略图', async () => {
    const [schema, page, css] = await Promise.all([
      read('src/content.config.ts'),
      read('src/pages/projects/index.astro'),
      read('src/styles/projects-page.css')
    ]);

    // 可选前置字段，路径写法与 icon 一致
    expect(schema).toMatch(
      /icon: z\.string\(\)\.optional\(\),[\s\S]{0,200}?image: z\.string\(\)\.optional\(\)/
    );
    expect(page).toContain('image: entry.data.image?.trim() || null,');
    // 卡片里与文字同列渲染，路径经 withBase 解析
    expect(page).toMatch(
      /card\.image \? \(\s*<span class="project-card__image">\s*<img src=\{withBase\(card\.image\)\}/
    );
    // 头部两列顶部对齐：图标在左，胶囊标题与小号副标题在右
    expect(css).toMatch(/\.project-card__head\s*\{[^}]*display:\s*flex[^}]*align-items:\s*flex-start/);
    expect(css).toMatch(/\.project-card__headings\s*\{[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/\.project-card__title\s*\{[^}]*font-size:\s*16px/);
    expect(css).toMatch(/\.project-card__subtitle\s*\{[^}]*font-size:\s*12px/);
    // 正文容器用 flow-root 包住浮动，展示图左浮动、正文整体不被推右
    expect(css).toMatch(/\.project-card__main\s*\{[^}]*display:\s*block/);
    expect(css).toMatch(/\.project-card__body\s*\{[^}]*display:\s*flow-root/);
    expect(css).toMatch(/\.project-card__image\s*\{[^}]*float:\s*left/);
    // 固定框裁切，高度可预期
    expect(css).toMatch(/\.project-card__image img\s*\{[^}]*height:\s*96px[^}]*object-fit:\s*cover/);
    // 弹窗复用同一套图标样式与头部
    expect(css).toMatch(/\.project-card__icon,\s*\n\.project-dialog__icon\s*\{/);
    expect(page).toContain('<span class="project-dialog__icon">');
    expect(css).toMatch(/\.project-dialog__icon\s*\{[^}]*width:\s*44px/);

    // 头部在图标之后，展示图排在头部之后、文段之前，文段才会绕开它
    const iconIndex = page.indexOf('class="project-card__icon"');
    const titleIndex = page.indexOf('class="project-card__title-row"');
    const headEndIndex = page.indexOf('class="project-card__image"');
    const descIndex = page.indexOf('class="project-card__description"');
    expect(iconIndex).toBeGreaterThan(-1);
    expect(iconIndex).toBeLessThan(titleIndex);
    expect(titleIndex).toBeLessThan(headEndIndex);
    expect(headEndIndex).toBeLessThan(descIndex);
  });
});

describe('卡片弹窗：统一宽度与滚动区', () => {
  it('项目与动态的卡片弹窗共用同一份宽度 token', async () => {
    const [global, projects, bits] = await Promise.all([
      read('src/styles/global.css'),
      read('src/styles/projects-page.css'),
      read('src/styles/components/bit-card.css')
    ]);

    expect(global).toMatch(/--card-dialog-inline-size:\s*min\(920px, calc\(100vw - 64px\)\)/);
    expect(projects).toMatch(/\.project-dialog\s*\{[^}]*width:\s*var\(--card-dialog-inline-size\)/);
    expect(bits).toMatch(/\.bit-dialog\s*\{[^}]*width:\s*var\(--card-dialog-inline-size\)/);
    // 写死宽度会让两个页面的弹窗在同一视口下不等宽（宽屏上尤其明显）
    expect(projects).not.toMatch(/\.project-dialog\s*\{[^}]*width:\s*min\(/);
    expect(bits).not.toMatch(/\.bit-dialog\s*\{[^}]*width:\s*min\(/);
  });

  it('滚动区按需出现：末尾外边距归零，overflow 不用 scroll', async () => {
    const [projects, bits] = await Promise.all([
      read('src/styles/projects-page.css'),
      read('src/styles/components/bit-card.css')
    ]);

    // 内容放得下时不该出现滚动条：末尾元素折叠出来的外边距会算进滚动区
    expect(projects).toMatch(/\.project-dialog__content > :last-child[\s\S]{0,140}?\{[^}]*margin-bottom:\s*0/);
    expect(bits).toMatch(/\.bit-dialog__content > :last-child[\s\S]{0,140}?\{[^}]*margin-bottom:\s*0/);
    expect(projects).toMatch(/\.project-dialog__content\s*\{[^}]*overflow-y:\s*auto/);
    expect(bits).toMatch(/\.bit-dialog__content\s*\{[^}]*overflow-y:\s*auto/);
    expect(projects).not.toMatch(/overflow-y:\s*scroll/);
    expect(bits).not.toMatch(/overflow-y:\s*scroll/);
  });
});

describe('阅读模式与页脚位置', () => {
  it('阅读模式把左栏两列 token 收为 0，正文内边距沿用 --pad-x', async () => {
    const [layout, toc] = await Promise.all([
      read('src/styles/components/layout.css'),
      read('src/styles/components/article-toc.css')
    ]);

    // 收起左栏靠 token 归零：目录的栅格规则引用同一对 token，因此无需逐条覆写
    expect(layout).toMatch(
      /body\.immersive-page\[data-reading="immersive"\]\s*\{[^}]*--sidebar:\s*0px[^}]*--layout-divider-inline-size:\s*0px/
    );
    expect(toc).toMatch(
      /grid-template-columns:[\s\S]{0,140}?var\(--sidebar\)[\s\S]{0,100}?var\(--layout-divider-inline-size\)/
    );
    // 阅读模式的正文左右内边距跟随普通设计
    expect(layout).toMatch(
      /body\.immersive-page\[data-reading="immersive"\] \.content\s*\{[^}]*padding:\s*64px var\(--pad-x\)/
    );
  });

  it('公开页页脚贴页面底部：内容区底部不留内边距，页脚自身顶到底部', async () => {
    const layout = await read('src/styles/components/layout.css');
    expect(layout).toMatch(/:where\(body:not\(\.admin-page\)\) \.content\s*\{[^}]*padding-bottom:\s*0/);
    expect(layout).toMatch(/\.site-footer\s*\{[^}]*margin-top:\s*auto/);
  });
});

describe('文章目录列：右边界跟随页面外缘间隙', () => {
  it('列宽 = 文字区宽度 - --page-inline，补偿移到表头且收起态抵消', async () => {
    const css = await read('src/styles/components/article-toc.css');

    // 「文字区宽度」与「列宽」是两个变量：列右边界落在壳层内容盒右缘，左边界不随间隙变化
    expect(css).toMatch(/--article-toc-inline-size:\s*260px/);
    expect(css).toMatch(
      /--article-toc-column:\s*calc\(var\(--article-toc-inline-size\) - var\(--page-inline\)\)/
    );

    // 补偿放在表头：列不用负右外边距，右内边距归 0
    const rail = /^\.article-toc--rail\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(rail, '需要 .article-toc--rail 规则').not.toBe('');
    expect(rail).toMatch(/margin-right:\s*0/);
    expect(rail).toMatch(/padding:\s*var\(--sidebar-padding-block\) 0 40px 0/);

    const head = /^\.article-toc__rail-head\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
    expect(head, '需要 .article-toc__rail-head 规则').not.toBe('');
    expect(head).toMatch(/margin-right:\s*calc\(var\(--page-inline\) \* -1\)/);
    expect(head).toMatch(/padding-right:\s*var\(--rail-action-offset\)/);

    // 收起 / 入场态抵消表头补偿，把手位置与今天一致
    expect(css).toMatch(
      /:root\[data-toc-collapsed='true'\] \.article-toc__rail-head,[\s\S]*?:root\[data-toc-intro='true'\] \.article-toc__rail-head\s*\{[^}]*margin-right:\s*0[^}]*padding-right:\s*0/
    );
    // 收起态列宽与 1024–1280 的占位规则保持不变
    expect(css).toMatch(/--article-toc-column:\s*var\(--article-toc-handle-column\)/);
    expect(css).toMatch(
      /@media \(min-width: 1024px\) and \(max-width: 1279\.98px\)[\s\S]*?minmax\(0, 1fr\)\s*\n?\s*0px;/
    );
  });
});

describe('主题涟漪：按目标主题分类方向', () => {
  it('亮色从点击处扩散、暗色从四周向点击处收敛', async () => {
    const [script, globalCss] = await Promise.all([
      read('src/scripts/sidebar-theme.ts'),
      read('src/styles/global.css')
    ]);

    expect(script).toMatch(/const expanding = targetTheme === 'light'/);
    // 扩散：新快照 clip 从 0 到整圆；收敛：旧快照 clip 从整圆到 0
    expect(script).toMatch(/expanding\s*\?\s*\[circle\(0\), circle\(radius\)\]\s*:\s*\[circle\(radius\), circle\(0\)\]/);
    expect(script).toContain("'::view-transition-new(root)'");
    expect(script).toContain("'::view-transition-old(root)'");
    // 方向标记 + 过渡结束后清理
    expect(script).toContain("root.dataset[RIPPLE_ATTR] = expanding ? 'expand' : 'converge'");
    expect(script).toContain('clearRippleFlag');

    // 收敛方向必须把旧快照抬到新快照之上，否则裁掉旧快照的过程看不见
    expect(globalCss).toMatch(
      /:root\[data-theme-ripple='converge'\]::view-transition-old\(root\)\s*\{[^}]*z-index:\s*1/
    );
    expect(globalCss).toMatch(
      /:root\[data-theme-ripple='expand'\]::view-transition-new\(root\)\s*\{[^}]*z-index:\s*1/
    );
  });
});

describe('blog 列表卡：tag 可悬停点击', () => {
  it('卡片是 div + 拉伸链接，tag 是真链接（不能嵌套 <a>）', async () => {
    const [card, lists] = await Promise.all([
      read('src/components/BlogCard.astro'),
      read('src/styles/components/lists.css')
    ]);

    expect(card).toMatch(/<div\s+class="list-item list-item--link"/);
    expect(card).toContain('list-item__stretch');
    expect(card).toContain('tag tag--link');
    // 卡片内不能再有「外层 a 包住 tag a」这种非法嵌套
    expect(card).not.toMatch(/<a\s+class="list-item list-item--link"/);
    expect(lists).toMatch(/\.list-item__stretch::after\s*\{[^}]*position:\s*absolute/);
    expect(lists).toMatch(/\.list-item--link \.meta-line \.tag--link\s*\{[^}]*z-index:\s*1/);
  });
});

describe('后台设置行的排版', () => {
  it('页脚四项与站点标题、站点语言共用同一套两列网格，顺序为页脚信息在上', async () => {
    const [section, form] = await Promise.all([
      read('src/components/admin/AdminSiteSection.astro'),
      read('src/styles/components/admin/theme/form.css')
    ]);

    // 四项与「站点标题 / 站点语言」写法逐字一致：都是 .admin-grid 的直接子项，因此列与列对齐
    const gridField = (main: string) =>
      new RegExp(
        `\\n {4}<label class="admin-field">\\n {6}<span class="admin-label">\\n {8}<span class="admin-label__main">${main}</span>`
      ).test(section);
    for (const main of [
      '站点标题',
      '站点语言',
      '页脚年份',
      '页脚版权文案',
      '窄屏站点标题宽度',
      '页面外缘间隙'
    ]) {
      expect(gridField(main), `${main} 应是 .admin-grid 的直接子项`).toBe(true);
    }
    expect(section).not.toContain('admin-footer-row');
    // 页脚预览跨两列
    expect(section).toMatch(/\n {4}<div class="admin-field admin-field--full">\n {6}<p id="site-footer-preview"/);

    // 顺序：页脚年份 → 页脚版权文案 → 页脚预览 → 窄屏站点标题宽度 → 页面外缘间隙
    const order = [
      'id="site-footer-start-year"',
      'id="site-footer-copyright"',
      'id="site-footer-preview"',
      'id="site-title-max-percent"',
      'id="site-page-gap-px"'
    ].map((token) => section.indexOf(token));
    expect(order.every((index) => index >= 0), '四项与页脚预览都要在标记里').toBe(true);
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1], `${order[index - 1]} 应排在 ${order[index]} 之前`).toBeLessThan(order[index]!);
    }

    // 新字段的标签与提示：提示走 TS 常量，避免把非子集字符写进模板
    expect(section).toContain('页面外缘间隙');
    expect(section).toContain('{ADMIN_SITE_PAGE_GAP_HINT}');
    const themeShared = await read('src/lib/admin-console/theme-shared.ts');
    expect(themeShared).toContain('（px，最小 ${ADMIN_SITE_PAGE_GAP_MIN}；仅 901px 以上生效）');

    // 两列均分来自 .admin-grid
    expect(form).not.toContain('admin-footer-row');
    expect(form).toMatch(/\.admin-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    // 百分比与间隙输入框都很短
    expect(form).toMatch(/\.admin-field__control--percent\s*\{[^}]*width:\s*84px/);
    expect(form).toMatch(/\.admin-field__control--page-gap\s*\{[^}]*width:\s*84px/);
  });
});

describe('RSS 点击区域与 RSS 开关', () => {
  it('可点元素右侧的「·」不接收点击', async () => {
    const css = await read(ENTRY_TAGS_CSS);

    // 分隔符绝对定位 + pointer-events: none，链接的点击盒子只剩文字
    const sep =
      /\.page-subtitle__item:not\(\[hidden\]\):has\(~ \.page-subtitle__item:not\(\[hidden\]\)\)::after\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(sep).toMatch(/position:\s*absolute/);
    expect(sep).toMatch(/pointer-events:\s*none/);
    // 间距改由元素自身的 margin 提供（否则两段会贴在一起）
    expect(css).toMatch(/\.page-subtitle__item:not\(:last-child\)\s*\{[^}]*margin-right:\s*1\.1em/);
    // 纯文本那段（不可点）保持行内分隔符，但只在后面还有可见项时才画：
    // hidden 的兄弟不算，否则末尾会多出一个「·」
    expect(css).toMatch(
      /\.page-subtitle__text:has\(~ \.page-subtitle__item:not\(\[hidden\]\)\)::after\s*\{[^}]*content:\s*"·"/
    );
    expect(css).toMatch(
      /\.page-subtitle__item:not\(\[hidden\]\):has\(~ \.page-subtitle__item:not\(\[hidden\]\)\)::after/
    );
    expect(css).not.toMatch(/\.page-subtitle__text:not\(:last-child\)::after/);
  });

  it('内页设置里 RSS 订阅 = 总开关 + 三页各自勾选（样式参考首页导语）', async () => {
    const [pageSection, blog, archive, bits, themeSettings, themeShared, codec] = await Promise.all([
      read('src/components/admin/AdminPageSection.astro'),
      read('src/components/BlogPageView.astro'),
      read('src/pages/archive/index.astro'),
      read('src/components/BitsPageView.astro'),
      read('src/lib/theme-settings.ts'),
      read('src/lib/admin-console/theme-shared.ts'),
      read('src/scripts/admin-console/form-codec.ts')
    ]);

    // 后台：单独一个 topic，总开关在标题行最右（`admin-label__toggle` = 首页导语那款「展示」）
    expect(pageSection).toMatch(/admin-subgroup--list-rss/);
    expect(pageSection).toMatch(
      /admin-label--split[\s\S]{0,600}?page-list-rss-enabled/
    );
    expect(pageSection).toMatch(/id="page-list-rss-enabled" type="checkbox"/);
    for (const page of ['blog', 'bits', 'archive']) {
      expect(pageSection).toContain(`id="page-list-rss-${page}"`);
    }
    expect(pageSection).toContain('id="page-list-rss-group"');

    // 数据层：总开关 + 三个页面各自一项，可规范化、可逐个校验
    expect(themeSettings).toMatch(/interface ListRssSettings[\s\S]{0,200}?enabled: boolean/);
    expect(themeShared).toMatch(/listRss: \{[\s\S]{0,200}?enabled:/);
    expect(themeShared).toContain('pushIssue(`page.listRss.${key}`');
    // 总开关关掉时三个勾选框置灰
    expect(codec).toContain('const syncListRssControls = (): void => {');
    expect(codec).toMatch(/input\.disabled = !enabled/);

    // 三页互不干扰：各自「总开关 ∧ 本页开关」
    expect(blog).toContain('page.listRss.enabled !== false && page.listRss.blog !== false');
    expect(bits).toContain('page.listRss.enabled !== false && page.listRss.bits !== false');
    expect(archive).toContain('page.listRss.enabled !== false && page.listRss.archive !== false');
  });
});

describe('#标签 与「切换标签」互斥', () => {
  it('hidden 属性真的隐藏（display:inline-flex 会压过 UA 的 [hidden]）', async () => {
    const css = await read(ENTRY_TAGS_CSS);
    expect(css).toMatch(
      /\.page-subtitle__item\[hidden\],[\s\S]{0,120}?\.page-subtitle__text\[hidden\],[\s\S]{0,120}?\.page-subtitle__actions\[hidden\]\s*\{[^}]*display:\s*none/
    );
  });
});

describe('项目弹窗的主次层级', () => {
  it('关闭按钮更小、标题与副标题放大、正文不得大于标题', async () => {
    const css = await read('src/styles/projects-page.css');

    // 关闭按钮缩小（44px 热区保留）
    const close = /\.project-dialog__close\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(close).toMatch(/font-size:\s*15px/);
    expect(close).toMatch(/width:\s*var\(--tap-min-h\)/);
    expect(close).toMatch(/border:\s*0/);
    expect(close).toMatch(/background:\s*transparent/);

    // 标题 / 副标题 / 类型胶囊放大
    const title = /\.project-dialog__title\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const titleSize = Number(/font-size:\s*([\d.]+)px/.exec(title)?.[1] ?? 0);
    expect(titleSize).toBeGreaterThanOrEqual(21);
    expect(css).toMatch(/\.project-dialog__subtitle\s*\{[^}]*font-size:\s*14\.5px/);
    expect(css).toMatch(/\.project-dialog \.badge\s*\{[^}]*font-size:\s*13px/);

    // 正文 < 标题
    const prose = /\.project-dialog__prose\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const proseSize = Number(/font-size:\s*([\d.]+)px/.exec(prose)?.[1] ?? 0);
    expect(proseSize).toBeGreaterThan(0);
    expect(proseSize).toBeLessThan(titleSize);
  });
});

describe('/devlog/ 条目的字号层级', () => {
  it('项目名最大最重、更新标题次之（不加粗）、摘要最小，且都用正文色', async () => {
    const css = await read(DEVLOG_CSS);

    const project = /\.devlog-row__project\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const title = /\.devlog-row__title\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const description = /\.devlog-row__description\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    const projectSize = Number(/font-size:\s*([\d.]+)px/.exec(project)?.[1] ?? 0);
    const titleSize = Number(/font-size:\s*([\d.]+)px/.exec(title)?.[1] ?? 0);
    const descSize = Number(/font-size:\s*([\d.]+)px/.exec(description)?.[1] ?? 0);

    expect(projectSize).toBeGreaterThan(titleSize);
    expect(titleSize).toBeGreaterThan(descSize);
    // 项目名加粗、标题不加粗；两者都是纯文本色
    expect(project).toMatch(/font-weight:\s*600/);
    expect(project).toMatch(/color:\s*var\(--text\)/);
    expect(title).toMatch(/font-weight:\s*400/);
    expect(title).toMatch(/color:\s*var\(--text\)/);
  });
});

describe('涟漪过渡期间冻结滚动条配色', () => {
  it('过渡期间把 color-scheme 钉在旧主题，结束后交还 CSS', async () => {
    const script = await read('src/scripts/sidebar-theme.ts');

    expect(script).toMatch(/root\.style\.colorScheme = previousScheme/);
    expect(script).toMatch(/removeProperty\('color-scheme'\)/);
    // 清理函数在动画结束/失败两条路径都要跑到
    expect(script).toMatch(/animation\.finished\.then\(clearRippleFlag, clearRippleFlag\)/);
    expect(script).toMatch(/\.catch\(clearRippleFlag\)/);
  });
});

describe('/devlog/ 页头搜索', () => {
  it('页头打开搜索，过滤由 devlog-filter 一并负责（项目 ∧ 关键词）', async () => {
    const [page, script] = await Promise.all([
      read('src/pages/devlog/index.astro'),
      read('src/scripts/devlog-filter.ts')
    ]);

    expect(page).toContain('showSearch={true}');
    expect(page).toContain('searchPlaceholder="搜索：标题 / 摘要 / 项目"');
    // 搜索与项目筛选同时成立
    expect(script).toContain('matchesProject(row, activeValue) && matchesQuery(row, activeQuery)');
    expect(script).toContain('tokenizeSearchQuery');
    expect(script).toContain('runPlan');
  });
});

describe('归档 tag 的作用域与语义', () => {
  it('项目档不暴露标签入口，更新档只取项目名称，全部档不带项目集合的 tags', async () => {
    const [page, scopeScript, indexJson, entryScript] = await Promise.all([
      read('src/pages/archive/index.astro'),
      read('src/scripts/archive-scope.ts'),
      read('src/pages/archive/index.json.ts'),
      read('src/scripts/entry-search.ts')
    ]);

    // 取值域
    expect(page).toMatch(/const projectTags: TagSummary\[\] = \[\];/);
    expect(page).toMatch(/collectTagScopedSummary\('devlog', devlogs, \(entry\) => \[\s*entry\.data\.project\s*\]/);
    expect(page).toMatch(/collectTagScopedSummary\(\s*'all',\s*\[\s*\.\.\.blogs,\s*\.\.\.devlogs\s*\]/);
    // index.json 的 devlog tags 不含 kind
    expect(indexJson).toMatch(/tags: \[entry\.data\.project\]/);
    expect(indexJson).not.toMatch(/tags: \[entry\.data\.project, entry\.data\.kind\]/);

    // 项目档隐藏 tag 入口；更新档把入口与标题按作用域改成「项目」
    expect(scopeScript).toMatch(/TAG_TRIGGER\.hidden = isProjects/);
    expect(scopeScript).toMatch(/const noun = scope === 'devlog' \? '项目' : '标签'/);
    expect(scopeScript).toContain("ENTRY_ROOT.dataset.entryTagNoun = noun");
    // entry-search 读这个称谓来生成「切换项目 / 清除筛选」
    expect(entryScript).toMatch(/root\.dataset\.entryTagNoun/);
    expect(entryScript).toContain('createSelectedChipActions(tagNoun())');
  });
});

describe('归档的更新行补「项目名：」', () => {
  it('devlog 行在标题前渲染项目名，样式用 muted 不抢标题', async () => {
    const [page, css] = await Promise.all([
      read('src/pages/archive/index.astro'),
      read('src/styles/archive-page.css')
    ]);

    expect(page).toMatch(/row\.kind === 'devlog' && row\.project/);
    expect(page).toContain('archive-timeline__project');
    expect(page).toMatch(/project: entry\.data\.project/);
    // 半角冒号，冒号后一个空格
    expect(page).toMatch(/\$\{row\.project\}: `/);
    // 项目名与标题继承同一个链接色，悬停整体高亮
    expect(css).toMatch(/\.archive-timeline__project\s*\{[^}]*color:\s*inherit/);
  });
});

describe('首页导语链接选项', () => {
  it('标签选项使用 #归档标签，且选择框加宽', async () => {
    const [shared, form] = await Promise.all([
      read('src/lib/admin-console/theme-shared.ts'),
      read('src/styles/components/admin/theme/form.css')
    ]);

    expect(shared).toContain("label: '#归档标签'");
    expect(shared).not.toContain("label: '#标签'");
    const select = /\.admin-inline-builder__select\s*\{([^}]*)\}/.exec(form)?.[1] ?? '';
    const width = Number(/width:\s*(\d+)px/.exec(select)?.[1] ?? 0);
    expect(width).toBeGreaterThanOrEqual(110);
  });
});

describe('弹窗正文层级与宽屏面板间距', () => {
  it('项目弹窗正文（含各级标题）都小于弹窗标题，正文对齐描述字号', async () => {
    const css = await read('src/styles/projects-page.css');
    const titleSize = Number(
      /font-size:\s*([\d.]+)px/.exec(/\.project-dialog__title\s*\{([^}]*)\}/.exec(css)?.[1] ?? '')?.[1] ?? 0
    );
    const proseSize = Number(
      /font-size:\s*([\d.]+)px/.exec(/\.project-dialog__prose\s*\{([^}]*)\}/.exec(css)?.[1] ?? '')?.[1] ?? 0
    );
    const subtitleSize = Number(
      /font-size:\s*([\d.]+)px/.exec(/\.project-dialog__subtitle\s*\{([^}]*)\}/.exec(css)?.[1] ?? '')?.[1] ?? 0
    );
    expect(proseSize).toBe(subtitleSize);
    expect(proseSize).toBeLessThan(titleSize);

    for (const level of ['h1', 'h2', 'h3']) {
      // h3/h4 是合并选择器（`h3,\n h4 {`），中间要允许逗号与空白
      const block = new RegExp(`\\.project-dialog__prose ${level}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      const size = Number(/font-size:\s*([\d.]+)px/.exec(block)?.[1] ?? 0);
      expect(size, `${level} 必须小于弹窗标题`).toBeGreaterThan(proseSize);
      expect(size, `${level} 必须小于弹窗标题`).toBeLessThan(titleSize);
    }
  });

  it('宽屏行把 min-height 多出来的高度放到内容上方，使正文到标题的间距与窄屏一致', async () => {
    const css = await read(DEVLOG_CSS);
    const toggle = /\.devlog-row__toggle\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(toggle).toMatch(/align-content:\s*end/);
    // 首行上方多出的那一截用列表上边距补回来
    expect(css).toMatch(/\.devlog-list\s*\{[^}]*margin-top:\s*8px/);
  });
});

describe('胶囊条视觉规格', () => {
  it('不额外指定字体族、悬停不加底色', async () => {
    const css = await read('src/styles/components/scope-pills.css');
    const item = /\.scope-pills__item\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    // 不指定 font-family，字体跟随正文
    expect(item).not.toContain('font-family');
    expect(item).toMatch(/font-size:\s*13px/);
    // 悬停只变色，不加底色
    const hover = /\.scope-pills__item:hover,[\s\S]{0,80}?\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(hover).toMatch(/color:\s*var\(--text\)/);
    expect(hover).not.toContain('background');
  });

  it('暗色模式下滑块是深色浮起面（否则白底白字不可视）', async () => {
    const css = await read('src/styles/components/scope-pills.css');
    const dark = /:root\[data-theme='dark'\] \.scope-pills__cursor\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    expect(dark, '需要暗色模式的滑块覆盖').not.toBe('');
    // 不能是「92% 白」那种几乎纯白的底
    expect(dark).not.toContain('#fff 92%');
    expect(dark).toMatch(/background:\s*color-mix\(in srgb, #fff 1[0-9]%, var\(--panel\)\)/);
  });
});

describe('目录展开/收起的正文右内边距', () => {
  it('展开时与左侧分割线留同样的间隙（--pad-x），收起时保持对称', async () => {
    const layout = await read(LAYOUT_CSS);

    // 收起态：不进入任何「展开」规则 → 基础 .content 的 `padding: 56px var(--pad-x)` 生效
    expect(layout).toMatch(/\.content\s*\{[^}]*padding:\s*56px var\(--pad-x\)/);

    // 中屏「正文内嵌目录」：仍然给浮动列留车道（不能被一起去掉）
    expect(layout).toMatch(
      /@media \(max-width: 1279\.98px\)\s*\{[\s\S]{0,300}?:root:not\(\[data-toc-collapsed='true'\]\) body\.immersive-page \.shell\[data-toc='true'\] \.content\s*\{[^}]*padding-right:\s*max\(/
    );

    // 1024–1280 阅读模式（目录进了第 4 列）：间隙 = --pad-x（与左侧一致）
    expect(layout).toMatch(
      /@media \(min-width: 1024px\) and \(max-width: 1279\.98px\)\s*\{[\s\S]{0,300}?body\.immersive-page\[data-reading='immersive'\] \.shell\[data-toc='true'\] \.content\s*\{[^}]*padding-right:\s*var\(--pad-x\)/
    );

    // ≥1280 展开态走基础规则的 --pad-x
    const wideBlock = /@media \(min-width: 1280px\)\s*\{([\s\S]*?)\n\}/.exec(
      layout.slice(layout.indexOf('内容区域'))
    )?.[1] ?? '';
    expect(wideBlock).not.toContain('padding-right');
  });
});

describe('目录标题字号与时间/kind 配色', () => {
  it('「本文目录」不小于目录条目字号（两种形态一致）', async () => {
    const css = await read('src/styles/components/article-toc.css');
    const base = Number(/\.article-toc\s*\{[^}]*font-size:\s*([\d.]+)px/.exec(css)?.[1] ?? 0);
    const title = Number(/\.article-toc__title\s*\{[^}]*font-size:\s*([\d.]+)px/.exec(css)?.[1] ?? 0);
    const inlineLabel = Number(
      /\.article-toc__summary-label\s*\{[^}]*font-size:\s*([\d.]+)px/.exec(css)?.[1] ?? 0
    );

    expect(base).toBeGreaterThan(0);
    expect(title, '目录标题不能比条目还小').toBeGreaterThanOrEqual(base);
    expect(inlineLabel).toBe(title);
  });

  it('/devlog/ 的日期与 kind 胶囊、/archive/ 的日期都用项目卡胶囊的可读配色', async () => {
    const [devlog, archive, lists] = await Promise.all([
      read(DEVLOG_CSS),
      read('src/styles/archive-page.css'),
      read('src/styles/components/lists.css')
    ]);

    // 项目卡胶囊的配色基准（.badge）
    // 行首锚定：`.list-item__row .badge { height: 24px }` 会先匹配到
    const badge = /^\.badge\s*\{([^}]*)\}/m.exec(lists)?.[1] ?? '';
    expect(badge).toMatch(/color:\s*var\(--muted\)/);

    // 日期使用 --muted
    const devlogDate = /\.devlog-row__date\s*\{([^}]*)\}/.exec(devlog)?.[1] ?? '';
    expect(devlogDate).toMatch(/color:\s*var\(--muted\)/);
    expect(devlogDate).not.toContain('var(--faint)');

    const archiveDate = /\.archive-timeline__date\s*\{([^}]*)\}/.exec(archive)?.[1] ?? '';
    expect(archiveDate).toMatch(/color:\s*var\(--muted\)/);
    expect(archiveDate).not.toContain('var(--faint)');

    // kind 胶囊与 .badge 的浅色/暗色配色一致
    const kind = /\.devlog-row__kind\s*\{([^}]*)\}/.exec(devlog)?.[1] ?? '';
    expect(kind).toMatch(/background:\s*#fafafa/);
    expect(kind).toMatch(/color:\s*var\(--muted\)/);
    expect(kind).toMatch(/border:\s*1px solid var\(--border\)/);
    expect(devlog).toMatch(
      /:root\[data-theme='dark'\] \.devlog-row__kind\s*\{[^}]*background:\s*#1f1f1f[^}]*border-color:\s*#3f3f3f/
    );
    // 与 .badge 的暗色覆盖一致
    expect(lists).toMatch(/:root\[data-theme="dark"\] \.badge\s*\{[^}]*background:\s*#1f1f1f[^}]*border-color:\s*#3f3f3f/);
  });
});
