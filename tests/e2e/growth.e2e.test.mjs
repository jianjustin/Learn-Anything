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

// ---- 密集图 ----
const dense = loadFixture('dense-diagram');
const densePanel = dense.growth.find((g) => g.kind === 'diagram');
const denseLast = dense.lessons[dense.lessons.length - 1].id;
const splitNodes = densePanel.nodes.filter((n) => n.label.includes('\n')).map((n) => n.id);

async function openDense(t, browser, opts) {
  const dir = makeCourseDir('dense-diagram');
  const opened = await openPage(browser, fileUrl(path.join(dir, 'course.html')), opts);
  t.after(() => opened.context.close());
  await opened.page.locator('#lessons li').first().waitFor({ timeout: 8000 });
  await showLesson(opened.page, denseLast);
  return opened;
}

// 底框是否不透明：有填充色、颜色本身不透明、fill-opacity 和 opacity 都是 1
const OPAQUE_FILL = `(rect) => {
  if (!rect) return false;
  const cs = getComputedStyle(rect);
  const m = cs.fill.match(/^rgba?\\(([^)]+)\\)$/);
  if (!m) return false;
  const parts = m[1].split(/[ ,\\/]+/).filter(Boolean);
  const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
  return alpha === 1 && parseFloat(cs.fillOpacity) === 1 && parseFloat(cs.opacity) === 1;
}`;

test('G9 密集图：标签分两行显示，字号不小于 11px', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await openDense(t, b.browser);
  assert.ok(splitNodes.length >= 4);
  for (const id of splitNodes) {
    const lines = page.locator(`[data-panel="diagram"] .node[data-node-id="${id}"] text tspan`);
    assert.equal(await lines.count(), 2, `${id} 应分两行`);
    const expected = densePanel.nodes.find((n) => n.id === id).label.split('\n');
    assert.deepEqual(await lines.allTextContents(), expected, id);
  }
  const sizes = await page.locator('[data-panel="diagram"] .node text').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  assert.equal(sizes.length, C.diagramAt(densePanel, dense.lessons, denseLast).nodes.length);
  for (const px of sizes) assert.ok(px >= 11, `节点字号 ${px}px`);
  assert.deepEqual(consoleErrors, []);
});

test('G10 密集图：标注和连线标签有不透明的底色，叠在连线之上', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await openDense(t, b.browser);
  const s = C.diagramAt(densePanel, dense.lessons, denseLast);
  const annots = page.locator('[data-panel="diagram"] .d-annot');
  const labels = page.locator('[data-panel="diagram"] .edge-label');
  assert.equal(await annots.count(), s.annotations.length);
  assert.equal(await labels.count(), s.edges.filter((e) => e.label).length);
  for (const loc of [annots, labels]) {
    const ok = await loc.evaluateAll((els, src) => {
      const opaque = eval(src);
      return els.map((g) => opaque(g.querySelector('rect')) && g.querySelector('text') !== null);
    }, OPAQUE_FILL);
    assert.ok(ok.length > 0 && ok.every(Boolean), JSON.stringify(ok));
  }
  const order = await page.locator('[data-panel="diagram"] svg').evaluate((svg) => {
    const all = Array.from(svg.querySelectorAll('.edge, .edge-label, .node, .d-annot'));
    const last = (cls) => Math.max(...all.map((e, i) => (e.matches(cls) ? i : -1)));
    const first = (cls) => all.findIndex((e) => e.matches(cls));
    return { lastEdge: last('.edge'), firstLabel: first('.edge-label'), lastLabel: last('.edge-label'), firstNode: first('.node'), lastNode: last('.node'), firstAnnot: first('.d-annot') };
  });
  assert.ok(order.lastEdge < order.firstLabel, JSON.stringify(order));
  assert.ok(order.lastLabel < order.firstNode, JSON.stringify(order));
  assert.ok(order.lastNode < order.firstAnnot, JSON.stringify(order));
});

test('G11 密集图：导出的 SVG 里也有分行标签和标注底框', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, requests } = await openDense(t, b.browser);
  const s = C.diagramAt(densePanel, dense.lessons, denseLast);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export="svg"]').click()]);
  const text = readFileSync(await svg.path(), 'utf8');
  const got = await page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const fillOf = (r) => r && r.getAttribute('fill');
    return {
      split: Array.from(doc.querySelectorAll('[data-node-id]')).filter((g) => g.querySelectorAll('tspan').length === 2).map((g) => g.getAttribute('data-node-id')),
      annots: Array.from(doc.querySelectorAll('[data-annot]')).map((g) => fillOf(g.querySelector('rect'))),
      labels: Array.from(doc.querySelectorAll('[data-edge-label]')).map((g) => fillOf(g.querySelector('rect'))),
    };
  }, text);
  for (const id of splitNodes) assert.ok(got.split.includes(id), `导出里 ${id} 没有分两行`);
  assert.equal(got.annots.length, s.annotations.length);
  assert.equal(got.labels.length, s.edges.filter((e) => e.label).length);
  for (const f of [...got.annots, ...got.labels]) assert.ok(f && f !== 'none' && !f.startsWith('var('), `底框填充 ${f}`);
  assert.ok(requests.every((u) => u.startsWith('file:') || u.startsWith('blob:')), requests.join('\n'));
});
