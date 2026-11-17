// 页面测试辅助：找到 playwright-core，启动本机 Chrome（退回 playwright 自带的 Chromium），
// 在临时目录里搭好课程目录，打开页面并收集请求和报错。
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS_DIR, fixture } from './paths.mjs';
import { readDataFile, writeDataFile } from '../../plugins/learn-anything/skills/learn/scripts/lib/data-file.mjs';

const require = createRequire(import.meta.url);

// 查找顺序：本地安装、PLAYWRIGHT_CORE_PATH、npm 全局目录（含 @playwright/mcp 和 @playwright/test 自带的那份）
function playwrightCandidates() {
  const list = ['playwright-core'];
  if (process.env.PLAYWRIGHT_CORE_PATH) list.push(process.env.PLAYWRIGHT_CORE_PATH);
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (root) {
      list.push(path.join(root, 'playwright-core'));
      list.push(path.join(root, '@playwright/mcp/node_modules/playwright-core'));
      list.push(path.join(root, '@playwright/test/node_modules/playwright-core'));
      list.push(path.join(root, 'playwright/node_modules/playwright-core'));
    }
  } catch {
    // 没有 npm 时只试前两种
  }
  return list;
}

let playwright;
function loadPlaywright() {
  if (playwright !== undefined) return playwright;
  playwright = null;
  for (const c of playwrightCandidates()) {
    try {
      playwright = require(c);
      break;
    } catch {
      // 试下一个
    }
  }
  return playwright;
}

// 返回 { browser } 或 { skip: '原因' }；跳过的测试在 run-all.sh 里算失败
export async function launchBrowser() {
  const pw = loadPlaywright();
  if (!pw) return { skip: '找不到 playwright-core（可设置 PLAYWRIGHT_CORE_PATH，或全局安装 @playwright/mcp）' };
  const errors = [];
  for (const opts of [{ channel: 'chrome' }, {}]) {
    try {
      return { browser: await pw.chromium.launch({ headless: true, ...opts }) };
    } catch (e) {
      errors.push(`${opts.channel || 'chromium'}: ${String(e.message).split('\n')[0]}`);
    }
  }
  return { skip: '无法启动 Chrome 或 Chromium：' + errors.join(' | ') };
}

export const fileUrl = (p) => pathToFileURL(p).href;

// 在临时目录里放好 course.html 和样例数据，返回课程目录。
// 默认的临时目录名含空格和中文，顺带检验页面对这类路径的处理。
export function makeCourseDir(fixtureName, { root, slug } = {}) {
  const base = root || mkdtempSync(path.join(os.tmpdir(), '学习 课程-'));
  const dir = path.join(base, slug || fixtureName);
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(ASSETS_DIR, 'course.html'), path.join(dir, 'course.html'));
  copyFileSync(fixture(fixtureName), path.join(dir, 'course-data.js'));
  return dir;
}

// 搭一个课程总目录：index.html、index-data.js 和若干课程子目录，返回路径。
// courses 的每一项：
//   slug     登记用的 slug，也是目录名（除非给了 dir）
//   fixture  数据来自 tests/fixtures 里的哪个样例，默认 'valid-minimal'
//   dir      目录名，默认等于 slug
//   mutate   (data) => void，改完再写入 course-data.js
//   raw      直接作为 course-data.js 的全部内容（用来造语法错误等）
//   create   false：只登记，不建目录
//   register false：只建目录，不登记
// options.entries 是原样追加到 index-data.js 的登记项（用来造不安全的 dir）；
// options.index 为 false 时不写 index-data.js。
export function makeHomeDir(courses = [], { index = true, entries = [] } = {}) {
  const home = mkdtempSync(path.join(os.tmpdir(), '学习 总览-'));
  const registered = [];
  for (const spec of courses) {
    const dir = spec.dir ?? spec.slug;
    if (spec.create !== false) {
      const full = path.join(home, dir);
      mkdirSync(full, { recursive: true });
      copyFileSync(path.join(ASSETS_DIR, 'course.html'), path.join(full, 'course.html'));
      const file = path.join(full, 'course-data.js');
      if (spec.raw !== undefined) {
        writeFileSync(file, spec.raw);
      } else {
        copyFileSync(fixture(spec.fixture || 'valid-minimal'), file);
        if (spec.mutate) rewriteData(file, spec.mutate);
      }
    }
    if (spec.register !== false) registered.push({ slug: spec.slug, dir });
  }
  const indexFile = path.join(home, 'index-data.js');
  const htmlFile = path.join(home, 'index.html');
  copyFileSync(path.join(ASSETS_DIR, 'index.html'), htmlFile);
  if (index) writeIndexData(indexFile, [...registered, ...entries]);
  return { home, indexFile, htmlFile };
}

// 写 index-data.js（原子替换）
export function writeIndexData(file, courses) {
  writeDataFile(file, 'LEARN_INDEX', { version: 1, courses });
}

// 打开页面，收集 console 报错、未捕获的异常和全部请求地址
export async function openPage(browser, url, { colorScheme = 'light', viewport = { width: 1280, height: 900 } } = {}) {
  const context = await browser.newContext({ colorScheme, viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(url);
  return { page, context, consoleErrors, requests };
}

// 读出课程数据、改完原子写回；返回改后的对象
export function rewriteData(file, mutate) {
  const data = readDataFile(file, 'LEARN_COURSE');
  mutate(data);
  writeDataFile(file, 'LEARN_COURSE', data);
  return data;
}

// 轮询直到 fn 返回真值（可以是 async）；超时抛出最后一次的结果或异常
export async function eventually(fn, { timeout = 8000, interval = 100, message = '等待超时' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e;
    }
    if (Date.now() >= deadline) {
      throw new Error(`${message}（${timeout} 毫秒）；最后一次：${last instanceof Error ? last.message : String(last)}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
