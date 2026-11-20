// 总览页的浏览器测试。整个文件共用一个浏览器，每个测试自己开页面、自己的课程总目录。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { eventually, fileUrl, launchBrowser, makeCourseDir, makeHomeDir, openPage, rewriteData, writeIndexData } from '../helpers/browser.mjs';
import { loadCore, loadFixture } from '../helpers/load-core.mjs';

const C = loadCore();

let launched;
const launchOnce = () => (launched ??= launchBrowser());
after(async () => {
  const b = launched && (await launched);
  if (b && b.browser) await b.browser.close();
});

// 搭好总目录并打开总览页；测试结束时关掉这一页。页面渲染完（卡片、失败列表或空提示出现）才返回。
async function open(t, browser, courses, opts = {}) {
  const { pageOpts, ...homeOpts } = opts;
  const made = makeHomeDir(courses, homeOpts);
  const opened = await openPage(browser, fileUrl(made.htmlFile), pageOpts);
  t.after(() => opened.context.close());
  await opened.page.locator('.course-card, .load-failures li, #empty-hint:visible').first().waitFor({ timeout: 8000 });
  return { ...opened, ...made };
}

const slugs = (page) => page.locator('.course-card').evaluateAll((els) => els.map((e) => e.dataset.slug));
// 失败原因的计数
const failures = (page, reason) => page.locator(`.load-failures li[data-reason="${reason}"]`).count();
// 控制台里「资源加载失败」是浏览器对缺文件的固有提示，不是页面代码的错
const pageErrors = (list) => list.filter((m) => !/Failed to load resource/.test(m));

test('I1 按更新时间倒序，跨时区比较', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, [
    { slug: 'a', mutate: (d) => { d.updatedAt = '2026-11-17T08:00:00+08:00'; } },
    { slug: 'b', mutate: (d) => { d.updatedAt = '2026-11-17T01:00:00+00:00'; } }, // 九点钟（东八区），更晚
    { slug: 'c', mutate: (d) => { delete d.updatedAt; } }, // 没有更新时间的排在最后
  ]);
  assert.deepEqual(await slugs(page), ['b', 'a', 'c']);
});

test('I2 每门课的统计与 progressOf 一致', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const fx = loadFixture('all-cards');
  const { page } = await open(t, b.browser, [
    { slug: 'all-cards', fixture: 'all-cards' },
    {
      slug: 'with-skip',
      mutate: (d) => {
        d.template = 'interview';
        d.lessons[0].status = 'done';
        d.lessons[0].mastered = true;
        d.lessons[1].status = 'skipped';
        d.lessons[1].mastered = true; // 跳过的课不计入已掌握
        d.review = [{ lesson: null, text: 'x' }, { lesson: null, text: 'y' }];
        d.resume = { lesson: 'first', note: '下一步讲 <b>第二课</b>' };
      },
    },
  ]);
  const p = C.progressOf(fx);
  const card = page.locator('.course-card[data-slug="all-cards"]');
  assert.equal(await card.locator('.done-count').innerText(), `${p.done}/${p.total}`);
  assert.match(await card.locator('.mastered-count').innerText(), new RegExp(String(p.mastered)));
  assert.match(await card.locator('.review-count').innerText(), new RegExp(String(p.review)));
  assert.equal(await card.locator('.template-tag').count(), 0);
  assert.match(await card.getAttribute('href'), /all-cards\/course\.html$/);
  assert.match(await card.innerText(), new RegExp(fx.topic));
  assert.match(await card.locator('.resume-note').innerText(), new RegExp(fx.resume.note.slice(0, 6)));

  const q = page.locator('.course-card[data-slug="with-skip"]');
  assert.equal(await q.locator('.done-count').innerText(), '1/1');
  assert.equal(await q.locator('.mastered-count').innerText(), '1');
  assert.equal(await q.locator('.review-count').innerText(), '2');
  assert.equal(await q.locator('.template-tag').innerText(), 'interview');
  // 断点说明是文本，不是 HTML
  assert.equal(await q.locator('.resume-note b').count(), 0);
  assert.match(await q.locator('.resume-note').innerText(), /<b>第二课<\/b>/);
});

test('I2b 按系列分区：系列按最近更新排，区内按 order，不属于系列的课放最后', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const at = (h) => `2026-11-17T${String(h).padStart(2, '0')}:00:00+08:00`;
  const { page } = await open(t, b.browser, [
    { slug: 'loose-new', mutate: (d) => { d.updatedAt = at(12); } },
    { slug: 'inv-2', mutate: (d) => { d.updatedAt = at(11); d.series = { name: '投资研究', order: 2 }; } },
    { slug: 'inv-1', mutate: (d) => { d.updatedAt = at(5); d.series = { name: '投资研究', order: 1 }; d.lessons[0].status = 'done'; } },
    { slug: 'inv-x', mutate: (d) => { d.updatedAt = at(10); d.series = { name: '投资研究' }; } },
    { slug: 'sd-1', mutate: (d) => { d.updatedAt = at(9); d.series = { name: '系统设计 <面试>', order: 1 }; } },
  ]);
  const sections = await page.locator('#courses > section.series').evaluateAll((els) => els.map((e) => ({
    name: e.dataset.series,
    title: e.querySelector('.series-title').textContent,
    slugs: [...e.querySelectorAll('.course-card')].map((c) => c.dataset.slug),
  })));
  assert.deepEqual(sections, [
    { name: '投资研究', title: '投资研究', slugs: ['inv-1', 'inv-2', 'inv-x'] },
    { name: '系统设计 <面试>', title: '系统设计 <面试>', slugs: ['sd-1'] },
    { name: '', title: '其他课程', slugs: ['loose-new'] },
  ]);
  const inv = page.locator('section.series[data-series="投资研究"]');
  assert.equal(await inv.locator('.series-count').innerText(), '3 门');
  const total = C.progressOf(loadFixture('valid-minimal')).total;
  assert.equal(await inv.locator('.series-done').innerText(), `1/${total * 3}`);
  assert.deepEqual(await inv.locator('.order-tag').allInnerTexts(), ['第 1 门', '第 2 门']);
  assert.equal(await page.locator('section.series-loose .order-tag').count(), 0);
  assert.match(await page.locator('#summary').innerText(), /共 5 门课，2 个系列/);
});

test('I2d 系列说明默认折叠，取区内第一门写了说明的课，重新渲染后保留展开状态', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const at = (h) => `2026-11-17T${String(h).padStart(2, '0')}:00:00+08:00`;
  const { page, home } = await open(t, b.browser, [
    { slug: 'inv-3', mutate: (d) => { d.updatedAt = at(12); d.series = { name: '投资研究', order: 3, description: '排在后面的说明' }; } },
    { slug: 'inv-2', mutate: (d) => { d.updatedAt = at(11); d.series = { name: '投资研究', order: 2, description: '建议顺序：① → ②\n先学 <b>第 1 门</b>' }; } },
    { slug: 'inv-1', mutate: (d) => { d.updatedAt = at(10); d.series = { name: '投资研究', order: 1 }; } },
    { slug: 'sd-1', mutate: (d) => { d.updatedAt = at(9); d.series = { name: '系统设计', order: 1, description: '  ' }; } },
    { slug: 'loose', mutate: (d) => { d.updatedAt = at(8); } },
  ]);
  const inv = page.locator('section.series[data-series="投资研究"]');
  const desc = inv.locator('details.series-desc');
  assert.equal(await desc.count(), 1);
  assert.equal(await desc.evaluate((e) => e.open), false, '默认折叠');
  assert.equal(await desc.locator('summary').innerText(), '系列说明');
  // 取 order 最小的那门写了说明的课；按纯文本显示，不当 HTML
  assert.equal(await desc.locator('p').evaluate((e) => e.textContent), '建议顺序：① → ②\n先学 <b>第 1 门</b>');
  assert.equal(await desc.locator('b').count(), 0);
  // 说明为空白的系列、不属于系列的课都没有这一栏
  assert.equal(await page.locator('details.series-desc').count(), 1);

  await desc.locator('summary').click();
  assert.equal(await desc.evaluate((e) => e.open), true);
  rewriteData(path.join(home, 'inv-1', 'course-data.js'), (d) => { d.lessons[0].status = 'done'; });
  await eventually(async () => /^1\//.test(await inv.locator('.series-done').innerText()), { message: '进度没有更新' });
  assert.equal(await desc.evaluate((e) => e.open), true, '重新渲染后仍然展开');
});

test('I2c 都不属于系列时不加分区标题', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, [{ slug: 'a' }, { slug: 'b' }]);
  assert.equal(await page.locator('.series-head').count(), 0);
  assert.equal(await page.locator('.course-card h2.course-topic').count(), 2);
  assert.doesNotMatch(await page.locator('#summary').innerText(), /系列/);
});

test('I3 登记了但目录不存在的课，单独列出', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await open(t, b.browser, [
    { slug: 'ok-one' },
    { slug: 'gone', create: false },
  ]);
  assert.equal(await failures(page, 'missing'), 1);
  assert.equal(await page.locator('.course-card').count(), 1);
  assert.match(await page.locator('.load-failures li[data-reason="missing"]').innerText(), /gone/);
  assert.deepEqual(pageErrors(consoleErrors), []);
});

test('I4 数据文件有语法错误的课，单独列出，不影响别的课', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await open(t, b.browser, [
    { slug: 'ok-one' },
    { slug: 'broken', raw: 'window.LEARN_COURSE = {"version": 1,,};\n' },
  ]);
  assert.equal(await failures(page, 'syntax'), 1);
  assert.deepEqual(await slugs(page), ['ok-one']);
  assert.match(await page.locator('.load-failures li[data-reason="syntax"]').innerText(), /broken/);
  assert.deepEqual(consoleErrors, []);
});

test('I4b 什么都没赋值、赋的不是课程对象，也算 syntax，且不串用上一门课的数据', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page } = await open(t, b.browser, [
    { slug: 'ok-one' },
    { slug: 'nothing', raw: 'var unrelated = 1;\n' },
    { slug: 'not-an-object', raw: 'window.LEARN_COURSE = "hello";\n' },
    { slug: 'no-lessons', raw: 'window.LEARN_COURSE = {"version":1,"topic":"缺 lessons"};\n' },
    { slug: 'null-value', raw: 'window.LEARN_COURSE = null;\n' },
  ]);
  assert.equal(await failures(page, 'syntax'), 4);
  assert.deepEqual(await slugs(page), ['ok-one']);
  // 失败的课用 dir 或 slug 命名
  for (const name of ['nothing', 'not-an-object', 'no-lessons', 'null-value']) {
    assert.equal(await page.locator('.load-failures li[data-reason="syntax"]', { hasText: name }).count(), 1, name);
  }
});

test('I5 拒绝不安全的目录，不发出外部请求，也不尝试加载', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const unsafe = ['../x', 'http://example.com/x', '/abs', 'a\\b', 'a/../b'];
  const { page, requests, consoleErrors } = await open(t, b.browser, [{ slug: 'ok-one' }], {
    entries: unsafe.map((dir, i) => ({ slug: `bad-${i}`, dir })),
  });
  assert.equal(await failures(page, 'unsafe'), unsafe.length);
  assert.deepEqual(await slugs(page), ['ok-one']);
  assert.ok(requests.every((u) => u.startsWith('file:')), requests.join('\n'));
  // 课程数据只请求过唯一一门安全的课
  const courseRequests = requests.filter((u) => /course-data\.js/.test(u)).map((u) => decodeURIComponent(u.split('?')[0]));
  assert.ok(courseRequests.length >= 1 && courseRequests.every((u) => u.endsWith('/ok-one/course-data.js')), courseRequests.join('\n'));
  assert.deepEqual(consoleErrors, []);
});

test('I5b 没有 dir 的登记项算 unsafe，不让页面崩溃', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await open(t, b.browser, [{ slug: 'ok-one' }], {
    entries: [{ slug: 'no-dir' }, 'oops', null, { slug: 'num', dir: 5 }],
  });
  assert.equal(await failures(page, 'unsafe'), 4);
  assert.deepEqual(await slugs(page), ['ok-one']);
  assert.deepEqual(consoleErrors, []);
});

test('I6 没有 index-data.js 时给出提示，不报错', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await open(t, b.browser, [], { index: false });
  assert.equal(await page.locator('#empty-hint').isVisible(), true);
  assert.equal(await page.locator('.course-card').count(), 0);
  assert.equal(await page.locator('.load-failures li').count(), 0);
  assert.deepEqual(pageErrors(consoleErrors), []);
});

test('I6b 登记表里没有课程时也给出提示', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, consoleErrors } = await open(t, b.browser, []);
  assert.equal(await page.locator('#empty-hint').isVisible(), true);
  assert.deepEqual(consoleErrors, []);
});

test('I7 五秒左右发现新登记的课', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, indexFile, home } = await open(t, b.browser, [{ slug: 'first' }]);
  assert.equal(await page.locator('.course-card').count(), 1);
  makeCourseDir('valid-minimal', { root: home, slug: 'second' });
  writeIndexData(indexFile, [{ slug: 'first', dir: 'first' }, { slug: 'second', dir: 'second' }]);
  await eventually(async () => (await page.locator('.course-card').count()) === 2, { message: '没有发现新登记的课' });
  assert.equal(await page.locator('#empty-hint').isVisible(), false);
});

test('I8 课程进度变了，总览页跟着变；坏掉的课修好后回到卡片', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, home } = await open(t, b.browser, [
    { slug: 'prog' },
    { slug: 'flaky', raw: 'window.LEARN_COURSE = {' },
  ]);
  const card = page.locator('.course-card[data-slug="prog"]');
  assert.equal(await card.locator('.done-count').innerText(), '0/2');
  rewriteData(path.join(home, 'prog', 'course-data.js'), (d) => { d.lessons[0].status = 'done'; });
  await eventually(async () => (await card.locator('.done-count').innerText()) === '1/2', { message: '进度没有更新' });
  assert.equal(await failures(page, 'syntax'), 1);
  const fixed = loadFixture('valid-minimal');
  fixed.slug = 'flaky';
  writeFileSync(path.join(home, 'flaky', 'course-data.js'), `window.LEARN_COURSE = ${JSON.stringify(fixed)};\n`);
  await eventually(async () => (await failures(page, 'syntax')) === 0 && (await page.locator('.course-card').count()) === 2, { message: '修好的课没有回到卡片' });
});

test('I9 index-data.js 坏了：保留已显示的课并提示，修好后恢复', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, indexFile, home } = await open(t, b.browser, [{ slug: 'first' }]);
  writeFileSync(indexFile, 'window.LEARN_INDEX = {"version":1,"courses":[');
  await eventually(async () => await page.locator('#index-error').isVisible(), { message: '没有提示 index-data.js 出错' });
  assert.equal(await page.locator('.course-card').count(), 1);
  assert.equal(await page.locator('#empty-hint').isVisible(), false);
  writeIndexData(indexFile, [{ slug: 'first', dir: 'first' }]);
  await eventually(async () => await page.locator('#index-error').isHidden(), { message: '修好后提示没有消失' });
  assert.equal(await page.locator('.course-card').count(), 1);
  assert.ok(home);
});

test('I10 课程数据里的文字一律当文本，不当 HTML', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const evil = '<img src=x onerror="window.__pwned=1">';
  const { page } = await open(t, b.browser, [
    { slug: 'evil', mutate: (d) => { d.topic = evil; d.template = evil; d.resume = { lesson: 'first', note: evil }; } },
  ]);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator('.course-card img').count(), 0);
  assert.match(await page.locator('.course-card').innerText(), /<img src=x/);
});

test('I11 离线：只请求 file: 地址；窄屏不出横向滚动条；深色模式可用', async (t) => {
  const b = await launchOnce();
  if (b.skip) return t.skip(b.skip);
  const { page, requests, consoleErrors } = await open(
    t,
    b.browser,
    [{ slug: 'a', fixture: 'all-cards' }, { slug: 'b', mutate: (d) => { d.topic = '一个很长很长很长很长很长很长很长很长很长很长很长很长很长的主题名字'; } }, { slug: 'gone', create: false }],
    { pageOpts: { colorScheme: 'dark', viewport: { width: 360, height: 800 } } },
  );
  await page.waitForTimeout(5600); // 至少经过一次自动刷新
  assert.ok(requests.every((u) => u.startsWith('file:')), requests.join('\n'));
  assert.deepEqual(pageErrors(consoleErrors), []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(bg, 'rgb(246, 245, 241)');
});
