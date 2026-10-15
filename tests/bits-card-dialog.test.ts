// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initBitsLightbox } from '../src/scripts/lightbox';
import {
  BITS_CARD_BODY_LINES,
  BITS_CARD_VISIBLE_IMAGE_LIMIT,
  buildBitsCardViewModel
} from '../src/lib/bits-card-view-model';
import { collectTagScopedSummary } from '../src/lib/tags';

/**
 * `/bits/` 卡片的三项结构契约：整卡可点开详情弹窗、标签可点筛选、正文与图片受高度限制。
 *
 * jsdom 不做布局，弹窗几何与截断样式读源码断言；灯箱索引用真实脚本加同构 DOM 跑出来。
 */

const SRC = process.cwd();
const read = (relative: string) => readFile(path.join(SRC, relative), 'utf8');

const BIT_CARD = 'src/components/BitCard.astro';
const BIT_TAGS = 'src/components/BitTags.astro';
const BIT_DIALOG = 'src/components/BitDialog.astro';
const BITS_PAGE_VIEW = 'src/components/BitsPageView.astro';
const BIT_CARD_CSS = 'src/styles/components/bit-card.css';
const BITS_CSS = 'src/styles/components/bits.css';

describe('bits 卡片：详情弹窗', () => {
  it('每条动态都渲染一个带完整正文与全部图片的弹窗', async () => {
    const dialog = await read(BIT_DIALOG);

    expect(dialog).toMatch(/<dialog[\s\S]*class="bit-dialog"[\s\S]*data-bit-dialog-panel/);
    // 弹窗自身是灯箱的图片来源：`data-bit` + 完整隐藏图片列表
    expect(dialog).toMatch(/data-bit\b/);
    expect(dialog).toContain('data-bit-image-item');
    expect(dialog).toContain('{Content ? <Content />');
    // 全部图片（不是 visibleImages）、按钮索引与完整列表一一对应
    expect(dialog).toMatch(/card\.imageItems\.map\(\(image, index\)/);
    expect(dialog).toContain('data-bit-image-index={index}');
    expect(dialog).not.toContain('visibleImages');
    expect(dialog).not.toContain('moreCount');
  });

  it('列表容器之后按条目渲染弹窗，且每条都 render 出 Content', async () => {
    const view = await read(BITS_PAGE_VIEW);
    const listIndex = view.indexOf('id="bits-list"');
    const dialogIndex = view.indexOf('<BitDialog');

    expect(listIndex).toBeGreaterThan(-1);
    expect(dialogIndex, '弹窗要渲染在列表容器之后').toBeGreaterThan(listIndex);
    expect(view).toMatch(/cards\.map\(\(\{ bit, Content \}\) => \(\s*<BitDialog bit=\{bit\} Content=\{Content\} \/>/);
    // 长文本也要 render：弹窗需要完整正文
    expect(view).not.toMatch(/if \(derivedText\.shouldRenderFull\)/);
    expect(view).toContain('const { Content } = await render(bit);');
    expect(view).toContain("import '../scripts/bits-dialog.ts';");
  });

  it('弹窗有高度上限并在内部滚动，窄屏走底部抽屉', async () => {
    const css = await read(BIT_CARD_CSS);
    const dialog = /\.bit-dialog \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(dialog).toMatch(/max-height:\s*min\(85vh,\s*720px\)/);
    expect(dialog).toMatch(/overflow:\s*hidden/);

    const inner = /\.bit-dialog__inner \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(inner).toContain('max-height: inherit');
    expect(inner).toContain('display: flex');

    const content = /\.bit-dialog__content \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(content).toMatch(/overflow-y:\s*auto/);
    expect(content).toMatch(/min-height:\s*0/);

    const drawer = /@media \(max-width: 640px\) \{[\s\S]*?\.bit-dialog \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(drawer).toMatch(/inset:\s*auto 0 0/);
    expect(drawer).toMatch(/max-height:\s*85dvh/);
    expect(drawer).toMatch(/border-radius:\s*18px 18px 0 0/);
    expect(css).toMatch(/\.bit-dialog__handle \{[\s\S]*?display:\s*none/);
  });

  it('标签落在正文与图片之后，字号不大于正文', async () => {
    const [dialog, css] = await Promise.all([read(BIT_DIALOG), read(BIT_CARD_CSS)]);

    const bodyIndex = dialog.indexOf('bit-dialog__body');
    const mediaIndex = dialog.indexOf('bit-dialog__media');
    const tagsIndex = dialog.indexOf('bit-dialog__tags');

    expect(bodyIndex).toBeGreaterThan(-1);
    expect(mediaIndex, '图片排在正文之后').toBeGreaterThan(bodyIndex);
    expect(tagsIndex, '标签排在图片之后').toBeGreaterThan(mediaIndex);
    // 标签是正文与图片之后的最后一块内容
    expect(tagsIndex).toBeGreaterThan(dialog.lastIndexOf('bit-dialog__media-item'));

    // 字号对照卡片模式（标签 12 / 正文 14），因此不会大于弹窗正文的 14.5px
    const cardBodyFontSize = 14;
    const cardTagFontSize = 12;
    const dialogBodyFontSize = Number(
      /\.bit-dialog__body \{([^}]*)\}/.exec(css)?.[1]?.match(/font-size:\s*([\d.]+)px/)?.[1]
    );
    const dialogTagFontSize = Number(
      /\.bit-dialog__tags \{([^}]*)\}/.exec(css)?.[1]?.match(/font-size:\s*([\d.]+)px/)?.[1]
    );

    expect(cardTagFontSize).toBeLessThan(cardBodyFontSize);
    expect(dialogTagFontSize).toBe(cardTagFontSize);
    expect(dialogTagFontSize).toBeLessThanOrEqual(dialogBodyFontSize);
  });

  it('卡片用拉伸覆盖层打开弹窗，图片与标签在其之上', async () => {
    const [card, css] = await Promise.all([read(BIT_CARD), read(BIT_CARD_CSS)]);

    expect(card).toMatch(
      /data-bit-dialog-open[\s\S]*data-bit-dialog=\{dialogId\}[\s\S]*aria-haspopup="dialog"/
    );
    expect(card).toContain('const dialogId = `bit-dialog-${bitEntry.id}`;');

    const overlay = /\.bit-card__open::after \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(overlay).toMatch(/position:\s*absolute/);
    expect(overlay).toMatch(/inset:\s*0/);
    expect(/\.bit-card \{([^}]*)\}/.exec(css)?.[1] ?? '').toMatch(/position:\s*relative/);
    expect(/\.bit-media-item \{([^}]*)\}/.exec(css)?.[1] ?? '').toMatch(/z-index:\s*1/);
    expect(css).toMatch(/\.bit-tag-token\.tag--link,[\s\S]*?z-index:\s*1/);
  });

  it('复用项目弹窗的通用控制器处理打开、关闭与焦点', async () => {
    const [bits, projects, controller] = await Promise.all([
      read('src/scripts/bits-dialog.ts'),
      read('src/scripts/projects-dialog.ts'),
      read('src/scripts/dialog-controller.ts')
    ]);

    expect(bits).toContain("import { initCardDialogs } from './dialog-controller'");
    expect(projects).toContain("import { initCardDialogs } from './dialog-controller'");
    expect(bits).toMatch(/focusSelector: '\.bit-dialog__title, \.bit-dialog__identity'/);
    expect(bits).toMatch(/panelSelector: '\[data-bit-dialog-panel\]'/);

    // 打开用 showModal；Esc 交给原生 cancel；点遮罩时 target 就是 dialog 自身
    expect(controller).toContain('showModal');
    expect(controller).toContain("dialog.addEventListener('cancel'");
    expect(controller).toMatch(/target\.matches\(wiring\.panelSelector\)/);
    expect(controller).toContain('window.requestAnimationFrame');
    // 通用控制器不包含任一页面的选择器字面量，差异全部由调用方注入
    expect(controller).not.toContain('bit-dialog');
    expect(controller).not.toContain('project-dialog');
  });
});

describe('bits 卡片：标签链接', () => {
  it('普通标签与地点标签都是 /bits/?tags=<key> 链接，且标记只在共享组件里写一份', async () => {
    const [tags, card, dialog] = await Promise.all([read(BIT_TAGS), read(BIT_CARD), read(BIT_DIALOG)]);

    expect(tags).toMatch(
      /<a\s+class="bit-tag-token tag tag--link"\s+href=\{tag\.href\}[\s\S]*?aria-label={`筛选标签 \$\{tag\.label\}`}[\s\S]*?data-bit-tag-link=\{tag\.key\}/
    );
    expect(tags).toMatch(
      /<a\s+class="bit-tag bit-tag--place tag tag--link"\s+href=\{card\.placeTag\.href\}[\s\S]*?data-bit-tag-link=\{card\.placeTag\.key\}/
    );
    // 标签链接的样式与文章页一致：悬停出现下划线
    expect(tags).toContain('tag tag--link');

    // 卡片与弹窗共用同一份标记：弹窗只额外挂一个类名
    expect(card).toContain('<BitTags card={card} />');
    expect(dialog).toContain('<BitTags card={card} class="bit-dialog__tags" />');
    expect(card).not.toContain('bit-tag-token');
    expect(dialog).not.toContain('bit-tag-token');

    // 地点标签的展示文本去掉 `loc:` 前缀，key 与 entry-search 的标签按钮同源，因此可点
    const viewModel = await read('src/lib/bits-card-view-model.ts');
    expect(viewModel).toContain('placeTag: placeTag && placeText ? toTagLink(placeText, withBase, placeTag) : null');
    expect(viewModel).toContain('href: routable ? withBase(`${getBitsPagePath()}?tags=${encodeURIComponent(key)}`) : null');
  });

  it('卡片标签的 key 与 /bits/ 标签选择器同源，地点标签也在索引里', () => {
    const tags = ['loc:Shanghai', 'Content Console'];
    const tagOptions = collectTagScopedSummary(
      'all',
      [{ id: 'bit-1', data: { tags } }],
      (entry) => entry.data.tags
    );
    const optionKeys = tagOptions.map((option) => option.key);

    const viewModel = buildBitsCardViewModel({
      id: 'bit-1',
      bodyText: 'Hello',
      tags,
      base: '/'
    });

    expect(optionKeys).toContain(viewModel.placeTag!.key);
    expect(optionKeys).toContain(viewModel.normalTagItems[0]!.key);
    expect(viewModel.placeTag!.href).toBe(`/bits/?tags=${encodeURIComponent(viewModel.placeTag!.key)}`);
  });
});

describe('bits 卡片：正文截断与一行图片', () => {
  it('两条路径都只截在行边界，且与字符预算同口径', async () => {
    const [card, css] = await Promise.all([read(BIT_CARD), read(BIT_CARD_CSS)]);

    // 可见行数：样式变量与视图模型常量必须一致。
    const lineBudget = /\.bit-card \{([^}]*)\}/g;
    const declaredLines = Array.from(css.matchAll(lineBudget))
      .map((match) => match[1]?.match(/--bit-card-body-lines:\s*(\d+)/)?.[1])
      .find((value) => value !== undefined);
    expect(declaredLines).toBe(String(BITS_CARD_BODY_LINES));
    expect(BITS_CARD_BODY_LINES).toBe(4);

    // 富文本路径只渲染预算内的内容，不做高度裁切：需要截断的一律走摘要路径，提示不会缺位
    expect(css).not.toMatch(/\.bit-body--rich \{[^}]*max-height/);
    expect(css).not.toMatch(/\.bit-body--rich \{[^}]*overflow/);
    expect(css).toMatch(/\.bit-body--rich > :where\([^)]*\)\s*\{[^}]*margin:\s*0/);

    // 纯文本摘要路径：同一行数，省略号画在末行末尾
    const excerpt = /\.bit-body__excerpt \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(excerpt).toMatch(/-webkit-line-clamp:\s*var\(--bit-card-body-lines, 4\)/);
    expect(excerpt).toMatch(/-webkit-box-orient:\s*vertical/);
    expect(excerpt).toMatch(/overflow:\s*hidden/);

    // 截断后必须给出「还有内容」的提示：右对齐到右下角、用强调色，且不是新的交互控件
    const hint = /\.bit-body-hint \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(hint).toMatch(/font-family:\s*var\(--font-copy\)/);
    expect(hint).toMatch(/color:\s*var\(--accent\)/);
    expect(hint).toMatch(/text-align:\s*right/);
    expect(card).toMatch(
      /card\.body\.truncated \? <p class="bit-body-hint" data-bit-body-hint>查看全文<\/p> : null/
    );
    expect(card).not.toMatch(/<button[^>]*bit-body-hint/);

    expect(card).toContain('class="bit-body bit-body--rich"');
    expect(card).toContain('class="bit-body__excerpt"');
    // 预算内才渲染完整 Markdown，超出预算一律走纯文本摘要
    expect(card).toContain(
      'const renderFullBody = card.body.shouldRenderFull && !card.body.truncated && Boolean(Content);'
    );
  });

  it('后台预览与卡片同口径，同样在截断后给出提示', async () => {
    const previewPane = await read('src/components/admin/editor/bits/BitsPreviewPane.svelte');

    expect(previewPane).toContain(
      '{:else if viewModel.body.shouldRenderFull && !viewModel.body.truncated && previewHtml}'
    );
    expect(previewPane).toContain('<p class="bit-body__excerpt">{viewModel.body.excerpt}</p>');
    expect(previewPane).toMatch(/viewModel\.body\.truncated[\s\S]*bit-body-hint/);
  });

  it('卡片图片固定一行等宽，超过 4 张沿用 +N 角标', async () => {
    const [card, css, bitsCss, previewPane] = await Promise.all([
      read(BIT_CARD),
      read(BIT_CARD_CSS),
      read(BITS_CSS),
      read('src/components/admin/editor/bits/BitsPreviewPane.svelte')
    ]);

    const grid = /\.bit-media-grid \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(grid).toMatch(/display:\s*grid/);
    expect(grid).toMatch(/grid-auto-flow:\s*column/);
    expect(grid).toMatch(/grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
    expect(grid).not.toContain('grid-template-columns');

    expect(card).toContain("const isMore = index === card.visibleImages.length - 1 && card.moreCount > 0;");
    expect(card).toContain('data-bit-image-open-hidden={maxVisible}');
    expect(card).toContain('+ {card.moreCount}');
    expect(card).toContain('const maxVisible = BITS_CARD_VISIBLE_IMAGE_LIMIT;');
    expect(BITS_CARD_VISIBLE_IMAGE_LIMIT).toBe(4);

    // 单张大图给高度上限，用 contain 完整缩放，不做半图裁切；弹窗里的大图不受限
    const singleCap = /\.bit-card \.bit-media-item--single > img \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(singleCap).toMatch(/max-height:\s*420px/);
    expect(singleCap).toMatch(/object-fit:\s*contain/);

    // 2×4 栅格（wideIndex / bit-media-item--wide）不再使用
    for (const source of [card, css, bitsCss, previewPane]) {
      expect(source).not.toContain('wideIndex');
      expect(source).not.toContain('bit-media-item--wide');
    }
    // 窄屏横向滚动的一条规则仍然只作用于卡片
    expect(bitsCss).toMatch(/\.bit-media-grid \.bit-media-item \{/);
  });
});

describe('bits 灯箱索引基准', () => {
  const images = Array.from({ length: 6 }, (_, index) => `https://example.com/${index + 1}.webp`);

  const imageItemsHtml = () =>
    images
      .map((src) => `<span data-bit-image-item data-bit-image-src="${src}" data-bit-image-alt=""></span>`)
      .join('');

  /** 与 BitCard/BitDialog 同构：卡片显示 4 张（第 4 张带 +N），弹窗显示全部 6 张。 */
  const renderBitsMarkup = () => {
    const cardButtons = images
      .slice(0, BITS_CARD_VISIBLE_IMAGE_LIMIT)
      .map(
        (src, index) =>
          `<button type="button" data-bit-image-button data-bit-image-index="${index}"${
            index === BITS_CARD_VISIBLE_IMAGE_LIMIT - 1
              ? `><img src="${src}"><span data-bit-image-open-hidden="${BITS_CARD_VISIBLE_IMAGE_LIMIT}">+ 2</span>`
              : `><img src="${src}">`
          }</button>`
      )
      .join('');
    const dialogButtons = images
      .map(
        (src, index) =>
          `<button type="button" data-bit-image-button data-bit-image-index="${index}"><img src="${src}"></button>`
      )
      .join('');

    document.body.innerHTML = `
      <dialog id="lightbox" hidden>
        <button type="button" data-lightbox-close></button>
        <button type="button" data-lightbox-prev></button>
        <button type="button" data-lightbox-next></button>
        <figure>
          <img data-lightbox-image alt="">
          <figcaption>
            <span data-lightbox-caption hidden></span>
            <span data-lightbox-count></span>
            <span data-lightbox-dots></span>
          </figcaption>
        </figure>
      </dialog>
      <article class="bit-card" data-bit>
        <button type="button" data-bit-dialog-open aria-haspopup="dialog"></button>
        <div class="bit-media-grid">${cardButtons}</div>
        <div hidden>${imageItemsHtml()}</div>
      </article>
      <dialog class="bit-dialog" data-bit-dialog-panel data-bit>
        <div class="bit-dialog__content">
          <div class="bit-dialog__media-grid">${dialogButtons}</div>
          <div hidden>${imageItemsHtml()}</div>
        </div>
      </dialog>
    `;
  };

  const lightboxImage = () =>
    document.querySelector<HTMLImageElement>('[data-lightbox-image]')!;
  const lightboxCount = () => document.querySelector<HTMLElement>('[data-lightbox-count]')!;
  const click = (el: Element) =>
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  beforeEach(() => {
    renderBitsMarkup();
    vi.stubGlobal('scrollTo', () => {});
    initBitsLightbox({ dialogId: 'lightbox' });
  });

  it('弹窗图片按完整列表取图，索引与按钮一一对应', () => {
    const dialogButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.bit-dialog [data-bit-image-button]')
    );
    expect(dialogButtons).toHaveLength(images.length);

    click(dialogButtons[2]!);
    expect(lightboxImage().src).toBe(images[2]);
    expect(lightboxCount().textContent).toBe(`3 / ${images.length}`);

    click(dialogButtons[5]!);
    expect(lightboxImage().src).toBe(images[5]);
    expect(lightboxCount().textContent).toBe(`6 / ${images.length}`);
  });

  it('卡片第 4 张的 +N 角标从完整列表的第 5 张开始', () => {
    const moreButton = document.querySelector<HTMLButtonElement>(
      '.bit-card [data-bit-image-button][data-bit-image-index="3"]'
    )!;
    const moreBadge = moreButton.querySelector('[data-bit-image-open-hidden]')!;
    expect(moreBadge.getAttribute('data-bit-image-open-hidden')).toBe('4');

    // 角标本体跳到完整列表的第 5 张；第 4 张缩略图本体仍从第 4 张开始
    click(moreBadge);
    expect(lightboxImage().src).toBe(images[4]);
    expect(lightboxCount().textContent).toBe(`5 / ${images.length}`);

    click(moreButton);
    expect(lightboxImage().src).toBe(images[3]);
    expect(lightboxCount().textContent).toBe(`4 / ${images.length}`);
  });

  it('卡片图片索引也落在完整列表上', () => {
    const secondCardButton = document.querySelector<HTMLButtonElement>(
      '.bit-card [data-bit-image-button][data-bit-image-index="1"]'
    )!;
    click(secondCardButton);
    expect(lightboxImage().src).toBe(images[1]);
    expect(lightboxCount().textContent).toBe(`2 / ${images.length}`);
  });
});
