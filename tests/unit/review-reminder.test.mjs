import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_DIR, SCRIPTS_DIR } from '../helpers/paths.mjs';

const { runReminder } = await import(path.join(SCRIPTS_DIR, 'review-reminder.mjs'));
const { writeDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const MSG = (c, n) => `learn-anything：${c} 门课共有 ${n} 条待回顾，说「继续学习」可以先回顾。`;

// courses: [{ slug, review: 条数 }]；返回 { coursesDir, stateDir }
function makeHome(courses, base = mkdtempSync(path.join(os.tmpdir(), 'la-'))) {
  const coursesDir = path.join(base, 'courses');
  mkdirSync(coursesDir, { recursive: true });
  writeDataFile(path.join(coursesDir, 'index-data.js'), 'LEARN_INDEX', { version: 1, courses: courses.map((c) => ({ slug: c.slug, dir: c.slug })) });
  for (const c of courses) {
    if (c.missing) continue;
    mkdirSync(path.join(coursesDir, c.slug));
    const file = path.join(coursesDir, c.slug, 'course-data.js');
    if (c.broken) writeFileSync(file, 'window.LEARN_COURSE = { "version": 1, "rev');
    else writeDataFile(file, 'LEARN_COURSE', { version: 1, review: Array.from({ length: c.review }, (_, i) => ({ lesson: null, text: `点 ${i}` })) });
  }
  return { coursesDir, stateDir: path.join(base, 'state') };
}

test('有待回顾：输出一行并记下日期', () => {
  const h = makeHome([{ slug: 'a', review: 2 }, { slug: 'b', review: 1 }, { slug: 'c', review: 0 }]);
  const out = JSON.parse(runReminder({ ...h, today: '2026-11-17' }));
  assert.equal(out.systemMessage, MSG(2, 3));
  assert.deepEqual(out.hookSpecificOutput, { hookEventName: 'SessionStart', additionalContext: MSG(2, 3) });
  assert.deepEqual(JSON.parse(readFileSync(path.join(h.stateDir, 'review-reminder.json'), 'utf8')), { lastReminded: '2026-11-17' });
});

test('同一天不重复，第二天再提醒', () => {
  const h = makeHome([{ slug: 'a', review: 1 }]);
  assert.ok(runReminder({ ...h, today: '2026-11-17' }));
  assert.equal(runReminder({ ...h, today: '2026-11-17' }), null);
  assert.ok(runReminder({ ...h, today: '2026-11-18' }));
});

test('没有待回顾：不输出，也不记日期', () => {
  const h = makeHome([{ slug: 'a', review: 0 }]);
  assert.equal(runReminder({ ...h, today: '2026-11-17' }), null);
  assert.equal(existsSync(h.stateDir), false);
});

test('日期记录损坏：按没提醒过处理', () => {
  const h = makeHome([{ slug: 'a', review: 1 }]);
  mkdirSync(h.stateDir);
  writeFileSync(path.join(h.stateDir, 'review-reminder.json'), 'garbage');
  assert.ok(runReminder({ ...h, today: '2026-11-17' }));
});

test('目录不存在、参数为空、占位符没有被替换：不输出', () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'la-'));
  for (const coursesDir of [path.join(stateDir, 'nope'), '', undefined, '${user_config.courses_dir}']) {
    assert.equal(runReminder({ coursesDir, stateDir, today: '2026-11-17' }), null);
  }
});

test('目录已删除的课和写到一半的数据被跳过，其余照常统计', () => {
  const h = makeHome([{ slug: 'gone', missing: true }, { slug: 'half', broken: true }, { slug: 'ok', review: 2 }]);
  assert.equal(JSON.parse(runReminder({ ...h, today: '2026-11-17' })).systemMessage, MSG(1, 2));
});

test('路径含空格和中文', () => {
  const h = makeHome([{ slug: 'a', review: 1 }], mkdtempSync(path.join(os.tmpdir(), '我的 课程-')));
  assert.equal(JSON.parse(runReminder({ ...h, today: '2026-11-17' })).systemMessage, MSG(1, 1));
});

test('命令行：缺参数、也没有配置文件时退出 0，没有任何输出', () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'la-'));
  const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'review-reminder.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, LEARN_ANYTHING_CONFIG: path.join(base, 'none.json'), CLAUDE_PLUGIN_DATA: path.join(base, 'state') },
  });
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', '']);
});

test('命令行：缺参数时从配置文件取课程目录（Codex 的 hook 不带参数）', () => {
  const h = makeHome([{ slug: 'a', review: 2 }]);
  const cfg = path.join(path.dirname(h.coursesDir), 'config.json');
  writeFileSync(cfg, JSON.stringify({ courses_dir: h.coursesDir }));
  const run = (cfgFile) => spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'review-reminder.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, LEARN_ANYTHING_CONFIG: cfgFile, CLAUDE_PLUGIN_DATA: h.stateDir },
  });
  const r = run(cfg);
  assert.deepEqual([r.status, r.stderr], [0, '']);
  assert.equal(JSON.parse(r.stdout).systemMessage, MSG(1, 2));
  // 配置文件读不懂：当作不提醒，仍然退出 0、不输出
  const bad = path.join(path.dirname(h.coursesDir), 'bad.json');
  writeFileSync(bad, '{');
  rmSync(h.stateDir, { recursive: true, force: true });
  assert.deepEqual([run(bad).status, run(bad).stdout, run(bad).stderr], [0, '', '']);
});

test('claude-hooks.json：只在新会话启动时运行，课程目录取 userConfig', () => {
  const h = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'hooks/claude-hooks.json'), 'utf8')).hooks.SessionStart;
  assert.equal(h.length, 1);
  assert.equal(h[0].matcher, 'startup');
  assert.deepEqual(h[0].hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/skills/learn/scripts/review-reminder.mjs', '${user_config.courses_dir}']);
  assert.equal(h[0].hooks[0].command, 'node');
});

test('codex-hooks.json：一条命令字符串，不带 args 和 userConfig 占位符', () => {
  const h = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'hooks/codex-hooks.json'), 'utf8')).hooks.SessionStart;
  assert.equal(h.length, 1);
  assert.equal(h[0].matcher, 'startup');
  assert.equal(h[0].hooks[0].command, 'node "${PLUGIN_ROOT}/skills/learn/scripts/review-reminder.mjs"');
  assert.equal(h[0].hooks[0].args, undefined);
});

test('没有 hooks/hooks.json：两个宿主都会默认加载它，各自的 hook 文件由清单指定', () => {
  assert.equal(existsSync(path.join(PLUGIN_DIR, 'hooks/hooks.json')), false);
});

// ---- 以下是补充的边界测试 ----

test('index-data.js 里不安全的 dir 不会被读取', () => {
  const h = makeHome([{ slug: 'ok', review: 1 }]);
  const outside = path.join(path.dirname(h.coursesDir), 'outside');
  mkdirSync(outside);
  writeDataFile(path.join(outside, 'course-data.js'), 'LEARN_COURSE', { version: 1, review: [{ text: 'x' }, { text: 'y' }] });
  const bad = ['../outside', '/etc', 'a/../../outside', 'a\\b', 'http://x', 'c:evil', '', '.', 'a//b', './ok', 'ok/.', 5, null];
  writeDataFile(path.join(h.coursesDir, 'index-data.js'), 'LEARN_INDEX', {
    version: 1,
    courses: [{ slug: 'ok', dir: 'ok' }, ...bad.map((dir) => ({ slug: 'bad', dir })), null, 'str', {}],
  });
  assert.equal(JSON.parse(runReminder({ ...h, today: '2026-11-17' })).systemMessage, MSG(1, 1));
});

test('只数格式正确的待回顾条目', () => {
  const h = makeHome([{ slug: 'a', review: 0 }, { slug: 'b', review: 0 }, { slug: 'c', review: 0 }, { slug: 'd', review: 0 }]);
  const put = (slug, review) => writeDataFile(path.join(h.coursesDir, slug, 'course-data.js'), 'LEARN_COURSE', { version: 1, review });
  put('a', [{ text: '好' }, { text: '' }, { text: 3 }, {}, null, 'str', [], { lesson: 'l1' }]);
  put('b', 'not-an-array');
  put('c', { text: 'x' });
  writeDataFile(path.join(h.coursesDir, 'd', 'course-data.js'), 'LEARN_COURSE', { version: 1 });
  assert.equal(JSON.parse(runReminder({ ...h, today: '2026-11-17' })).systemMessage, MSG(1, 1));
});

test('index-data.js 缺失、损坏或 courses 不是数组：不输出', () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'la-'));
  const coursesDir = mkdtempSync(path.join(os.tmpdir(), 'la-'));
  assert.equal(runReminder({ coursesDir, stateDir, today: '2026-11-17' }), null);
  writeFileSync(path.join(coursesDir, 'index-data.js'), 'window.LEARN_INDEX = {');
  assert.equal(runReminder({ coursesDir, stateDir, today: '2026-11-17' }), null);
  writeDataFile(path.join(coursesDir, 'index-data.js'), 'LEARN_INDEX', { version: 1, courses: {} });
  assert.equal(runReminder({ coursesDir, stateDir, today: '2026-11-17' }), null);
  assert.equal(existsSync(path.join(stateDir, 'review-reminder.json')), false);
});

test('日期记录里的 lastReminded 不是字符串：按没提醒过处理', () => {
  const h = makeHome([{ slug: 'a', review: 1 }]);
  mkdirSync(h.stateDir);
  writeFileSync(path.join(h.stateDir, 'review-reminder.json'), '{"lastReminded":20261117}');
  assert.ok(runReminder({ ...h, today: '2026-11-17' }));
});

test('状态目录写不进去：不提醒（返回 null），否则每个新会话都会重复提醒', () => {
  const h = makeHome([{ slug: 'a', review: 1 }]);
  writeFileSync(h.stateDir, 'i am a file');
  assert.equal(runReminder({ ...h, today: '2026-11-17' }), null);
});

test('命令行：用 CLAUDE_PLUGIN_DATA 记日期，当天第二次不再输出，退出 0', () => {
  const h = makeHome([{ slug: 'a', review: 1 }]);
  const run = () => spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'review-reminder.mjs'), h.coursesDir], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: h.stateDir },
  });
  const first = run();
  assert.deepEqual([first.status, first.stderr], [0, '']);
  const out = JSON.parse(first.stdout);
  assert.equal(out.systemMessage, MSG(1, 1));
  assert.ok(first.stdout.endsWith('\n') && first.stdout.trim().split('\n').length === 1);
  const stored = JSON.parse(readFileSync(path.join(h.stateDir, 'review-reminder.json'), 'utf8')).lastReminded;
  assert.match(stored, /^\d{4}-\d{2}-\d{2}$/);
  const second = run();
  assert.deepEqual([second.status, second.stdout, second.stderr], [0, '', '']);
});
