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

const segHitsBox = (o, q, r) => {
  const x1 = Math.min(o.x, q.x), x2 = Math.max(o.x, q.x), y1 = Math.min(o.y, q.y), y2 = Math.max(o.y, q.y);
  return x1 < r.x + r.w && x2 > r.x && y1 < r.y + r.h && y2 > r.y;
};
// 标注是节点上方的小标签，diagramAt 直接给出它的外框
const annotBox = (a) => {
  assert.ok(a.w > 0 && a.h > 0, `标注 ${a.text} 没有外框`);
  return { x: a.x, y: a.y, w: a.w, h: a.h };
};

test('单行跳连：每一课的连线点都在画布内，画布高度逐课不变', () => {
  const p = {
    kind: 'diagram', title: 't',
    nodes: [
      { id: 'a', label: 'A', col: 1, row: 1, since: 'l1' },
      { id: 'b', label: 'B', col: 2, row: 1, since: 'l1' },
      { id: 'c', label: 'C', col: 3, row: 1, since: 'l2' },
    ],
    edges: [
      { from: 'a', to: 'b', since: 'l1' }, { from: 'b', to: 'c', since: 'l2' },
      { from: 'a', to: 'c', label: '跳过', since: 'l3' },
    ],
  };
  const heights = new Set();
  for (const id of ['l1', 'l2', 'l3']) {
    const s = at(id, p);
    heights.add(s.height);
    for (const e of s.edges) {
      // 连线标签的位置由页面计算（见页面测试 G12），核心只负责连线的点
      for (const pt of e.points) assert.ok(pt.x >= 0 && pt.y >= 0 && pt.x <= s.width && pt.y <= s.height, `${id} ${e.from}→${e.to} ${JSON.stringify(pt)} 超出 ${s.width}×${s.height}`);
    }
  }
  assert.equal(heights.size, 1, `画布高度逐课变化：${[...heights]}`);
  const ac = at('l3', p).edges.find((e) => e.to === 'c' && e.from === 'a');
  assert.equal(segHitsBox(ac.points[0], ac.points[ac.points.length - 1], node(at('l3', p), 'b')) && ac.points.length === 2, false);
});

test('绕行线不穿过同一课可见的标注文字', () => {
  const p = {
    kind: 'diagram', title: 't',
    nodes: [
      { id: 'a', label: 'A', col: 1, row: 1, since: 'l1' },
      { id: 'm', label: 'M', col: 2, row: 1, since: 'l1' },
      { id: 'b', label: 'B', col: 3, row: 1, since: 'l1' },
      { id: 'n', label: 'N', col: 2, row: 2, since: 'l1' },
    ],
    edges: [{ from: 'a', to: 'b', label: '绕行', since: 'l1' }],
    annotations: [
      { node: 'm', text: '第一条标注文字', since: 'l1' },
      { node: 'm', text: '第二条标注文字', since: 'l1' },
      { node: 'm', text: '第三条标注文字比较长', since: 'l1' },
      { node: 'a', text: '起点自己的说明', since: 'l2' },
    ],
  };
  for (const id of ['l1', 'l2']) {
    const s = at(id, p);
    assert.equal(s.annotations.filter((a) => a.node === 'm').length, 3);
    const e = s.edges[0];
    assert.ok(e.points.length > 2, `${id} 应绕行`);
    const boxes = s.annotations.map(annotBox);
    e.points.slice(1).forEach((q, i) => {
      const o = e.points[i];
      for (const r of boxes) assert.equal(segHitsBox(o, q, r), false, `${id} 段 ${JSON.stringify([o, q])} 穿过标注 ${JSON.stringify(r)}`);
    });
    for (const nd of s.nodes.filter((x) => x.id !== 'a' && x.id !== 'b')) {
      e.points.slice(1).forEach((q, i) => assert.equal(segHitsBox(e.points[i], q, nd), false, `${id} 穿过节点 ${nd.id}`));
    }
    for (const pt of e.points) assert.ok(pt.y <= s.height && pt.y >= 0);
  }
});

// ---- 密集图：结构上和真实的迁移课程一样密（6 列 4 行、16 个节点、约 30 条连线和 30 条标注） ----
const dense = loadFixture('dense-diagram');
const densePanel = dense.growth.find((g) => g.kind === 'diagram');
const denseAt = (id) => plain(C.diagramAt(densePanel, dense.lessons, id));
const denseLessons = dense.lessons.map((l) => l.id);

// 线段是否穿过矩形内部（只碰到边不算），斜线也算得准
const segCrossesRect = (p, q, r, pad = 0) => {
  const x1 = r.x - pad, x2 = r.x + r.w + pad, y1 = r.y - pad, y2 = r.y + r.h + pad;
  const dx = q.x - p.x, dy = q.y - p.y;
  let t0 = 0, t1 = 1;
  for (const [pp, qq] of [[-dx, p.x - x1], [dx, x2 - p.x], [-dy, p.y - y1], [dy, y2 - p.y]]) {
    if (pp === 0) { if (qq <= 0) return false; continue; }
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; t0 = Math.max(t0, t); } else { if (t < t0) return false; t1 = Math.min(t1, t); }
  }
  return t0 < t1;
};
const pathCrosses = (pts, r, pad) => pts.slice(1).some((q, i) => segCrossesRect(pts[i], q, r, pad));
const rectsMeet = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onBorder = (pt, r) => {
  const inX = pt.x >= r.x - 1 && pt.x <= r.x + r.w + 1, inY = pt.y >= r.y - 1 && pt.y <= r.y + r.h + 1;
  const nearX = Math.abs(pt.x - r.x) <= 1 || Math.abs(pt.x - r.x - r.w) <= 1;
  const nearY = Math.abs(pt.y - r.y) <= 1 || Math.abs(pt.y - r.y - r.h) <= 1;
  return inX && inY && (nearX || nearY);
};

test('密集图：样例本身是密的，且校验 0 错误 0 警告', () => {
  const r = plain(C.validateCourse(dense, { dirName: 'dense-diagram' }));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(densePanel.nodes.length, 16);
  assert.ok(densePanel.edges.length >= 28 && densePanel.annotations.length >= 28);
});

test('密集图：标签分行，最多两行', () => {
  for (const id of denseLessons) {
    for (const n of denseAt(id).nodes) {
      assert.ok(Array.isArray(n.lines) && n.lines.length >= 1 && n.lines.length <= 2, `${id} ${n.id} lines`);
      if (n.label.includes('\n')) assert.deepEqual(n.lines, n.label.split('\n'), `${id} ${n.id}`);
      else assert.deepEqual(n.lines, [n.label], `${id} ${n.id}`);
    }
  }
});

test('密集图：标注是节点上方的小标签，互不重叠，不盖住节点', () => {
  for (const id of denseLessons) {
    const s = denseAt(id);
    const nodeOf = Object.fromEntries(s.nodes.map((n) => [n.id, n]));
    assert.ok(s.annotations.length > 0);
    for (const a of s.annotations) {
      assert.ok(a.w > 0 && a.h > 0, `${id} ${a.text} 没有外框`);
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= s.width && a.y + a.h <= s.height, `${id} ${a.text} 超出画布`);
      assert.ok(a.y + a.h <= nodeOf[a.node].y, `${id} ${a.text} 不在节点上方`);
      for (const n of s.nodes) assert.equal(rectsMeet(a, n), false, `${id} ${a.text} 盖住节点 ${n.id}`);
    }
    for (const n of s.nodes) {
      const mine = s.annotations.filter((a) => a.node === n.id);
      assert.ok(mine.length <= 3, `${id} ${n.id} 画了 ${mine.length} 条标注`);
      mine.forEach((a, i) => mine.slice(i + 1).forEach((b) => assert.equal(rectsMeet(a, b), false, `${id} ${a.text} 和 ${b.text} 重叠`)));
    }
  }
  assert.equal(denseAt('dispatch').annotations.filter((a) => a.node === 'brain').length, 3, '第一行的节点也能放 3 条');
});

test('密集图：不绕行的连线是两点直线，端点落在两端节点的边缘上', () => {
  let diagonal = 0;
  for (const id of denseLessons) {
    const s = denseAt(id);
    const nodeOf = Object.fromEntries(s.nodes.map((n) => [n.id, n]));
    for (const e of s.edges) {
      const a = nodeOf[e.from], b = nodeOf[e.to];
      const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const others = s.nodes.filter((n) => n !== a && n !== b);
      const straightClear = !others.some((n) => segCrossesRect(center(a), center(b), n, 4));
      if (straightClear) assert.equal(e.points.length, 2, `${id} ${e.from}→${e.to} 直线不穿过别的节点，却画成 ${e.points.length} 个点`);
      if (e.points.length === 2) {
        assert.ok(onBorder(e.points[0], a), `${id} ${e.from}→${e.to} 起点 ${JSON.stringify(e.points[0])} 不在 ${e.from} 边上`);
        assert.ok(onBorder(e.points[1], b), `${id} ${e.from}→${e.to} 终点 ${JSON.stringify(e.points[1])} 不在 ${e.to} 边上`);
        if (e.points[0].x !== e.points[1].x && e.points[0].y !== e.points[1].y) diagonal++;
      }
    }
  }
  assert.ok(diagonal > 0, '应有斜线');
});

test('密集图：任何连线都不穿过端点以外的节点', () => {
  for (const id of denseLessons) {
    const s = denseAt(id);
    for (const e of s.edges) {
      for (const n of s.nodes.filter((x) => x.id !== e.from && x.id !== e.to)) {
        assert.equal(pathCrosses(e.points, n), false, `${id} ${e.from}→${e.to} 穿过节点 ${n.id}：${JSON.stringify(e.points)}`);
      }
    }
  }
});

test('密集图：全部内容在画布内，画布大小逐课不变', () => {
  const sizes = new Set();
  const positions = new Map();
  for (const id of denseLessons) {
    const s = denseAt(id);
    sizes.add(`${s.width}×${s.height}`);
    const inside = (x, y) => x >= 0 && y >= 0 && x <= s.width && y <= s.height;
    for (const r of [...s.nodes, ...s.annotations, ...s.groups]) {
      assert.ok(inside(r.x, r.y) && inside(r.x + r.w, r.y + r.h), `${id} ${JSON.stringify(r)} 超出 ${s.width}×${s.height}`);
    }
    for (const e of s.edges) for (const pt of e.points) assert.ok(inside(pt.x, pt.y), `${id} ${e.from}→${e.to} ${JSON.stringify(pt)}`);
    for (const n of s.nodes) {
      const key = `${n.x},${n.y}`;
      if (positions.has(n.id)) assert.equal(positions.get(n.id), key, `${n.id} 换了位置`);
      positions.set(n.id, key);
    }
  }
  assert.equal(sizes.size, 1, `画布大小逐课变化：${[...sizes]}`);
});

test('小数位置落在两格之间', () => {
  const lessons = [{ id: 'l1' }];
  const p = { kind: 'diagram', title: 't', edges: [], groups: [], annotations: [], routes: [], nodes: [
    { id: 'a', label: 'A', col: 1, row: 2, since: 'l1' },
    { id: 'b', label: 'B', col: 1, row: 3, since: 'l1' },
    { id: 'm', label: 'M', col: 2.5, row: 2.5, since: 'l1' },
  ] };
  const s = plain(C.diagramAt(p, lessons, 'l1'));
  const n = (id) => s.nodes.find((x) => x.id === id);
  assert.equal(n('m').y - n('a').y, 0.5 * C.GRID.rowH);
  assert.equal(n('b').y - n('m').y, 0.5 * C.GRID.rowH);
  assert.equal(n('m').x - n('a').x, 1.5 * C.GRID.colW);
  assert.deepEqual(s.warnings, []);
  // 全部节点都在画布内
  for (const x of s.nodes) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= s.width && x.y + x.h <= s.height);
});

test('矩形相交才算重叠：错开半格的两个节点会重叠，错开一格不会', () => {
  const lessons = [{ id: 'l1' }];
  const mk = (col) => ({ kind: 'diagram', title: 't', edges: [], groups: [], annotations: [], routes: [], nodes: [
    { id: 'a', label: 'A', col: 1, row: 1, since: 'l1' },
    { id: 'b', label: 'B', col, row: 1, since: 'l1' },
  ] });
  assert.equal(plain(C.diagramAt(mk(1.5), lessons, 'l1')).warnings.length, 1); // 半格 80px < 节点宽 112px
  assert.deepEqual(plain(C.diagramAt(mk(2), lessons, 'l1')).warnings, []);
});

// ---- 小数位置下的整体行为 ----
const frac = (nodes, edges = [], annotations = []) => ({ kind: 'diagram', title: 't', groups: [], routes: [], nodes, edges, annotations });
const fracAt = (p) => plain(C.diagramAt(p, [{ id: 'l1' }], 'l1'));
const fn = (id, col, row, extra = {}) => ({ id, label: id.toUpperCase(), col, row, since: 'l1', ...extra });
const crossesAny = (pts, s, skip) => s.nodes.filter((n) => !skip.includes(n.id)).some((n) => pathCrosses(pts, n, 0));

test('重叠警告的措辞：整数位置占同一格，措辞不变；有小数位置只说框相交，列出两个节点的 id', () => {
  assert.deepEqual(fracAt(frac([fn('a', 1, 1), fn('d', 1, 1)])).warnings, ['图「t」：节点 a、d 占同一格（第 1 列、第 1 行）']);
  // 整数位置的跨列节点：照旧按占到的那一格报
  assert.deepEqual(fracAt(frac([fn('a', 1, 1, { span: 2 }), fn('d', 2, 1)])).warnings, ['图「t」：节点 a、d 占同一格（第 2 列、第 1 行）']);
  assert.deepEqual(fracAt(frac([fn('a', 1, 1), fn('b', 1.5, 1.25)])).warnings, ['图「t」：节点 a、b 的框相交']);
  // 一个整数、一个小数，也是框相交
  assert.deepEqual(fracAt(frac([fn('a', 2, 2), fn('x', 2, 2.25)])).warnings, ['图「t」：节点 a、x 的框相交']);
});

test('只贴边不算重叠', () => {
  // 上下错开的距离正好等于节点高 40px：rowH 130，错开 40/130 行
  const dy = 1 + C.GRID.nodeH / C.GRID.rowH;
  assert.deepEqual(fracAt(frac([fn('a', 1, 1), fn('b', 1, dy)])).warnings, []);
});

test('第一行附近的小数位置：标注仍在画布内，不被顶部截掉', () => {
  const notes = ['一', '二', '三'].map((t) => ({ node: 'a', text: t, since: 'l1' }));
  for (const row of [1, 1.2, 1.5, 1.9, 2]) {
    const s = fracAt(frac([fn('a', 1, row), fn('b', 2, 3)], [], notes));
    for (const c of s.annotations) assert.ok(c.y >= 0, `row ${row}`);
    for (const x of s.nodes) assert.ok(x.y >= 0 && x.y + x.h <= s.height, `row ${row}`);
  }
  // 整数的第 1 行与第 2 行之后的结果不变：第 2 行放得下标注，不再下移
  const top = (row) => fracAt(frac([fn('a', 1, row)], [], notes)).nodes[0].y - (row - 1) * C.GRID.rowH;
  assert.equal(top(1), 32 + 64 + 8);
  assert.equal(top(2), 32);
  // 小数行：放得下就不多移，放不下才移到刚好放得下
  assert.ok(top(1.5) > top(2) && top(1.5) < top(1));
  const s15 = fracAt(frac([fn('a', 1, 1.5)], [], notes));
  assert.equal(Math.min(...s15.annotations.map((c) => c.y)), 32 + 8);
});

test('同一行带一点小数偏移的两个节点之间的绕行：不穿过任何节点，端点在两个节点的边上，画布放得下', () => {
  // a 在 b 的左边隔两列，中间 m 挡着；b 比 a 低 0.3 行（矩形上下仍有重叠）
  // 第 1 行上方没有空隙，只能往下绕；第 2 行先试上方
  for (const [dy, r] of [[0, 1], [0.1, 1], [0.3, 1], [0.3, 2], [-0.3, 1], [-0.3, 2]]) {
    const p = frac([fn('a', 1, r), fn('m', 2, r + dy / 2), fn('b', 3, r + dy)], [{ from: 'a', to: 'b', since: 'l1' }]);
    const s = fracAt(p);
    const pts = s.edges[0].points;
    assert.ok(pts.length > 2, `dy ${dy} 应该绕行`);
    assert.ok(!crossesAny(pts, s, ['a', 'b']), `dy ${dy}`);
    // 线只在出发和到达的那一段碰自己的两端节点，中间不再穿回去
    pts.slice(1).forEach((q, i) => {
      if (i > 0) assert.ok(!segCrossesRect(pts[i], q, node(s, 'a'), 0), `dy ${dy} 第 ${i} 段穿过起点节点`);
      if (i < pts.length - 2) assert.ok(!segCrossesRect(pts[i], q, node(s, 'b'), 0), `dy ${dy} 第 ${i} 段穿过终点节点`);
    });
    assert.ok(onBorder(pts[0], node(s, 'a')) && onBorder(pts.at(-1), node(s, 'b')), `dy ${dy}`);
    for (const q of pts) assert.ok(q.x >= 0 && q.y >= 0 && q.x <= s.width && q.y <= s.height, `dy ${dy}`);
  }
});

test('半行错开的上下两个节点之间的连线是斜线或折线，不穿过中间的节点', () => {
  const p = frac([fn('a', 1, 1), fn('m', 1.5, 2), fn('b', 2, 3)], [{ from: 'a', to: 'b', since: 'l1' }]);
  const s = fracAt(p);
  assert.ok(!crossesAny(s.edges[0].points, s, ['a', 'b']));
});

// ---- 小数位置下的连线不出画布 ----
const allInside = (s, msg) => {
  for (const e of s.edges) for (const q of e.points) {
    assert.ok(q.x >= 0 && q.x <= s.width && q.y >= 0 && q.y <= s.height, `${msg}：折点 (${q.x}, ${q.y}) 在画布 ${s.width}×${s.height} 外`);
  }
};

test('小数位置：没有警告的合法版面里，绕行线不画到画布外（空隙不到一列的同行节点之间有挡路的节点）', () => {
  for (const [name, nodes] of [
    ['a(1,2) b(1.85,1.7) m(1.15,1.65)', [fn('a', 1, 2), fn('b', 1.85, 1.7), fn('m', 1.15, 1.65)]],
    ['a(1,2) b(1.85,2.3) m(1.7,1.95)', [fn('a', 1, 2), fn('b', 1.85, 2.3), fn('m', 1.7, 1.95)]],
  ]) {
    const s = fracAt(frac(nodes, [{ from: 'a', to: 'b', since: 'l1' }]));
    assert.deepEqual(s.warnings, [], name);
    allInside(s, name);
  }
});

test('向下绕的线下面要放得下连线标签：放不下的候选线被丢掉', () => {
  // 第 1 行两个节点之间隔着一列，m 挡着；画布按 mayDetour 给足下方绕行的高度，标签也放得下
  const s = fracAt(frac([fn('a', 1, 1), fn('m', 2, 1), fn('b', 3, 1)], [{ from: 'a', to: 'b', label: '标签', since: 'l1' }]));
  const low = Math.max(...s.nodes.map((n) => n.y + n.h));
  for (const e of s.edges) {
    const pts = e.points;
    pts.slice(1).forEach((q, i) => { if (q.y === pts[i].y && q.y > low) assert.ok(q.y + 20 <= s.height); });
  }
  allInside(s, '整数');
  // 同样的版面，m 错开半行：画布高度和折点仍然满足同一条
  const t = fracAt(frac([fn('a', 1, 1), fn('m', 2, 1.4), fn('b', 3, 1)], [{ from: 'a', to: 'b', label: '标签', since: 'l1' }]));
  allInside(t, '小数');
  const lowT = Math.max(...t.nodes.map((n) => n.y + n.h));
  t.edges[0].points.slice(1).forEach((q, i, a) => { if (q.y === t.edges[0].points[i].y && q.y > lowT) assert.ok(q.y + 20 <= t.height); });
});

test('小数位置：互相重叠的节点（有警告）之间的连线也不出画布', () => {
  for (const nodes of [
    [fn('a', 1, 2), fn('b', 1.4, 2.2), fn('m', 1.2, 1.9)],
    [fn('a', 1, 1), fn('b', 1.3, 1.1), fn('m', 1.15, 1.05)],
    [fn('a', 1.5, 3), fn('b', 2.2, 3.3), fn('m', 1.9, 3.1)],
  ]) {
    const s = fracAt(frac(nodes, [{ from: 'a', to: 'b', since: 'l1' }, { from: 'b', to: 'a', since: 'l1' }]));
    assert.ok(s.warnings.length > 0);
    allInside(s, JSON.stringify(nodes.map((n) => [n.col, n.row])));
  }
});

test('小数位置：随机版面里所有连线的折点都在画布内', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pos = () => 1 + Math.round(rnd() * 8) / 4; // 1 到 3，步长 0.25
  for (let t = 0; t < 300; t++) {
    const nodes = Array.from({ length: 2 + Math.floor(rnd() * 5) }, (_, i) => fn('n' + i, pos(), pos()));
    const edges = nodes.map((n) => ({ from: n.id, to: nodes[Math.floor(rnd() * nodes.length)].id, since: 'l1' }));
    allInside(fracAt(frac(nodes, edges)), `第 ${t} 组 ${JSON.stringify(nodes.map((n) => [n.col, n.row]))}`);
  }
});
