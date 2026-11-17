// 课程页生长面板的浏览器测试。整个文件共用一个浏览器，每个测试自己开页面、自己的课程目录。
// 期望值不写死：用 course-core 对同一份样例算出来，再和页面比较。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { eventually, fileUrl, launchBrowser, makeCourseDir, openPage, rewriteData } from '../helpers/browser.mjs';
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

async function openDense(t, browser, opts, mutate) {
  const dir = makeCourseDir('dense-diagram');
  if (mutate) rewriteData(path.join(dir, 'course-data.js'), mutate);
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

// 页面上每个连线标签底框、节点形状、标注底框的矩形（SVG 坐标），以及画布的 viewBox
const LAYOUT = `(svg) => {
  const box = (r) => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') });
  const vb = svg.viewBox.baseVal;
  return {
    view: { x: vb.x, y: vb.y, w: vb.width, h: vb.height },
    labels: Array.from(svg.querySelectorAll('.edge-label')).map((g) => ({ id: g.dataset.edgeLabel, ...box(g.querySelector('rect')) })),
    shapes: Array.from(svg.querySelectorAll('.node rect.shape')).map((r) => ({ id: r.parentNode.dataset.nodeId, ...box(r) })),
    chips: Array.from(svg.querySelectorAll('.d-annot rect')).map((r) => ({ id: r.parentNode.dataset.annot, ...box(r) })),
  };
}`;
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const insideView = (r, v) => r.x >= v.x && r.y >= v.y && r.x + r.w <= v.x + v.w && r.y + r.h <= v.y + v.h;
const layoutOf = (page) => page.locator('[data-panel="diagram"] svg').evaluate((svg, src) => eval(src)(svg), LAYOUT);

test('G12 密集图：每一课的连线标签都在画布内，不压住节点和标注；比画布还宽的标签截断', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await openDense(t, b.browser);
  for (const l of dense.lessons) {
    await showLesson(page, l.id);
    const lay = await layoutOf(page);
    assert.equal(lay.labels.length, C.diagramAt(densePanel, dense.lessons, l.id).edges.filter((e) => e.label).length, l.id);
    for (const r of lay.labels) {
      assert.ok(insideView(r, lay.view), `${l.id} 标签 ${r.id} ${JSON.stringify(r)} 超出 ${JSON.stringify(lay.view)}`);
      for (const o of [...lay.shapes, ...lay.chips]) assert.equal(meets(r, o), false, `${l.id} 标签 ${r.id} 压住 ${o.id} ${JSON.stringify(o)}`);
    }
  }

  const wide = '超长的连线标签'.repeat(30);
  const { page: p2 } = await openDense(t, b.browser, undefined, (d) => {
    d.growth[0].edges.find((e) => e.from === 'rider' && e.to === 'gw').label = wide;
  });
  const lay = await layoutOf(p2);
  const r = lay.labels.find((x) => x.id === 'rider→gw');
  assert.ok(insideView(r, lay.view), `超宽标签 ${JSON.stringify(r)} 超出 ${JSON.stringify(lay.view)}`);
  const g = p2.locator('[data-panel="diagram"] .edge-label[data-edge-label="rider→gw"]');
  assert.match(await g.locator('text').textContent(), /…$/);
  assert.equal(await g.locator('title').textContent(), wide);
});

test('G13 密集图：节点标签、标注、连线标签的字都在自己的框内', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await openDense(t, b.browser);
  const checked = { 节点: 0, 标注: 0, 连线标签: 0 };
  for (const l of dense.lessons) {
    await showLesson(page, l.id);
    const { bad, counts } = await page.locator('[data-panel="diagram"] svg').evaluate((svg) => {
      const out = [];
      const counts = { 节点: 0, 标注: 0, 连线标签: 0 };
      // 字的外框（按字体的上下沿算）：左右要离框边至少 inset（节点 4px、小标签 2px，比页面用的内边距略小）；
      // 上下允许字体行高带来的 1px 出入
      const check = (kind, id, frame, el, inset) => {
        counts[kind] += 1;
        const f = frame.getBBox(), t = el.getBBox();
        if (t.x < f.x + inset - 0.5 || t.x + t.width > f.x + f.width - inset + 0.5 || t.y < f.y - 1 || t.y + t.height > f.y + f.height + 1) {
          out.push(`${kind} ${id} 「${el.textContent}」 字 ${[t.x, t.y, t.width, t.height].map(Math.round)} 框 ${[f.x, f.y, f.width, f.height].map(Math.round)}`);
        }
      };
      svg.querySelectorAll('.node').forEach((g) => g.querySelectorAll('text tspan').forEach((ts) => check('节点', g.dataset.nodeId, g.querySelector('rect.shape'), ts, 4)));
      svg.querySelectorAll('.d-annot').forEach((g) => check('标注', g.dataset.annot, g.querySelector('rect'), g.querySelector('text'), 2));
      svg.querySelectorAll('.edge-label').forEach((g) => check('连线标签', g.dataset.edgeLabel, g.querySelector('rect'), g.querySelector('text'), 2));
      return { bad: out, counts };
    });
    for (const kind of Object.keys(checked)) checked[kind] += counts[kind];
    assert.deepEqual(bad, [], l.id);
  }
  // 三类元素都真的检查过：选择器失效时这条测试不能空跑通过
  for (const [kind, n] of Object.entries(checked)) assert.ok(n > 0, `没有检查到任何${kind}`);
});

test('G14 密集图：没有换行符的长标签折成两行，仍放不下才截断，悬停看全文', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await openDense(t, b.browser);
  const long = densePanel.nodes.find((n) => n.id === 'forecast').label;
  assert.ok(!long.includes('\n') && long.length > 8);
  const node = page.locator('[data-panel="diagram"] .node[data-node-id="forecast"]');
  const lines = await node.locator('text tspan').allTextContents();
  assert.equal(lines.length, 2, `forecast 应折成两行：${JSON.stringify(lines)}`);
  assert.equal(lines.join(''), long, '折行不丢字、不截断');
  assert.equal(await node.locator('title').textContent(), long);

  const huge = '一个长到两行也放不下的节点标签需要截断才行'.repeat(2);
  const { page: p2 } = await openDense(t, b.browser, undefined, (d) => {
    d.growth[0].nodes.find((n) => n.id === 'forecast').label = huge;
  });
  const n2 = p2.locator('[data-panel="diagram"] .node[data-node-id="forecast"]');
  const cut = await n2.locator('text tspan').allTextContents();
  assert.equal(cut.length, 2, JSON.stringify(cut));
  assert.match(cut[1], /…$/, `第二行应以省略号结尾：${JSON.stringify(cut)}`);
  assert.ok(huge.startsWith(cut[0]), JSON.stringify(cut));
  assert.equal(await n2.locator('title').textContent(), huge);
});

// ---- 恶意数据：面板里的文字字段一律按文字显示，导出的 SVG 也一样 ----
const PAYLOADS = [
  '<img src=x onerror="window.__pwned=1">',
  '</svg><script>window.__pwned=2</script>',
  '"><svg onload="window.__pwned=3"><a href="javascript:window.__pwned=4">x</a>',
  ']]><foreignObject><iframe src="https://example.invalid/"></iframe></foreignObject>',
  '&amp; &lt;b&gt; <!-- -->',
];
const evil = (i) => PAYLOADS[i % PAYLOADS.length];

// 生长区里出现的元素种类和带事件属性、外部地址的元素
const GROWTH_SCAN = `(root) => {
  const tags = new Set();
  const bad = [];
  root.querySelectorAll('*').forEach((el) => {
    tags.add(el.localName);
    for (const a of el.attributes) {
      if (/^on/i.test(a.name)) bad.push(el.localName + ' ' + a.name);
      if (/href$|^src$/i.test(a.name) && !/^#/.test(a.value)) bad.push(el.localName + ' ' + a.name + '=' + a.value);
    }
  });
  return { tags: [...tags].sort(), bad };
}`;

async function scanAllLessons(page, lessons) {
  const tags = new Set();
  const bad = [];
  for (const l of lessons) {
    await showLesson(page, l.id);
    const r = await page.locator('#growth').evaluate((root, src) => eval(src)(root), GROWTH_SCAN);
    r.tags.forEach((x) => tags.add(x));
    bad.push(...r.bad);
  }
  return { tags, bad };
}

test('G15 恶意数据：节点、连线、标注、分组、版本、事件里的 HTML 不执行、不产生元素，导出的 SVG 是干净的 XML', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);

  // 对照：同一份样例原样渲染时生长区里有哪些元素
  const plainPage = await open(t, b.browser);
  const baseline = await scanAllLessons(plainPage.page, data.lessons);
  assert.deepEqual(baseline.bad, []);

  const dir = makeCourseDir('all-cards');
  let k = 0;
  rewriteData(path.join(dir, 'course-data.js'), (d) => {
    const dg = d.growth.find((g) => g.kind === 'diagram');
    dg.title = evil(k++);
    dg.nodes.forEach((n) => { n.label = evil(k++); });
    dg.edges.forEach((e) => { e.label = evil(k++); });
    dg.annotations.forEach((a) => { a.text = evil(k++); });
    dg.groups.forEach((g) => { g.label = evil(k++); });
    d.growth.find((g) => g.kind === 'code').versions.forEach((v) => { v.label = evil(k++); v.note = evil(k++); v.code = evil(k++); });
    const tl = d.growth.find((g) => g.kind === 'timeline');
    tl.metricLabel = evil(k++);
    tl.events.forEach((e) => { e.title = evil(k++); e.detail = evil(k++); });
  });
  const opened = await openPage(b.browser, fileUrl(path.join(dir, 'course.html')));
  t.after(() => opened.context.close());
  const { page, requests, consoleErrors } = opened;
  await page.locator('#lessons li').first().waitFor({ timeout: 8000 });

  const scan = await scanAllLessons(page, data.lessons);
  assert.deepEqual(scan.bad, []);
  const extra = [...scan.tags].filter((x) => !baseline.tags.has(x));
  assert.deepEqual(extra, [], `出现了对照里没有的元素：${extra.join(', ')}`);
  for (const tag of ['img', 'script', 'iframe', 'foreignobject', 'a']) assert.equal(scan.tags.has(tag), false, tag);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  // 文字原样显示出来了，说明确实渲染过这些字段
  await showLesson(page, 'wrap');
  const growthText = await page.locator('#growth').evaluate((el) => el.textContent);
  assert.ok(growthText.includes('<img src=x'), '节点标签没有按文字显示');
  assert.ok(growthText.includes('</svg><script>'), '标签没有按文字显示');
  assert.deepEqual(consoleErrors, []);

  // 导出的 SVG：合法 XML，没有 script、事件属性和外部链接
  const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export="svg"]').click()]);
  const text = readFileSync(await svg.path(), 'utf8');
  assert.doesNotMatch(text, /<script/i);
  assert.doesNotMatch(text, /<(img|iframe|foreignObject)\b/i);
  const parsed = await page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    const err = doc.querySelector('parsererror');
    if (err) return { error: err.textContent };
    const bad = [];
    let count = 0;
    doc.querySelectorAll('*').forEach((el) => {
      count++;
      if (el.localName.toLowerCase() === 'script') bad.push('script');
      for (const a of el.attributes) {
        if (/^on/i.test(a.name)) bad.push(el.localName + ' ' + a.name);
        if (/href$|^src$/i.test(a.name) && !/^#/.test(a.value)) bad.push(el.localName + ' ' + a.name + '=' + a.value);
      }
    });
    return { root: doc.documentElement.localName, bad, count, text: doc.documentElement.textContent };
  }, text);
  assert.equal(parsed.error, undefined, parsed.error);
  assert.equal(parsed.root, 'svg');
  assert.ok(parsed.count > 5);
  assert.deepEqual(parsed.bad, []);
  assert.ok(parsed.text.includes('<img src=x'), '导出的 SVG 里标签应是文字');
  await page.waitForTimeout(300);
  assert.ok(requests.every((u) => u.startsWith('file:') || u.startsWith('blob:')), requests.join('\n'));
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
});
