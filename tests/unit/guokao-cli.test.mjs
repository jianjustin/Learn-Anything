import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, SCRIPTS_DIR } from '../helpers/paths.mjs';
import { loadCore, plain } from '../helpers/load-core.mjs';

const script = path.join(SCRIPTS_DIR, 'guokao.mjs');
const { migrateCourse } = await import(path.join(SCRIPTS_DIR, 'migrate-guokao.mjs'));
const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const lib = await import(path.join(SCRIPTS_DIR, 'lib/guokao.mjs'));
const { MigrateError } = await import(path.join(SCRIPTS_DIR, 'lib/migrate-common.mjs'));
const C = loadCore();
const oldDir = path.join(ROOT, 'tests/fixtures/old-guokao');
const bankRoot = path.join(ROOT, 'tests/fixtures/guokao-repo');

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'guokao-cli-'));
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
// 把旧课程迁进临时目录，返回课程文件
function makeCourse() {
  const { dir } = migrateCourse(oldDir, tmp());
  return path.join(dir, 'course-data.js');
}
const read = (f) => readDataFile(f, 'LEARN_COURSE');
const table = (course, mark) => course.lessons.flatMap((l) => l.cards).find((c) => c.generated === mark);
// 题库副本，供改动后再同步
function bankCopy() {
  const dest = tmp();
  cpSync(bankRoot, dest, { recursive: true });
  return dest;
}
const refsOf = (repo) => path.join(repo, 'guokao-sprint/references');

test('sync：表格卡和 templateData.growth 跟题库一致', () => {
  const file = makeCourse();
  const r = run('sync', bankRoot, file);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'nodes=4 items=7 demo=1');
  const course = read(file);
  assert.deepEqual(plain(C.validateCourse(course, { dirName: course.slug }).errors), []);

  const [typemap, examgrid] = course.templateData.growth;
  assert.deepEqual(typemap.nodes.map((n) => n.id), ['fangcheng', 'jihe', 'rongchi', 'jingji']);
  assert.deepEqual(typemap.nodes[0].count, { 2024: 4, 2025: 3, 2026: 1 });
  assert.deepEqual(typemap.nodes[3], {
    id: 'jingji', label: '经济利润', methods: '利润 = 售价 - 成本', lesson: 'celve', count: { 2024: 1, 2025: 0, 2026: 0 },
  });
  assert.equal(examgrid.items.length, 7);
  assert.equal(examgrid.items.find((i) => i.no === 63).demo, true);

  const tm = table(course, lib.TABLE_MARK.typemap);
  assert.ok(tm.rows.some((row) => row[0] === '经济利润' && row[2] === '做与跳'));
  const eg = table(course, lib.TABLE_MARK.examgrid);
  const cell = (label, col) => eg.rows.find((row) => row[0] === label)[eg.headers.indexOf(col)];
  assert.equal(cell('容斥原理', '2025地市'), '72▣');
  assert.equal(cell('几何', '2025地市'), '68▣◢');
  assert.equal(cell('经济利润', '2024'), '79');
  assert.equal(cell('方程与比例', '2024'), '63★ 74◢');
  // 表格卡没有重复
  assert.equal(course.lessons.flatMap((l) => l.cards).filter((c) => c.generated).length, 2);
  // 再同步一次，文件不变
  const before = hash(file);
  assert.equal(run('sync', bankRoot, file).status, 0);
  assert.equal(hash(file), before);
});

test('sync：--demo 加标记，hold 题和不存在的题拒绝', () => {
  const file = makeCourse();
  const r = run('sync', bankRoot, file, '--demo', '2024-70');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'nodes=4 items=7 demo=2');
  const course = read(file);
  const eg = table(course, lib.TABLE_MARK.examgrid);
  assert.equal(eg.rows.find((row) => row[0] === '几何')[1], '70★');
  assert.equal(course.templateData.growth[1].items.find((i) => i.no === 70).demo, true);
  // 下次不带 --demo 同步，标记还在
  assert.equal(run('sync', bankRoot, file).status, 0);
  assert.equal(read(file).templateData.growth[1].items.find((i) => i.no === 70).demo, true);

  const before = hash(file);
  for (const key of ['2025地市-68', '2099-1']) {
    const bad = run('sync', bankRoot, file, '--demo', key);
    assert.equal(bad.status, 1, key);
    assert.match(bad.stderr, /✗/);
    assert.equal(hash(file), before, key);
  }
  assert.match(run('sync', bankRoot, file, '--demo', '2025地市-68').stderr, /留作整卷|hold/);
});

test('sync：题库里没有的题，demo 标记丢掉并列出', () => {
  const file = makeCourse();
  const repo = bankCopy();
  const zhenti = path.join(refsOf(repo), 'zhenti/xingce-shuliang.data.js');
  writeFileSync(zhenti, readFileSync(zhenti, 'utf8').replace('    { "year": "2024", "no": 63, "type": "fangcheng" },\n', ''));
  const r = run('sync', repo, file);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /^△.*2024-63/m);
  assert.equal(r.stdout.trim(), 'nodes=4 items=6 demo=0');
  const course = read(file);
  assert.ok(!course.templateData.growth[1].items.some((i) => i.no === 63));
});

test('sync：题库的新节点按仓库大纲补进来，对应的课不存在时拒绝', () => {
  const file = makeCourse();
  const r = run('sync', bankRoot, file);
  assert.match(r.stderr, /^△.*jingji/m);

  const file2 = makeCourse();
  const repo = bankCopy();
  const outlines = path.join(refsOf(repo), 'outlines.data.js');
  writeFileSync(outlines, readFileSync(outlines, 'utf8').replace('id: "jingji", label: "经济利润", methods: "利润 = 售价 - 成本", lesson: "celve"', 'id: "jingji", label: "经济利润", methods: "利润 = 售价 - 成本", lesson: ["celve", "nosuch"]'));
  const before = hash(file2);
  const bad = run('sync', repo, file2);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /nosuch/);
  assert.equal(hash(file2), before);
});

test('sync：课程里节点的 lesson 以课程为准，不被大纲覆盖', () => {
  const file = makeCourse();
  assert.equal(read(file).templateData.growth[0].nodes[1].lesson.join(), 'fangcheng,celve');
  assert.equal(run('sync', bankRoot, file).status, 0);
  const nodes = read(file).templateData.growth[0].nodes;
  assert.deepEqual(nodes[2].lesson, 'celve');
  assert.deepEqual(nodes[1].lesson, ['fangcheng', 'celve']);
});

test('sync 只改 templateData.growth 和两张表格卡', () => {
  const file = makeCourse();
  const course = read(file);
  course.review.push({ lesson: 'fangcheng', text: '新的待回顾' });
  course.lessons[1].mastered = true;
  writeFileSync(file, `window.LEARN_COURSE = ${JSON.stringify(course, null, 2)};\n`);
  assert.equal(run('sync', bankRoot, file).status, 0);
  const after = read(file);

  const strip = (c) => {
    const o = structuredClone(c);
    delete o.templateData.growth;
    for (const l of o.lessons) l.cards = l.cards.filter((card) => !card.generated);
    return o;
  };
  assert.deepEqual(strip(after), strip(course));
  assert.notDeepEqual(after.templateData.growth, course.templateData.growth);
  assert.equal(after.review.at(-1).text, '新的待回顾');
  assert.equal(after.lessons[1].mastered, true);
  // 非表格卡的数量和顺序不变
  assert.deepEqual(after.lessons.map((l) => l.cards.filter((c) => !c.generated).length), course.lessons.map((l) => l.cards.filter((c) => !c.generated).length));
});

test('仓库路径不合法时退出 1，课程文件不变', () => {
  const file = makeCourse();
  const before = hash(file);
  const empty = tmp();
  for (const repo of ['', 'relative/repo', '${GUOKAO_REPO}', empty, path.join(bankRoot, 'guokao-sprint')]) {
    const r = run('sync', repo, file);
    assert.equal(r.status, 1, JSON.stringify(repo));
    assert.match(r.stderr, /^✗/m);
    assert.equal(hash(file), before);
  }
});

test('题库的新题型在仓库大纲里找不到时拒绝，课程文件不变', () => {
  const file = makeCourse();
  const repo = bankCopy();
  const before = hash(file);
  const outlines = path.join(refsOf(repo), 'outlines.data.js');
  writeFileSync(outlines, 'window.GUOKAO_OUTLINES = {};\n');
  const r = run('sync', repo, file);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /jingji/);
  assert.equal(hash(file), before);
});

test('template 不是 guokao 时退出 1；缺参数、未知参数退出 2', () => {
  const file = makeCourse();
  const course = read(file);
  course.template = 'interview';
  writeFileSync(file, `window.LEARN_COURSE = ${JSON.stringify(course, null, 2)};\n`);
  const before = hash(file);
  const r = run('sync', bankRoot, file);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /guokao/);
  assert.equal(hash(file), before);

  assert.equal(run().status, 2);
  assert.equal(run('sync').status, 2);
  assert.equal(run('sync', bankRoot).status, 2);
  assert.equal(run('sync', bankRoot, file, '--demo').status, 2);
  assert.equal(run('sync', bankRoot, file, '--nope').status, 2);
  assert.equal(run('nope', bankRoot, file).status, 2);
});

test('课程文件不存在或读不懂时退出 1', () => {
  const dir = tmp();
  assert.equal(run('sync', bankRoot, path.join(dir, 'missing.js')).status, 1);
  const bad = path.join(dir, 'course-data.js');
  writeFileSync(bad, 'not a data file');
  const r = run('sync', bankRoot, bad);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✗/m);
});

test('repoProblem：空、含 ${、非绝对路径、没有 outlines.data.js', () => {
  assert.equal(lib.repoProblem(bankRoot), null);
  for (const bad of ['', '  ', '${X}/y', 'a/b', path.join(tmp(), 'nope'), undefined]) {
    assert.equal(typeof lib.repoProblem(bad), 'string', String(bad));
  }
});

test('loadRepo：读大纲和真题（含注释的 JS），没有的 slug 给 null', () => {
  const repo = lib.loadRepo(bankRoot);
  assert.equal(repo.refs, path.join(bankRoot, 'guokao-sprint/references'));
  assert.equal(repo.outline('xingce-shuliang').typemap.nodes.length, 4);
  assert.equal(repo.outline('nope'), null);
  assert.equal(repo.outline('toString'), null);
  assert.equal(repo.zhenti('xingce-shuliang').items.length, 7);
  assert.equal(repo.zhenti('nope'), null);
  assert.throws(() => repo.zhenti('../x'), MigrateError);
  assert.deepEqual(repo.readImage('img/2024-70.png'), readFileSync(path.join(bankRoot, 'guokao-sprint/references/zhenti/img/2024-70.png')));
});

test('readImage：路径不安全、不存在、符号链接指到外面都拒绝', () => {
  const repo = bankCopy();
  const outside = tmp();
  writeFileSync(path.join(outside, 'x.png'), 'x');
  symlinkSync(path.join(outside, 'x.png'), path.join(refsOf(repo), 'zhenti/img/link.png'));
  const { readImage } = lib.loadRepo(repo);
  for (const bad of ['../outlines.data.js', '/etc/passwd', 'img/nope.png', 'img/link.png', '', 'a\\b']) {
    assert.throws(() => readImage(bad), MigrateError, bad);
  }
  assert.ok(readImage('img/2024-70.png').length > 0);
});

test('questionKey', () => {
  assert.equal(lib.questionKey({ year: '2025地市', no: 68 }), '2025地市-68');
});

test('syncGrowth：纯函数，不改传入的对象；zhenti 为 null 时 growth 原样', () => {
  const repo = lib.loadRepo(bankRoot);
  const course = readDataFile(makeCourse(), 'LEARN_COURSE');
  const snapshot = structuredClone(course);
  const outline = repo.outline('xingce-shuliang');
  const r = lib.syncGrowth(course, repo.zhenti('xingce-shuliang'), outline);
  assert.deepEqual(course, snapshot);
  assert.deepEqual(r.added, ['jingji']);
  assert.deepEqual(r.dropped, []);
  assert.equal(r.growth.length, 2);
  const none = lib.syncGrowth(course, null, outline);
  assert.deepEqual(none.growth, course.templateData.growth);
  assert.deepEqual([none.added, none.dropped], [[], []]);
});

test('syncGrowth：题库里已改成 hold 的题，demo 标记也丢掉；课程没有题型地图时按大纲建', () => {
  const repo = lib.loadRepo(bankRoot);
  const course = readDataFile(makeCourse(), 'LEARN_COURSE');
  course.templateData.growth[1].items.find((i) => i.no === 70).demo = true;
  const zhenti = structuredClone(repo.zhenti('xingce-shuliang'));
  zhenti.items.find((i) => i.no === 70).hold = true;
  delete zhenti.items.find((i) => i.no === 70).img;
  const r = lib.syncGrowth(course, zhenti, repo.outline('xingce-shuliang'));
  assert.ok(r.dropped.includes('2024-70'));
  assert.ok(!r.growth[1].items.find((i) => i.no === 70).demo);

  course.templateData.growth = [];
  const built = lib.syncGrowth(course, repo.zhenti('xingce-shuliang'), repo.outline('xingce-shuliang'));
  assert.deepEqual(built.growth.map((g) => g.kind), ['typemap', 'examgrid']);
  assert.equal(built.growth[0].nodes.length, 4);
  assert.throws(() => lib.syncGrowth(course, repo.zhenti('xingce-shuliang'), { typemap: { nodes: [] } }), MigrateError);
});

test('syncGrowth：hold 题带 img 时，写进课程前去掉 img', () => {
  const file = makeCourse();
  const repo = bankCopy();
  const zhenti = path.join(refsOf(repo), 'zhenti/xingce-shuliang.data.js');
  writeFileSync(zhenti, readFileSync(zhenti, 'utf8').replace('"hold": true }', '"hold": true, "img": "img/2024-70.png" }'));
  assert.ok(lib.loadRepo(repo).zhenti('xingce-shuliang').items.some((i) => i.hold && i.img), '夹具应有带 img 的 hold 题');
  const r = run('sync', repo, file);
  assert.equal(r.status, 0, r.stderr);
  const items = read(file).templateData.growth[1].items;
  assert.ok(items.filter((i) => i.hold).length >= 2);
  for (const it of items.filter((i) => i.hold)) assert.equal(Object.hasOwn(it, 'img'), false, `${it.year}-${it.no}`);
  assert.equal(items.find((i) => i.no === 70).img, 'img/2024-70.png');
});

test('syncGrowth：新节点的 lesson 为空数组时拒绝，课程文件不变', () => {
  const file = makeCourse();
  const repo = bankCopy();
  const outlines = path.join(refsOf(repo), 'outlines.data.js');
  writeFileSync(outlines, readFileSync(outlines, 'utf8').replace('methods: "利润 = 售价 - 成本", lesson: "celve"', 'methods: "利润 = 售价 - 成本", lesson: []'));
  const before = hash(file);
  const r = run('sync', repo, file);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /jingji/);
  assert.equal(hash(file), before);
});

const lessonOf = (course, id) => course.lessons.find((l) => l.id === id);

test('image：插在最后一张 steps 卡之后，图片内嵌', () => {
  const file = makeCourse();
  const course = read(file);
  const lesson = lessonOf(course, 'fangcheng');
  const lastSteps = lesson.cards.map((c) => c.type).lastIndexOf('steps');
  assert.ok(lastSteps >= 0 && lastSteps < lesson.cards.length - 1, '夹具里 steps 卡后面应还有别的卡');
  const r = run('image', bankRoot, file, 'fangcheng', '2024-70', '--alt', '图中 <三角形> & "边"');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'inserted fangcheng 2024-70');
  const after = read(file);
  const cards = lessonOf(after, 'fangcheng').cards;
  assert.equal(cards.length, lesson.cards.length + 1);
  const card = cards[lastSteps + 1];
  assert.equal(card.type, 'html');
  assert.equal(card.title, '2024-70 题图');
  assert.match(card.html, /data:image\/png;base64,/);
  assert.ok(card.html.includes('图中 &lt;三角形&gt; &amp; &quot;边&quot;'), card.html);
  assert.deepEqual(cards.slice(0, lastSteps + 1), lesson.cards.slice(0, lastSteps + 1));
  assert.deepEqual(cards.slice(lastSteps + 2), lesson.cards.slice(lastSteps + 1));
  assert.deepEqual(plain(C.validateCourse(after, { dirName: after.slug }).errors), []);
});

test('image：没有 steps 卡时追加到末尾', () => {
  const file = makeCourse();
  const course = read(file);
  const lesson = lessonOf(course, 'fangcheng');
  lesson.cards = lesson.cards.filter((c) => c.type !== 'steps');
  writeFileSync(file, `window.LEARN_COURSE = ${JSON.stringify(course, null, 2)};\n`);
  const n = lesson.cards.length;
  const r = run('image', bankRoot, file, 'fangcheng', '2024-70');
  assert.equal(r.status, 0, r.stderr);
  const cards = lessonOf(read(file), 'fangcheng').cards;
  assert.equal(cards.length, n + 1);
  assert.equal(cards.at(-1).title, '2024-70 题图');
  assert.match(cards.at(-1).html, /data:image\/png;base64,/);
});

test('image：hold 题、没有题图的题、题库里没有的题拒绝，文件不变', () => {
  const file = makeCourse();
  const before = hash(file);
  const hold = bankCopy();
  const zhenti = path.join(refsOf(hold), 'zhenti/xingce-shuliang.data.js');
  writeFileSync(zhenti, readFileSync(zhenti, 'utf8').replace('"no": 72, "type": "rongchi", "hold": true', '"no": 72, "type": "rongchi", "hold": true, "img": "img/2024-70.png"'));
  for (const [repo, key] of [[hold, '2025地市-72'], [bankRoot, '2024-63'], [bankRoot, '2025地市-68'], [bankRoot, '2099-1']]) {
    const r = run('image', repo, file, 'fangcheng', key);
    assert.equal(r.status, 1, key);
    assert.match(r.stderr, /^✗/m, key);
    assert.equal(hash(file), before, key);
  }
  assert.match(run('image', hold, file, 'fangcheng', '2025地市-72').stderr, /留作整卷|hold/);
  assert.match(run('image', bankRoot, file, 'fangcheng', '2024-63').stderr, /没有题图/);
});

test('image：课程 id 不存在时退出 1；参数不对退出 2', () => {
  const file = makeCourse();
  const before = hash(file);
  const r = run('image', bankRoot, file, 'nosuch', '2024-70');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✗.*nosuch/m);
  assert.equal(hash(file), before);
  assert.equal(run('image', bankRoot, file, 'fangcheng').status, 2);
  assert.equal(run('image', bankRoot, file, 'fangcheng', '2024-70', '--alt').status, 2);
  assert.equal(run('image', bankRoot, file, 'fangcheng', '2024-70', '--nope').status, 2);
});
