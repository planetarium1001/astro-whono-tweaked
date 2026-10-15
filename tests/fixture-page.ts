import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { vi } from 'vitest';

/**
 * 页面快照的读取与注入。
 *
 * 快照是构建产物（tests/fixtures），客户端行为测试需要真实渲染后的 HTML：
 * SSR 输出的 data-* 属性、inline JSON 数据脚本与脚本加载顺序。
 */

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures');

export const fixturePath = (name: string) => path.join(FIXTURE_DIR, name);

/**
 * 去掉 fixture 里要执行的 <script>，避免 jsdom 解析 Vite 模块。
 * 必须保留 `type="application/json"` 的数据脚本（如 archive 的作用域数据），
 * 它们是页面内嵌状态，删掉会让服务端数据缺失。
 */
const stripScripts = (html: string) =>
  html
    .replace(/<script(?![^>]*type="application\/json")[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]+rel="modulepreload"[^>]*>/gi, '');

export const renderFixture = (html: string) => {
  document.documentElement.innerHTML = stripScripts(html)
    .replace(/^[\s\S]*?<html[^>]*>/i, '')
    .replace(/<\/html>[\s\S]*$/i, '');
};

export const renderFixturePage = async (name: string) => {
  renderFixture(await readFile(fixturePath(name), 'utf8'));
};

/** 生成绑定某个页面快照的加载助手，供用例在 beforeEach 里复用。 */
export const createFixturePageLoader = (name: string) => () => renderFixturePage(name);

/** 只让 index.json 的请求成功，其它一律 404。 */
export const stubIndexFetch = (indexJson: string) => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('index.json')) {
      return new Response(indexJson, {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response('not found', { status: 404 });
  });
};
