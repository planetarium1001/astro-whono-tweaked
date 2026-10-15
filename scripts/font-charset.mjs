import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { collectSourceFiles } from './collect-source-files.mjs';

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, 'tools', 'charset-common.txt');
const BASE_CHARSET_PATH = path.join(ROOT, 'tools', 'charset-base.txt');

const ASCII_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ASCII_DIGITS = '0123456789';
const ASCII_PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const CJK_PUNCT = '，。！？；：、（）《》〈〉「」『』【】〔〕“”‘’—…·•';
const EXTRA_SPACES = ' \u00A0\u3000';

const EXTRA_CHARS = [
  ASCII_LETTERS,
  ASCII_DIGITS,
  ASCII_PUNCT,
  CJK_PUNCT,
  EXTRA_SPACES
].join('');

const SOURCE_DIRS = [
  { dir: 'src/content', exts: ['.md'] },
  { dir: 'src/pages', exts: ['.astro'] },
  { dir: 'src/components', exts: ['.astro'] },
  { dir: 'src/layouts', exts: ['.astro'] },
  // Theme Console 可编辑文案（brandTitle/quote/导航 label/页面标题等）也会用公开字体渲染。
  { dir: 'src/data/settings', exts: ['.json'] }
];

const SOURCE_FILES = ['site.config.mjs'];

const charset = new Set();

const addText = (text) => {
  for (const ch of text) {
    charset.add(ch);
  }
};

const collectFiles = () =>
  collectSourceFiles(ROOT, { dirs: SOURCE_DIRS, files: SOURCE_FILES });

const main = async () => {
  try {
    const baseText = await fs.readFile(BASE_CHARSET_PATH, 'utf8');
    addText(baseText);
  } catch (_) {
    // 基准字符集文件可缺省。
  }

  const files = await collectFiles();
  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8');
    addText(text);
  }

  addText(EXTRA_CHARS);

  const sorted = Array.from(charset).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

  if (process.argv.includes('--check')) {
    let committed;
    try {
      committed = await fs.readFile(OUTPUT_PATH, 'utf8');
    } catch (_) {
      console.error('[check:font-charset] Missing charset file / 缺少字符集文件');
      console.error(`- expected path: ${OUTPUT_PATH}`);
      console.error('- fix: run `npm run font:build`');
      process.exit(1);
    }

    const committedSet = new Set(committed.replace(/\n$/, ''));
    const missing = sorted.filter((ch) => !committedSet.has(ch));
    if (missing.length > 0) {
      console.error('[check:font-charset] Charset is stale / 字符集已过期，字体子集缺少以下字符：');
      console.error(`- missing characters (${missing.length}): ${missing.join('')}`);
      console.error('- fix: run `npm run font:build` and commit the regenerated fonts.');
      process.exit(1);
    }

    const stale = Array.from(committedSet).filter((ch) => !charset.has(ch));
    if (stale.length > 0) {
      console.error('[check:font-charset] Charset has stale characters / 字符集含已不再使用的字符：');
      console.error(`- stale characters (${stale.length}): ${stale.join('')}`);
      console.error('- fix: run `npm run font:build` and commit the regenerated fonts.');
      process.exit(1);
    }

    // stamp 由 font:subset 成功后写入，用于发现「跑了 font:charset 却没跑 font:subset」的过期状态。
    const stampPath = path.join(path.dirname(OUTPUT_PATH), 'charset-common.sha256');
    let stamp = '';
    try {
      stamp = (await fs.readFile(stampPath, 'utf8')).trim();
    } catch (_) {
      // stamp 缺失由下面的不一致分支处理。
    }
    const committedHash = createHash('sha256').update(committed).digest('hex');
    if (stamp !== committedHash) {
      console.error('[check:font-charset] Font subsets are stale / 字体子集未随字符集重生成：');
      console.error(`- expected stamp (${stampPath}): ${committedHash}`);
      console.error(`- actual stamp: ${stamp || '(missing)'}`);
      console.error('- fix: run `npm run font:subset` (or `npm run font:build`) and commit the regenerated fonts.');
      process.exit(1);
    }

    console.log(`charset up to date: ${OUTPUT_PATH}`);
    return;
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${sorted.join('')}\n`, 'utf8');

  console.log(`charset generated: ${OUTPUT_PATH}`);
  console.log(`characters: ${sorted.length}`);
};

await main();
