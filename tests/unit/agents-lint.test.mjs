import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PLUGIN_DIR } from '../helpers/paths.mjs';
import { frontmatter } from '../helpers/frontmatter.mjs';

const agent = (name) => frontmatter(readFileSync(path.join(PLUGIN_DIR, 'agents', `${name}.md`), 'utf8'));

test('course-researcher：名字、工具和输出的五个小节', () => {
  const { data, body } = agent('course-researcher');
  assert.equal(data.name, 'course-researcher');
  assert.ok(data.description.length > 0);
  for (const tool of ['WebSearch', 'WebFetch']) assert.ok(data.tools.includes(tool), tool);
  for (const h of ['## 资料清单', '## 大纲草案', '## 上法建议', '## 资料缺口', '## 未核实']) assert.ok(body.includes(h), h);
});

test('course-researcher：固定标记照抄中文，「未核实」只给学习者指定的资料', () => {
  const { body } = agent('course-researcher');
  assert.ok(body.includes('一律照抄中文原文'), '固定标记照抄中文');
  assert.ok(body.includes('「未核实」只用于学习者指定的资料'), '未核实的适用范围');
});

test('answer-grader：名字、不带写入和联网工具、输出约定', () => {
  const { data, body } = agent('answer-grader');
  assert.equal(data.name, 'answer-grader');
  // 省略 tools 等于继承全部工具，所以必须显式只列 Read
  assert.equal(data.tools, 'Read');
  for (const tool of ['WebSearch', 'WebFetch', 'Write', 'Edit', 'Bash']) assert.ok(!(data.tools || '').includes(tool), tool);
  for (const key of ['"mastered"', '"hits"', '"misses"', '"feedback"']) assert.ok(body.includes(key), key);
});
