import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCRIPTS_DIR } from '../helpers/paths.mjs';

const { configPath } = await import(path.join(SCRIPTS_DIR, 'lib/host-config.mjs'));
const SCRIPT = path.join(SCRIPTS_DIR, 'config.mjs');

function run(args, cfg) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, LEARN_ANYTHING_CONFIG: cfg } });
  return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, stdout: r.stdout, stderr: r.stderr };
}
const tmpCfg = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'la-cfg-')), 'sub', 'config.json');

test('配置文件位置：LEARN_ANYTHING_CONFIG 优先，其次 XDG_CONFIG_HOME，最后 ~/.config', () => {
  assert.equal(configPath({ LEARN_ANYTHING_CONFIG: '/x/c.json', XDG_CONFIG_HOME: '/y' }), '/x/c.json');
  assert.equal(configPath({ LEARN_ANYTHING_CONFIG: 'rel.json', XDG_CONFIG_HOME: '/y' }), '/y/learn-anything/config.json');
  assert.equal(configPath({ XDG_CONFIG_HOME: 'rel' }), path.join(os.homedir(), '.config/learn-anything/config.json'));
  assert.equal(configPath({}), path.join(os.homedir(), '.config/learn-anything/config.json'));
});

test('没有配置文件：两项都是 null，退出 0', () => {
  const cfg = tmpCfg();
  const r = run([], cfg);
  assert.equal(r.status, 0);
  assert.deepEqual(r.out, { courses_dir: null, guokao_repo: null, file: cfg });
});

test('set 按键合并：只给一项不清掉另一项，末尾斜杠去掉，别的键保留', () => {
  const cfg = tmpCfg();
  assert.equal(run(['set', '--courses-dir', '/data/courses/'], cfg).status, 0);
  const r = run(['set', '--guokao-repo=/data/guokao'], cfg);
  assert.equal(r.status, 0);
  assert.deepEqual(r.out, { courses_dir: '/data/courses', guokao_repo: '/data/guokao', file: cfg });
  const raw = JSON.parse(readFileSync(cfg, 'utf8'));
  raw.extra = 1;
  writeFileSync(cfg, JSON.stringify(raw));
  run(['set', '--courses-dir', '/new'], cfg);
  assert.deepEqual(JSON.parse(readFileSync(cfg, 'utf8')), { courses_dir: '/new', guokao_repo: '/data/guokao', extra: 1 });
  assert.deepEqual(run([], cfg).out, { courses_dir: '/new', guokao_repo: '/data/guokao', file: cfg });
});

test('参数不对退出 2：相对路径、空值、未知参数、什么都没给', () => {
  const cfg = tmpCfg();
  for (const args of [['set', '--courses-dir', 'rel'], ['set', '--courses-dir', ''], ['set', '--courses-dir'], ['set', '--foo', '/x'], ['set'], ['get']]) {
    assert.equal(run(args, cfg).status, 2, args.join(' '));
  }
});

test('配置文件读不懂或某项不是绝对路径：退出 1，输出 ✗，set 也不覆盖它', () => {
  const cfg = tmpCfg();
  run(['set', '--courses-dir', '/a'], cfg);
  for (const text of ['{', '[]', '{"courses_dir": "rel"}', '{"courses_dir": 3}']) {
    writeFileSync(cfg, text);
    const r = run([], cfg);
    assert.equal(r.status, 1, text);
    assert.match(r.stderr, /^✗ /);
    assert.equal(run(['set', '--courses-dir', '/b'], cfg).status, 1);
    assert.equal(readFileSync(cfg, 'utf8'), text);
  }
});
