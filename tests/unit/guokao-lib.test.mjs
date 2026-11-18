import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SCRIPTS_DIR } from '../helpers/paths.mjs';

const lib = await import(path.join(SCRIPTS_DIR, 'lib/guokao.mjs'));
const { TABLE_MARK, placeTables, tableLessonIndex, imageHtml, inferMastered, typemapTable, examgridTable } = lib;

const typemap = {
  kind: 'typemap',
  title: '题型地图',
  nodes: [
    { id: 'a', label: '甲', lesson: 'l1' },
    { id: 'b', label: '乙', lesson: ['l1', 'l2'] },
  ],
};
const examgrid = { kind: 'examgrid', title: '真题覆盖', years: ['2024'], items: [{ year: '2024', no: 1, type: 'a', demo: true }] };
const mk = (growth, lessons) => ({
  topic: 't', slug: 's', template: 'guokao', templateData: { growth },
  lessons: lessons ?? [
    { id: 'kaoqing', title: '考情', cards: [{ type: 'points', items: ['x'] }] },
    { id: 'l1', title: '一', cards: [] },
    { id: 'l2', title: '二', cards: [] },
  ],
});

test('TABLE_MARK 是两张表格卡的标记', () => {
  assert.deepEqual(TABLE_MARK, { typemap: 'guokao-typemap', examgrid: 'guokao-examgrid' });
});

test('表格卡带 generated 标记', () => {
  const c = mk([typemap, examgrid]);
  const t = typemapTable(typemap, c.lessons);
  assert.equal(t.generated, 'guokao-typemap');
  assert.deepEqual(t.rows, [['甲', '', '一', ], ['乙', '', '一、二']]);
  assert.equal(examgridTable(examgrid, typemap).generated, 'guokao-examgrid');
});

test('tableLessonIndex：kaoqing 课，没有时第一课', () => {
  assert.equal(tableLessonIndex([{ id: 'a' }, { id: 'kaoqing' }]), 1);
  assert.equal(tableLessonIndex([{ id: 'a' }, { id: 'b' }]), 0);
});

test('placeTables：没有标记卡时追加到 tableLessonIndex 那一课末尾，不改传入的对象', () => {
  const c = mk([typemap, examgrid]);
  const snapshot = structuredClone(c);
  const r = placeTables(c);
  assert.deepEqual(c, snapshot);
  assert.notEqual(r, c);
  assert.deepEqual(r.lessons[0].cards.map((x) => x.generated), [undefined, 'guokao-typemap', 'guokao-examgrid']);
  assert.equal(r.lessons[1].cards.length, 0);
});

test('placeTables：已有带标记的卡就原地替换，位置和数量不变', () => {
  const c = mk([typemap, examgrid], [
    { id: 'kaoqing', title: '考情', cards: [] },
    { id: 'l1', title: '一', cards: [
      { type: 'table', generated: 'guokao-typemap', title: '旧', headers: ['x'], rows: [] },
      { type: 'points', items: ['p'] },
      { type: 'table', generated: 'guokao-examgrid', title: '旧', headers: ['x'], rows: [] },
    ] },
  ]);
  const r = placeTables(c);
  assert.equal(r.lessons[0].cards.length, 0);
  assert.deepEqual(r.lessons[1].cards.map((x) => [x.type, x.generated]), [
    ['table', 'guokao-typemap'], ['points', undefined], ['table', 'guokao-examgrid'],
  ]);
  assert.equal(r.lessons[1].cards[0].title, '题型地图');
  assert.equal(r.lessons[1].cards[0].headers[0], '题型');
  assert.equal(r.lessons[1].cards[2].title.startsWith('真题覆盖'), true);
  assert.deepEqual(placeTables(r), r);
});

test('placeTables：没有 examgrid 时删掉旧的 examgrid 卡', () => {
  const c = mk([typemap], [
    { id: 'kaoqing', title: '考情', cards: [
      { type: 'table', generated: 'guokao-typemap', title: '旧', headers: ['x'], rows: [] },
      { type: 'table', generated: 'guokao-examgrid', title: '旧', headers: ['x'], rows: [] },
      { type: 'table', title: '手写的表', headers: ['x'], rows: [] },
    ] },
  ]);
  const r = placeTables(c);
  assert.deepEqual(r.lessons[0].cards.map((x) => x.generated ?? x.title), ['guokao-typemap', '手写的表']);
});

test('imageHtml：内嵌图片，说明转义后放在图下', () => {
  const buf = Buffer.from('abc');
  const html = imageHtml('img/a.PNG', '梯形 **A**\n<O>', buf);
  assert.equal(html, `<figure><img src="data:image/png;base64,${buf.toString('base64')}" alt="梯形 A &lt;O&gt;" style="max-width:100%">`
    + '<figcaption>梯形 <strong>A</strong><br>&lt;O&gt;</figcaption></figure>');
  assert.equal(imageHtml('a.jpg', '', buf), `<figure><img src="data:image/jpeg;base64,${buf.toString('base64')}" alt="" style="max-width:100%"></figure>`);
  assert.throws(() => imageHtml('a.bmp', '', buf), /格式/);
});

test('inferMastered', () => {
  const practice = (...items) => ({ type: 'practice', items });
  assert.equal(inferMastered({ id: 'x', status: 'current', cards: [practice({ q: 'a', ok: true })] }), false);
  assert.equal(inferMastered({ id: 'kaoqing', status: 'done', cards: [] }), true);
  assert.equal(inferMastered({ id: 'kaoqing', status: 'todo', cards: [] }), false);
  assert.equal(inferMastered({ id: 'x', status: 'done', cards: [practice({ q: 'a', ok: false }, { q: 'b' })] }), false);
  assert.equal(inferMastered({ id: 'x', status: 'done', cards: [practice({ q: 'a', ok: false }), { type: 'points' }, practice({ q: 'b', ok: true }, { q: 'c' })] }), true);
  assert.equal(inferMastered({ id: 'x', status: 'done', cards: [] }), false);
  assert.equal(inferMastered({ id: 'x', status: 'done' }), false);
});

test('SERIES_ORDER、SERIES_NAME', () => {
  assert.equal(lib.SERIES_NAME, '国考');
  assert.equal(lib.SERIES_ORDER.length, 9);
  assert.equal(lib.SERIES_ORDER[3], 'xingce-shuliang');
});
