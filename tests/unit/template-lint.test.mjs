// tests/unit/template-lint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { SKILL_DIR } from '../helpers/paths.mjs';
import { frontmatter } from '../helpers/frontmatter.mjs';

const TEMPLATES_DIR = path.join(SKILL_DIR, 'templates');
const read = (name, f) => readFileSync(path.join(TEMPLATES_DIR, name, f), 'utf8');
// 每个模板目录下的全部 .md 文件，TEMPLATE.md 排第一
const templateFiles = (name) => {
  const names = readdirSync(path.join(TEMPLATES_DIR, name)).filter((f) => f.endsWith('.md')).sort();
  return ['TEMPLATE.md', ...names.filter((f) => f !== 'TEMPLATE.md')];
};

// ── 通用检查：对每个模板都跑 ──

const TEMPLATES = readdirSync(TEMPLATES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

test('模板目录里至少有 interview 和 guokao', () => {
  for (const name of ['interview', 'guokao']) assert.ok(TEMPLATES.includes(name), name);
});

for (const name of TEMPLATES) {
  test(`${name}：有 TEMPLATE.md，frontmatter 的 name 与目录名相同、match 非空、research 是 run 或 skip`, () => {
    assert.ok(existsSync(path.join(TEMPLATES_DIR, name, 'TEMPLATE.md')), `${name}/TEMPLATE.md`);
    const { data } = frontmatter(read(name, 'TEMPLATE.md'));
    assert.equal(data.name, name);
    assert.ok(typeof data.match === 'string' && data.match.length > 0, 'match');
    assert.ok(['run', 'skip'].includes(data.research), `research: ${data.research}`);
  });

  test(`${name}：反引号里只写文件名的 .md 都找得到（模板目录、references/ 或 SKILL.md）`, () => {
    const refsDir = path.join(SKILL_DIR, 'references');
    for (const f of templateFiles(name)) {
      for (const m of read(name, f).matchAll(/`([A-Za-z0-9_-]+\.md)`/g)) {
        const ref = m[1];
        const found = ref === 'SKILL.md'
          || existsSync(path.join(TEMPLATES_DIR, name, ref))
          || existsSync(path.join(refsDir, ref));
        assert.ok(found, `${name}/${f} 引用了 ${ref}`);
      }
    }
  });
}

// ── interview 专项 ──

const interview = ['TEMPLATE.md', 'outline-patterns.md', 'lesson-guide.md'].map((f) => read('interview', f));
const interviewAll = interview.join('\n');

test('frontmatter：名字、匹配说明、不调研', () => {
  const { data } = frontmatter(interview[0]);
  assert.equal(data.name, 'interview');
  assert.equal(data.research, 'skip');
  assert.match(data.match, /面试/);
});

test('三类主题、串讲和示范案例都在', () => {
  for (const w of ['system-design', 'knowledge', 'experience', '面试串讲', '示范案例', 'templateData.type', 'notice', '追问链', '核心链路']) {
    assert.ok(interviewAll.includes(w), w);
  }
});

test('用新的名字，没有旧名字的残留', () => {
  for (const w of ['`diagram`', '`problem`', '面试怎么讲', '面试题']) assert.ok(interviewAll.includes(w), w);
  for (const re of [/INTERVIEW_COURSE/, /\.interview_points/, /demoCase/, /`architecture`/, /architecture 面板/, /`interview` 卡/, /type: "interview"/, /"type": "interview"/, /`service`/, /`store`/, /`external`/, /`placeholder`/]) {
    assert.doesNotMatch(interviewAll, re);
  }
});

test('模板的 lesson-guide 写明模拟面试结束后统一点评', () => {
  assert.match(interview[2], /模拟面试/);
  assert.match(interview[2], /统一点评/);
});

test('写明面试题同时算作本课的检验', () => {
  // TEMPLATE.md 正文里要有这句明确的话，不能只是在别处碰巧出现「practice」和「检验」两个词
  assert.ok(interview[0].includes('课中抛出的每一道面试题都是一次检验，记进本课的 `practice` 卡，参与「已掌握」和待回顾；不另外出检验题。'));
});

// ── guokao 专项 ──

const GUOKAO_FILES = ['TEMPLATE.md', 'outline-patterns.md', 'lesson-guide.md', 'import-questions.md'];
const guokaoExists = existsSync(path.join(TEMPLATES_DIR, 'guokao'));
const guokao = guokaoExists ? GUOKAO_FILES.map((f) => (existsSync(path.join(TEMPLATES_DIR, 'guokao', f)) ? read('guokao', f) : '')) : GUOKAO_FILES.map(() => '');
const guokaoAll = guokao.join('\n');

test('guokao 引用的模板内文件都存在', () => {
  for (const f of GUOKAO_FILES) assert.ok(existsSync(path.join(TEMPLATES_DIR, 'guokao', f)), `guokao/${f}`);
  // TEMPLATE.md 要指向三份辅助文件
  for (const f of GUOKAO_FILES.slice(1)) assert.ok(guokao[0].includes(`\`${f}\``), `TEMPLATE.md 提到 ${f}`);
});

test('guokao frontmatter', () => {
  const { data } = frontmatter(guokao[0]);
  assert.equal(data.name, 'guokao');
  assert.equal(data.research, 'skip');
  assert.match(data.match ?? '', /国考/);
  assert.match(data.match ?? '', /申论/);
});

test('guokao 关键规则都在', () => {
  for (const w of [
    'hold', 'demo', 'drill', 'guokao.mjs sync', 'guokao.mjs image', 'guokao.mjs new', '--demo', 'answer-grader',
    '考情', '做与跳', '出题依据', '错因', '用时', 'skipped', '国考题库',
  ]) {
    assert.ok(guokaoAll.includes(w), w);
  }
  // TEMPLATE.md 正文里要有这句明确的话
  assert.ok(guokao[0].includes('课中出的每一道原创变式都是一次检验，记进本课的 `practice` 卡，参与「已掌握」和待回顾。'));
});

test('guokao 没有旧格式残留', () => {
  assert.ok(guokao.every((t) => t.trim().length > 0), '四个模板文件都要有内容');
  for (const re of [
    /GUOKAO_COURSE/, /\.guokao_points/, /bootstrap/, /notify\.sh/, /"type": "image"/, /type: "image"/,
    /kind: "examgrid"/, /kind: "typemap"/, /validate\.mjs \.guokao/,
  ]) {
    assert.doesNotMatch(guokaoAll, re);
  }
});
