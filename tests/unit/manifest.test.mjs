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

test('plugin.json：国考题库仓库配置项（可选的目录）', () => {
  const m = json(path.join(PLUGIN_DIR, '.claude-plugin/plugin.json'));
  const c = m.userConfig.guokao_repo;
  assert.equal(c.type, 'directory');
  assert.equal(c.title, '国考题库仓库');
  assert.equal(c.required, false);
  assert.equal(typeof c.description, 'string');
  assert.ok(c.description.length > 0);
});

test('marketplace.json：指向 plugin 目录', () => {
  const m = json(path.join(ROOT, '.claude-plugin/marketplace.json'));
  assert.equal(m.name, 'learn-anything-local');
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source]), [['learn-anything', './plugins/learn-anything']]);
});

test('plugin.json：hook 文件指向 hooks/claude-hooks.json', () => {
  const m = json(path.join(PLUGIN_DIR, '.claude-plugin/plugin.json'));
  assert.equal(m.hooks, './hooks/claude-hooks.json');
});

test('.codex-plugin/plugin.json：名字、版本与 Claude 清单一致，技能和 Codex 的 hook 文件', () => {
  const claude = json(path.join(PLUGIN_DIR, '.claude-plugin/plugin.json'));
  const m = json(path.join(PLUGIN_DIR, '.codex-plugin/plugin.json'));
  assert.equal(m.name, claude.name);
  assert.equal(m.version, claude.version);
  assert.equal(m.skills, './skills/');
  assert.equal(m.hooks, './hooks/codex-hooks.json');
  assert.equal(m.userConfig, undefined);
  assert.ok(m.interface.displayName);
  assert.ok(m.interface.defaultPrompt.length <= 3 && m.interface.defaultPrompt.every((p) => p.length <= 128));
});
