import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCRIPTS_DIR } from '../helpers/paths.mjs';

const { writeDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const SCRIPT = path.join(SCRIPTS_DIR, 'list-courses.mjs');

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const lines = (r) => r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));

function course(over = {}) {
  return {
    version: 1, topic: '宏观经济学入门', slug: 'macro', template: null,
    mission: { why: '', target: '', background: '' }, approach: '', researched: 'skipped', resources: [],
    updatedAt: '2026-11-17T10:00:00+08:00',
    resume: { lesson: 'b', note: '讲到 **利率**' },
    review: [{ lesson: 'a', text: 'x' }, { lesson: null, text: 'y' }],
    growth: [],
    lessons: [
      { id: 'a', title: 'A', summary: '', status: 'done', mastered: true, readings: [], cards: [] },
      { id: 'b', title: 'B', summary: '', status: 'current', mastered: false, readings: [], cards: [] },
      { id: 'c', title: 'C', summary: '', status: 'skipped', mastered: false, readings: [], cards: [] },
      { id: 'd', title: 'D', summary: '', status: 'done', mastered: false, readings: [], cards: [] },
    ],
    ...over,
  };
}

function makeHome(name = 'courses') {
  const base = mkdtempSync(path.join(os.tmpdir(), 'la-list-'));
  const home = path.join(base, name);
  mkdirSync(home, { recursive: true });
  return home;
}

test('正常课程：每门一行摘要，统计口径与 progressOf 一致（不数跳过的课）', () => {
  const home = makeHome();
  writeDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX', { version: 1, courses: [{ slug: 'macro', dir: 'macro' }, { slug: 'billing', dir: 'old/billing-system' }] });
  mkdirSync(path.join(home, 'macro'));
  writeDataFile(path.join(home, 'macro', 'course-data.js'), 'LEARN_COURSE', course());
  mkdirSync(path.join(home, 'old/billing-system'), { recursive: true });
  writeDataFile(path.join(home, 'old/billing-system', 'course-data.js'), 'LEARN_COURSE', course({ topic: '计费系统', slug: 'billing', template: 'interview', resume: undefined, updatedAt: undefined, review: [] }));
  const r = run(home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.deepEqual(lines(r), [
    { slug: 'macro', dir: 'macro', topic: '宏观经济学入门', template: null, done: 2, total: 3, mastered: 1, review: 2, resumeLesson: 'b', resumeNote: '讲到 **利率**', updatedAt: '2026-11-17T10:00:00+08:00' },
    { slug: 'billing', dir: 'old/billing-system', topic: '计费系统', template: 'interview', done: 2, total: 3, mastered: 1, review: 0, resumeLesson: null, resumeNote: null, updatedAt: null },
  ]);
});

test('读不出来的课：missing、syntax、unsafe 各一行，其余课照常列出', () => {
  const home = makeHome();
  writeDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX', {
    version: 1,
    courses: [
      { slug: 'gone', dir: 'gone' },
      { slug: 'broken', dir: 'broken' },
      { slug: 'evil', dir: '../outside' },
      { slug: 'abs', dir: '/etc' },
      { slug: 'ok', dir: 'ok' },
    ],
  });
  mkdirSync(path.join(home, 'broken'));
  writeFileSync(path.join(home, 'broken', 'course-data.js'), 'window.LEARN_COURSE = { "version": 1, "to');
  // 不安全的 dir 指向的文件即使存在也不读
  mkdirSync(path.join(home, '..', 'outside'), { recursive: true });
  writeDataFile(path.join(home, '..', 'outside', 'course-data.js'), 'LEARN_COURSE', course());
  mkdirSync(path.join(home, 'ok'));
  writeDataFile(path.join(home, 'ok', 'course-data.js'), 'LEARN_COURSE', course({ slug: 'ok' }));
  const r = run(home);
  assert.equal(r.status, 0, r.stderr);
  const out = lines(r);
  assert.deepEqual(out.slice(0, 4), [
    { slug: 'gone', dir: 'gone', error: 'missing' },
    { slug: 'broken', dir: 'broken', error: 'syntax' },
    { slug: 'evil', dir: '../outside', error: 'unsafe' },
    { slug: 'abs', dir: '/etc', error: 'unsafe' },
  ]);
  assert.equal(out[4].slug, 'ok');
  assert.equal(out[4].done, 2);
});

test('数据文件是合法外壳但写的是可执行代码：按 syntax 处理，不执行', () => {
  const home = makeHome();
  writeDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX', { version: 1, courses: [{ slug: 'x', dir: 'x' }] });
  mkdirSync(path.join(home, 'x'));
  const marker = path.join(home, 'pwned');
  writeFileSync(path.join(home, 'x', 'course-data.js'), `window.LEARN_COURSE = (require('fs').writeFileSync(${JSON.stringify(marker)}, '1'), {});`);
  const r = run(home);
  assert.deepEqual(lines(r), [{ slug: 'x', dir: 'x', error: 'syntax' }]);
  assert.equal(spawnSync('test', ['-e', marker]).status, 1);
});

test('课程目录的路径含空格和中文', () => {
  const home = makeHome('我的 课程');
  writeDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX', { version: 1, courses: [{ slug: 'macro', dir: '宏观 经济' }] });
  mkdirSync(path.join(home, '宏观 经济'));
  writeDataFile(path.join(home, '宏观 经济', 'course-data.js'), 'LEARN_COURSE', course());
  const r = run(home);
  assert.equal(r.status, 0, r.stderr);
  const [row] = lines(r);
  assert.equal(row.dir, '宏观 经济');
  assert.equal(row.topic, '宏观经济学入门');
});

test('没有登记表、课程目录不存在：零行，退出 0', () => {
  const home = makeHome();
  for (const dir of [home, path.join(home, 'nope')]) {
    const r = run(dir);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  }
});

test('登记表读不懂：✗ 开头的一行，退出 1', () => {
  const home = makeHome();
  writeFileSync(path.join(home, 'index-data.js'), 'window.LEARN_INDEX = {');
  const r = run(home);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^✗ /);
});

test('参数缺失或多余：退出 2', () => {
  assert.equal(run().status, 2);
  assert.equal(run('').status, 2);
  assert.equal(run('a', 'b').status, 2);
});
