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
  for (const w of ['继续学习', '系统学习', '面试', 'mock interview', '国考', '考公', '行测', '申论']) assert.ok(data.description.includes(w), w);
  assert.ok(!data.description.includes('guokao-sprint'));
  assert.ok(!data.description.includes('不用于考公'));
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

test('正文用到了国考题库配置和 guokao.mjs；入口先读非空 template 的模板入口规则', () => {
  assert.ok(body.includes('${user_config.guokao_repo}'));
  assert.ok(allowedTools.includes('Bash(node ${CLAUDE_SKILL_DIR}/scripts/guokao.mjs *)'));
  const entry = body.split('## 入口')[1].split('\n## ')[0];
  assert.ok(/`template` 不是 `null`/.test(entry) && entry.includes('TEMPLATE.md') && entry.includes('入口规则'));
  assert.ok(!/考公[^\n]*不归本 skill|那归 guokao-sprint/.test(body));
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

// frontmatter 助手不解析多行值，allowed-tools 按原文的列表行取
const allowedTools = read('SKILL.md').split(/^---$/m)[1].split('\n').filter((l) => l.startsWith('  - ')).map((l) => l.slice(4));

// 「下一课」的定义在三处用同一句话，改一处就要改三处
const NEXT_LESSON = '下一课是顺序上在本课之后的第一门 `todo` 的课；本课之后没有 `todo` 的课时，取整个列表里第一门 `todo` 的课；都没有就是课程讲完了，`resume` 留在本课并说明讲完。已经 `done` 或 `skipped` 的课不会被改回 `current`。';

test('「下一课」的定义在 SKILL.md、lesson-guide.md、data-format.md 里是同一句话', () => {
  for (const rel of ['SKILL.md', 'references/lesson-guide.md', 'references/data-format.md']) {
    assert.ok(read(rel).includes(NEXT_LESSON), rel);
  }
  assert.ok(body.includes('课末只动本课卡片、本课状态、下一课的状态和 `resume`'));
});

test('入口先运行 list-courses.mjs 列课程，选定之后才读那一门课的数据', () => {
  const entry = body.split('## 入口')[1].split('\n## ')[0];
  assert.ok(entry.includes('node ${CLAUDE_SKILL_DIR}/scripts/list-courses.mjs "${user_config.courses_dir}"'));
  assert.ok(entry.includes('学习者选定之后才读那一门课的 `course-data.js`'));
  assert.ok(!/先读 `\$\{user_config\.courses_dir\}\/index-data\.js`/.test(entry));
  assert.ok(allowedTools.includes('Bash(node ${CLAUDE_SKILL_DIR}/scripts/list-courses.mjs *)'));
});

test('页面模板更新后用 refresh-pages.mjs 刷新', () => {
  const rules = body.split('## 文件操作规则')[1].split('\n## ')[0];
  assert.ok(rules.includes('node ${CLAUDE_SKILL_DIR}/scripts/refresh-pages.mjs "${user_config.courses_dir}"'));
  assert.ok(allowedTools.includes('Bash(node ${CLAUDE_SKILL_DIR}/scripts/refresh-pages.mjs *)'));
});

test('lesson-guide.md：插话记进待回顾时 lesson 为 null，回顾答上来不改 mastered', () => {
  const guide = read('references/lesson-guide.md');
  assert.ok(guide.includes('插话产生的待回顾条目一律写 `"lesson": null`'));
  assert.ok(!guide.includes('`lesson` 写最相关的课'));
});

test('lesson-guide.md：有一节说明怎样补测一门 done 的课', () => {
  const guide = read('references/lesson-guide.md');
  const sec = guide.split(/^## \d+\. 补测$/m)[1]?.split('\n## ')[0];
  assert.ok(sec, '缺少「补测」一节');
  for (const w of ['`done`', '`practice`', '`mastered` 设为 `true`', '`review` 里没有指向这一课的条目']) assert.ok(sec.includes(w), w);
});

test('data-format.md：updatedAt 取当前本地时间，给出取时间的命令', () => {
  const doc = read('references/data-format.md');
  assert.ok(doc.includes('date +%Y-%m-%dT%H:%M:%S%z'));
  assert.ok(doc.includes('`+0800` 写成 `+08:00`'));
});

test('data-format.md：resume.note 是纯文本；todo 的课可以寄存卡片', () => {
  const doc = read('references/data-format.md');
  const [rich, plainLine] = doc.split('## 2. 文本格式')[1].split('\n').filter((l) => l.startsWith('- **'));
  assert.ok(!rich.includes('resume.note'));
  assert.ok(plainLine.includes('`resume.note`'));
  assert.ok(doc.includes('`todo` 的课可以寄存卡片，讲到之前页面不显示'));
});
