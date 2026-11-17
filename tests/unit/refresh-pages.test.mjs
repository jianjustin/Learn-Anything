import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ASSETS_DIR, SCRIPTS_DIR } from '../helpers/paths.mjs';

const { writeDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const SCRIPT = path.join(SCRIPTS_DIR, 'refresh-pages.mjs');
const COURSE_HTML = readFileSync(path.join(ASSETS_DIR, 'course.html'), 'utf8');
const INDEX_HTML = readFileSync(path.join(ASSETS_DIR, 'index.html'), 'utf8');

const run = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
const read = (...p) => readFileSync(path.join(...p), 'utf8');

// 一个已有两门课的课程目录，页面都是旧的
function makeHome(name = 'courses') {
  const home = path.join(mkdtempSync(path.join(os.tmpdir(), 'la-refresh-')), name);
  mkdirSync(home, { recursive: true });
  writeDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX', {
    version: 1,
    courses: [
      { slug: 'macro', dir: 'macro' },
      { slug: 'billing', dir: '旧课 billing' },
      { slug: 'gone', dir: 'gone' },
      { slug: 'evil', dir: '../outside' },
    ],
  });
  writeFileSync(path.join(home, 'index.html'), 'old index');
  for (const dir of ['macro', '旧课 billing']) {
    mkdirSync(path.join(home, dir));
    writeFileSync(path.join(home, dir, 'course.html'), 'old page');
    writeFileSync(path.join(home, dir, 'course-data.js'), `window.LEARN_COURSE = {"slug":"${dir}"};`);
    writeFileSync(path.join(home, dir, 'notes.txt'), 'mine');
  }
  // 没有登记的目录不碰
  mkdirSync(path.join(home, 'stray'));
  writeFileSync(path.join(home, 'stray', 'course.html'), 'old page');
  mkdirSync(path.join(home, '..', 'outside'));
  return home;
}

test('把两个页面模板复制到课程目录和每门登记过且目录存在的课里，别的文件不动', () => {
  const home = makeHome('我的 课程');
  const r = run([home]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /刷新了总览页和 2 门课的课程页/);
  assert.equal(read(home, 'index.html'), INDEX_HTML);
  for (const dir of ['macro', '旧课 billing']) {
    assert.equal(read(home, dir, 'course.html'), COURSE_HTML);
    assert.equal(read(home, dir, 'course-data.js'), `window.LEARN_COURSE = {"slug":"${dir}"};`);
    assert.equal(read(home, dir, 'notes.txt'), 'mine');
    assert.deepEqual(readdirSync(path.join(home, dir)).sort(), ['course-data.js', 'course.html', 'notes.txt']);
  }
  assert.equal(read(home, 'stray', 'course.html'), 'old page');
  // 不安全的 dir 不写，目录不存在的课不建
  assert.deepEqual(readdirSync(path.join(home, '..', 'outside')), []);
  assert.equal(existsSync(path.join(home, 'gone')), false);
  assert.match(r.stdout, /gone/);
  assert.match(r.stdout, /evil/);
});

test('没有登记表：什么也不做，退出 0', () => {
  const home = path.join(mkdtempSync(path.join(os.tmpdir(), 'la-refresh-')), 'courses');
  mkdirSync(home);
  const r = run([home]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(home), []);
  const missing = path.join(home, 'nope');
  assert.equal(run([missing]).status, 0);
  assert.equal(existsSync(missing), false);
});

test('课程目录不是绝对路径、为空或含没替换的占位符：退出 1，不创建任何东西', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'la-refresh-cwd-'));
  mkdirSync(path.join(cwd, 'rel'));
  writeDataFile(path.join(cwd, 'rel', 'index-data.js'), 'LEARN_INDEX', { version: 1, courses: [] });
  for (const dir of ['', 'rel', './rel', '${user_config.courses_dir}', `${cwd}/\${user_config.courses_dir}`]) {
    const r = run([dir], cwd);
    assert.equal(r.status, 1, dir);
    assert.match(r.stderr, /^✗ /, dir);
    assert.equal(r.stdout, '', dir);
  }
  assert.deepEqual(readdirSync(cwd), ['rel']);
  assert.deepEqual(readdirSync(path.join(cwd, 'rel')), ['index-data.js']);
});

test('登记表读不懂：退出 1，不写页面', () => {
  const home = path.join(mkdtempSync(path.join(os.tmpdir(), 'la-refresh-')), 'courses');
  mkdirSync(home);
  writeFileSync(path.join(home, 'index-data.js'), 'window.LEARN_INDEX = {');
  const r = run([home]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✗ /);
  assert.deepEqual(readdirSync(home), ['index-data.js']);
});

test('参数个数不对：退出 2', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['/a', '/b']).status, 2);
});
