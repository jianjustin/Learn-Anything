// tests/unit/core-growth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadFixture, plain } from '../helpers/load-core.mjs';

const C = loadCore();
const lessons = ['l1', 'l2', 'l3'].map((id) => ({ id }));
const panel = {
  kind: 'diagram', title: 't',
  nodes: [
    { id: 'a', label: 'A', col: 1, row: 1, since: 'l1' },
    { id: 'box', label: '黑盒', col: 2, row: 1, style: 'ghost', since: 'l1', until: 'l2' },
    { id: 'b', label: 'B', col: 2, row: 1, since: 'l2' },
    { id: 'c', label: 'C', col: 3, row: 2, span: 2, since: 'l3' },
  ],
  edges: [{ from: 'a', to: 'b', label: '调用', since: 'l2' }, { from: 'b', to: 'c', style: 'dashed', since: 'l3' }],
  groups: [{ id: 'g', label: '组', members: ['a', 'b'], since: 'l2' }],
  annotations: [{ node: 'b', text: '关键参数', since: 'l3' }],
  routes: [{ lesson: 'l2', steps: ['a', 'b', 'a'] }, { lesson: 'l3', steps: ['a', 'b', 'c'] }],
};
const at = (id, p = panel) => plain(C.diagramAt(p, lessons, id));
const node = (s, id) => s.nodes.find((n) => n.id === id);

test('节点按课出现和消失，位置不变', () => {
  assert.deepEqual(at('l1').nodes.map((n) => n.id), ['a', 'box']);
  assert.deepEqual(at('l2').nodes.map((n) => n.id), ['a', 'b']);
  assert.deepEqual(at('l3').nodes.map((n) => n.id), ['a', 'b', 'c']);
  assert.deepEqual([node(at('l1'), 'a').x, node(at('l1'), 'a').y], [node(at('l3'), 'a').x, node(at('l3'), 'a').y]);
});

test('本课新增的元素带 isNew', () => {
  const s = at('l2');
  assert.deepEqual(s.nodes.filter((n) => n.isNew).map((n) => n.id), ['b']);
  assert.equal(s.edges.length, 1);
  assert.equal(s.edges[0].isNew, true);
  assert.equal(at('l3').edges[0].isNew, false);
});

test('网格换算和 span', () => {
  const s = at('l3');
  assert.deepEqual(plain(C.GRID), { colW: 160, rowH: 130, nodeW: 112, nodeH: 40 });
  assert.equal(node(s, 'c').x - node(s, 'a').x, 2 * C.GRID.colW);
  assert.equal(node(s, 'c').y - node(s, 'a').y, C.GRID.rowH);
  assert.equal(node(s, 'a').w, C.GRID.nodeW);
  assert.equal(node(s, 'c').w, C.GRID.nodeW + C.GRID.colW);
});

test('路线：最新的一条生效，重复经过的节点有多个编号', () => {
  assert.equal(at('l1').route, null);
  assert.deepEqual(at('l2').route.steps, [{ node: 'a', numbers: [1, 3] }, { node: 'b', numbers: [2] }]);
  assert.deepEqual(at('l3').route.steps.map((s) => s.node), ['a', 'b', 'c']);
});

test('分组边界包住可见成员', () => {
  const s = at('l2');
  const g = s.groups[0];
  for (const id of ['a', 'b']) {
    const n = node(s, id);
    assert.ok(g.x <= n.x && g.y <= n.y && g.x + g.w >= n.x + n.w && g.y + g.h >= n.y + n.h);
  }
});

test('同格节点和过多标注给出警告，并进入 validateCourse', () => {
  const p = structuredClone(panel);
  p.nodes.push({ id: 'd', label: 'D', col: 1, row: 1, since: 'l1' });
  for (const t of ['一', '二', '三']) p.annotations.push({ node: 'b', text: t, since: 'l3' });
  assert.match(at('l1', p).warnings.join('\n'), /a.*d|d.*a/);
  assert.match(at('l3', p).warnings.join('\n'), /b/);
  const d = loadFixture('valid-minimal');
  d.growth = [{ kind: 'diagram', title: 't', edges: [], groups: [], annotations: [], routes: [],
    nodes: [{ id: 'a', label: 'A', col: 1, row: 1, since: 'first' }, { id: 'd', label: 'D', col: 1, row: 1, since: 'first' }] }];
  const r = plain(C.validateCourse(d, { dirName: 'valid-minimal' }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});

test('diffLines 标出新增和改动的行', () => {
  assert.deepEqual(plain(C.diffLines('a\nb\nc', 'a\nB\nc\nd')), [false, true, false, true]);
});

test('代码面板：默认显示最后一个可见版本，可指定版本', () => {
  const cp = { kind: 'code', title: 't', versions: [
    { id: 'v1', since: 'l1', label: 'v1', language: 'go', code: 'a\nb' },
    { id: 'v2', since: 'l2', label: 'v2', code: 'a\nb\nc' },
  ] };
  const s1 = plain(C.codeStateAt(cp, lessons, 'l1'));
  assert.deepEqual(s1.versions.map((v) => v.id), ['v1']);
  assert.deepEqual(s1.current.lines.map((l) => l.changed), [false, false]);
  const s3 = plain(C.codeStateAt(cp, lessons, 'l3'));
  assert.equal(s3.current.id, 'v2');
  assert.deepEqual(s3.current.lines, [{ text: 'a', changed: false }, { text: 'b', changed: false }, { text: 'c', changed: true }]);
  assert.equal(C.codeStateAt(cp, lessons, 'l3', 'v1').current.id, 'v1');
});

test('时间线：单位换算、比例和好坏', () => {
  const tp = { kind: 'timeline', title: 't', metricLabel: 'P99', events: [
    { since: 'l1', title: '告警', metric: { value: 3.2, unit: 's' } },
    { since: 'l2', title: '无指标' },
    { since: 'l3', title: '修复', metric: { value: 400, unit: 'ms' } },
  ] };
  const e = plain(C.timelineAt(tp, lessons, 'l3').events);
  assert.deepEqual(e.map((x) => x.ratio), [1, null, 0.125]);
  assert.deepEqual(e.map((x) => x.better), [false, false, true]);
  assert.equal(C.timelineAt(tp, lessons, 'l1').events.length, 1);
  const hi = { kind: 'timeline', title: 't', better: 'higher', events: [
    { since: 'l1', title: '前', metric: { value: 100, unit: 'qps' } },
    { since: 'l2', title: '后', metric: { value: 400, unit: 'qps' } },
  ] };
  assert.deepEqual(plain(C.timelineAt(hi, lessons, 'l2').events.map((x) => x.better)), [false, true]);
});

test('addedAt 列出本课新增元素的名字', () => {
  const cp = { kind: 'code', title: 't', versions: [{ id: 'v2', since: 'l2', label: 'v2', code: 'x' }] };
  const list = plain(C.addedAt({ lessons, growth: [panel, cp] }, 'l2'));
  for (const name of ['B', '调用', '组', 'v2']) assert.ok(list.includes(name), name);
  assert.ok(!list.includes('A'));
});

test('lessons 损坏时 validateCourse 不抛异常，只报错、不算版面警告', () => {
  const emptyDiagram = { kind: 'diagram', title: 't', nodes: [], edges: [], groups: [], annotations: [], routes: [] };
  const broken = {
    'lessons 是字符串': (d) => { d.lessons = 'oops'; },
    'lessons 缺失': (d) => { delete d.lessons; },
    'lessons 含 null 项': (d) => { d.lessons.push(null); },
  };
  for (const [name, mutate] of Object.entries(broken)) {
    const d = loadFixture('valid-minimal');
    d.growth = [emptyDiagram];
    mutate(d);
    let r;
    assert.doesNotThrow(() => { r = plain(C.validateCourse(d, { dirName: 'valid-minimal' })); }, name);
    assert.ok(r.errors.length > 0, name);
  }
});

test('同行或同列隔着别的节点时，连线绕开中间的节点', () => {
  const p = {
    kind: 'diagram', title: 't',
    nodes: [
      { id: 'a', label: 'A', col: 1, row: 2, since: 'l1' },
      { id: 'm', label: 'M', col: 2, row: 2, since: 'l1' },
      { id: 'b', label: 'B', col: 3, row: 2, since: 'l1' },
      { id: 'v', label: 'V', col: 1, row: 3, since: 'l1' },
      { id: 'w', label: 'W', col: 1, row: 4, since: 'l1' },
    ],
    edges: [{ from: 'a', to: 'b', since: 'l1' }, { from: 'a', to: 'w', since: 'l1' }, { from: 'a', to: 'm', since: 'l1' }],
  };
  const s = at('l1', p);
  const crosses = (pts, r) => pts.slice(1).some((q, i) => {
    const o = pts[i];
    const x1 = Math.min(o.x, q.x), x2 = Math.max(o.x, q.x), y1 = Math.min(o.y, q.y), y2 = Math.max(o.y, q.y);
    return x1 < r.x + r.w && x2 > r.x && y1 < r.y + r.h && y2 > r.y;
  });
  const [ab, aw, am] = s.edges;
  assert.equal(crosses(ab.points, node(s, 'm')), false, 'a→b 不应穿过 m');
  assert.equal(crosses(aw.points, node(s, 'v')), false, 'a→w 不应穿过 v');
  assert.equal(am.points.length, 2, '相邻的两个节点仍走直线');
  for (const e of s.edges) for (const pt of e.points) assert.ok(pt.x >= 0 && pt.y >= 0 && pt.x <= s.width && pt.y <= s.height);
});
