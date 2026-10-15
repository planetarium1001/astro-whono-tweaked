#!/usr/bin/env node
/**
 * check-image-references：全站图片引用完整性校验，覆盖 Markdown `![]()`、HTML `src=`、
 * `<source srcset>` 与 frontmatter / 设置文件里的图片字段；跳过外链、`data:` 与模板表达式。
 * 用法：`node ./scripts/check-image-references.mjs`
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { collectSourceFiles } from './collect-source-files.mjs';

const ROOT = process.cwd();

const SOURCE_DIRS = [
  { dir: 'src/content', exts: ['.md'] },
  { dir: 'src/test-fixtures', exts: ['.md'] },
  { dir: 'src/data/settings', exts: ['.json'] },
  { dir: 'src/pages', exts: ['.astro'] },
  { dir: 'src/components', exts: ['.astro'] },
  { dir: 'src/layouts', exts: ['.astro'] }
];

const SOURCE_FILES = ['site.config.mjs'];

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
// Markdown 容器指令的图片属性，例如 `:::friend{avatar="author/avatar.webp"}`。
const DIRECTIVE_IMAGE_ATTR_RE = /\b(?:avatar|cover|icon|src)\s*=\s*"([^"]*\.[A-Za-z0-9]+)"/g;
// JSON / mjs 里的图片键。
const JSON_IMAGE_KEY_RE = /\b(?:avatar|authorAvatar|heroImageSrc|cover|icon|src)\s*:\s*["']([^"']+)["']/g;
const HTML_SRC_RE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
const SOURCE_SRCSET_RE = /<source\b[^>]*\bsrcset\s*=\s*["']([^"']+)["']/gi;
// frontmatter 的图片字段。不含 `badge`：它是纯文本角标，当图片路径会产生假阳性。
const FRONTMATTER_KEY_RE =
  /^\s*-?\s*(?:cover|icon|avatar|heroImageSrc|src)\s*:\s*["']?([^"'\n#]+)["']?\s*$/gm;

const isRemote = (value) =>
  /^[A-Za-z][A-Za-z\d+.-]*:/.test(value) || value.startsWith('//');

const isTemplateExpression = (value) => value.includes('${') || value.includes('{');

const stripDecorations = (value) => {
  let out = value.trim();
  // Markdown 标题：![alt](url "title")
  out = out.replace(/\s+"[^"]*"$/, '').trim();
  out = out.replace(/^<|>$/g, '').replace(/^["']|["']$/g, '').trim();
  return (out.split(/[?#]/, 1)[0] ?? '').trim();
};

const parseSrcset = (srcset) =>
  srcset
    .split(',')
    .map((candidate) => stripDecorations(candidate.trim().split(/\s+/, 1)[0] ?? ''))
    .filter(Boolean);

// base = 'source-relative'：Markdown / HTML 里的相对路径，按所在文件目录解析。
// base = 'public-relative'：frontmatter 的 images[].src 等字段，schema 要求去掉 public/ 前缀的相对路径。
const toAbsolutePath = (rawValue, filePath, base) => {
  const value = stripDecorations(rawValue);
  if (!value || isRemote(value) || isTemplateExpression(value)) return null;

  if (value.startsWith('/')) {
    return path.join(ROOT, 'public', value.replace(/^\/+/, ''));
  }
  if (value.startsWith('public/')) {
    return path.join(ROOT, value);
  }
  if (base === 'public-relative') {
    return path.join(ROOT, 'public', value);
  }
  return path.resolve(path.dirname(filePath), value);
};

const collectFiles = () =>
  collectSourceFiles(ROOT, { dirs: SOURCE_DIRS, files: SOURCE_FILES });

// 去掉代码围栏与行内代码。
const stripCodeFences = (text) =>
  text
    .replace(/^([ \t]*)(```|~~~)[\s\S]*?^\1\2[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');

const collectReferences = async (filePath) => {
  const rawText = await readFile(filePath, 'utf8');
  const text = path.extname(filePath) === '.md' ? stripCodeFences(rawText) : rawText;
  const raw = [];

  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) raw.push({ value: match[1], base: 'source-relative' });
  for (const match of text.matchAll(HTML_SRC_RE)) raw.push({ value: match[1], base: 'source-relative' });
  for (const match of text.matchAll(SOURCE_SRCSET_RE)) {
    for (const candidate of parseSrcset(match[1])) raw.push({ value: candidate, base: 'source-relative' });
  }
  for (const match of text.matchAll(DIRECTIVE_IMAGE_ATTR_RE)) {
    raw.push({ value: match[1], base: 'public-relative' });
  }
  const extension = path.extname(filePath);
  if (extension === '.json' || extension === '.mjs') {
    for (const match of text.matchAll(JSON_IMAGE_KEY_RE)) {
      raw.push({ value: match[1], base: 'public-relative' });
    }
  }
  if (path.extname(filePath) === '.md') {
    // frontmatter 的图片字段按 public/ 解析（schema 要求不带 public/、不以 / 开头）。
    for (const match of text.matchAll(FRONTMATTER_KEY_RE)) {
      raw.push({ value: match[1], base: 'public-relative' });
    }
  }

  const references = [];
  for (const { value, base } of raw) {
    const absolutePath = toAbsolutePath(value, filePath, base);
    if (!absolutePath) continue;
    references.push({
      value: stripDecorations(value),
      absolutePath,
      relativeToRoot: path.relative(ROOT, absolutePath).replace(/\\/g, '/')
    });
  }
  return references;
};

const main = async () => {
  const files = await collectFiles();
  const problems = [];
  let checked = 0;

  for (const filePath of files) {
    const references = await collectReferences(filePath);
    for (const reference of references) {
      checked += 1;
      if (existsSync(reference.absolutePath)) continue;
      problems.push(
        `${path.relative(ROOT, filePath)} → ${reference.value}（解析为 ${reference.relativeToRoot}，不存在）`
      );
    }
  }

  if (problems.length > 0) {
    console.error('[check-image-references] 存在无法解析的本地图片引用：');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`\n共检查 ${checked} 处引用，${problems.length} 处失效。`);
    process.exit(1);
  }

  console.log(`[check-image-references] OK（${files.length} 个文件 / ${checked} 处引用全部可达）`);
};

await main();
