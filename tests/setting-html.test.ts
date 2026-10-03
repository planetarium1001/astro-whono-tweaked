import { describe, expect, it } from 'vitest';
import { renderSettingHtml, toSettingPlainText } from '../src/lib/setting-html';

describe('setting html renderer', () => {
  it('keeps whitelisted tags and turns newlines into <br>', () => {
    expect(renderSettingHtml('A minimal\nAstro theme')).toBe('A minimal<br>Astro theme');
    expect(renderSettingHtml('<b>粗</b>\n<i>斜</i>')).toBe('<b>粗</b><br><i>斜</i>');
  });

  it('drops source-formatting newlines around block tags so lines stay flush', () => {
    expect(
      renderSettingHtml('<div class="whono-left">Whono</div>\n<div class="whono-right">主题与写作</div>')
    ).toBe('<div class="whono-left">Whono</div><div class="whono-right">主题与写作</div>');
    expect(renderSettingHtml('<div class="whono-left">上</div>\n\n<p class="whono-right">下</p>')).toBe(
      '<div class="whono-left">上</div><p class="whono-right">下</p>'
    );
    expect(renderSettingHtml('上一行\n<div class="whono-right">下一行</div>')).toBe(
      '上一行<div class="whono-right">下一行</div>'
    );
    expect(renderSettingHtml('<div>块</div>\n尾随文字')).toBe('<div>块</div>尾随文字');
    // 行内标签之间的空格仍然保留
    expect(renderSettingHtml('<b>粗</b> <i>斜</i>')).toBe('<b>粗</b> <i>斜</i>');
  });

  it('escapes tags outside the allowlist instead of dropping the text', () => {
    expect(renderSettingHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(renderSettingHtml('<a href="https://example.com">链接</a>')).toBe(
      '&lt;a href="https://example.com"&gt;链接&lt;/a&gt;'
    );
    expect(renderSettingHtml('a < b')).toBe('a &lt; b');
  });

  it('drops event handlers and unknown attributes', () => {
    expect(renderSettingHtml('<span onclick="x()" data-x="1" class="whono-right">文</span>')).toBe(
      '<span class="whono-right">文</span>'
    );
  });

  it('keeps layout styles but strips font and colour overrides', () => {
    expect(renderSettingHtml('<span style="text-align: right; display: block">文</span>')).toBe(
      '<span style="text-align: right; display: block">文</span>'
    );
    expect(
      renderSettingHtml('<span style="font-family: Comic Sans; font-size: 40px; color: red">文</span>')
    ).toBe('<span>文</span>');
    expect(renderSettingHtml('<span style="background: url(https://example.com/a.png)">文</span>')).toBe(
      '<span>文</span>'
    );
  });

  it('auto-closes unbalanced tags so the sidebar cannot be swallowed', () => {
    expect(renderSettingHtml('<div class="whono-right">两行')).toBe('<div class="whono-right">两行</div>');
    expect(renderSettingHtml('<b>粗</div>')).toBe('<b>粗</b>');
    expect(renderSettingHtml('</div>文')).toBe('文');
  });

  it('derives plain text for title, meta and aria labels', () => {
    expect(toSettingPlainText('A minimal\nAstro theme')).toBe('A minimal Astro theme');
    expect(toSettingPlainText('<b>Whono</b><br>主题')).toBe('Whono 主题');
    expect(toSettingPlainText('<script>alert(1)</script>')).toBe('alert(1)');
    expect(toSettingPlainText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(toSettingPlainText('&lt;未闭合')).toBe('<未闭合');
    expect(toSettingPlainText('   ')).toBe('');
  });
});
