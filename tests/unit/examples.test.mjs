import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ASSETS_DIR, ROOT, SCRIPTS_DIR, example } from '../helpers/paths.mjs';
import { loadCore, plain } from '../helpers/load-core.mjs';

const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const C = loadCore();
const slugs = ['macro-intro', 'realtime-billing'];
const data = Object.fromEntries(slugs.map((s) => [s, readDataFile(example(s), 'LEARN_COURSE')]));

test('示例都合法，没有警告', () => {
  for (const s of slugs) assert.deepEqual(plain(C.validateCourse(data[s], { dirName: s })), { errors: [], warnings: [] });
});

test('通用示例：经过调研、挂了资料、有检验记录、不套模板', () => {
  const d = data['macro-intro'];
  assert.deepEqual([d.template, d.researched], [null, 'yes']);
  assert.ok(d.resources.some((r) => r.kind === 'book'));
  assert.ok(d.lessons.some((l) => l.readings.length > 0));
  assert.ok(d.lessons.some((l) => l.cards.some((c) => c.type === 'practice')));
  assert.ok(d.lessons.some((l) => l.status === 'done' && l.mastered) && d.lessons.some((l) => l.status === 'done' && !l.mastered));
});

test('通用示例：声明是虚构的示例，资料都是虚构的，不引用真实书目', () => {
  const d = data['macro-intro'];
  assert.match(d.notice, /示例/);
  assert.match(d.notice, /虚构/);
  for (const r of d.resources) {
    assert.ok(/示例/.test(r.title), `资料标题要带「示例」：${r.title}`);
    if (r.url) assert.match(r.url, /^https:\/\/example\.com\//);
  }
});

test('通用示例：一道答对、一道没答对（有缺口说明和对应的待回顾），有带 refs 和不带 refs 的卡片', () => {
  const d = data['macro-intro'];
  const items = d.lessons.flatMap((l) => l.cards.filter((c) => c.type === 'practice').flatMap((c) => c.items.map((i) => ({ lesson: l.id, ...i }))));
  assert.ok(items.some((i) => i.yours && i.ok === true));
  const failed = items.filter((i) => i.yours && i.ok === false);
  assert.ok(failed.length > 0);
  for (const f of failed) {
    assert.ok(f.why, '没答对的要写缺口');
    assert.ok(d.review.some((r) => r.lesson === f.lesson), `待回顾里要有指向 ${f.lesson} 的条目`);
    assert.equal(d.lessons.find((l) => l.id === f.lesson).mastered, false);
  }
  const cards = d.lessons.flatMap((l) => l.cards);
  assert.ok(cards.some((c) => Array.isArray(c.refs) && c.refs.length > 0));
  assert.ok(cards.some((c) => !c.refs && !['questions', 'practice', 'note'].includes(c.type)));
});

test('面试示例：套用面试模板，有 diagram 面板', () => {
  const d = data['realtime-billing'];
  assert.deepEqual([d.template, d.templateData.type], ['interview', 'system-design']);
  assert.ok(d.growth.some((p) => p.kind === 'diagram'));
});

test('示例里的页面与模板逐字节一致，登记齐全', () => {
  // 用 equal 比较 Buffer 的 equals 结果：不一致时只打印提示，不把整页 HTML 当 diff 打出来
  const hint = (rel) => `examples/${rel} 与页面模板不一致：运行 bash tests/run-all.sh --sync 同步示例里的页面副本`;
  for (const s of slugs) {
    const same = readFileSync(path.join(ROOT, 'examples', s, 'course.html')).equals(readFileSync(path.join(ASSETS_DIR, 'course.html')));
    assert.ok(same, hint(`${s}/course.html`));
  }
  assert.ok(readFileSync(path.join(ROOT, 'examples/index.html')).equals(readFileSync(path.join(ASSETS_DIR, 'index.html'))), hint('index.html'));
  assert.deepEqual(readDataFile(path.join(ROOT, 'examples/index-data.js'), 'LEARN_INDEX').courses.map((c) => c.slug).sort(), slugs);
});

test('README 中英文都在，写了安装命令', () => {
  for (const f of ['README.md', 'README.zh-CN.md']) assert.match(readFileSync(path.join(ROOT, f), 'utf8'), /bash install\.sh/);
});

test('README 中英文：改了仓库后用 --reinstall，页面模板用 refresh-pages.mjs 刷新，不再说 install 测试只用 --dry-run', () => {
  const zh = readFileSync(path.join(ROOT, 'README.zh-CN.md'), 'utf8');
  const en = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  for (const t of [zh, en]) {
    assert.match(t, /bash install\.sh --reinstall/);
    assert.match(t, /scripts\/refresh-pages\.mjs <[^>]+>/);
    assert.match(t, /bash tests\/run-all\.sh --sync/);
  }
  assert.doesNotMatch(zh, /下次会话生效/);
  assert.doesNotMatch(zh, /全部使用 `--dry-run`/);
  assert.doesNotMatch(en, /take effect in the next session/);
  assert.doesNotMatch(en, /use `--dry-run` only/);
  assert.match(zh, /某条命令失败时[^。]*退出码 1/);
  assert.match(en, /exits with code 1 when[^.]*a command fails/);
});

test('面试示例是源示例的原样迁移：保留了小数位置', () => {
  const nodes = data['realtime-billing'].growth.find((p) => p.kind === 'diagram').nodes;
  assert.ok(nodes.some((n) => !Number.isInteger(n.row) || !Number.isInteger(n.col)));
});
