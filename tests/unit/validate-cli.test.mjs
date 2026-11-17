import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { SCRIPTS_DIR, fixture } from '../helpers/paths.mjs';

const run = (...args) => spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'validate.mjs'), ...args], { encoding: 'utf8' });

test('合法文件：退出码 0', () => { const r = run(fixture('all-cards')); assert.equal(r.status, 0); assert.match(r.stdout, /✓/); });
test('引用错误：退出码 1', () => { const r = run(fixture('bad-ref')); assert.equal(r.status, 1); assert.match(r.stdout, /✗.*resume\.lesson/); });
test('不是严格 JSON：退出码 1', () => { const r = run(fixture('not-json')); assert.equal(r.status, 1); assert.match(r.stdout, /JSON/); });
test('缺参数：退出码 2', () => assert.equal(run().status, 2));
