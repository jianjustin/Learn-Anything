// tests/unit/new-course.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ASSETS_DIR, SCRIPTS_DIR } from '../helpers/paths.mjs';

const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const run = (...args) => spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'new-course.mjs'), ...args], { encoding: 'utf8' });
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'la-'));
const index = (home) => readDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX');

test('建课：复制模板并登记，不写课程数据', () => {
  const home = tmp();
  const r = run(home, 'macro-intro');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), path.join(home, 'macro-intro', 'course.html'));
  assert.deepEqual(readFileSync(path.join(home, 'macro-intro/course.html')), readFileSync(path.join(ASSETS_DIR, 'course.html')));
  assert.deepEqual(readFileSync(path.join(home, 'index.html')), readFileSync(path.join(ASSETS_DIR, 'index.html')));
  assert.deepEqual(index(home), { version: 1, courses: [{ slug: 'macro-intro', dir: 'macro-intro' }] });
  assert.equal(existsSync(path.join(home, 'macro-intro/course-data.js')), false);
});

test('第二门课追加登记，不覆盖已有的 index.html', () => {
  const home = tmp();
  run(home, 'first-course');
  writeFileSync(path.join(home, 'index.html'), 'MARK');
  assert.equal(run(home, 'second-course').status, 0);
  assert.equal(readFileSync(path.join(home, 'index.html'), 'utf8'), 'MARK');
  assert.deepEqual(index(home).courses.map((c) => c.slug), ['first-course', 'second-course']);
});

test('目录已存在时拒绝，登记不变', () => {
  const home = tmp();
  run(home, 'dup');
  const r = run(home, 'dup');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✗ /);
  assert.equal(r.stdout, '');
  assert.equal(index(home).courses.length, 1);
});

test('slug 不合法时拒绝，不创建任何东西', () => {
  const home = tmp();
  for (const slug of ['Bad_Slug', 'a--b', '-a', '中文']) assert.equal(run(home, slug).status, 1);
  assert.deepEqual(readdirSync(home), []);
});

test('缺参数：退出码 2', () => assert.equal(run(tmp()).status, 2));

test('多余参数：退出码 2', () => assert.equal(run(tmp(), 'a', 'b').status, 2));

test('课程目录不存在时自动创建，路径可以含空格和中文', () => {
  const home = path.join(tmp(), '我的 课程');
  assert.equal(run(home, 'ok-course').status, 0);
  assert.equal(existsSync(path.join(home, 'ok-course/course.html')), true);
});

test('index-data.js 读不懂时拒绝：不覆盖、不建任何东西，错误信息点名该文件', () => {
  const home = tmp();
  writeFileSync(path.join(home, 'index-data.js'), 'window.LEARN_INDEX = {oops');
  const r = run(home, 'new-one');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /index-data\.js/);
  assert.equal(r.stdout, '');
  assert.equal(readFileSync(path.join(home, 'index-data.js'), 'utf8'), 'window.LEARN_INDEX = {oops');
  assert.deepEqual(readdirSync(home), ['index-data.js']);
});

test('index-data.js 里 courses 不是数组时同样拒绝', () => {
  const home = tmp();
  writeFileSync(path.join(home, 'index-data.js'), 'window.LEARN_INDEX = {"version":1,"courses":{}};');
  const r = run(home, 'new-one');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /index-data\.js/);
  assert.deepEqual(readdirSync(home), ['index-data.js']);
});

test('课程已登记但目录不存在时不重复登记', () => {
  const home = tmp();
  writeFileSync(path.join(home, 'index-data.js'), 'window.LEARN_INDEX = {"version":1,"courses":[{"slug":"gone","dir":"gone"}]};');
  assert.equal(run(home, 'gone').status, 0);
  assert.deepEqual(index(home).courses, [{ slug: 'gone', dir: 'gone' }]);
});

test('createCourse 可以被导入，导入本身没有副作用', async () => {
  const mod = await import(path.join(SCRIPTS_DIR, 'new-course.mjs'));
  const home = tmp();
  const r = mod.createCourse(home, 'via-import');
  assert.deepEqual(r, { dir: path.join(home, 'via-import'), coursePage: path.join(home, 'via-import', 'course.html') });
  assert.throws(() => mod.createCourse(home, 'via-import'), { code: 'exists' });
  assert.throws(() => mod.createCourse(home, 'Bad'), { code: 'slug' });
});

// ---- 整体审查后的修复：课程目录只接受绝对路径（D1）、回滚（D4） ----

test('课程目录为空、是相对路径或含没替换的占位符：退出 1，当前目录里什么都不建', () => {
  const cwd = tmp();
  for (const home of ['', 'rel/dir', './x', '${user_config.courses_dir}', `${cwd}/\${user_config.courses_dir}`]) {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'new-course.mjs'), home, 'x'], { encoding: 'utf8', cwd });
    assert.equal(r.status, 1, home);
    assert.match(r.stderr, /^✗ /, home);
    assert.equal(r.stdout, '', home);
  }
  assert.deepEqual(readdirSync(cwd), []);
});

const { createCourse } = await import(path.join(SCRIPTS_DIR, 'new-course.mjs'));
const diskFull = () => { throw new Error('磁盘满了'); };

test('回滚：登记失败时删掉课程目录、这次复制的 index.html 和新建的上级目录', () => {
  const base = tmp();
  writeFileSync(path.join(base, 'keep.txt'), 'x');
  assert.throws(() => createCourse(path.join(base, 'a', 'b', 'courses'), 'macro', { writeIndex: diskFull }), /磁盘满了/);
  assert.deepEqual(readdirSync(base), ['keep.txt']);
});

test('回滚：已有的课程目录、登记表和 index.html 原样保留', () => {
  const home = tmp();
  const indexText = 'window.LEARN_INDEX = {"version":1,"courses":[{"slug":"other","dir":"other"}]};\n';
  writeFileSync(path.join(home, 'index-data.js'), indexText);
  writeFileSync(path.join(home, 'index.html'), 'mine');
  assert.throws(() => createCourse(home, 'macro', { writeIndex: diskFull }), /磁盘满了/);
  assert.deepEqual(readdirSync(home).sort(), ['index-data.js', 'index.html']);
  assert.equal(readFileSync(path.join(home, 'index-data.js'), 'utf8'), indexText);
  assert.equal(readFileSync(path.join(home, 'index.html'), 'utf8'), 'mine');
  // 没有 index.html 时，这次复制的那份也删掉
  const fresh = tmp();
  assert.throws(() => createCourse(fresh, 'macro', { writeIndex: diskFull }), /磁盘满了/);
  assert.deepEqual(readdirSync(fresh), []);
});

test('回滚本身出错：报出的仍是原来的错误，回滚错误附在后面', () => {
  const home = tmp();
  const removed = [];
  const remove = (p) => { removed.push(p); throw new Error('权限不够'); };
  assert.throws(() => createCourse(home, 'macro', { writeIndex: diskFull, remove }), (e) => {
    assert.match(e.message, /^磁盘满了/);
    assert.match(e.message, /清理时出错.*权限不够/);
    return true;
  });
  assert.ok(removed.includes(path.join(home, 'macro')));
});
