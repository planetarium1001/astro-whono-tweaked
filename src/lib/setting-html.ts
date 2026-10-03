// 设置富文本：侧栏站点名 / 引用文案的标签与属性白名单。
//
// 只放行排版相关标签，白名单外的原样显示成文本，未闭合标签自动补全；
// 字体与配色由主题 token 决定，故 style 只保留对齐与盒模型属性；
// 文本里的换行等同 <br>，但块级标签（div / p）边界上的换行是源码排版，直接丢弃。

const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'sub',
  'sup',
  'code',
  'br',
  'wbr',
  'span',
  'div',
  'p',
  'ruby',
  'rt',
  'rp'
]);

const VOID_TAGS: ReadonlySet<string> = new Set(['br', 'wbr']);

const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set(['class', 'style', 'title']);

// 只开放排版属性：字体族、字号、颜色、定位均不在此列
const ALLOWED_STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  'display',
  'text-align',
  'white-space',
  'width',
  'min-width',
  'max-width',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'line-height',
  'letter-spacing',
  'vertical-align'
]);

// 只接受尺寸/对齐这类字面量，挡掉 url()、expression() 与反斜杠转义
const STYLE_VALUE_RE = /^[A-Za-z0-9\s.,%()#+\-*/]+$/;
const CLASS_TOKEN_RE = /^[A-Za-z0-9_-]+$/;
const TAG_RE = /<\/?([A-Za-z][A-Za-z0-9-]*)([^<>]*?)\/?>/g;
const ATTRIBUTE_RE = /([A-Za-z_:][A-Za-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

const escapeText = (value: string): string =>
  value.replace(/[&<>]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'));

const escapeAttribute = (value: string): string =>
  value.replace(
    /[&<>"]/g,
    (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;')
  );

// 先转义再换行转 <br>，顺序不可颠倒
const renderText = (value: string): string => escapeText(value).replace(/\r\n?|\n/g, '<br>');

const sanitizeStyleValue = (value: string): string | null => {
  const next = value.trim();
  if (!next) return null;
  const lowered = next.toLowerCase();
  if (
    lowered.includes('url(')
    || lowered.includes('expression')
    || lowered.includes('javascript:')
    || next.includes('\\')
  ) {
    return null;
  }
  return STYLE_VALUE_RE.test(next) ? next : null;
};

const sanitizeStyle = (value: string): string | null => {
  const declarations: string[] = [];
  for (const rawDeclaration of value.split(';')) {
    const separator = rawDeclaration.indexOf(':');
    if (separator < 0) continue;
    const property = rawDeclaration.slice(0, separator).trim().toLowerCase();
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;
    const sanitizedValue = sanitizeStyleValue(rawDeclaration.slice(separator + 1));
    if (!sanitizedValue) continue;
    declarations.push(`${property}: ${sanitizedValue}`);
  }
  return declarations.length ? declarations.join('; ') : null;
};

const sanitizeClass = (value: string): string | null => {
  const tokens = value.split(/\s+/).filter((token) => CLASS_TOKEN_RE.test(token));
  return tokens.length ? [...new Set(tokens)].join(' ') : null;
};

const sanitizeAttributes = (raw: string): string => {
  if (!raw.trim()) return '';
  const attributes: string[] = [];
  ATTRIBUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_RE.exec(raw)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (!ALLOWED_ATTRIBUTES.has(name)) continue;

    if (name === 'class') {
      const className = sanitizeClass(value);
      if (className) attributes.push(`class="${escapeAttribute(className)}"`);
      continue;
    }

    if (name === 'style') {
      const style = sanitizeStyle(value);
      if (style) attributes.push(`style="${escapeAttribute(style)}"`);
      continue;
    }

    const title = value.trim();
    if (title) attributes.push(`title="${escapeAttribute(title)}"`);
  }
  return attributes.length ? ` ${attributes.join(' ')}` : '';
};

type SettingToken =
  | { kind: 'text'; value: string }
  | { kind: 'literal'; value: string }
  | { kind: 'open'; name: string; attributes: string; selfClosing: boolean }
  | { kind: 'close'; name: string };

// 块级标签：其边界上的换行不产生空行
const BLOCK_TAGS: ReadonlySet<string> = new Set(['div', 'p']);

const tokenizeSettingHtml = (source: string): SettingToken[] => {
  const tokens: SettingToken[] = [];
  let cursor = 0;

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(source)) !== null) {
    if (match.index > cursor) {
      tokens.push({ kind: 'text', value: source.slice(cursor, match.index) });
    }
    cursor = match.index + match[0].length;

    const rawTag = match[0];
    const tagName = (match[1] ?? '').toLowerCase();
    const isClosing = rawTag.startsWith('</');

    if (!ALLOWED_TAGS.has(tagName) || (isClosing && VOID_TAGS.has(tagName))) {
      tokens.push({ kind: 'literal', value: rawTag });
      continue;
    }

    if (isClosing) {
      tokens.push({ kind: 'close', name: tagName });
      continue;
    }

    tokens.push({
      kind: 'open',
      name: tagName,
      attributes: sanitizeAttributes(match[2] ?? ''),
      selfClosing: /\/>$/.test(rawTag)
    });
  }

  if (cursor < source.length) {
    tokens.push({ kind: 'text', value: source.slice(cursor) });
  }
  return tokens;
};

const endsWithBlock = (token: SettingToken | undefined): boolean => {
  if (!token) return false;
  if (token.kind === 'close') return BLOCK_TAGS.has(token.name);
  return token.kind === 'open' && token.selfClosing && BLOCK_TAGS.has(token.name);
};

const startsWithBlock = (token: SettingToken | undefined): boolean =>
  token?.kind === 'open' && BLOCK_TAGS.has(token.name);

/** 渲染成可安全 set:html 的片段：白名单外的标签转义为文本，未闭合标签自动补全 */
export const renderSettingHtml = (raw: string): string => {
  const source = typeof raw === 'string' ? raw : '';
  const tokens = tokenizeSettingHtml(source);
  const output: string[] = [];
  const stack: string[] = [];

  const closeUntil = (index: number) => {
    for (let i = stack.length - 1; i >= index; i -= 1) {
      output.push(`</${stack[i]}>`);
    }
    stack.length = index;
  };

  tokens.forEach((token, index) => {
    if (token.kind === 'text') {
      let value = token.value;
      if (endsWithBlock(tokens[index - 1])) {
        value = value.replace(/^[ \t]*(?:\r?\n)+[ \t]*/, '');
      }
      if (startsWithBlock(tokens[index + 1])) {
        value = value.replace(/[ \t]*(?:\r?\n)+[ \t]*$/, '');
      }
      if (value) output.push(renderText(value));
      return;
    }

    if (token.kind === 'literal') {
      output.push(renderText(token.value));
      return;
    }

    if (token.kind === 'close') {
      // 多余的闭合标签忽略，顺序不对时先补齐中间层
      const openIndex = stack.lastIndexOf(token.name);
      if (openIndex >= 0) closeUntil(openIndex);
      return;
    }

    if (VOID_TAGS.has(token.name)) {
      output.push(`<${token.name}>`);
      return;
    }

    output.push(`<${token.name}${token.attributes}>`);
    if (token.selfClosing) {
      output.push(`</${token.name}>`);
      return;
    }
    stack.push(token.name);
  });

  closeUntil(0);
  return output.join('');
};

const decodeEntities = (value: string): string =>
  value.replace(/&(#[Xx][0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (entity, body: string) => {
    if (body.startsWith('#') && body.length > 1) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(code);
      } catch (_) {
        return entity;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });

/** 纯文本副本，供 <title> / meta / RSS / aria-label 使用；标签等同空格 */
export const toSettingPlainText = (raw: string): string => {
  const source = typeof raw === 'string' ? raw : '';
  return decodeEntities(source.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
};
