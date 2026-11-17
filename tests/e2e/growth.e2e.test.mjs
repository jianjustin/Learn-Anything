// 课程页生长面板的浏览器测试。整个文件共用一个浏览器，每个测试自己开页面、自己的课程目录。
// 期望值不写死：用 course-core 对同一份样例算出来，再和页面比较。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { eventually, fileUrl, launchBrowser, makeCourseDir, openPage } from '../helpers/browser.mjs';
import { loadCore, loadFixture } from '../helpers/load-core.mjs';

const C = loadCore();
const data = loadFixture('all-cards');
const panel = data.growth.find((g) => g.kind === 'diagram');
const codePanel = data.growth.find((g) => g.kind === 'code');

let launched;
const launchOnce = () => (launched ??= launchBrowser());
after(async () => {
  const b = launched && (await launched);
  if (b && b.browser) await b.browser.close();
});

async function open(t, browser, opts) {
  const dir = makeCourseDir('all-cards');
  const opened = await openPage(browser, fileUrl(path.join(dir, 'course.html')), opts);
  t.after(() => opened.context.close());
  await opened.page.locator('#lessons li').first().waitFor({ timeout: 8000 });
  return opened;
}

const current = (page) => page.locator('#lessons li[aria-current="true"]').getAttribute('data-lesson-id');
const showLesson = (page, id) => page.locator(`#lessons li[data-lesson-id="${id}"]`).click();

test('G1 图逐课生长，新增元素有标记', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await open(t, b.browser);
  for (const id of ['intro', 'core', 'wrap']) {
    await showLesson(page, id);
    const s = C.diagramAt(panel, data.lessons, id);
    const nodes = page.locator('[data-panel="diagram"] .node');
    assert.equal(await nodes.count(), s.nodes.length, `第 ${id} 课节点数`);
    assert.deepEqual((await nodes.evaluateAll((els) => els.map((e) => e.dataset.nodeId))).sort(), s.nodes.map((n) => n.id).sort());
    assert.equal(await page.locator('[data-panel="diagram"] .node.is-new').count(), s.nodes.filter((n) => n.isNew).length, `第 ${id} 课新增节点数`);
    assert.equal(await page.locator('[data-panel="diagram"] .edge').count(), s.edges.length, `第 ${id} 课连线数`);
  }
  assert.deepEqual(consoleErrors, []);
});

test('G2 路线编号与计算结果一致', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser);
  await showLesson(page, 'wrap');
  const expected = C.diagramAt(panel, data.lessons, 'wrap').route.steps.flatMap((s) => s.numbers).sort((a, b) => a - b).join(',');
  const actual = (await page.locator('.route-num').allInnerTexts()).flatMap((x) => x.split(/\D+/).filter(Boolean)).map(Number).sort((a, b) => a - b).join(',');
  assert.equal(actual, expected);
  await showLesson(page, 'intro');
  assert.equal(await page.locator('.route-num').count(), 0, '第一课还没有路线');
});

test('G3 代码面板高亮改动的行，可切换版本', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser);
  await showLesson(page, 'wrap');
  const s = C.codeStateAt(codePanel, data.lessons, 'wrap');
  assert.ok(s.current.lines.some((l) => l.changed));
  assert.equal(await page.locator('[data-panel="code"] .code-line').count(), s.current.lines.length);
  assert.equal(await page.locator('[data-panel="code"] .code-line.changed').count(), s.current.lines.filter((l) => l.changed).length);
  assert.equal(await page.locator('[data-panel="code"] .version-chip').count(), s.versions.length);
  await page.locator('.version-chip[data-version="v1"]').click();
  assert.equal(await page.locator('[data-panel="code"] .code-line.changed').count(), 0);
  assert.equal(await page.locator('.version-chip[data-version="v1"]').getAttribute('aria-pressed'), 'true');
  await showLesson(page, 'intro');
  assert.equal(await page.locator('[data-panel="code"] .version-chip').count(), 1, '第一课只有 v1');
});

test('G4 时间线的条形宽度成比例', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser);
  await showLesson(page, 'wrap');
  assert.equal(await page.locator('[data-panel="timeline"] .event').count(), C.timelineAt(data.growth[2], data.lessons, 'wrap').events.length);
  const widths = await page.locator('[data-panel="timeline"] .bar').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  assert.equal(widths.length, 2);
  assert.ok(Math.abs(widths[1] / widths[0] - 0.125) < 0.02, String(widths));
});

test('G5 本课新增', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser);
  await showLesson(page, 'core');
  assert.deepEqual((await page.locator('#added .chip').allInnerTexts()).sort(), [...C.addedAt(data, 'core')].sort());
});

test('G6 播放生长逐课前进，可停止', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser);
  await showLesson(page, 'intro');
  await page.locator('#play').click();
  await page.waitForTimeout(2000);
  assert.equal(await current(page), 'core');
  await page.locator('#play').click();
  await page.waitForTimeout(2500);
  assert.equal(await current(page), 'core');
});

test('G6b 播放到最后一课自动停止；方向键也能停止', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser);
  await showLesson(page, 'core');
  await page.locator('#play').click();
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'true');
  await eventually(async () => (await current(page)) === 'wrap', { message: '没有前进到最后一课' });
  await eventually(async () => (await page.locator('#play').getAttribute('aria-pressed')) === 'false', { message: '到最后一课没有停止' });

  await showLesson(page, 'intro');
  await page.locator('#play').click();
  await page.keyboard.press('ArrowRight');
  assert.equal(await current(page), 'core');
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  await page.waitForTimeout(2200);
  assert.equal(await current(page), 'core', '按方向键后播放应已停止');
});

test('G7 导出 SVG 和 PNG', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, requests } = await open(t, b.browser);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export="svg"]').click()]);
  assert.equal(svg.suggestedFilename(), `${data.slug}-${panel.title}.svg`);
  const text = readFileSync(await svg.path(), 'utf8');
  assert.match(text, /<svg/);
  assert.match(text, /fill="(?!var)[^"]+"/, '导出的 SVG 应内联颜色');
  assert.doesNotMatch(text, /var\(--/);
  for (const n of C.diagramAt(panel, data.lessons, 'wrap').nodes) assert.ok(text.includes(n.label), n.label);
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export="png"]').click()]);
  assert.equal(png.suggestedFilename(), `${data.slug}-${panel.title}.png`);
  const buf = readFileSync(await png.path());
  assert.ok(statSync(await png.path()).size > 0);
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  const s = C.diagramAt(panel, data.lessons, 'wrap');
  assert.equal(buf.readUInt32BE(16), s.width * 2, 'PNG 按 2 倍分辨率');
  assert.ok(requests.every((u) => u.startsWith('file:') || u.startsWith('blob:')), requests.join('\n'));
});

test('G8 窄屏和深色：图不撑出页面', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, { colorScheme: 'dark', viewport: { width: 390, height: 844 } });
  for (const id of ['intro', 'core', 'wrap']) {
    await showLesson(page, id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `第 ${id} 课出现横向滚动`);
    const fits = await page.locator('[data-panel="diagram"]').evaluate((p) => p.getBoundingClientRect().right <= window.innerWidth);
    assert.equal(fits, true);
  }
});
