import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, SCRIPTS_DIR } from '../helpers/paths.mjs';
import { loadCore, plain } from '../helpers/load-core.mjs';

const script = path.join(SCRIPTS_DIR, 'migrate-interview.mjs');
const { loadOldCourse, convertCourse, countsOf, migrateCourse } = await import(script);
const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const oldDir = path.join(ROOT, 'tests/fixtures/old-interview');
const oldFile = path.join(oldDir, 'course-data.js');
const C = loadCore();
const old = loadOldCourse(oldFile);
const out = convertCourse(old);
const cards = out.lessons[0].cards;

test('旧格式的各种写法都能读', () => {
  assert.equal(old.growth[1].versions[0].code, 'line1\nline2');
});

test('转换结果是合法的新格式', () => {
  assert.deepEqual(plain(C.validateCourse(out, { dirName: 'old-interview' }).errors), []);
});

test('顶层字段', () => {
  assert.equal(out.template, 'interview');
  assert.deepEqual(out.templateData, { type: 'experience' });
  assert.equal(out.notice, '示范案例，请换成你自己的经历');
  assert.ok(!('demoCase' in out) && !('type' in out));
  assert.deepEqual(out.mission, { why: '', target: '', background: '' });
  assert.deepEqual([out.approach, out.researched, out.resources], ['', 'skipped', []]);
});

test('顶层字段的顺序与设计 5.3 的表格一致', () => {
  assert.deepEqual(Object.keys(out), [
    'version', 'topic', 'slug', 'template', 'templateData', 'mission', 'approach', 'researched', 'resources',
    'notice', 'updatedAt', 'resume', 'review', 'growth', 'lessons',
  ]);
});

test('待回顾转成带课程 id 的条目', () => {
  assert.deepEqual(out.review, [{ lesson: null, text: '原文一' }, { lesson: null, text: '原文二' }]);
});

test('updatedAt、resume、课程的 id/title/summary/status 和其余卡片字段原样保留', () => {
  assert.equal(out.updatedAt, old.updatedAt);
  assert.deepEqual(out.resume, old.resume);
  assert.equal(out.resume.lesson, 'fix');
  assert.deepEqual(out.lessons.map((l) => [l.id, l.title, l.summary, l.status]), old.lessons.map((l) => [l.id, l.title, l.summary, l.status]));
  assert.deepEqual(cards[0], { type: 'problem', title: '面试题', question: old.lessons[0].cards[0].question, approach: '先定位再优化', answer: '看慢查询日志' });
  assert.deepEqual(cards[4], old.lessons[0].cards[4]);
});

test('面板和节点改名', () => {
  assert.deepEqual(out.growth.map((p) => p.kind), ['diagram', 'code', 'timeline']);
  assert.deepEqual(out.growth[0].nodes.map((n) => n.style), ['box', 'pill', 'outline', 'ghost']);
  assert.ok(out.growth[0].nodes.every((n) => !('kind' in n)));
  assert.deepEqual(out.growth[0].nodes[3], { id: 'box', label: '待拆开', col: 2, row: 2, style: 'ghost', since: 'bg', until: 'fix' });
});

test('卡片改名并补上标题，已有的标题保留', () => {
  assert.deepEqual(cards.map((c) => [c.type, c.title]), [
    ['problem', '面试题'], ['problem', '设计题'], ['quote', '面试怎么讲'], ['quote', '开场白'], ['points', undefined],
  ]);
});

test('每课补上 mastered 和 readings，没有卡片的课得到空数组', () => {
  for (const l of out.lessons) assert.deepEqual([l.mastered, l.readings], [false, []]);
  assert.deepEqual(out.lessons[1].cards, []);
});

test('数量不变，源对象不被修改', () => {
  const snapshot = JSON.stringify(old);
  const again = convertCourse(old);
  assert.equal(JSON.stringify(old), snapshot);
  assert.deepEqual(again, out);
  assert.deepEqual(countsOf(out), countsOf(old));
  assert.equal(old.growth[0].kind, 'architecture');
});

test('countsOf 数对每一项', () => {
  assert.deepEqual(countsOf(old), { lessons: 2, cards: 5, nodes: 4, edges: 1, groups: 1, annotations: 1, routes: 1, versions: 1, events: 2 });
});

test('规则没提到的字段原样保留：未知顶层字段、卡片类型、卡片/课程/面板元素字段', () => {
  const o = structuredClone(old);
  o.extra = { a: [1, 2] };
  o.lessons[0].note2 = '课程上的未知字段';
  o.lessons[0].cards.push({ type: 'mystery', foo: [1], title: '' });
  o.lessons[0].cards[4].refs2 = ['x'];
  o.lessons[0].cards[0].optional = true;
  o.growth[0].nodes[0].weird = 1;
  o.growth[0].edges[0].style = 'dashed';
  o.growth[2].better = 'higher';
  o.growth[2].events[0].metric.unit = 'ms';
  const r = convertCourse(o);
  assert.deepEqual(r.extra, { a: [1, 2] });
  assert.equal(r.lessons[0].note2, '课程上的未知字段');
  assert.deepEqual(r.lessons[0].cards[5], { type: 'mystery', foo: [1], title: '' });
  assert.deepEqual(r.lessons[0].cards[4].refs2, ['x']);
  assert.equal(r.lessons[0].cards[0].optional, true);
  assert.equal(r.growth[0].nodes[0].weird, 1);
  assert.equal(r.growth[0].edges[0].style, 'dashed');
  assert.equal(r.growth[2].better, 'higher');
  assert.equal(r.growth[2].events[0].metric.unit, 'ms');
  assert.deepEqual(countsOf(r), countsOf(o));
});

test('没有 demoCase、没有 type、没有 review 的旧课程也能转', () => {
  const o = structuredClone(old);
  delete o.demoCase; delete o.type; delete o.review; delete o.resume; delete o.updatedAt;
  const r = convertCourse(o);
  assert.ok(!('notice' in r) && !('templateData' in r) && !('resume' in r) && !('updatedAt' in r));
  assert.deepEqual(r.review, []);
  assert.deepEqual(plain(C.validateCourse(r, { dirName: 'old-interview' }).errors), []);
});

test('demoCase: false 不产生提示条', () => {
  const o = structuredClone(old);
  o.demoCase = false;
  const r = convertCourse(o);
  assert.ok(!('notice' in r) && !('demoCase' in r));
});

test('无法对应的东西拒绝转换，不悄悄丢内容', () => {
  const mutated = (f) => { const o = structuredClone(old); f(o); return o; };
  assert.throws(() => convertCourse(mutated((o) => { o.growth[0].nodes[0].kind = 'database'; })), /kind/);
  assert.throws(() => convertCourse(mutated((o) => { o.review = [{ q: 1 }]; })), /review\[0\]/);
  assert.throws(() => convertCourse(mutated((o) => { o.notice = '已有'; })), /notice/);
  assert.throws(() => convertCourse(mutated((o) => { o.lessons[0].mastered = true; })), /mastered/);
});

const hashOf = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'la-'));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('命令行：写入新目录并登记，不改动源目录', () => {
  const before = hashOf(oldFile);
  const dirBefore = readdirSync(oldDir);
  const home = tmp();
  const r = run(oldDir, home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /lessons=2 cards=5 nodes=4 edges=1 groups=1 annotations=1 routes=1 versions=1 events=2/);
  assert.deepEqual(readDataFile(path.join(home, 'old-interview/course-data.js'), 'LEARN_COURSE'), JSON.parse(JSON.stringify(out)));
  assert.deepEqual(readDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX').courses, [{ slug: 'old-interview', dir: 'old-interview' }]);
  assert.ok(existsSync(path.join(home, 'old-interview/course.html')));
  assert.equal(hashOf(oldFile), before);
  assert.deepEqual(readdirSync(oldDir), dirBefore);
  assert.equal(run(oldDir, home).status, 1);
});

test('命令行：缺参数退出 2', () => {
  assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 2);
});

// 造一个旧课程目录，course-data.js 用 mutate 改过
function oldCopy(mutate) {
  const dir = tmp();
  const o = structuredClone(old);
  mutate(o);
  writeFileSync(path.join(dir, 'course-data.js'), `window.INTERVIEW_COURSE = ${JSON.stringify(o)};\n`);
  return dir;
}

test('命令行：校验有错误时退出 1，打印错误，课程目录里什么都不留', () => {
  const src = oldCopy((o) => { o.lessons[0].status = 'doing'; });
  const home = path.join(tmp(), 'courses');
  const r = run(src, home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✗.*status/);
  assert.ok(!existsSync(home));
});

test('命令行：旧课程转不了、读不了时退出 1，什么都不留', () => {
  const home = path.join(tmp(), 'courses');
  assert.equal(run(oldCopy((o) => { o.growth[0].nodes[0].kind = 'database'; }), home).status, 1);
  assert.equal(run(tmp(), home).status, 1);
  const bad = tmp();
  writeFileSync(path.join(bad, 'course-data.js'), 'window.INTERVIEW_COURSE = {');
  assert.equal(run(bad, home).status, 1);
  assert.ok(!existsSync(home));
});

test('命令行：旧文件里的死循环会被限时中断', () => {
  const bad = tmp();
  writeFileSync(path.join(bad, 'course-data.js'), 'while (true) {}');
  const home = path.join(tmp(), 'courses');
  const r = run(bad, home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /timed out/i);
  assert.ok(!existsSync(home));
});

test('旧文件拿不到 window 以外的全局', () => {
  const file = path.join(tmp(), 'course-data.js');
  writeFileSync(file, 'window.INTERVIEW_COURSE = { x: typeof require + typeof process };');
  assert.equal(loadOldCourse(file).x, 'undefinedundefined');
});

test('命令行：目标已存在时退出 1，不动已有的课程和登记表', () => {
  const home = tmp();
  mkdirSync(path.join(home, 'old-interview'));
  writeFileSync(path.join(home, 'old-interview/mine.txt'), 'x');
  const r = run(oldDir, home);
  assert.equal(r.status, 1);
  assert.deepEqual(readdirSync(home), ['old-interview']);
  assert.deepEqual(readdirSync(path.join(home, 'old-interview')), ['mine.txt']);
});

test('写入失败时清掉这次创建的东西，index-data.js 和 index.html 恢复原样', () => {
  const fail = { write() { throw new Error('磁盘满了'); } };
  // 总目录已有登记表（别的课程）和 index.html
  const home = tmp();
  const indexText = 'window.LEARN_INDEX = {"version":1,"courses":[{"slug":"other","dir":"other"}]};\n';
  writeFileSync(path.join(home, 'index-data.js'), indexText);
  writeFileSync(path.join(home, 'index.html'), 'mine');
  assert.throws(() => migrateCourse(oldDir, home, fail), /磁盘满了/);
  assert.deepEqual(readdirSync(home).sort(), ['index-data.js', 'index.html']);
  assert.equal(readFileSync(path.join(home, 'index-data.js'), 'utf8'), indexText);
  assert.equal(readFileSync(path.join(home, 'index.html'), 'utf8'), 'mine');
  // 总目录本来不存在：整个删掉
  const fresh = path.join(tmp(), 'courses');
  assert.throws(() => migrateCourse(oldDir, fresh, fail), /磁盘满了/);
  assert.ok(!existsSync(fresh));
  // 总目录存在但是空的：只清掉这次创建的
  const empty = tmp();
  assert.throws(() => migrateCourse(oldDir, empty, fail), /磁盘满了/);
  assert.deepEqual(readdirSync(empty), []);
});
