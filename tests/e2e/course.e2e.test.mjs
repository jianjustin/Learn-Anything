// 课程页（不含生长面板）的浏览器测试。整个文件共用一个浏览器，每个测试自己开页面、自己的课程目录。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eventually, fileUrl, launchBrowser, makeCourseDir, openPage, rewriteData } from '../helpers/browser.mjs';
import { loadCore, loadFixture } from '../helpers/load-core.mjs';

const C = loadCore();
const allCards = loadFixture('all-cards');
const bookTitle = allCards.resources.find((r) => r.id === 'book-a').title;
const corePractice = (d) => d.lessons.find((l) => l.id === 'core').cards.find((c) => c.type === 'practice');
const rubricOfFirstItem = corePractice(allCards).items[0].rubric;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whyText = allCards.lessons.find((l) => l.id === 'core').cards.find((c) => c.type === 'practice').items[1].why;

let launched;
const launchOnce = () => (launched ??= launchBrowser());
after(async () => {
  const b = launched && (await launched);
  if (b && b.browser) await b.browser.close();
});

// 搭好课程目录并打开页面；测试结束时关掉这一页
async function open(t, browser, fixtureName, opts) {
  const dir = makeCourseDir(fixtureName);
  const file = path.join(dir, 'course-data.js');
  const opened = await openPage(browser, fileUrl(path.join(dir, 'course.html')), opts);
  t.after(() => opened.context.close());
  await opened.page.locator('#lessons li').first().waitFor({ timeout: 8000 });
  return { ...opened, dir, file };
}

const current = (page) => page.locator('#lessons li[aria-current="true"]').getAttribute('data-lesson-id');
const showLesson = (page, id) => page.locator(`#lessons li[data-lesson-id="${id}"]`).click();

test('B1 离线：只请求 file: 地址，路径含空格和中文', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, dir, requests, consoleErrors } = await open(t, b.browser, 'all-cards');
  assert.match(dir, / /);
  assert.match(dir, /[一-鿿]/);
  await page.waitForTimeout(3000); // 至少经过一次自动刷新
  assert.ok(requests.length > 0 && requests.every((u) => u.startsWith('file:')), requests.join('\n'));
  assert.deepEqual(consoleErrors, []);
  assert.equal(await page.locator('#errors-box').isHidden(), true);
  assert.equal(await page.locator('#topic').innerText(), allCards.topic);
});

test('B2 新开的课：没有生长区，没有报错，显示未核对提示', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await open(t, b.browser, 'valid-minimal');
  assert.equal(await page.locator('#growth').isHidden(), true);
  assert.equal(await page.locator('#lessons li').count(), 2);
  assert.equal(await page.locator('#errors-box').isHidden(), true);
  assert.match(await page.locator('#unresearched-banner').innerText(), /大纲未经资料核对/);
  assert.equal(await page.locator('#topic').innerText(), '示例主题');
  assert.equal(await page.locator('#notice').isHidden(), true);
  assert.match(await page.locator('#lessons li[data-lesson-id="second"]').innerText(), /可选/);
  assert.deepEqual(consoleErrors, []);
});

test('B3 十三种卡片都能渲染，html 卡里的脚本不执行', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, 'all-cards');
  const seen = new Set();
  for (const id of allCards.lessons.map((l) => l.id)) {
    await showLesson(page, id);
    assert.equal(await current(page), id);
    for (const type of await page.locator('#cards .card').evaluateAll((els) => els.map((e) => e.dataset.type))) seen.add(type);
  }
  assert.deepEqual([...seen].sort(), [...C.CARD_TYPES].sort());
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator('.card[data-type="html"] script, .card[data-type="html"] [onerror]').count(), 0);
  assert.match(await page.locator('.card[data-type="html"]').innerText(), /ok/);
  assert.equal(await page.locator('#growth').isVisible(), true);
});

test('B4 「已讲」和「已掌握」分开显示', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, 'all-cards');
  const intro = page.locator('#lessons li[data-lesson-id="intro"]');
  const core = page.locator('#lessons li[data-lesson-id="core"]');
  assert.equal(await intro.getAttribute('data-mastered'), 'true');
  assert.equal(await intro.getAttribute('data-status'), 'done');
  assert.match(await intro.innerText(), /已掌握/);
  assert.equal(await core.getAttribute('data-mastered'), 'false');
  assert.match(await core.innerText(), /已讲/);
  assert.doesNotMatch(await core.innerText(), /已掌握/);
  assert.equal(await page.locator('#lessons li[data-lesson-id="wrap"]').getAttribute('data-status'), 'current');
});

test('B5 来源标记随 researched 变化', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  await showLesson(page, 'intro');
  assert.match(await page.locator('.card[data-type="points"] .source-tag[data-kind="refs"]').first().innerText(), new RegExp(bookTitle));
  assert.equal(await page.locator('.card[data-type="steps"] .source-tag[data-kind="unverified"]').first().innerText(), '未核对');
  await showLesson(page, 'core');
  assert.equal(await page.locator('.card[data-type="practice"] .source-tag, .card[data-type="questions"] .source-tag, .card[data-type="note"] .source-tag').count(), 0);
  assert.equal(await page.locator('#unresearched-banner').isHidden(), true);
  rewriteData(file, (d) => { d.researched = 'skipped'; });
  await eventually(async () => (await page.locator('.source-tag').count()) === 0, { message: '来源标记没有消失' });
  assert.equal(await page.locator('#unresearched-banner').isHidden(), true);
  rewriteData(file, (d) => { d.researched = 'no'; });
  await eventually(() => page.locator('#unresearched-banner').isVisible(), { message: '未核对提示没有出现' });
  assert.equal(await page.locator('.source-tag').count(), 0);
});

test('B6 自动刷新保留正在看的课，断点变了才跳转', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  assert.equal(await current(page), 'wrap');
  await showLesson(page, 'intro');
  rewriteData(file, (d) => { d.topic = '改过的主题'; });
  await eventually(async () => (await page.locator('#topic').innerText()) === '改过的主题', { message: '页面没有刷新' });
  assert.equal(await current(page), 'intro');
  rewriteData(file, (d) => { d.resume.lesson = 'core'; });
  await eventually(async () => (await current(page)) === 'core', { message: '断点变了却没有跳转' });
  assert.equal(await current(page), 'core');
});

test('B7 数据写到一半：提示错误并保留上次内容，修好后恢复', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  const topicBefore = await page.locator('#topic').innerText();
  const good = readFileSync(file, 'utf8');
  writeFileSync(file, good.slice(0, Math.floor(good.length / 2)));
  await eventually(() => page.locator('#errors-box').isVisible(), { message: '错误框没有出现' });
  assert.match(await page.locator('#errors-box').innerText(), /语法错误/);
  assert.equal(await page.locator('#topic').innerText(), topicBefore);
  assert.ok((await page.locator('#cards .card').count()) > 0);
  writeFileSync(file, good);
  await eventually(() => page.locator('#errors-box').isHidden(), { message: '修好后错误框没有隐藏' });
  assert.equal(await page.locator('#topic').innerText(), topicBefore);
});

test('B7b 文件不存在、没有赋值、校验出错：分别提示，保留上次内容', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  const good = readFileSync(file, 'utf8');
  const cardsBefore = await page.locator('#cards .card').count();
  const expectError = async (re) => {
    await eventually(async () => (await page.locator('#errors-box').isVisible()) && re.test(await page.locator('#errors-box').innerText()),
      { message: `错误框没有显示 ${re}` });
    assert.equal(await page.locator('#topic').innerText(), allCards.topic);
    assert.equal(await page.locator('#cards .card').count(), cardsBefore);
  };

  writeFileSync(file, 'window.SOMETHING_ELSE = {};\n');
  await expectError(/没有给 window\.LEARN_COURSE 赋值/);

  writeFileSync(file, good);
  await eventually(() => page.locator('#errors-box').isHidden());

  writeFileSync(file, good.replace('"version": 1', '"version": 2'));
  await expectError(/version 应为 1/);

  writeFileSync(file, good);
  await eventually(() => page.locator('#errors-box').isHidden());
  rmSync(file);
  await expectError(/找不到 course-data\.js/);
  writeFileSync(file, good);
  await eventually(() => page.locator('#errors-box').isHidden(), { message: '恢复文件后错误框没有隐藏' });
});

test('B8 方向键切课；深色和窄屏下没有横向滚动', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, 'all-cards');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await current(page), 'core');
  await page.keyboard.press('ArrowRight');
  assert.equal(await current(page), 'wrap');
  await page.keyboard.press('ArrowRight');
  assert.equal(await current(page), 'wrap', '最后一课再往右不动');

  for (const opts of [{ colorScheme: 'dark' }, { viewport: { width: 390, height: 844 } }]) {
    const other = await open(t, b.browser, 'all-cards', opts);
    for (const id of allCards.lessons.map((l) => l.id)) {
      await showLesson(other.page, id);
      assert.equal(await other.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `${JSON.stringify(opts)} 第 ${id} 课出现横向滚动`);
    }
  }
});

test('B9 练习卡：未作答时不显示参考答案，没掌握时显示缺口', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, 'all-cards');
  await showLesson(page, 'core');
  const items = page.locator('.card[data-type="practice"] li');
  assert.equal(await items.count(), 2);
  assert.doesNotMatch(await items.nth(0).innerText(), /参考答案/);
  assert.match(await items.nth(1).innerText(), /参考答案/);
  assert.match(await items.nth(1).innerText(), new RegExp(whyText));
});

test('B9b 练习卡：作答之前不显示评分标准，作答或跳过之后显示', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  await showLesson(page, 'core');
  const items = page.locator('.card[data-type="practice"] li');
  const rubricRe = new RegExp(escapeRe(rubricOfFirstItem));
  assert.doesNotMatch(await items.nth(0).innerText(), /评分标准/);
  assert.doesNotMatch(await items.nth(0).innerText(), rubricRe);
  assert.match(await items.nth(1).innerText(), /评分标准/);

  rewriteData(file, (d) => { corePractice(d).items[0].skipped = true; });
  await eventually(async () => /已跳过/.test(await items.nth(0).innerText()), { message: '跳过的题没有显示已跳过' });
  assert.match(await items.nth(0).innerText(), /评分标准/);
  assert.match(await items.nth(0).innerText(), rubricRe);
  assert.doesNotMatch(await items.nth(0).innerText(), /待作答|没掌握/);

  rewriteData(file, (d) => { const it = corePractice(d).items[0]; delete it.skipped; it.yours = '我的回答'; });
  await eventually(async () => /我的回答/.test(await items.nth(0).innerText()), { message: '作答后页面没有更新' });
  assert.match(await items.nth(0).innerText(), /评分标准/);
  assert.match(await items.nth(0).innerText(), rubricRe);
});

test('B10 notice 提示条', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  assert.equal(await page.locator('#notice').innerText(), allCards.notice);
  rewriteData(file, (d) => { d.notice = '示范案例，请换成你自己的经历'; });
  await eventually(async () => (await page.locator('#notice').innerText()) === '示范案例，请换成你自己的经历', { message: 'notice 没有更新' });
  assert.equal(await page.locator('#notice').innerText(), '示范案例，请换成你自己的经历');
  rewriteData(file, (d) => { delete d.notice; });
  await eventually(() => page.locator('#notice').isHidden(), { message: '删掉 notice 后提示条没有隐藏' });
});

test('B11 页头、待回顾、资料清单和延伸阅读', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const minimal = await open(t, b.browser, 'valid-minimal');
  assert.match(await minimal.page.locator('#mission').innerText(), /能讲清主线/);
  assert.match(await minimal.page.locator('#approach').innerText(), /以讲授为主/);
  assert.match(await minimal.page.locator('#resume-note').innerText(), /准备开始第 1 课/);

  const { page } = await open(t, b.browser, 'all-cards');
  await showLesson(page, 'intro');
  assert.equal(await page.locator('#review li').count(), 1);
  assert.deepEqual(await page.locator('#resources li').evaluateAll((els) => els.map((e) => e.dataset.resourceId)), ['book-a', 'doc-b']);
  assert.equal(await page.locator('#readings li').count(), 1);
  assert.match(await page.locator('#readings li').innerText(), new RegExp(bookTitle));
  assert.match(await page.locator('#progress').innerText(), /2\s*\/\s*3/);
});

// 把 wrap 课（打开时正在看的课）的 html 卡换成给定内容，等页面显示出来
async function showHtmlCard(page, file, html, marker) {
  rewriteData(file, (d) => {
    d.lessons.find((l) => l.id === 'wrap').cards.find((c) => c.type === 'html').html = html;
  });
  await eventually(async () => (await page.locator('.card[data-type="html"]').innerText()).includes(marker), { message: 'html 卡没有更新' });
}

test('B12 html 卡里的 id 和 name 一律删掉，覆盖不了 document 上的方法', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  await showHtmlCard(page, file, '<p>clobber</p><img name="getElementById" src="#"><a id="cards" href="#x">链接</a><form name="x"></form>', 'clobber');
  assert.equal(await page.evaluate(() => typeof document.getElementById), 'function');
  assert.equal(await page.locator('.card[data-type="html"] [id], .card[data-type="html"] [name]').count(), 0);
  rewriteData(file, (d) => { d.topic = '覆盖之后的新主题'; });
  await eventually(async () => (await page.locator('#topic').innerText()) === '覆盖之后的新主题', { message: '自动刷新失效' });
  await showLesson(page, 'core');
  assert.equal(await current(page), 'core');
});

test('B13 html 卡里的 style 和带 url( 的属性被删掉，不产生外部请求', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file, requests } = await open(t, b.browser, 'all-cards');
  await showHtmlCard(page, file,
    '<div style="background:\\75rl(http://example.invalid/b.png)">styled</div>' +
    '<svg width="20" height="20"><rect width="20" height="20" fill="url(http://example.invalid/c.svg)"/>' +
    '<rect width="20" height="20" mask="u\\72l(http://example.invalid/d.svg)"/></svg>', 'styled');
  await page.waitForTimeout(500);
  assert.ok(requests.every((u) => u.startsWith('file:')), requests.join('\n'));
  assert.equal(await page.locator('.card[data-type="html"] [style], .card[data-type="html"] [fill], .card[data-type="html"] [mask]').count(), 0);
  assert.equal(await page.locator('.card[data-type="html"] svg rect').count(), 2);
});

test('B14 渲染和报错路径都抛异常时，轮询也不会停', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  // 让页面里所有 $() 调用抛异常，撑过至少一次刷新，再恢复
  await page.evaluate(() => { document.getElementById = () => { throw new Error('模拟的失效'); }; });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { delete document.getElementById; });
  rewriteData(file, (d) => { d.topic = '恢复之后的新主题'; });
  await eventually(async () => (await page.locator('#topic').innerText()) === '恢复之后的新主题', { message: '轮询已经停止' });
});

test('B15 todo 的课不显示寄存的卡片，变成 current 后才出现', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  rewriteData(file, (d) => {
    d.lessons.push({ id: 'later', title: '以后的课', summary: '', status: 'todo', mastered: false, readings: [],
      cards: [{ type: 'points', items: ['寄存的要点'] }] });
  });
  await eventually(async () => (await page.locator('#lessons li').count()) === 4, { message: '新课没有出现' });
  await showLesson(page, 'later');
  assert.equal(await current(page), 'later');
  assert.equal(await page.locator('#cards .card').count(), 0);
  assert.equal(await page.locator('#cards .empty-lesson').innerText(), '这一课还没开讲，讲到这一课时显示卡片。');
  assert.doesNotMatch(await page.locator('#cards').innerText(), /寄存的要点/);
  rewriteData(file, (d) => {
    d.lessons.find((l) => l.id === 'wrap').status = 'done';
    d.lessons.find((l) => l.id === 'later').status = 'current';
  });
  await eventually(async () => (await page.locator('#cards .card').count()) === 1, { message: '变成 current 后卡片没有出现' });
  assert.match(await page.locator('#cards .card').innerText(), /寄存的要点/);
  assert.equal(await page.locator('#cards .empty-lesson').count(), 0);
});

test('B16 没有卡片的课按状态说明：current 正在讲，todo 还没开讲', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  rewriteData(file, (d) => { d.lessons.find((l) => l.id === 'wrap').cards = []; });
  await eventually(async () => (await page.locator('#cards .card').count()) === 0, { message: '卡片没有清空' });
  assert.equal(await current(page), 'wrap');
  assert.equal(await page.locator('#cards .empty-lesson').innerText(), '这一课正在讲，卡片在课末写入。');
  rewriteData(file, (d) => { d.lessons.find((l) => l.id === 'wrap').status = 'todo'; });
  await eventually(async () => (await page.locator('#cards .empty-lesson').innerText()) === '这一课还没开讲，讲到这一课时显示卡片。',
    { message: 'todo 的说明不对' });
});

test('B17 断点说明 resume.note 按纯文本显示', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file } = await open(t, b.browser, 'all-cards');
  rewriteData(file, (d) => { d.resume.note = '讲到 **利率** 和 `<b>粗</b>`'; });
  await eventually(async () => (await page.locator('#resume-note').innerText()).includes('**利率**'), { message: '断点说明没有更新' });
  assert.match(await page.locator('#resume-note').innerText(), /讲到 \*\*利率\*\* 和 `<b>粗<\/b>`/);
  assert.equal(await page.locator('#resume-note strong, #resume-note code, #resume-note b').count(), 0);
});

test('B3b html 卡的 href 和 src：data:image 只留在 img 的 src 上，其余只放行页内锚点', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, file, requests } = await open(t, b.browser, 'all-cards');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const svgData = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cscript%3Ealert(1)%3C/script%3E%3C/svg%3E';
  await showHtmlCard(page, file,
    '<p>links</p>' +
    `<a class="t-data" href="${svgData}">data 链接</a>` +
    '<a class="t-js" href="javascript:window.__pwned=1">js 链接</a>' +
    '<a class="t-js2" href=" java\tscript:window.__pwned=1">js 链接 2</a>' +
    '<a class="t-ext" href="https://example.invalid/x">外部链接</a>' +
    '<a class="t-anchor" href="#x">锚点</a>' +
    `<img class="t-png" src="${png}" alt="png">` +
    '<img class="t-ext-img" src="https://example.invalid/a.png" alt="ext">' +
    `<svg width="10" height="10"><use class="t-use" href="${svgData}#a"></use><use class="t-use-x" xlink:href="${svgData}#a"></use><use class="t-use-anchor" href="#a"></use></svg>`,
    'links');
  const attr = (sel, name) => page.locator(`.card[data-type="html"] ${sel}`).getAttribute(name);
  assert.equal(await attr('.t-data', 'href'), null);
  assert.equal(await attr('.t-js', 'href'), null);
  assert.equal(await attr('.t-js2', 'href'), null);
  assert.equal(await attr('.t-ext', 'href'), null);
  assert.equal(await attr('.t-anchor', 'href'), '#x');
  assert.equal(await attr('.t-png', 'src'), png);
  assert.equal(await attr('.t-ext-img', 'src'), null);
  assert.equal(await attr('.t-use', 'href'), null);
  assert.equal(await attr('.t-use-x', 'xlink:href'), null);
  assert.equal(await attr('.t-use-anchor', 'href'), '#a');
  await page.waitForTimeout(300);
  assert.ok(requests.every((u) => u.startsWith('file:')), requests.join('\n'));
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
});
