// tests/unit/template-lint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SKILL_DIR } from '../helpers/paths.mjs';
import { frontmatter } from '../helpers/frontmatter.mjs';

const dir = path.join(SKILL_DIR, 'templates/interview');
const files = ['TEMPLATE.md', 'outline-patterns.md', 'lesson-guide.md'].map((f) => readFileSync(path.join(dir, f), 'utf8'));
const all = files.join('\n');

test('frontmatter：名字、匹配说明、不调研', () => {
  const { data } = frontmatter(files[0]);
  assert.equal(data.name, 'interview');
  assert.equal(data.research, 'skip');
  assert.match(data.match, /面试/);
});

test('三类主题、串讲和示范案例都在', () => {
  for (const w of ['system-design', 'knowledge', 'experience', '面试串讲', '示范案例', 'templateData.type', 'notice', '追问链', '核心链路']) {
    assert.ok(all.includes(w), w);
  }
});

test('用新的名字，没有旧名字的残留', () => {
  for (const w of ['`diagram`', '`problem`', '面试怎么讲', '面试题']) assert.ok(all.includes(w), w);
  for (const re of [/INTERVIEW_COURSE/, /\.interview_points/, /demoCase/, /`architecture`/, /architecture 面板/, /`interview` 卡/, /type: "interview"/]) {
    assert.doesNotMatch(all, re);
  }
});

test('写明面试题同时算作本课的检验', () => {
  assert.match(all, /practice/);
  assert.match(all, /检验/);
});
