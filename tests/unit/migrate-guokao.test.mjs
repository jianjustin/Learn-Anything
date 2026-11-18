import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, SCRIPTS_DIR } from '../helpers/paths.mjs';
import { loadCore, plain } from '../helpers/load-core.mjs';

const script = path.join(SCRIPTS_DIR, 'migrate-guokao.mjs');
const { loadOldCourse, convertCourse, migrateCourse, MigrateError, APPROACH } = await import(script);
const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const oldDir = path.join(ROOT, 'tests/fixtures/old-guokao');
const oldFile = path.join(oldDir, 'course-data.js');
const png = readFileSync(path.join(oldDir, 'img/2024-70.png'));
const readImage = (src) => readFileSync(path.join(oldDir, src));
const C = loadCore();
const old = loadOldCourse(oldFile);
const out = convertCourse(old, readImage);
const lesson = (id) => out.lessons.find((l) => l.id === id);
const practice = lesson('fangcheng').cards.find((c) => c.type === 'practice').items;

test('转换结果是合法的新格式，没有警告', () => {
  const r = C.validateCourse(out, { dirName: 'xingce-shuliang' });
  assert.deepEqual(plain(r.errors), []);
  assert.deepEqual(plain(r.warnings), []);
});

test('顶层字段和顺序', () => {
  assert.deepEqual(Object.keys(out), [
    'version', 'topic', 'slug', 'template', 'templateData', 'mission', 'approach', 'researched', 'resources',
    'series', 'updatedAt', 'resume', 'review', 'growth', 'lessons',
  ]);
  assert.equal(out.template, 'guokao');
  assert.deepEqual(out.templateData, { from: 'guokao-sprint', subject: 'xingce', exam: old.exam, growth: old.growth });
  assert.deepEqual(out.mission, {
    why: '准备国考行测的数量关系', target: '做好副省级卷第 66–80 题，共 15 题，限时约 10 分钟', background: '',
  });
  assert.equal(out.approach, APPROACH);
  assert.deepEqual([out.researched, out.resources, out.growth], ['skipped', [], []]);
  assert.deepEqual(out.series, { name: '国考', order: 4 });
  assert.deepEqual([out.updatedAt, out.resume], [old.updatedAt, old.resume]);
});

test('mission：非行测科目、没有 exam 时 target 为空；不在九门课清单里的 slug 没有 order', () => {
  const o = structuredClone(old);
  Object.assign(o, { slug: 'shenlun-x', subject: 'shenlun', topic: '申论' });
  delete o.exam;
  const r = convertCourse(o, readImage);
  assert.deepEqual(r.mission, { why: '准备国考申论', target: '', background: '' });
  assert.deepEqual(r.series, { name: '国考' });
  assert.ok(!('exam' in r.templateData));
});

test('待回顾迁成待回顾：以「第 N 课」开头的挂到第 N 课，其余 lesson 为 null', () => {
  assert.deepEqual(out.review, [
    { lesson: 'fangcheng', text: '第 2 课变式 1：答案对，但等量关系列错' },
    { lesson: null, text: '没有课号的一条' },
  ]);
});

test('课号超出课程数时 lesson 为 null', () => {
  const o = structuredClone(old);
  o.review = ['第 9 课：x'];
  assert.deepEqual(convertCourse(o, readImage).review, [{ lesson: null, text: '第 9 课：x' }]);
});

test('每课补上 mastered 和 readings: []，其余字段原样', () => {
  for (const [i, l] of out.lessons.entries()) {
    assert.equal(typeof l.mastered, 'boolean');
    assert.deepEqual(l.readings, []);
    for (const k of ['id', 'title', 'summary', 'status']) assert.equal(l[k], old.lessons[i][k]);
  }
  assert.equal(lesson('kaoqing').optional, false);
});

test('掌握按原练习记录推出', () => {
  assert.equal(lesson('kaoqing').mastered, true);
  assert.equal(lesson('fangcheng').mastered, false);
  assert.equal(lesson('celve').mastered, false);
  // 另造一门 done 课：看练习里最后一条判过对错的
  const withItems = (items) => {
    const o = structuredClone(old);
    o.lessons[2].status = 'done';
    o.lessons[2].cards = [{ type: 'practice', items }];
    return convertCourse(o, readImage).lessons[2].mastered;
  };
  assert.equal(withItems([{ q: 'a', yours: 'x', ok: true }, { q: 'b', yours: 'y', ok: false }, { q: 'c' }]), false);
  assert.equal(withItems([{ q: 'a', yours: 'x', ok: false }, { q: 'b', yours: 'y', ok: true }, { q: 'c' }]), true);
  assert.equal(withItems([{ q: 'a' }, { q: 'b', yours: '跳过' }]), false);
  assert.equal(withItems([]), false);
});

test('题型地图转成表格卡，放在考情课末尾', () => {
  const cards = lesson('kaoqing').cards;
  assert.equal(cards.length, old.lessons[0].cards.length + 2);
  assert.deepEqual(cards.at(-2), {
    type: 'table',
    generated: 'guokao-typemap',
    title: '题型地图',
    headers: ['题型', '常用方法', '对应的课', '2024 题数', '2025 题数', '2026 题数'],
    rows: [
      ['方程与比例', '设未知数 · 代入排除', '方程与比例', '3', '2', '0'],
      ['几何', '', '方程与比例、做与跳', '', '', ''],
      ['容斥原理', '', '做与跳', '', '', ''],
    ],
  });
});

test('真题覆盖转成表格卡：题型一行、年份一列，题号后用符号标出示范、组练、整卷和复合，没有题的题型不列', () => {
  assert.deepEqual(lesson('kaoqing').cards.at(-1), {
    type: 'table',
    generated: 'guokao-examgrid',
    title: '真题覆盖（题号；★ 已示范，△ 组练，▣ 留作整卷，◢ 复合题）',
    headers: ['题型', '2024', '2025地市'],
    rows: [
      ['方程与比例', '63★ 74◢', '67△'],
      ['几何', '70', '68▣◢'],
    ],
  });
});

test('没有考情课时表格卡放在第一课', () => {
  const o = structuredClone(old);
  o.lessons[0].id = 'intro';
  o.resume.lesson = 'fangcheng';
  const r = convertCourse(o, readImage);
  assert.equal(r.lessons[0].cards.at(-1).type, 'table');
  assert.deepEqual(plain(C.validateCourse(r, { dirName: 'xingce-shuliang' }).errors), []);
});

test('题图转成 html 卡：图片按 data:image 内嵌，说明转义后放在图下', () => {
  const [, img, bare] = lesson('fangcheng').cards;
  const data = `data:image/png;base64,${png.toString('base64')}`;
  assert.deepEqual(img, {
    type: 'html',
    title: '2024 副省级 70 题 题图',
    html: `<figure><img src="${data}" alt="梯形 ABCD 对角线交于 &lt;O&gt;" style="max-width:100%">`
      + '<figcaption>梯形 <strong>ABCD</strong><br>对角线交于 &lt;O&gt;</figcaption></figure>',
  });
  assert.deepEqual(bare, { type: 'html', title: '题图', html: `<figure><img src="${data}" alt="" style="max-width:100%"></figure>` });
});

test('practice：出题依据接在题目后，错因译成中文放在缺口前，用时接在回答后', () => {
  assert.deepEqual(practice[0], { q: '原创变式 1：……\n出题依据：仿 2024-63', yours: 'B', ok: true, answer: 'B' });
  assert.deepEqual(practice[1], {
    q: '原创变式 2：……\n出题依据：仿 2024-63', yours: 'A', ok: false, why: '错因：审题。读错倍数', answer: 'D',
  });
  assert.deepEqual(practice[3], { q: '15 题限时组练', yours: '对 12 题\n（用时 11 分钟）' });
});

test('practice：回答为「跳过」的记为 skipped，跳题依据写进缺口', () => {
  assert.deepEqual(practice[2], { q: '2024-65 几何', skipped: true, why: '跳题依据：计算量大', answer: 'C' });
});

test('practice：没评对错的（申论）和还没作答的原样', () => {
  assert.deepEqual(practice[4], { q: '申论小题', yours: '要点一', answer: '参考要点' });
  assert.deepEqual(practice[5], { q: '原创变式 3：……\n出题依据：仿 2024-63' });
});

test('interview 卡改名 problem，没有标题时补「追问」', () => {
  assert.deepEqual(lesson('fangcheng').cards.at(-1), { type: 'problem', title: '追问', question: '为什么先设小的量？', answer: '好算' });
});

test('源对象不被修改', () => {
  assert.deepEqual(loadOldCourse(oldFile), old);
});

test('无法对应的东西拒绝转换，不悄悄丢内容', () => {
  const mutated = (f) => { const o = structuredClone(old); f(o); return o; };
  assert.throws(() => convertCourse(mutated((o) => { o.growth.push({ kind: 'diagram' }); }), readImage), /growth\[2\]/);
  assert.throws(() => convertCourse(mutated((o) => { o.growth.shift(); }), readImage), /题型地图/);
  assert.throws(() => convertCourse(mutated((o) => { o.growth[1].items[0].type = 'x'; }), readImage), /不在题型地图里/);
  assert.throws(() => convertCourse(mutated((o) => { o.review = [1]; }), readImage), /review\[0\]/);
  assert.throws(() => convertCourse(mutated((o) => { o.series = {}; }), readImage), /series/);
  assert.throws(() => convertCourse(mutated((o) => { o.lessons[1].cards[3].items[1].cause = 'luck'; }), readImage), /cause/);
  assert.throws(() => convertCourse(mutated((o) => { o.lessons[1].cards[1].src = '../x.png'; }), readImage), /相对路径/);
  assert.throws(() => convertCourse(mutated((o) => { o.lessons[1].cards[1].src = 'img/a.bmp'; }), readImage), /格式/);
});

const hashOf = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'la-'));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

// 造一个旧课程目录（带题图），course-data.js 用 mutate 改过
function oldCopy(mutate) {
  const dir = tmp();
  const o = structuredClone(old);
  mutate(o);
  writeFileSync(path.join(dir, 'course-data.js'), `window.GUOKAO_COURSE = ${JSON.stringify(o)};\n`);
  mkdirSync(path.join(dir, 'img'));
  writeFileSync(path.join(dir, 'img/2024-70.png'), png);
  return dir;
}

test('命令行：写入新目录并登记，不改动源目录', () => {
  const before = hashOf(oldFile);
  const dirBefore = readdirSync(oldDir);
  const home = tmp();
  const r = run(oldDir, home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'lessons=3 cards=9 practice=6 review=2\n');
  assert.deepEqual(readDataFile(path.join(home, 'xingce-shuliang/course-data.js'), 'LEARN_COURSE'), out);
  assert.deepEqual(readDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX').courses, [{ slug: 'xingce-shuliang', dir: 'xingce-shuliang' }]);
  assert.deepEqual(readdirSync(path.join(home, 'xingce-shuliang')).sort(), ['course-data.js', 'course.html']);
  assert.equal(hashOf(oldFile), before);
  assert.deepEqual(readdirSync(oldDir), dirBefore);
  assert.equal(run(oldDir, home).status, 1);
});

test('命令行：缺参数退出 2', () => {
  assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 2);
});

test('命令行：题图找不到或通过符号链接指到源目录外面：退出 1，什么都不留', () => {
  const home = path.join(tmp(), 'courses');
  const missing = oldCopy((o) => { o.lessons[1].cards[1].src = 'img/none.png'; });
  let r = run(missing, home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /找不到题图/);
  const outside = path.join(tmp(), 'secret.png');
  writeFileSync(outside, png);
  const linked = oldCopy((o) => { o.lessons[1].cards[1].src = 'img/link.png'; });
  symlinkSync(outside, path.join(linked, 'img/link.png'));
  r = run(linked, home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /不在旧课程目录里/);
  assert.ok(!existsSync(home));
});

test('命令行：校验有错误时退出 1，打印错误，什么都不留', () => {
  const home = path.join(tmp(), 'courses');
  const r = run(oldCopy((o) => { o.lessons[0].status = 'doing'; }), home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✗.*status/);
  assert.ok(!existsSync(home));
});

test('命令行：旧文件不是严格 JSON（guokao-sprint 允许写成 JavaScript）也能读', () => {
  const dir = oldCopy(() => {});
  const src = readFileSync(path.join(dir, 'course-data.js'), 'utf8').replace('"version":1', '/* 注释 */ version: 1');
  writeFileSync(path.join(dir, 'course-data.js'), src);
  const r = run(dir, tmp());
  assert.equal(r.status, 0, r.stderr);
});

test('写入失败时清掉这次创建的东西', () => {
  const home = path.join(tmp(), 'courses');
  assert.throws(() => migrateCourse(oldDir, home, { write() { throw new Error('磁盘满了'); } }), (e) => e instanceof MigrateError && /磁盘满了/.test(e.message));
  assert.ok(!existsSync(home));
});
