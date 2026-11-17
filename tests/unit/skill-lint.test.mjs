// tests/unit/skill-lint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SKILL_DIR } from '../helpers/paths.mjs';
import { frontmatter } from '../helpers/frontmatter.mjs';
import { loadCore, plain } from '../helpers/load-core.mjs';

const read = (rel) => readFileSync(path.join(SKILL_DIR, rel), 'utf8');
const { data, body } = frontmatter(read('SKILL.md'));
const { parseDataFile } = await import(path.join(SKILL_DIR, 'scripts/lib/data-file.mjs'));
const C = loadCore();

test('frontmatter：名字、描述里的触发词、长度', () => {
  assert.equal(data.name, 'learn');
  for (const w of ['继续学习', '系统学习', '面试', 'mock interview', 'guokao-sprint']) assert.ok(data.description.includes(w), w);
  assert.ok(data.description.length <= 1536);
});

test('正文的章节齐全，篇幅不超过 500 行', () => {
  const heads = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['路径约定', '什么时候读 references', '入口', '开题', '每课的讲解与检验', '续学与回顾', '调整大纲', '领域模板', '文件操作规则', '讲课风格', '常见错误']);
  assert.ok(body.split('\n').length <= 500);
});

test('正文提到的文件都存在', () => {
  const all = ['SKILL.md', 'references/kickoff.md', 'references/lesson-guide.md', 'references/data-format.md'].map(read).join('\n');
  const rels = new Set([...all.matchAll(/(?:references|scripts|assets|templates)\/[\w./-]+\.(?:md|mjs|html)/g)].map((m) => m[0]));
  assert.ok(rels.size >= 7);
  for (const rel of rels) assert.ok(existsSync(path.join(SKILL_DIR, rel)), rel);
});

test('正文用到了课程目录配置、两个子代理和弹窗提问', () => {
  for (const w of ['${user_config.courses_dir}', 'course-researcher', 'answer-grader', 'AskUserQuestion', '${CLAUDE_SKILL_DIR}/scripts/validate.mjs', '${CLAUDE_SKILL_DIR}/scripts/new-course.mjs']) {
    assert.ok(body.includes(w), w);
  }
});

test('data-format.md 与实现一致：卡片类型和顶层字段都有说明', () => {
  const doc = read('references/data-format.md');
  for (const t of plain(C.CARD_TYPES)) assert.ok(doc.includes('`' + t + '`'), t);
  for (const f of ['version', 'topic', 'slug', 'template', 'templateData', 'mission', 'approach', 'researched', 'resources', 'notice', 'updatedAt', 'resume', 'review', 'growth', 'lessons', 'mastered', 'readings', 'refs', 'rubric']) {
    assert.ok(doc.includes('`' + f + '`'), f);
  }
});

test('data-format.md 里的完整示例是合法的课程数据', () => {
  const blocks = [...read('references/data-format.md').matchAll(/```js\n(window\.LEARN_COURSE = [\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 1);
  for (const b of blocks) {
    const d = parseDataFile(b, 'LEARN_COURSE');
    assert.deepEqual(plain(C.validateCourse(d, { dirName: d.slug }).errors), []);
  }
});
