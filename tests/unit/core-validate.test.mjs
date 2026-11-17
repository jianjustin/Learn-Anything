import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadFixture, plain } from '../helpers/load-core.mjs';

const C = loadCore();
const bad = (mutate, dirName = 'valid-minimal') => {
  const d = loadFixture('valid-minimal');
  mutate(d);
  return plain(C.validateCourse(d, { dirName }));
};
const diagram = (nodes, edges = []) => [{ kind: 'diagram', title: 't', nodes, edges, groups: [], annotations: [], routes: [] }];

test('两个合法样例没有错误也没有警告', () => {
  for (const name of ['valid-minimal', 'all-cards']) {
    assert.deepEqual(plain(C.validateCourse(loadFixture(name), { dirName: name })), { errors: [], warnings: [] });
  }
});

for (const [name, mutate, re] of [
  ['缺 topic', (d) => { delete d.topic; }, /topic/],
  ['mission 缺字段', (d) => { delete d.mission.target; }, /mission\.target/],
  ['researched 取值非法', (d) => { d.researched = 'maybe'; }, /researched/],
  ['status 取值非法', (d) => { d.lessons[0].status = 'doing'; }, /status/],
  ['mastered 不是布尔', (d) => { d.lessons[0].mastered = 'yes'; }, /mastered/],
  ['lessons 为空', (d) => { d.lessons = []; }, /lessons/],
  ['课程 id 重复', (d) => { d.lessons[1].id = 'first'; }, /first/],
  ['两个 current', (d) => { d.lessons[1].status = 'current'; }, /current/],
  ['resume 引用不存在的课', (d) => { d.resume.lesson = 'nope'; }, /resume\.lesson/],
  ['review 引用不存在的课', (d) => { d.review = [{ lesson: 'nope', text: 'x' }]; }, /review/],
  ['readings 引用不存在的资料', (d) => { d.lessons[0].readings = [{ resource: 'nope', where: '第 1 章' }]; }, /readings/],
  ['refs 引用不存在的资料', (d) => { d.lessons[0].cards = [{ type: 'points', items: ['x'], refs: ['nope'] }]; }, /refs/],
  ['资料 kind 非法', (d) => { d.resources = [{ id: 'r', kind: 'blog', title: 't', note: 'n' }]; }, /kind/],
  ['卡片缺必需字段', (d) => { d.lessons[0].cards = [{ type: 'points' }]; }, /points/],
  ['practice 条目缺 q', (d) => { d.lessons[0].cards = [{ type: 'practice', items: [{ yours: 'x' }] }]; }, /practice/],
  ['practice 条目的 skipped 不是布尔', (d) => { d.lessons[0].cards = [{ type: 'practice', items: [{ q: 'x', skipped: 'yes' }] }]; }, /skipped/],
  ['面板 kind 非法', (d) => { d.growth = [{ kind: 'architecture', title: 't' }]; }, /kind/],
  ['since 引用不存在的课', (d) => { d.growth = diagram([{ id: 'a', label: 'A', col: 1, row: 1, since: 'nope' }]); }, /since/],
  ['until 不在 since 之后', (d) => { d.growth = diagram([{ id: 'a', label: 'A', col: 1, row: 1, since: 'second', until: 'first' }]); }, /until/],
  ['连线引用不存在的节点', (d) => { d.growth = diagram([{ id: 'a', label: 'A', col: 1, row: 1, since: 'first' }], [{ from: 'a', to: 'zz', since: 'first' }]); }, /zz/],
]) {
  test(`报错：${name}`, () => assert.match(bad(mutate).errors.join('\n'), re));
}

test('警告：slug 与目录名不一致', () => {
  const r = bad(() => {}, 'other-dir');
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join('\n'), /slug/);
});

test('警告：未知卡片类型', () => {
  const r = bad((d) => { d.lessons[0].cards = [{ type: 'mystery', foo: 1 }]; });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join('\n'), /mystery/);
});

test('practice 条目可以标 skipped: true', () => {
  assert.deepEqual(bad((d) => { d.lessons[0].cards = [{ type: 'practice', items: [{ q: 'x', rubric: 'r', skipped: true }] }]; }).errors, []);
});

test('待回顾条目的 lesson 可以是 null', () => {
  assert.deepEqual(bad((d) => { d.review = [{ lesson: null, text: 'x' }]; }).errors, []);
});

test('progressOf 分开统计已讲和已掌握', () => {
  const d = loadFixture('valid-minimal');
  const L = (id, status, mastered) => ({ id, title: id, summary: id, status, mastered, readings: [], cards: [] });
  d.lessons = [L('a', 'done', true), L('b', 'done', false), L('c', 'current', false), L('d', 'skipped', false), L('e', 'todo', false)];
  d.review = [{ lesson: 'b', text: 'x' }, { lesson: null, text: 'y' }];
  assert.deepEqual(plain(C.progressOf(d)), { total: 4, done: 2, mastered: 1, skipped: 1, review: 2 });
});

test('sourceTag 的规则', () => {
  const course = { researched: 'yes', resources: [{ id: 'r1', title: '《宏观经济学》' }] };
  assert.deepEqual(plain(C.sourceTag(course, { type: 'points', refs: ['r1'] })), { kind: 'refs', titles: ['《宏观经济学》'] });
  assert.deepEqual(plain(C.sourceTag(course, { type: 'points' })), { kind: 'unverified' });
  for (const type of ['questions', 'practice', 'note']) assert.equal(C.sourceTag(course, { type }), null);
  assert.equal(C.sourceTag({ ...course, researched: 'skipped' }, { type: 'points', refs: ['r1'] }), null);
  assert.equal(C.sourceTag({ ...course, researched: 'no' }, { type: 'points' }), null);
});

test('inline 只支持粗体、行内代码和换行', () => {
  assert.equal(C.inline('a **b** `c<d>`\ne'), 'a <strong>b</strong> <code>c&lt;d&gt;</code><br>e');
  assert.equal(C.inline('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
});

test('卡片类型和默认标题', () => {
  assert.deepEqual(plain(C.CARD_TYPES), ['points', 'steps', 'quote', 'problem', 'qa', 'questions', 'practice', 'table', 'compare', 'chips', 'code', 'note', 'html']);
  assert.equal(C.DEFAULT_CARD_TITLE.quote, '一句话总结');
  assert.equal(C.DEFAULT_CARD_TITLE.problem, '思考题');
  assert.equal(C.DEFAULT_CARD_TITLE.practice, '你的练习');
});

test('网格位置可以是不小于 1 的小数', () => {
  const r = bad((d) => { d.growth = diagram([
    { id: 'a', label: 'A', col: 1, row: 1, since: 'first' },
    { id: 'b', label: 'B', col: 2.5, row: 1.5, since: 'first' },
  ]); });
  assert.deepEqual(r.errors, []);
});

for (const [name, patch] of [
  ['col 小于 1', { col: 0.5 }],
  ['row 为 0', { row: 0 }],
  ['col 为负数', { col: -1 }],
  ['row 不是有限数字', { row: Infinity }],
  ['col 是字符串', { col: '2' }],
  ['span 是小数', { span: 1.5 }],
]) {
  test(`报错：${name}`, () => {
    const r = bad((d) => { d.growth = diagram([{ id: 'a', label: 'A', col: 1, row: 1, since: 'first', ...patch }]); });
    assert.ok(r.errors.length > 0);
  });
}
