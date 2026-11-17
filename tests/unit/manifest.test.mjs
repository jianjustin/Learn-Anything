import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, PLUGIN_DIR } from '../helpers/paths.mjs';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('plugin.json：名字、版本和课程目录配置项', () => {
  const m = json(path.join(PLUGIN_DIR, '.claude-plugin/plugin.json'));
  assert.equal(m.name, 'learn-anything');
  assert.equal(m.version, '0.1.0');
  assert.equal(m.userConfig.courses_dir.type, 'directory');
  assert.equal(m.userConfig.courses_dir.required, true);
});

test('marketplace.json：指向 plugin 目录', () => {
  const m = json(path.join(ROOT, '.claude-plugin/marketplace.json'));
  assert.equal(m.name, 'learn-anything-local');
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source]), [['learn-anything', './plugins/learn-anything']]);
});
