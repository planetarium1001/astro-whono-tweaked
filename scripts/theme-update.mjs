#!/usr/bin/env node
/**
 * 从主题仓库同步更新。
 *
 * 按 theme.json 记录的仓库与基准提交对主题文件做三方合并：站点未改动的直接取新版，
 * 站点改过的用 git merge-file 合并；站点自有路径不覆盖，只在报告中列出。
 *
 *   npm run theme:update            合并并更新 theme.json 的基准提交
 *   npm run theme:update -- --check 只报告变更，不写入
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const THEME_MANIFEST = path.join(ROOT, 'theme.json');
const CHECK_ONLY = process.argv.includes('--check');

/** 站点自有路径：主题更新不覆盖这些文件，只在报告中列出。 */
const SITE_OWNED_PREFIXES = [
  'src/content/',
  'src/data/settings/',
  'public/images/',
  'public/author/',
  'public/fonts/',
  'tools/',
  'tests/fixtures/'
];
const SITE_OWNED_FILES = new Set(['README.md', 'theme.json', '.github/workflows/pages.yml']);

const isSiteOwned = (filePath) =>
  SITE_OWNED_FILES.has(filePath)
  || SITE_OWNED_PREFIXES.some((prefix) => filePath.startsWith(prefix));

const runGit = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

const git = (args, { allowFailure = false } = {}) => {
  const result = runGit(args);
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
  return result.status === 0 ? result.stdout : '';
};

const readManifest = () => {
  if (!existsSync(THEME_MANIFEST)) {
    throw new Error('missing theme.json: this repository is not tracked as a theme instance');
  }
  const manifest = JSON.parse(readFileSync(THEME_MANIFEST, 'utf8'));
  if (!manifest.repository || !manifest.branch || !manifest.commit) {
    throw new Error('theme.json requires repository, branch and commit fields');
  }
  return manifest;
};

/** 取某个提交下的文件内容；文件不存在返回 null。 */
const readBlob = (commit, filePath) => {
  const result = runGit(['show', `${commit}:${filePath}`]);
  return result.status === 0 ? result.stdout : null;
};

const readWorktree = (filePath) => {
  const absolute = path.join(ROOT, filePath);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
};

/** 三方合并；返回合并结果与是否冲突。无基准时退化为取主题版本。 */
const mergeFile = (filePath, base, ours, theirs, scratchDir) => {
  if (ours === null) return { content: theirs, conflicted: false };
  if (theirs === null) return { content: null, conflicted: false };
  if (ours === base) return { content: theirs, conflicted: false };
  if (theirs === base) return { content: ours, conflicted: false };

  const stamp = filePath.replaceAll('/', '_');
  const oursPath = path.join(scratchDir, `${stamp}.ours`);
  const basePath = path.join(scratchDir, `${stamp}.base`);
  const theirsPath = path.join(scratchDir, `${stamp}.theirs`);
  writeFileSync(oursPath, ours);
  writeFileSync(basePath, base ?? '');
  writeFileSync(theirsPath, theirs);

  const result = spawnSync(
    'git',
    ['merge-file', '-p', '--diff3', oursPath, basePath, theirsPath],
    { encoding: 'utf8' }
  );
  if (result.error) throw result.error;

  return { content: result.stdout, conflicted: result.status !== 0 };
};

const main = async () => {
  const manifest = readManifest();
  const { repository, branch, commit: baseCommit } = manifest;

  if (git(['status', '--porcelain']).trim()) {
    throw new Error('working tree is not clean; commit or stash changes before updating');
  }

  git(['fetch', '--no-tags', '--force', repository, branch]);
  const headCommit = git(['rev-parse', 'FETCH_HEAD']).trim();

  if (headCommit === baseCommit) {
    console.log(`[theme:update] 已是最新：${baseCommit.slice(0, 10)}`);
    return;
  }

  const changed = git(['diff', '--name-status', baseCommit, headCommit])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\t/);
      return { status, filePath: rest.at(-1) };
    });

  const summary = { updated: [], merged: [], conflicts: [], skipped: [], removed: [] };
  const scratchDir = mkdtempSync(path.join(tmpdir(), 'theme-update-'));

  try {
    for (const { filePath } of changed) {
      if (isSiteOwned(filePath)) {
        summary.skipped.push(filePath);
        continue;
      }

      const base = readBlob(baseCommit, filePath);
      const theirs = readBlob(headCommit, filePath);
      const ours = readWorktree(filePath);
      const { content, conflicted } = mergeFile(filePath, base, ours, theirs, scratchDir);

      if (conflicted) {
        summary.conflicts.push(filePath);
      } else if (content === null) {
        summary.removed.push(filePath);
      } else if (ours === base) {
        summary.updated.push(filePath);
      } else {
        summary.merged.push(filePath);
      }

      if (!CHECK_ONLY && content !== null) {
        writeFileSync(path.join(ROOT, filePath), content);
      }
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }

  const printGroup = (label, items) => {
    if (items.length === 0) return;
    console.log(`\n${label}（${items.length}）`);
    for (const item of items) console.log(`  ${item}`);
  };

  console.log(`[theme:update] ${baseCommit.slice(0, 10)} → ${headCommit.slice(0, 10)}${CHECK_ONLY ? '（仅检查）' : ''}`);
  printGroup('取主题新版本', summary.updated);
  printGroup('已合并双方改动', summary.merged);
  printGroup('主题已删除', summary.removed);
  printGroup('站点自有，未覆盖', summary.skipped);
  printGroup('存在冲突，需手工处理', summary.conflicts);
  if (!CHECK_ONLY && summary.removed.length > 0) {
    console.log('\n主题已删除的文件不会自动移除，确认后请自行删除。');
  }

  if (summary.conflicts.length > 0) {
    console.error('\n[theme:update] 存在冲突，theme.json 未更新。解决冲突后重跑本命令。');
    process.exitCode = 1;
    return;
  }

  if (CHECK_ONLY) {
    console.log('\n[theme:update] 检查模式，未写入任何文件。');
    return;
  }

  writeFileSync(
    THEME_MANIFEST,
    `${JSON.stringify({ ...manifest, commit: headCommit }, null, 2)}\n`
  );
  console.log('\n[theme:update] 合并完成，theme.json 已更新到新基准提交。');
  console.log('建议执行：npm run verify');
};

main().catch((error) => {
  console.error(`[theme:update] ${error.message}`);
  process.exit(1);
});
