# learn-anything Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 learn-anything 的第一版：一个 Claude Code plugin，能系统学习任意主题，并带面试模板和两门旧课程的迁移。

**Architecture:** 仓库根是本地 marketplace，plugin 本体在 `plugins/learn-anything/`。课程页是单文件离线 HTML，纯逻辑放在 `course-core` 脚本块里，页面、校验脚本和单元测试共用这一份。教学流程写在 skill 的说明文件里；调研和评分各用一个子代理；提醒用一个 SessionStart hook。

**Tech Stack:** Claude Code plugin（skill、agents、hooks、userConfig），node 20+ 的 ES 模块脚本，无 npm 依赖，`node:test`，playwright-core 加本机 Chrome 做页面测试，bash。

**Spec:** `docs/specs/2026-11-17-learn-anything-design.md`。执行者要同时读设计文档，下文用「设计 5.x」引用它的章节。

## Global Constraints

- 直接在 `main` 上开发，每个任务结束提交一次。不推送。
- node 20 及以上。plugin 目录里不放 `package.json`，不引入 npm 依赖。
- 名字固定：plugin `learn-anything`，marketplace `learn-anything-local`，skill `learn`，子代理 `course-researcher` 和 `answer-grader`，配置项 `courses_dir`，数据全局变量 `LEARN_COURSE` 和 `LEARN_INDEX`。
- 数据文件形态固定为 `window.LEARN_COURSE = <严格 JSON>;`。
- 脚本和 hook 只用 `JSON.parse` 读课程数据，不执行它。唯一的例外是 `migrate-interview.mjs` 读旧格式源文件。
- `course.html` 和 `index.html` 是单文件，零外部请求，在 `file://` 下可用。
- 课程页每 2500 毫秒重新加载数据，总览页每 5000 毫秒。
- 不修改 guokao-sprint 的任何文件。不修改、不删除任何现有课程的源目录。
- 页面和 skill 的文字用简体中文。
- 参考实现在 `/Users/chenjianrui/workspaces/skills/interview_sprint`，只读。可以借鉴做法，核心代码要新写。

## Review Focus

设计文档隐含、但容易漏测的五类输入。每一类的测试已经放进对应任务。

1. **写到一半的数据文件。** 模型写文件的瞬间页面或 hook 正好在读。页面应保留上一次的内容并提示，修好后恢复；hook 应跳过这门课，不报错。测试在任务 5（B7）和任务 10。
2. **课程目录的路径里有空格或中文。** 脚本、hook 和 `file://` 地址都应正常工作。测试在任务 5（B1）、任务 8 和任务 10。
3. **总览里登记了、但目录已被删掉的课。** 总览页应单独列出并说明原因，hook 应跳过。测试在任务 7（I3）和任务 10。
4. **旧课程数据里的 JS 写法。** 不加引号的键、注释、尾逗号、`[...].join("\n")`，迁移后语义不变。测试在任务 13。
5. **提醒的日期边界和损坏的日期记录。** 同一天不重复，第二天再提醒；记录损坏时按没提醒过处理。测试在任务 10。

## File Structure

```text
.claude-plugin/marketplace.json                         任务 1
.gitignore                                              任务 1
plugins/learn-anything/
  .claude-plugin/plugin.json                            任务 1
  agents/course-researcher.md、answer-grader.md         任务 9
  hooks/hooks.json                                      任务 10
  skills/learn/
    SKILL.md                                            任务 11
    references/kickoff.md、lesson-guide.md、data-format.md   任务 11
    templates/interview/TEMPLATE.md、outline-patterns.md、lesson-guide.md   任务 12
    assets/course.html                                  任务 3、4、5、6
    assets/index.html                                   任务 7
    scripts/lib/data-file.mjs                           任务 2
    scripts/validate.mjs                                任务 3
    scripts/new-course.mjs                              任务 8
    scripts/review-reminder.mjs                         任务 10
    scripts/migrate-interview.mjs                       任务 13
tests/
  helpers/paths.mjs、load-core.mjs、browser.mjs、frontmatter.mjs
  fixtures/<name>/course-data.js
  unit/*.test.mjs、e2e/*.e2e.test.mjs、install.test.sh、run-all.sh
examples/                                               任务 14
install.sh、README.md、README.zh-CN.md                  任务 14
```

每个文件只有一个职责：`data-file.mjs` 只管外壳和 JSON；`course-core` 只管纯逻辑；`course-app` 只管 DOM；各脚本只做一件事并从参数接收目录。

---

### Task 1: 仓库骨架与 plugin 清单

**Files:**
- Create: `.gitignore`
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/learn-anything/.claude-plugin/plugin.json`
- Create: `tests/helpers/paths.mjs`
- Create: `tests/run-all.sh`
- Test: `tests/unit/manifest.test.mjs`

**Interfaces:**
- Produces: `tests/helpers/paths.mjs` 导出 `ROOT`、`PLUGIN_DIR`（`plugins/learn-anything`）、`SKILL_DIR`（`PLUGIN_DIR/skills/learn`）、`ASSETS_DIR`、`SCRIPTS_DIR`、`fixture(name)`（返回 `tests/fixtures/<name>/course-data.js`）、`example(slug)`（返回 `examples/<slug>/course-data.js`）。全部是绝对路径。

- [ ] **Step 1: 写失败的测试**

```js
// tests/unit/manifest.test.mjs
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit`
Expected: FAIL，找不到 `tests/helpers/paths.mjs`

- [ ] **Step 3: 写清单和辅助文件**

- `plugin.json` 字段：`name`、`version: "0.1.0"`、`description`（一句中文）、`author.name: "jianjustin"`、`userConfig.courses_dir`（`type: "directory"`、`title: "课程目录"`、`description`、`required: true`）。
- `marketplace.json` 字段：`name`、`owner.name: "jianjustin"`、`plugins`（一项，见测试）。
- `.gitignore`：`.DS_Store`、`node_modules/`、`tests/artifacts/`。
- `tests/run-all.sh`：`set -u`，进入仓库根，运行 `node --test tests/unit`，任何一步失败则最终退出码为 1。后续任务会往里加步骤。

- [ ] **Step 4: 运行，确认通过，并用官方校验器检查**

Run: `node --test tests/unit`
Expected: PASS

Run: `claude plugin validate plugins/learn-anything --strict`
Expected: 退出码 0。如果校验器对 marketplace 的 `source` 写法报错，按它的提示改，并同步改测试里的期望值。

- [ ] **Step 5: 提交**

```bash
git add .gitignore .claude-plugin plugins tests docs
git commit -m "chore: plugin 骨架、本地 marketplace 与设计文档"
```

---

### Task 2: 数据文件读写库

**Files:**
- Create: `plugins/learn-anything/skills/learn/scripts/lib/data-file.mjs`
- Test: `tests/unit/data-file.test.mjs`

**Interfaces:**
- Produces:
  - `parseDataFile(text: string, globalName: string): object`。失败时抛 `DataFileError`，`code` 为 `'wrapper'`（前缀、全局变量名或结尾分号不对）或 `'json'`（外壳里不是一个严格 JSON 对象）。
  - `serializeDataFile(globalName: string, data: object): string`
  - `readDataFile(file: string, globalName: string): object`
  - `writeDataFile(file: string, globalName: string, data: object): void`，先写同目录的临时文件再改名。
  - `class DataFileError extends Error`，带 `code`。

- [ ] **Step 1: 写失败的测试**

```js
// tests/unit/data-file.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCRIPTS_DIR } from '../helpers/paths.mjs';

const { parseDataFile, serializeDataFile, readDataFile, writeDataFile, DataFileError } =
  await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));

test('往返后内容不变', () => {
  const d = { version: 1, topic: '宏观经济学 "入门"\n第二行', lessons: [{ id: 'a' }] };
  assert.deepEqual(parseDataFile(serializeDataFile('LEARN_COURSE', d), 'LEARN_COURSE'), d);
});

test('序列化的形态', () => {
  assert.equal(serializeDataFile('LEARN_INDEX', { version: 1 }), 'window.LEARN_INDEX = {\n  "version": 1\n};\n');
});

test('容忍 BOM 和首尾空白', () => {
  assert.deepEqual(parseDataFile('﻿\n  window.LEARN_COURSE = {"version":1};\n\n', 'LEARN_COURSE'), { version: 1 });
});

for (const [name, text, code] of [
  ['键没加引号', 'window.LEARN_COURSE = { version: 1 };', 'json'],
  ['尾逗号', 'window.LEARN_COURSE = { "version": 1, };', 'json'],
  ['注释', 'window.LEARN_COURSE = { /* x */ "version": 1 };', 'json'],
  ['分号后还有语句', 'window.LEARN_COURSE = { "version": 1 }; alert(1);', 'json'],
  ['顶层不是对象', 'window.LEARN_COURSE = [1];', 'json'],
  ['全局变量名不对', 'window.OTHER = { "version": 1 };', 'wrapper'],
  ['缺结尾分号', 'window.LEARN_COURSE = { "version": 1 }', 'wrapper'],
  ['写到一半', 'window.LEARN_COURSE = { "version": 1, "top', 'wrapper'],
]) {
  test(`拒绝：${name}`, () => {
    assert.throws(() => parseDataFile(text, 'LEARN_COURSE'), (e) => e instanceof DataFileError && e.code === code);
  });
}

test('writeDataFile 写完后没有残留的临时文件，内容可读回', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '学习 目录-'));
  const file = path.join(dir, 'course-data.js');
  writeDataFile(file, 'LEARN_COURSE', { version: 1 });
  assert.deepEqual(readdirSync(dir), ['course-data.js']);
  assert.deepEqual(readDataFile(file, 'LEARN_COURSE'), { version: 1 });
  assert.equal(readFileSync(file, 'utf8'), serializeDataFile('LEARN_COURSE', { version: 1 }));
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/data-file.test.mjs`
Expected: FAIL，找不到模块

- [ ] **Step 3: 实现上面五个导出**

解析顺序：去掉 BOM 和首尾空白；检查前缀 `window.<globalName> = ` 和结尾 `;`，不符抛 `wrapper`；对中间部分 `JSON.parse`，失败或结果不是普通对象抛 `json`。

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/unit/data-file.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/learn-anything/skills/learn/scripts/lib tests/unit/data-file.test.mjs
git commit -m "feat: 数据文件读写库，只按严格 JSON 解析"
```

---

### Task 3: 课程核心：校验与进度

**Files:**
- Create: `plugins/learn-anything/skills/learn/assets/course.html`（本任务只放最小的 HTML 骨架和 `<script id="course-core">`）
- Create: `plugins/learn-anything/skills/learn/scripts/validate.mjs`
- Create: `tests/helpers/load-core.mjs`
- Create: `tests/fixtures/valid-minimal/course-data.js`、`tests/fixtures/all-cards/course-data.js`、`tests/fixtures/bad-ref/course-data.js`、`tests/fixtures/not-json/course-data.js`
- Test: `tests/unit/core-validate.test.mjs`、`tests/unit/validate-cli.test.mjs`

**Interfaces:**
- Consumes: `parseDataFile`、`readDataFile`（任务 2）。
- Produces（`window.CourseCore` 的成员，纯逻辑，不碰 DOM）：
  - `CARD_TYPES: string[]`，设计 5.4 的 13 种，按表格顺序。
  - `DEFAULT_CARD_TITLE: Record<string, string>`，设计 5.4 的默认标题。
  - `validateCourse(data, opts?: { dirName?: string }): { errors: string[], warnings: string[] }`，规则见设计 5.6。
  - `progressOf(data): { total, done, mastered, skipped, review }`。`total` 不含 `skipped` 的课。
  - `sourceTag(course, card): { kind: 'refs', titles: string[] } | { kind: 'unverified' } | null`，规则见设计 5.7 的「来源标记」。
  - `inline(text: string): string`，转义后只支持粗体、行内代码和换行。
- Produces（测试辅助）：`loadCore(): CourseCore`、`loadFixture(name): object`、`plain(v)`（把 vm 里的对象转成本 realm 的普通对象）。
- Produces（命令行）：`node validate.mjs <course-data.js>`，退出码 0、1、2，见设计 5.14。

- [ ] **Step 1: 写样例数据**

`valid-minimal`（照抄）：

```js
window.LEARN_COURSE = {
  "version": 1,
  "topic": "示例主题",
  "slug": "valid-minimal",
  "template": null,
  "mission": { "why": "想系统了解", "target": "能讲清主线", "background": "零基础" },
  "approach": "以讲授为主，每课一道简答题检验。",
  "researched": "no",
  "resources": [],
  "updatedAt": "2026-11-17T10:00:00+08:00",
  "resume": { "lesson": "first", "note": "准备开始第 1 课" },
  "review": [],
  "growth": [],
  "lessons": [
    { "id": "first", "title": "第一课", "summary": "这一课讲什么", "status": "current", "mastered": false, "readings": [], "cards": [] },
    { "id": "second", "title": "第二课", "summary": "这一课讲什么", "optional": true, "status": "todo", "mastered": false, "readings": [], "cards": [] }
  ]
};
```

`all-cards`（自己写，必须满足）：

- `slug` 为 `all-cards`，`researched` 为 `"yes"`，`template` 为 `null`。
- 两份资料，id 为 `book-a`（`kind: "book"`）和 `doc-b`（`kind: "doc"`）。
- 三课：`intro`（`done`，`mastered: true`）、`core`（`done`，`mastered: false`）、`wrap`（`current`）。`resume.lesson` 为 `wrap`。
- `review` 有一条，`lesson` 为 `core`。
- 13 种卡片各至少出现一次。`intro` 里有一张带 `refs: ["book-a"]` 的 `points` 卡和一张不带 `refs` 的 `steps` 卡。
- 一张 `html` 卡，内容为 `<b>ok</b><script>window.__pwned=1</script><img src="x" onerror="window.__pwned=1">`。
- 一张 `practice` 卡，两条：第一条只有 `q` 和 `rubric`；第二条有 `q`、`rubric`、`yours`、`ok: false`、`why`、`answer`。
- `intro` 有一条 `readings`，指向 `book-a`。
- 三个面板：一个 `diagram`（至少 4 个节点，分布在三课；含一个带 `until` 的节点、2 条连线、1 个分组、1 条标注、挂在 `core` 和 `wrap` 上的两条 `routes`）；一个 `code`（两个版本，id 为 `v1`、`v2`，分别从 `intro`、`core` 出现）；一个 `timeline`（两个带指标的事件，`3.2 s` 和 `400 ms`，分别从 `intro`、`core` 出现）。
- 整份数据校验后不能有警告：同时可见的节点不占同一格，同一节点的标注不超过 3 条。

`bad-ref`：把 `valid-minimal` 的 `slug` 改为 `bad-ref`，`resume.lesson` 改为 `nope`。
`not-json`：内容为 `window.LEARN_COURSE = { version: 1 };`。

- [ ] **Step 2: 写失败的测试**

```js
// tests/unit/core-validate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadFixture, plain } from '../helpers/load-core.mjs';

const C = loadCore();
const bad = (mutate, dirName = 'valid-minimal') => {
  const d = loadFixture('valid-minimal');
  mutate(d);
  return plain(C.validateCourse(d, { dirName }));
};
const diagram = (nodes, edges = []) => [{ kind: 'diagram', title: 't', nodes, edges, groups: [], annotations: [], routes: [] }];

test('两个合法样例没有错误也没有警告', () => {
  for (const name of ['valid-minimal', 'all-cards']) {
    assert.deepEqual(plain(C.validateCourse(loadFixture(name), { dirName: name })), { errors: [], warnings: [] });
  }
});

for (const [name, mutate, re] of [
  ['缺 topic', (d) => { delete d.topic; }, /topic/],
  ['mission 缺字段', (d) => { delete d.mission.target; }, /mission\.target/],
  ['researched 取值非法', (d) => { d.researched = 'maybe'; }, /researched/],
  ['status 取值非法', (d) => { d.lessons[0].status = 'doing'; }, /status/],
  ['mastered 不是布尔', (d) => { d.lessons[0].mastered = 'yes'; }, /mastered/],
  ['lessons 为空', (d) => { d.lessons = []; }, /lessons/],
  ['课程 id 重复', (d) => { d.lessons[1].id = 'first'; }, /first/],
  ['两个 current', (d) => { d.lessons[1].status = 'current'; }, /current/],
  ['resume 引用不存在的课', (d) => { d.resume.lesson = 'nope'; }, /resume\.lesson/],
  ['review 引用不存在的课', (d) => { d.review = [{ lesson: 'nope', text: 'x' }]; }, /review/],
  ['readings 引用不存在的资料', (d) => { d.lessons[0].readings = [{ resource: 'nope', where: '第 1 章' }]; }, /readings/],
  ['refs 引用不存在的资料', (d) => { d.lessons[0].cards = [{ type: 'points', items: ['x'], refs: ['nope'] }]; }, /refs/],
  ['资料 kind 非法', (d) => { d.resources = [{ id: 'r', kind: 'blog', title: 't', note: 'n' }]; }, /kind/],
  ['卡片缺必需字段', (d) => { d.lessons[0].cards = [{ type: 'points' }]; }, /points/],
  ['practice 条目缺 q', (d) => { d.lessons[0].cards = [{ type: 'practice', items: [{ yours: 'x' }] }]; }, /practice/],
  ['面板 kind 非法', (d) => { d.growth = [{ kind: 'architecture', title: 't' }]; }, /kind/],
  ['since 引用不存在的课', (d) => { d.growth = diagram([{ id: 'a', label: 'A', col: 1, row: 1, since: 'nope' }]); }, /since/],
  ['until 不在 since 之后', (d) => { d.growth = diagram([{ id: 'a', label: 'A', col: 1, row: 1, since: 'second', until: 'first' }]); }, /until/],
  ['连线引用不存在的节点', (d) => { d.growth = diagram([{ id: 'a', label: 'A', col: 1, row: 1, since: 'first' }], [{ from: 'a', to: 'zz', since: 'first' }]); }, /zz/],
]) {
  test(`报错：${name}`, () => assert.match(bad(mutate).errors.join('\n'), re));
}

test('警告：slug 与目录名不一致', () => {
  const r = bad(() => {}, 'other-dir');
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join('\n'), /slug/);
});

test('警告：未知卡片类型', () => {
  const r = bad((d) => { d.lessons[0].cards = [{ type: 'mystery', foo: 1 }]; });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join('\n'), /mystery/);
});

test('待回顾条目的 lesson 可以是 null', () => {
  assert.deepEqual(bad((d) => { d.review = [{ lesson: null, text: 'x' }]; }).errors, []);
});

test('progressOf 分开统计已讲和已掌握', () => {
  const d = loadFixture('valid-minimal');
  const L = (id, status, mastered) => ({ id, title: id, summary: id, status, mastered, readings: [], cards: [] });
  d.lessons = [L('a', 'done', true), L('b', 'done', false), L('c', 'current', false), L('d', 'skipped', false), L('e', 'todo', false)];
  d.review = [{ lesson: 'b', text: 'x' }, { lesson: null, text: 'y' }];
  assert.deepEqual(plain(C.progressOf(d)), { total: 4, done: 2, mastered: 1, skipped: 1, review: 2 });
});

test('sourceTag 的规则', () => {
  const course = { researched: 'yes', resources: [{ id: 'r1', title: '《宏观经济学》' }] };
  assert.deepEqual(plain(C.sourceTag(course, { type: 'points', refs: ['r1'] })), { kind: 'refs', titles: ['《宏观经济学》'] });
  assert.deepEqual(plain(C.sourceTag(course, { type: 'points' })), { kind: 'unverified' });
  for (const type of ['questions', 'practice', 'note']) assert.equal(C.sourceTag(course, { type }), null);
  assert.equal(C.sourceTag({ ...course, researched: 'skipped' }, { type: 'points', refs: ['r1'] }), null);
  assert.equal(C.sourceTag({ ...course, researched: 'no' }, { type: 'points' }), null);
});

test('inline 只支持粗体、行内代码和换行', () => {
  assert.equal(C.inline('a **b** `c<d>`\ne'), 'a <strong>b</strong> <code>c&lt;d&gt;</code><br>e');
  assert.equal(C.inline('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');
});

test('卡片类型和默认标题', () => {
  assert.deepEqual(plain(C.CARD_TYPES), ['points', 'steps', 'quote', 'problem', 'qa', 'questions', 'practice', 'table', 'compare', 'chips', 'code', 'note', 'html']);
  assert.equal(C.DEFAULT_CARD_TITLE.quote, '一句话总结');
  assert.equal(C.DEFAULT_CARD_TITLE.problem, '思考题');
  assert.equal(C.DEFAULT_CARD_TITLE.practice, '你的练习');
});
```

```js
// tests/unit/validate-cli.test.mjs
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
```

- [ ] **Step 3: 运行，确认失败**

Run: `node --test tests/unit`
Expected: FAIL，找不到 `load-core.mjs`

- [ ] **Step 4: 实现**

- `tests/helpers/load-core.mjs`：用正则从 `course.html` 抽出 `<script id="course-core">` 的内容，在 `vm.runInNewContext` 里执行，返回 `window.CourseCore`。`loadFixture` 用 `readDataFile` 读样例。
- `course.html`：合法的 HTML 骨架，加一个 `<script id="course-core">`，里面实现本任务的 `CourseCore` 成员。
- `validate.mjs`：用 `readDataFile` 读文件；`DataFileError` 时输出一行 `✗ ...不是严格 JSON...` 并退出 1。用和 `load-core` 同样的办法取得 `validateCourse`，把数据文件所在目录的名字作为 `dirName` 传入。错误行以 `✗ ` 开头，警告行以 `△ ` 开头，通过时输出以 `✓ ` 开头的一行。

- [ ] **Step 5: 运行，确认通过**

Run: `node --test tests/unit`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add plugins/learn-anything/skills/learn/assets/course.html plugins/learn-anything/skills/learn/scripts/validate.mjs tests
git commit -m "feat: 课程数据校验与进度统计，页面与命令行共用一份逻辑"
```

---

### Task 4: 课程核心：生长面板的计算

**Files:**
- Modify: `plugins/learn-anything/skills/learn/assets/course.html`（`course-core` 脚本块）
- Test: `tests/unit/core-growth.test.mjs`

**Interfaces:**
- Consumes: 任务 3 的 `course-core` 和 `loadCore`、`plain`。
- Produces（`CourseCore` 新增成员）：
  - `GRID: { colW: 160, rowH: 130, nodeW: 112, nodeH: 40 }`
  - `diagramAt(panel, lessons, lessonId): { nodes, edges, groups, annotations, route, width, height, warnings }`
    - `nodes[]`: `{ id, label, style, x, y, w, h, isNew }`。`span` 为 n 时 `w = nodeW + colW * (n - 1)`。
    - `edges[]`: `{ from, to, label, style, points, isNew }`；`groups[]`: `{ id, label, x, y, w, h, isNew }`；`annotations[]`: `{ node, text, x, y, isNew }`。
    - `route`: `null`，或 `{ steps: [{ node, numbers: number[] }] }`，按节点首次出现的顺序排列。
    - `warnings: string[]`：同格节点、同一节点的标注超过 3 条。
  - `diffLines(prev: string, next: string): boolean[]`，对 `next` 的每一行给出是否新增或改动。
  - `codeStateAt(panel, lessons, lessonId, versionId?): { versions: [{ id, label }], current: { id, label, language, note, lines: [{ text, changed }] } | null }`。`versions` 只含当前课可见的版本；不传 `versionId` 时 `current` 是最后一个可见版本；第一个版本的各行 `changed` 都是 `false`。
  - `timelineAt(panel, lessons, lessonId): { events: [{ title, detail, metricText, ratio, better, isNew }] }`。`ratio` 是换算到同一单位后与最大值的比，没有指标时为 `null`。`better` 表示比第一个带指标的事件更好。单位换算支持 `s`、`ms`、`us`、`min` 和 `B`、`KB`、`MB`、`GB`。
  - `addedAt(course, lessonId): string[]`，这一课新增元素的名字（节点、连线、分组的 `label`，标注的 `text`，版本的 `label`，事件的 `title`）。
  - `validateCourse` 把各课 `diagramAt` 的 `warnings` 并入自己的 `warnings`（去重）。警告文字里写节点 id，不写课程名，这样同一个问题在多课出现时只报一次。

- [ ] **Step 1: 写失败的测试**

```js
// tests/unit/core-growth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, loadFixture, plain } from '../helpers/load-core.mjs';

const C = loadCore();
const lessons = ['l1', 'l2', 'l3'].map((id) => ({ id }));
const panel = {
  kind: 'diagram', title: 't',
  nodes: [
    { id: 'a', label: 'A', col: 1, row: 1, since: 'l1' },
    { id: 'box', label: '黑盒', col: 2, row: 1, style: 'ghost', since: 'l1', until: 'l2' },
    { id: 'b', label: 'B', col: 2, row: 1, since: 'l2' },
    { id: 'c', label: 'C', col: 3, row: 2, span: 2, since: 'l3' },
  ],
  edges: [{ from: 'a', to: 'b', label: '调用', since: 'l2' }, { from: 'b', to: 'c', style: 'dashed', since: 'l3' }],
  groups: [{ id: 'g', label: '组', members: ['a', 'b'], since: 'l2' }],
  annotations: [{ node: 'b', text: '关键参数', since: 'l3' }],
  routes: [{ lesson: 'l2', steps: ['a', 'b', 'a'] }, { lesson: 'l3', steps: ['a', 'b', 'c'] }],
};
const at = (id, p = panel) => plain(C.diagramAt(p, lessons, id));
const node = (s, id) => s.nodes.find((n) => n.id === id);

test('节点按课出现和消失，位置不变', () => {
  assert.deepEqual(at('l1').nodes.map((n) => n.id), ['a', 'box']);
  assert.deepEqual(at('l2').nodes.map((n) => n.id), ['a', 'b']);
  assert.deepEqual(at('l3').nodes.map((n) => n.id), ['a', 'b', 'c']);
  assert.deepEqual([node(at('l1'), 'a').x, node(at('l1'), 'a').y], [node(at('l3'), 'a').x, node(at('l3'), 'a').y]);
});

test('本课新增的元素带 isNew', () => {
  const s = at('l2');
  assert.deepEqual(s.nodes.filter((n) => n.isNew).map((n) => n.id), ['b']);
  assert.equal(s.edges.length, 1);
  assert.equal(s.edges[0].isNew, true);
  assert.equal(at('l3').edges[0].isNew, false);
});

test('网格换算和 span', () => {
  const s = at('l3');
  assert.deepEqual(plain(C.GRID), { colW: 160, rowH: 130, nodeW: 112, nodeH: 40 });
  assert.equal(node(s, 'c').x - node(s, 'a').x, 2 * C.GRID.colW);
  assert.equal(node(s, 'c').y - node(s, 'a').y, C.GRID.rowH);
  assert.equal(node(s, 'a').w, C.GRID.nodeW);
  assert.equal(node(s, 'c').w, C.GRID.nodeW + C.GRID.colW);
});

test('路线：最新的一条生效，重复经过的节点有多个编号', () => {
  assert.equal(at('l1').route, null);
  assert.deepEqual(at('l2').route.steps, [{ node: 'a', numbers: [1, 3] }, { node: 'b', numbers: [2] }]);
  assert.deepEqual(at('l3').route.steps.map((s) => s.node), ['a', 'b', 'c']);
});

test('分组边界包住可见成员', () => {
  const s = at('l2');
  const g = s.groups[0];
  for (const id of ['a', 'b']) {
    const n = node(s, id);
    assert.ok(g.x <= n.x && g.y <= n.y && g.x + g.w >= n.x + n.w && g.y + g.h >= n.y + n.h);
  }
});

test('同格节点和过多标注给出警告，并进入 validateCourse', () => {
  const p = structuredClone(panel);
  p.nodes.push({ id: 'd', label: 'D', col: 1, row: 1, since: 'l1' });
  for (const t of ['一', '二', '三']) p.annotations.push({ node: 'b', text: t, since: 'l3' });
  assert.match(at('l1', p).warnings.join('\n'), /a.*d|d.*a/);
  assert.match(at('l3', p).warnings.join('\n'), /b/);
  const d = loadFixture('valid-minimal');
  d.growth = [{ kind: 'diagram', title: 't', edges: [], groups: [], annotations: [], routes: [],
    nodes: [{ id: 'a', label: 'A', col: 1, row: 1, since: 'first' }, { id: 'd', label: 'D', col: 1, row: 1, since: 'first' }] }];
  const r = plain(C.validateCourse(d, { dirName: 'valid-minimal' }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});

test('diffLines 标出新增和改动的行', () => {
  assert.deepEqual(plain(C.diffLines('a\nb\nc', 'a\nB\nc\nd')), [false, true, false, true]);
});

test('代码面板：默认显示最后一个可见版本，可指定版本', () => {
  const cp = { kind: 'code', title: 't', versions: [
    { id: 'v1', since: 'l1', label: 'v1', language: 'go', code: 'a\nb' },
    { id: 'v2', since: 'l2', label: 'v2', code: 'a\nb\nc' },
  ] };
  const s1 = plain(C.codeStateAt(cp, lessons, 'l1'));
  assert.deepEqual(s1.versions.map((v) => v.id), ['v1']);
  assert.deepEqual(s1.current.lines.map((l) => l.changed), [false, false]);
  const s3 = plain(C.codeStateAt(cp, lessons, 'l3'));
  assert.equal(s3.current.id, 'v2');
  assert.deepEqual(s3.current.lines, [{ text: 'a', changed: false }, { text: 'b', changed: false }, { text: 'c', changed: true }]);
  assert.equal(C.codeStateAt(cp, lessons, 'l3', 'v1').current.id, 'v1');
});

test('时间线：单位换算、比例和好坏', () => {
  const tp = { kind: 'timeline', title: 't', metricLabel: 'P99', events: [
    { since: 'l1', title: '告警', metric: { value: 3.2, unit: 's' } },
    { since: 'l2', title: '无指标' },
    { since: 'l3', title: '修复', metric: { value: 400, unit: 'ms' } },
  ] };
  const e = plain(C.timelineAt(tp, lessons, 'l3').events);
  assert.deepEqual(e.map((x) => x.ratio), [1, null, 0.125]);
  assert.deepEqual(e.map((x) => x.better), [false, false, true]);
  assert.equal(C.timelineAt(tp, lessons, 'l1').events.length, 1);
  const hi = { kind: 'timeline', title: 't', better: 'higher', events: [
    { since: 'l1', title: '前', metric: { value: 100, unit: 'qps' } },
    { since: 'l2', title: '后', metric: { value: 400, unit: 'qps' } },
  ] };
  assert.deepEqual(plain(C.timelineAt(hi, lessons, 'l2').events.map((x) => x.better)), [false, true]);
});

test('addedAt 列出本课新增元素的名字', () => {
  const cp = { kind: 'code', title: 't', versions: [{ id: 'v2', since: 'l2', label: 'v2', code: 'x' }] };
  const list = plain(C.addedAt({ lessons, growth: [panel, cp] }, 'l2'));
  for (const name of ['B', '调用', '组', 'v2']) assert.ok(list.includes(name), name);
  assert.ok(!list.includes('A'));
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/core-growth.test.mjs`
Expected: FAIL，`C.diagramAt is not a function`

- [ ] **Step 3: 在 `course-core` 里实现上述成员**

`diffLines` 用最长公共子序列：`next` 中不在公共子序列里的行记为 `true`。连线的 `points` 只需连接两个节点的边缘，路由算法自定。

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/unit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/learn-anything/skills/learn/assets/course.html tests/unit/core-growth.test.mjs
git commit -m "feat: 生长面板的布局、对比和时间线计算"
```

---

### Task 5: 课程页渲染（不含生长面板）

**Files:**
- Modify: `plugins/learn-anything/skills/learn/assets/course.html`（样式、页面结构、`<script id="course-app">`）
- Create: `tests/helpers/browser.mjs`
- Modify: `tests/run-all.sh`（加入页面测试，有测试被跳过即算失败）
- Test: `tests/e2e/course.e2e.test.mjs`

**Interfaces:**
- Consumes: `CourseCore`（任务 3、4），样例 `valid-minimal`、`all-cards`。
- Produces（页面的 DOM 约定，后续任务和测试依赖它）：
  - `#topic`、`#mission`、`#approach`、`#resume-note`、`#progress`
  - `#notice`（有 `notice` 时可见）、`#unresearched-banner`（`researched` 为 `"no"` 时可见，文字含「大纲未经资料核对」）、`#errors-box`
  - `#lessons li[data-lesson-id][data-status][data-mastered]`；已掌握的课显示「已掌握」，`done` 但未掌握的显示「已讲」；正在看的课带 `aria-current="true"`
  - `#review li`、`#resources li[data-resource-id]`、`#readings li`
  - `#cards .card[data-type]`；来源标记是 `.card .source-tag[data-kind="refs"|"unverified"]`，未核对的文字为「未核对」
  - `#growth`（没有面板时隐藏；内容在任务 6 实现）
- Produces（测试辅助，`tests/helpers/browser.mjs`）：
  - `launchBrowser(): Promise<{ browser } | { skip: string }>`，依次尝试本机 Chrome 和 playwright 自带的 Chromium；`playwright-core` 从本地、`PLAYWRIGHT_CORE_PATH`、`npm root -g` 下查找。
  - `makeCourseDir(fixtureName, { root?, slug? }): string`，在临时目录里放好 `course.html` 和 `course-data.js`，返回课程目录。默认的临时目录名含空格和中文。
  - `openPage(browser, url, opts?): Promise<{ page, context, consoleErrors, requests }>`
  - `rewriteData(file, mutate): object`，用 `readDataFile` 和 `writeDataFile` 改数据。
  - `fileUrl(p): string`

- [ ] **Step 1: 写失败的测试**

每个测试开头：`const b = await launchBrowser(); if (b.skip) return t.skip(b.skip);`。等待页面刷新时用 `expect` 式的轮询，上限 8 秒。

```js
// tests/e2e/course.e2e.test.mjs（节选关键断言；其余样板按上面的约定写）
test('B1 离线：只请求 file: 地址，路径含空格和中文', async (t) => {
  const dir = makeCourseDir('all-cards');
  const { requests, consoleErrors } = await openPage(browser, fileUrl(path.join(dir, 'course.html')));
  assert.ok(requests.length > 0 && requests.every((u) => u.startsWith('file:')));
  assert.deepEqual(consoleErrors, []);
});

test('B2 新开的课：没有生长区，没有报错，显示未核对提示', async (t) => {
  // valid-minimal
  assert.equal(await page.locator('#growth').isHidden(), true);
  assert.equal(await page.locator('#lessons li').count(), 2);
  assert.equal(await page.locator('#errors-box').isHidden(), true);
  assert.match(await page.locator('#unresearched-banner').innerText(), /大纲未经资料核对/);
  assert.equal(await page.locator('#topic').innerText(), '示例主题');
});

test('B3 十三种卡片都能渲染，html 卡里的脚本不执行', async (t) => {
  // all-cards；逐课点击 #lessons li，收集出现过的 data-type
  assert.deepEqual([...seen].sort(), [...C.CARD_TYPES].sort());
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator('.card[data-type="html"] script, .card[data-type="html"] [onerror]').count(), 0);
});

test('B4 「已讲」和「已掌握」分开显示', async (t) => {
  const intro = page.locator('#lessons li[data-lesson-id="intro"]');
  const core = page.locator('#lessons li[data-lesson-id="core"]');
  assert.equal(await intro.getAttribute('data-mastered'), 'true');
  assert.match(await intro.innerText(), /已掌握/);
  assert.equal(await core.getAttribute('data-mastered'), 'false');
  assert.match(await core.innerText(), /已讲/);
  assert.doesNotMatch(await core.innerText(), /已掌握/);
});

test('B5 来源标记随 researched 变化', async (t) => {
  // 看 intro 课
  assert.match(await page.locator('.card[data-type="points"] .source-tag[data-kind="refs"]').first().innerText(), new RegExp(bookTitle));
  assert.equal(await page.locator('.card[data-type="steps"] .source-tag[data-kind="unverified"]').first().innerText(), '未核对');
  assert.equal(await page.locator('.card[data-type="practice"] .source-tag, .card[data-type="questions"] .source-tag, .card[data-type="note"] .source-tag').count(), 0);
  rewriteData(file, (d) => { d.researched = 'skipped'; });
  // 等刷新后
  assert.equal(await page.locator('.source-tag').count(), 0);
  assert.equal(await page.locator('#unresearched-banner').isHidden(), true);
});

test('B6 自动刷新保留正在看的课，断点变了才跳转', async (t) => {
  // 点 intro；改 topic；等刷新
  assert.equal(await current(), 'intro');
  rewriteData(file, (d) => { d.resume.lesson = 'core'; });
  // 等刷新后
  assert.equal(await current(), 'core');
});

test('B7 数据写到一半：提示错误并保留上次内容，修好后恢复', async (t) => {
  const good = readFileSync(file, 'utf8');
  writeFileSync(file, good.slice(0, Math.floor(good.length / 2)));
  // 等到 #errors-box 可见
  assert.equal(await page.locator('#topic').innerText(), topicBefore);
  assert.ok((await page.locator('#cards .card').count()) > 0);
  writeFileSync(file, good);
  // 等到 #errors-box 隐藏
});

test('B8 方向键切课；深色和窄屏下没有横向滚动', async (t) => {
  await page.keyboard.press('ArrowLeft');
  assert.equal(await current(), 'core');
  // colorScheme: 'dark'、viewport 宽 390 各开一页
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
});

test('B9 练习卡：未作答时不显示参考答案，没掌握时显示缺口', async (t) => {
  const items = page.locator('.card[data-type="practice"] li');
  assert.doesNotMatch(await items.nth(0).innerText(), /参考答案/);
  assert.match(await items.nth(1).innerText(), /参考答案/);
  assert.match(await items.nth(1).innerText(), new RegExp(whyText));
});

test('B10 notice 提示条', async (t) => {
  rewriteData(file, (d) => { d.notice = '示范案例，请换成你自己的经历'; });
  // 等刷新后
  assert.equal(await page.locator('#notice').innerText(), '示范案例，请换成你自己的经历');
});

test('B11 页头、待回顾、资料清单和延伸阅读', async (t) => {
  // valid-minimal
  assert.match(await page.locator('#mission').innerText(), /能讲清主线/);
  assert.match(await page.locator('#approach').innerText(), /以讲授为主/);
  assert.match(await page.locator('#resume-note').innerText(), /准备开始第 1 课/);
  // all-cards，看 intro 课
  assert.equal(await page.locator('#review li').count(), 1);
  assert.deepEqual(await page.locator('#resources li').evaluateAll((els) => els.map((e) => e.dataset.resourceId)), ['book-a', 'doc-b']);
  assert.equal(await page.locator('#readings li').count(), 1);
  assert.match(await page.locator('#progress').innerText(), /2\s*\/\s*3/);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test --test-concurrency=1 tests/e2e`
Expected: FAIL（页面还没有内容）。如果全部被跳过，先解决浏览器驱动的问题再继续。

- [ ] **Step 3: 实现页面**

- 加载：每次新建 `<script src="course-data.js?t=<时间戳>">`，加载前把 `window.LEARN_COURSE` 置空，加载后移除标签；用内容指纹判断是否需要重新渲染。
- 出错的三种情况分别提示：文件不存在、语法错误、没有给 `LEARN_COURSE` 赋值。任何一种都保留上一次成功渲染的内容。
- `html` 卡片渲染前清洗：移除 `script`、`iframe` 等标签和所有 `on*` 属性；`src`、`href` 只放行页内锚点和 `data:image`。
- 单张卡片渲染出错只影响这一张。
- 视觉设计自定，满足设计 5.7。不引用任何外部资源。

- [ ] **Step 4: 运行，确认通过**

Run: `bash tests/run-all.sh`
Expected: 全部通过，没有被跳过的测试

- [ ] **Step 5: 提交**

```bash
git add plugins/learn-anything/skills/learn/assets/course.html tests
git commit -m "feat: 课程页：大纲与进度、卡片、来源标记、自动刷新与容错"
```

---

### Task 6: 课程页的生长面板

**Files:**
- Modify: `plugins/learn-anything/skills/learn/assets/course.html`（`course-app`）
- Test: `tests/e2e/growth.e2e.test.mjs`

**Interfaces:**
- Consumes: `diagramAt`、`codeStateAt`、`timelineAt`、`addedAt`（任务 4），任务 5 的页面和辅助函数。
- Produces（DOM 约定）：
  - `#growth [data-panel="diagram"|"code"|"timeline"]`
  - `diagram`：内联 SVG；节点 `.node[data-node-id]`，本课新增的带 `.is-new`；路线编号 `.route-num`；导出按钮 `[data-export="svg"]`、`[data-export="png"]`
  - `code`：行 `.code-line`，改动的带 `.changed`；版本切换 `.version-chip[data-version]`
  - `timeline`：事件 `.event`，指标条 `.bar`
  - `#added .chip`（本课新增）、`#play`（播放生长，每 1800 毫秒前进一课，再点一次停止）

- [ ] **Step 1: 写失败的测试**

期望值不写死，用 `loadCore()` 对同一份样例算出来再和页面比较。

```js
// tests/e2e/growth.e2e.test.mjs（关键断言）
test('G1 图逐课生长，新增元素有标记', async (t) => {
  for (const id of ['intro', 'core', 'wrap']) {
    // 点到这一课
    const s = C.diagramAt(panel, data.lessons, id);
    assert.equal(await page.locator('[data-panel="diagram"] .node').count(), s.nodes.length);
    assert.equal(await page.locator('[data-panel="diagram"] .node.is-new').count(), s.nodes.filter((n) => n.isNew).length);
  }
});

test('G2 路线编号与计算结果一致', async (t) => {
  const expected = C.diagramAt(panel, data.lessons, 'wrap').route.steps.flatMap((s) => s.numbers).sort((a, b) => a - b).join(',');
  const actual = (await page.locator('.route-num').allInnerTexts()).flatMap((x) => x.split(/\D+/).filter(Boolean)).map(Number).sort((a, b) => a - b).join(',');
  assert.equal(actual, expected);
});

test('G3 代码面板高亮改动的行，可切换版本', async (t) => {
  const s = C.codeStateAt(codePanel, data.lessons, 'wrap');
  assert.equal(await page.locator('[data-panel="code"] .code-line.changed').count(), s.current.lines.filter((l) => l.changed).length);
  await page.locator('.version-chip[data-version="v1"]').click();
  assert.equal(await page.locator('[data-panel="code"] .code-line.changed').count(), 0);
});

test('G4 时间线的条形宽度成比例', async (t) => {
  const widths = await page.locator('[data-panel="timeline"] .bar').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  assert.ok(Math.abs(widths[1] / widths[0] - 0.125) < 0.02);
});

test('G5 本课新增', async (t) => {
  assert.deepEqual((await page.locator('#added .chip').allInnerTexts()).sort(), [...C.addedAt(data, 'core')].sort());
});

test('G6 播放生长逐课前进，可停止', async (t) => {
  // 从 intro 开始点 #play，等 2 秒
  assert.equal(await current(), 'core');
  await page.locator('#play').click();
  // 再等 2.5 秒
  assert.equal(await current(), 'core');
});

test('G7 导出 SVG 和 PNG', async (t) => {
  const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export="svg"]').click()]);
  assert.match(svg.suggestedFilename(), /\.svg$/);
  assert.match(readFileSync(await svg.path(), 'utf8'), /<svg/);
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('[data-export="png"]').click()]);
  assert.match(png.suggestedFilename(), /\.png$/);
  assert.ok(statSync(await png.path()).size > 0);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test --test-concurrency=1 tests/e2e/growth.e2e.test.mjs`
Expected: FAIL，找不到 `[data-panel="diagram"]`

- [ ] **Step 3: 实现三种面板的渲染、本课新增、播放和导出**

导出 SVG 时内联样式，使文件脱离页面也能正常显示；导出 PNG 时按 2 倍分辨率绘制。新增元素有出现动画，系统设置了减少动效时不播放。

- [ ] **Step 4: 运行，确认通过**

Run: `bash tests/run-all.sh`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add plugins/learn-anything/skills/learn/assets/course.html tests/e2e/growth.e2e.test.mjs
git commit -m "feat: 课程页的生长面板、播放与导出"
```

---

### Task 7: 总览页

**Files:**
- Create: `plugins/learn-anything/skills/learn/assets/index.html`
- Test: `tests/e2e/index.e2e.test.mjs`

**Interfaces:**
- Consumes: `LEARN_INDEX` 和 `LEARN_COURSE` 的形态（设计 5.2），`progressOf` 的口径（任务 3）。总览页是独立的单文件，自己带一份等价的统计逻辑。
- Produces（DOM 约定）：
  - `.course-card[data-slug]`，内含 `.done-count`（如 `2/3`）、`.mastered-count`、`.review-count`、`.template-tag`（没有模板时不出现）、`.resume-note`，整张卡片是指向 `<dir>/course.html` 的链接。
  - `.load-failures li[data-reason="missing"|"syntax"|"unsafe"]`
  - `#empty-hint`（没有 `index-data.js` 或没有课程时可见）

- [ ] **Step 1: 写失败的测试**

```js
// tests/e2e/index.e2e.test.mjs（关键断言）
test('I1 按更新时间倒序，跨时区比较', async (t) => {
  // a: "2026-11-17T08:00:00+08:00"；b: "2026-11-17T01:00:00+00:00"（更晚）
  assert.deepEqual(await page.locator('.course-card').evaluateAll((els) => els.map((e) => e.dataset.slug)), ['b', 'a']);
});

test('I2 每门课的统计与 progressOf 一致', async (t) => {
  const p = C.progressOf(loadFixture('all-cards'));
  const card = page.locator('.course-card[data-slug="all-cards"]');
  assert.equal(await card.locator('.done-count').innerText(), `${p.done}/${p.total}`);
  assert.match(await card.locator('.mastered-count').innerText(), new RegExp(String(p.mastered)));
  assert.match(await card.locator('.review-count').innerText(), new RegExp(String(p.review)));
  assert.equal(await card.locator('.template-tag').count(), 0);
  assert.match(await card.getAttribute('href'), /all-cards\/course\.html$/);
});

test('I3 登记了但目录不存在的课，单独列出', async (t) => {
  assert.equal(await page.locator('.load-failures li[data-reason="missing"]').count(), 1);
  assert.equal(await page.locator('.course-card').count(), 1);
});

test('I4 数据文件有语法错误的课，单独列出', async (t) => {
  assert.equal(await page.locator('.load-failures li[data-reason="syntax"]').count(), 1);
});

test('I5 拒绝不安全的目录，不发出外部请求', async (t) => {
  // dir 分别为 "../x"、"http://example.com/x"、"/abs"
  assert.equal(await page.locator('.load-failures li[data-reason="unsafe"]').count(), 3);
  assert.ok(requests.every((u) => u.startsWith('file:')));
});

test('I6 没有 index-data.js 时给出提示，不报错', async (t) => {
  assert.equal(await page.locator('#empty-hint').isVisible(), true);
});

test('I7 五秒左右发现新登记的课', async (t) => {
  // 页面打开后往 index-data.js 里加一门课，等 8 秒以内
  assert.equal(await page.locator('.course-card').count(), 2);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test --test-concurrency=1 tests/e2e/index.e2e.test.mjs`
Expected: FAIL，`index.html` 不存在

- [ ] **Step 3: 实现总览页**

各课的数据文件按顺序逐个加载，因为它们写的是同一个全局变量。目录的安全检查在发出任何加载之前做。

- [ ] **Step 4: 运行，确认通过**

Run: `bash tests/run-all.sh`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add plugins/learn-anything/skills/learn/assets/index.html tests/e2e/index.e2e.test.mjs
git commit -m "feat: 课程总览页"
```

---

### Task 8: 建课脚本

**Files:**
- Create: `plugins/learn-anything/skills/learn/scripts/new-course.mjs`
- Test: `tests/unit/new-course.test.mjs`

**Interfaces:**
- Consumes: `readDataFile`、`writeDataFile`（任务 2），`assets/course.html`、`assets/index.html`。
- Produces:
  - `createCourse(coursesDir: string, slug: string): { dir: string, coursePage: string }`，失败时抛带 `code` 的错误：`'slug'`（不符合 `^[a-z0-9]+(-[a-z0-9]+)*$`）或 `'exists'`（目录已存在）。
  - 命令行 `node new-course.mjs <courses_dir> <slug>`：成功时输出课程页的绝对路径，退出码 0；`slug` 或 `exists` 错误退出码 1；缺参数退出码 2。

- [ ] **Step 1: 写失败的测试**

```js
// tests/unit/new-course.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ASSETS_DIR, SCRIPTS_DIR } from '../helpers/paths.mjs';

const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const run = (...args) => spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'new-course.mjs'), ...args], { encoding: 'utf8' });
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'la-'));
const index = (home) => readDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX');

test('建课：复制模板并登记，不写课程数据', () => {
  const home = tmp();
  const r = run(home, 'macro-intro');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), path.join(home, 'macro-intro', 'course.html'));
  assert.deepEqual(readFileSync(path.join(home, 'macro-intro/course.html')), readFileSync(path.join(ASSETS_DIR, 'course.html')));
  assert.deepEqual(readFileSync(path.join(home, 'index.html')), readFileSync(path.join(ASSETS_DIR, 'index.html')));
  assert.deepEqual(index(home), { version: 1, courses: [{ slug: 'macro-intro', dir: 'macro-intro' }] });
  assert.equal(existsSync(path.join(home, 'macro-intro/course-data.js')), false);
});

test('第二门课追加登记，不覆盖已有的 index.html', () => {
  const home = tmp();
  run(home, 'first-course');
  writeFileSync(path.join(home, 'index.html'), 'MARK');
  assert.equal(run(home, 'second-course').status, 0);
  assert.equal(readFileSync(path.join(home, 'index.html'), 'utf8'), 'MARK');
  assert.deepEqual(index(home).courses.map((c) => c.slug), ['first-course', 'second-course']);
});

test('目录已存在时拒绝，登记不变', () => {
  const home = tmp();
  run(home, 'dup');
  assert.equal(run(home, 'dup').status, 1);
  assert.equal(index(home).courses.length, 1);
});

test('slug 不合法时拒绝，不创建任何东西', () => {
  const home = tmp();
  for (const slug of ['Bad_Slug', 'a--b', '-a', '中文']) assert.equal(run(home, slug).status, 1);
  assert.deepEqual(readdirSync(home), []);
});

test('缺参数：退出码 2', () => assert.equal(run(tmp()).status, 2));

test('课程目录不存在时自动创建，路径可以含空格和中文', () => {
  const home = path.join(tmp(), '我的 课程');
  assert.equal(run(home, 'ok-course').status, 0);
  assert.equal(existsSync(path.join(home, 'ok-course/course.html')), true);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/new-course.test.mjs`
Expected: FAIL，找不到脚本

- [ ] **Step 3: 实现 `createCourse` 和命令行入口**

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/unit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/learn-anything/skills/learn/scripts/new-course.mjs tests/unit/new-course.test.mjs
git commit -m "feat: 建课脚本"
```

---

### Task 9: 两个子代理

**Files:**
- Create: `plugins/learn-anything/agents/course-researcher.md`
- Create: `plugins/learn-anything/agents/answer-grader.md`
- Create: `tests/helpers/frontmatter.mjs`
- Test: `tests/unit/agents-lint.test.mjs`

**Interfaces:**
- Produces:
  - `frontmatter(text: string): { data: Record<string, string>, body: string }`，解析 `---` 之间的 `key: value` 行，只在第一个冒号处切分，值两端的引号去掉。
  - `course-researcher` 的输出：一份 Markdown，固定五个二级标题，依次为 `## 资料清单`、`## 大纲草案`、`## 上法建议`、`## 资料缺口`、`## 未核实`。
    - 资料清单是表格，列为：id、类型、标题、作者、链接、说明、核实情况。id 用英文 kebab-case，类型用设计 5.3 的 `kind` 取值。
    - 大纲草案每课一行：`序号. 标题 —— 一句话说明；延伸阅读：<资料 id> <章节>；（可选）`。
  - `answer-grader` 的输出：只有一个 JSON 对象，`{"mastered": true|false, "hits": string[], "misses": string[], "feedback": string}`。

- [ ] **Step 1: 写失败的测试**

```js
// tests/unit/agents-lint.test.mjs
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

test('answer-grader：名字、不带写入和联网工具、输出约定', () => {
  const { data, body } = agent('answer-grader');
  assert.equal(data.name, 'answer-grader');
  for (const tool of ['WebSearch', 'WebFetch', 'Write', 'Edit', 'Bash']) assert.ok(!(data.tools || '').includes(tool), tool);
  for (const key of ['"mastered"', '"hits"', '"misses"', '"feedback"']) assert.ok(body.includes(key), key);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/agents-lint.test.mjs`
Expected: FAIL，文件不存在

- [ ] **Step 3: 写两个子代理的定义**

正文按设计 5.12 写清输入、任务、规则和上面的输出格式。`course-researcher` 要写明：章节号必须在目录原文里核对过，核对不了就只写书名并列入「未核实」；不把营销内容当资料；学习者指定的书必须进入资料清单。`answer-grader` 要写明：只依据题目、评分标准和学习者的原话；不读任何文件；不因表达流畅判为掌握；只输出 JSON。`answer-grader` 的 `tools` 只列一个最小的只读工具。

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/unit` 和 `claude plugin validate plugins/learn-anything --strict`
Expected: 都通过

- [ ] **Step 5: 实测子代理的调用名**

Run: `claude --plugin-dir plugins/learn-anything -p "只回答：你能调用的子代理类型里，名字包含 learn-anything 的有哪些？逐个列出完整名字。"`
Expected: 输出里有两个子代理的完整名字，预期是 `learn-anything:course-researcher` 和 `learn-anything:answer-grader`。把实际的名字记在本文件这一步下面，任务 11 要用。

- [ ] **Step 6: 提交**

```bash
git add plugins/learn-anything/agents tests/helpers/frontmatter.mjs tests/unit/agents-lint.test.mjs
git commit -m "feat: 开题调研和独立评分两个子代理"
```

---

### Task 10: SessionStart 提醒

**Files:**
- Create: `plugins/learn-anything/skills/learn/scripts/review-reminder.mjs`
- Create: `plugins/learn-anything/hooks/hooks.json`
- Test: `tests/unit/review-reminder.test.mjs`

**Interfaces:**
- Consumes: `readDataFile`（任务 2）。
- Produces:
  - `runReminder({ coursesDir, stateDir, today }): string | null`。`today` 是 `YYYY-MM-DD`。要提醒时返回一行 JSON 文本并把日期写入 `<stateDir>/review-reminder.json`（内容为 `{"lastReminded":"YYYY-MM-DD"}`）；不提醒时返回 `null`，不写任何文件。
  - 命令行 `node review-reminder.mjs <courses_dir>`：`stateDir` 取环境变量 `CLAUDE_PLUGIN_DATA`，没有时取 `~/.cache/learn-anything`；`today` 取本地日期。有返回值就打印到标准输出。任何情况下退出码都是 0，不向标准错误输出。
  - 提醒文字固定为：`learn-anything：<课数> 门课共有 <条数> 条待回顾，说「继续学习」可以先回顾。`，课数只算有待回顾条目的课。
  - `hooks.json`：`SessionStart`，`matcher` 为 `startup`，exec 形式，`command` 为 `node`，`args` 为 `["${CLAUDE_PLUGIN_ROOT}/skills/learn/scripts/review-reminder.mjs", "${user_config.courses_dir}"]`，`timeout` 为 10。

- [ ] **Step 1: 写失败的测试**

```js
// tests/unit/review-reminder.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test('命令行：缺参数也退出 0，没有任何输出', () => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'review-reminder.mjs')], { encoding: 'utf8' });
  assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', '']);
});

test('hooks.json：只在新会话启动时运行', () => {
  const h = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'hooks/hooks.json'), 'utf8')).hooks.SessionStart;
  assert.equal(h.length, 1);
  assert.equal(h[0].matcher, 'startup');
  assert.deepEqual(h[0].hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/skills/learn/scripts/review-reminder.mjs', '${user_config.courses_dir}']);
  assert.equal(h[0].hooks[0].command, 'node');
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/review-reminder.test.mjs`
Expected: FAIL，找不到脚本

- [ ] **Step 3: 实现 `runReminder`、命令行入口和 `hooks.json`**

整个函数体包在 try 里，任何异常都返回 `null`。

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/unit` 和 `claude plugin validate plugins/learn-anything --strict`
Expected: 都通过

- [ ] **Step 5: 实测提醒是否显示给用户**

用 `claude --plugin-dir plugins/learn-anything` 启动一个新会话。事先准备一个有待回顾条目的课程目录，并用环境变量 `CLAUDE_PLUGIN_OPTION_COURSES_DIR` 或 `claude plugin configure` 让 hook 拿到目录。
Expected: 会话开始时界面上出现提醒的那一行。如果没有显示，把输出改成能显示的形式（例如只保留 `additionalContext`，并在文字里要求模型在第一句回复里转述这一行），同步改测试，并把结论记在这一步下面。

- [ ] **Step 6: 提交**

```bash
git add plugins/learn-anything/skills/learn/scripts/review-reminder.mjs plugins/learn-anything/hooks tests/unit/review-reminder.test.mjs
git commit -m "feat: 新会话开始时的待回顾提醒"
```

---

### Task 11: skill 的说明文件

**Files:**
- Create: `plugins/learn-anything/skills/learn/SKILL.md`
- Create: `plugins/learn-anything/skills/learn/references/kickoff.md`
- Create: `plugins/learn-anything/skills/learn/references/lesson-guide.md`
- Create: `plugins/learn-anything/skills/learn/references/data-format.md`
- Test: `tests/unit/skill-lint.test.mjs`

**Interfaces:**
- Consumes: 全部脚本的命令行（任务 3、8），子代理的调用名（任务 9 第 5 步的实测结果），`CourseCore.CARD_TYPES`（任务 3）。
- Produces:
  - `SKILL.md` 的 frontmatter：`name: learn`；`description` 照抄下面的文字；`allowed-tools` 放行 `node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs`、`new-course.mjs` 两条命令。
  - `SKILL.md` 的二级标题，依次为：`路径约定`、`什么时候读 references`、`入口`、`开题`、`每课的讲解与检验`、`续学与回顾`、`调整大纲`、`领域模板`、`文件操作规则`、`讲课风格`、`常见错误`。
  - 领域模板的约定（任务 12 依赖）：模板在 `templates/<name>/TEMPLATE.md`，frontmatter 有 `name`、`match`、`research`。

`description` 的文字：

```text
系统学习任意主题，或继续之前的课程：先问目标和基础，联网调研后给出带资料清单的大纲，分段讲授，逐课检验，内容和进度存进本地离线课程页。用于：我想学 xx、系统学习 xx、帮我讲讲 xx、开一门 xx 的课、继续学习、继续上次的 xx、learn xx、teach me xx。也用于面试准备：我想准备 xx 面试、系统设计、八股、项目经历复盘、模拟面试、interview prep、mock interview。不用于考公备考（国考、公务员、行测、申论），那归 guokao-sprint。
```

- [ ] **Step 1: 写失败的测试**

```js
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/skill-lint.test.mjs`
Expected: FAIL，`SKILL.md` 不存在

- [ ] **Step 3: 写四个说明文件**

写之前先加载 `mattpocock-skills:writing-for-agents` 和 `superpowers:writing-skills` 两个技能。内容以设计 5.8 至 5.11 为准，分工如下：

- `SKILL.md`：流程主干和硬规则。每个环节只写做什么和何时读哪个 reference。
  - `路径约定`：课程目录是 `${user_config.courses_dir}`；它为空或仍是字面的占位符时，先请用户配置，不在别处建课。
  - `文件操作规则`：模板只复制不修改；编辑前先读；每次写入 `course-data.js` 之后运行校验脚本，有错误先修好；进度只存在 `course-data.js`。
  - `领域模板`：开题时读各 `templates/*/TEMPLATE.md` 的 frontmatter 做匹配；套用后在讲课前读模板正文；模板规则优先。
- `references/kickoff.md`：两个开题问题的问法；给 `course-researcher` 的任务书格式；三种 `researched` 取值各在什么情况下用；判断上法时要考虑的几件事（有没有实践及其形式、检验形式、结课形式、是否启用生长面板及种类）；大纲在对话里的格式；slug 规则；建课时的写入清单。
- `references/lesson-guide.md`：分段和停顿；插话处理；怎么选检验形式；评分标准怎么写；调用 `answer-grader` 时传什么、结果怎么写回 `practice` 卡；课末写入清单；续学时的回顾步骤；调整大纲。
- `references/data-format.md`：设计 5.2 至 5.6 的完整说明，至少一个完整的 `window.LEARN_COURSE` 示例，以及开题、开课、每段、发题、评分、课末各阶段的写入清单。

子代理的调用名用任务 9 第 5 步实测到的名字。

两点注意，否则测试会失败：

- 这四个文件里不要写出某个具体模板的路径，模板到任务 12 才有。提到模板时写 `templates/<name>/TEMPLATE.md`。
- `data-format.md` 里只有完整的示例才以 `window.LEARN_COURSE = ` 开头。片段从字段写起。

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/unit` 和 `claude plugin validate plugins/learn-anything --strict`
Expected: 都通过

- [ ] **Step 5: 实测占位符的替换**

Run: `claude --plugin-dir plugins/learn-anything -p "/learn-anything:learn 只回答一件事：你读到的课程目录路径是什么？原样输出，不要做别的。"`
Expected: 未配置时，记下模型读到的内容（空、默认值或字面占位符），确认 `路径约定` 里的兜底说法覆盖了这种情况；不覆盖就改写并重跑测试。

- [ ] **Step 6: 提交**

```bash
git add plugins/learn-anything/skills/learn/SKILL.md plugins/learn-anything/skills/learn/references tests/unit/skill-lint.test.mjs
git commit -m "feat: learn skill 的通用教学流程"
```

---

### Task 12: 面试模板

**Files:**
- Create: `plugins/learn-anything/skills/learn/templates/interview/TEMPLATE.md`
- Create: `plugins/learn-anything/skills/learn/templates/interview/outline-patterns.md`
- Create: `plugins/learn-anything/skills/learn/templates/interview/lesson-guide.md`
- Test: `tests/unit/template-lint.test.mjs`

**Interfaces:**
- Consumes: 模板约定（任务 11），数据格式（设计 5.3 至 5.5）。
- 内容来源（只读）：`/Users/chenjianrui/workspaces/skills/interview_sprint/interview-sprint/` 当前工作副本里的 `SKILL.md`、`references/outline-patterns.md`、`references/lesson-guide.md`，以及 `references/data-format.md` 第 5 节的「约定」。

- [ ] **Step 1: 写失败的测试**

```js
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/template-lint.test.mjs`
Expected: FAIL，文件不存在

- [ ] **Step 3: 移植模板**

- `TEMPLATE.md`：frontmatter 为 `name: interview`、`match: 面试准备类请求：系统设计、知识点或八股、项目经历复盘、模拟面试`、`research: skip`。正文写这个模板相对通用流程改了什么：主题类型的判断及其存放位置（`templateData.type`）；经历复盘用示范案例并设置 `notice`；大纲最后一课固定为面试串讲；每课的卡片约定；课中面试题的流程，以及它同时算作检验、记进 `practice` 卡；何时读另外两个文件。
- `outline-patterns.md`、`lesson-guide.md`：从来源文件移植，保持规则不变，按下表改名，删掉已经由通用流程覆盖的部分（分段长度、插话、续学、调整大纲、文件操作）。

| 来源里的写法 | 模板里的写法 |
|---|---|
| `architecture` 面板 | `diagram` 面板 |
| 节点 `service`、`store`、`external`、`placeholder` | `box`、`pill`、`outline`、`ghost` |
| `interview` 卡 | 标题为「面试题」的 `problem` 卡 |
| `quote` 卡（默认标题「面试怎么讲」） | 标题写明「面试怎么讲」的 `quote` 卡 |
| `demoCase: true` | `notice: "示范案例，请换成你自己的经历"` |
| 顶层 `type` | `templateData.type` |
| `.interview_points/<slug>/` | 课程目录下的 `<slug>/` |

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/unit`
Expected: PASS（`skill-lint` 里「提到的文件都存在」也要通过）

- [ ] **Step 5: 提交**

```bash
git add plugins/learn-anything/skills/learn/templates tests/unit/template-lint.test.mjs
git commit -m "feat: 面试模板"
```

---

### Task 13: 旧课程迁移脚本

**Files:**
- Create: `plugins/learn-anything/skills/learn/scripts/migrate-interview.mjs`
- Create: `tests/fixtures/old-interview/course-data.js`
- Test: `tests/unit/migrate-interview.test.mjs`

**Interfaces:**
- Consumes: `createCourse`（任务 8），`writeDataFile`（任务 2），`validateCourse`（任务 3，取法同 `validate.mjs`）。
- Produces:
  - `loadOldCourse(file: string): object`，在 `vm` 沙箱里执行旧格式文件，返回 `window.INTERVIEW_COURSE`。
  - `convertCourse(old: object): object`，规则见设计 5.15。不修改传入的对象。
  - `countsOf(course: object): { lessons, cards, nodes, edges, groups, annotations, routes, versions, events }`，新旧两种格式都能数。
  - 命令行 `node migrate-interview.mjs <旧课程目录> <courses_dir>`：转换、建课、写入、校验、核对数量。成功时输出一行 `lessons=… cards=… nodes=… edges=… groups=… annotations=… routes=… versions=… events=…`，退出码 0。目标已存在、校验有错误或数量不一致时退出码 1。缺参数退出码 2。不修改源目录。

- [ ] **Step 1: 写旧格式样例**

`tests/fixtures/old-interview/course-data.js`，用旧格式的各种写法（不加引号的键、行注释、尾逗号、`["a", "b"].join("\n")`），内容必须满足：

- `window.INTERVIEW_COURSE`，`type: "experience"`，`demoCase: true`，`slug: "old-interview"`。
- `review: ["原文一", "原文二"]`。
- 两课：`bg`（`done`）和 `fix`（`current`）。`resume.lesson` 为 `fix`。
- `growth` 三个面板，依次是：`architecture`（四个节点，依次是不写 `kind` 的、`store`、`external`、`placeholder`，互不同格；一条连线、一个分组、一条标注、一条路线）、`code`（一个版本，`code` 写成 `["line1", "line2"].join("\n")`）、`timeline`（两个事件）。所有 `since` 都引用 `bg` 或 `fix`。
- `bg` 的卡片依次是：没有标题的 `interview` 卡、标题为「设计题」的 `interview` 卡、没有标题的 `quote` 卡、标题为「开场白」的 `quote` 卡、`points` 卡。`fix` 没有卡片。

- [ ] **Step 2: 写失败的测试**

```js
// tests/unit/migrate-interview.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, SCRIPTS_DIR } from '../helpers/paths.mjs';
import { loadCore, plain } from '../helpers/load-core.mjs';

const script = path.join(SCRIPTS_DIR, 'migrate-interview.mjs');
const { loadOldCourse, convertCourse, countsOf } = await import(script);
const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const oldDir = path.join(ROOT, 'tests/fixtures/old-interview');
const oldFile = path.join(oldDir, 'course-data.js');
const C = loadCore();
const old = loadOldCourse(oldFile);
const out = convertCourse(old);
const cards = out.lessons[0].cards;

test('旧格式的各种写法都能读', () => {
  assert.equal(old.growth[1].versions[0].code, 'line1\nline2');
});

test('转换结果是合法的新格式', () => {
  assert.deepEqual(plain(C.validateCourse(out, { dirName: 'old-interview' }).errors), []);
});

test('顶层字段', () => {
  assert.equal(out.template, 'interview');
  assert.deepEqual(out.templateData, { type: 'experience' });
  assert.equal(out.notice, '示范案例，请换成你自己的经历');
  assert.ok(!('demoCase' in out) && !('type' in out));
  assert.deepEqual(out.mission, { why: '', target: '', background: '' });
  assert.deepEqual([out.approach, out.researched, out.resources], ['', 'skipped', []]);
});

test('待回顾转成带课程 id 的条目', () => {
  assert.deepEqual(out.review, [{ lesson: null, text: '原文一' }, { lesson: null, text: '原文二' }]);
});

test('面板和节点改名', () => {
  assert.deepEqual(out.growth.map((p) => p.kind), ['diagram', 'code', 'timeline']);
  assert.deepEqual(out.growth[0].nodes.map((n) => n.style), ['box', 'pill', 'outline', 'ghost']);
  assert.ok(out.growth[0].nodes.every((n) => !('kind' in n)));
});

test('卡片改名并补上标题，已有的标题保留', () => {
  assert.deepEqual(cards.map((c) => [c.type, c.title]), [
    ['problem', '面试题'], ['problem', '设计题'], ['quote', '面试怎么讲'], ['quote', '开场白'], ['points', undefined],
  ]);
});

test('每课补上 mastered 和 readings', () => {
  for (const l of out.lessons) assert.deepEqual([l.mastered, l.readings], [false, []]);
});

test('数量不变，源对象不被修改', () => {
  assert.deepEqual(countsOf(out), countsOf(old));
  assert.equal(old.growth[0].kind, 'architecture');
});

test('命令行：写入新目录并登记，不改动源目录', () => {
  const hash = () => createHash('sha256').update(readFileSync(oldFile)).digest('hex');
  const before = hash();
  const home = mkdtempSync(path.join(os.tmpdir(), 'la-'));
  const r = spawnSync(process.execPath, [script, oldDir, home], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /lessons=2 cards=5 nodes=4 edges=1 groups=1 annotations=1 routes=1 versions=1 events=2/);
  assert.deepEqual(readDataFile(path.join(home, 'old-interview/course-data.js'), 'LEARN_COURSE'), JSON.parse(JSON.stringify(out)));
  assert.deepEqual(readDataFile(path.join(home, 'index-data.js'), 'LEARN_INDEX').courses, [{ slug: 'old-interview', dir: 'old-interview' }]);
  assert.equal(hash(), before);
  assert.equal(spawnSync(process.execPath, [script, oldDir, home], { encoding: 'utf8' }).status, 1);
});

test('命令行：缺参数退出 2', () => {
  assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 2);
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `node --test tests/unit/migrate-interview.test.mjs`
Expected: FAIL，找不到脚本

- [ ] **Step 4: 实现三个导出和命令行入口**

`updatedAt`、`resume`、课程的 `id`、`title`、`summary`、`optional`、`status` 和其余卡片字段原样保留。输出对象的字段顺序与设计 5.3 的表格一致。

- [ ] **Step 5: 运行，确认通过**

Run: `node --test tests/unit`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add plugins/learn-anything/skills/learn/scripts/migrate-interview.mjs tests/fixtures/old-interview tests/unit/migrate-interview.test.mjs
git commit -m "feat: 旧面试课程的迁移脚本"
```

---

### Task 14: 示例、安装脚本与说明文档

**Files:**
- Create: `examples/index.html`、`examples/index-data.js`
- Create: `examples/macro-intro/course.html`、`examples/macro-intro/course-data.js`
- Create: `examples/realtime-billing/course.html`、`examples/realtime-billing/course-data.js`
- Create: `install.sh`
- Create: `README.md`、`README.zh-CN.md`
- Modify: `tests/run-all.sh`
- Test: `tests/unit/examples.test.mjs`、`tests/install.test.sh`

**Interfaces:**
- Consumes: `new-course.mjs`、`migrate-interview.mjs`、`validate.mjs`。
- Produces: `install.sh` 的命令行：
  - `bash install.sh [--courses-dir <绝对路径>] [--config-dir <目录>]... [--uninstall] [--dry-run]`
  - 默认处理的配置目录：Claude Code 的默认目录；`~/.claude-ccswitch`（存在时）；环境变量 `CLAUDE_CONFIG_DIR` 指向的目录（已设置且不同于前两者时）。给了 `--config-dir` 时只处理给出的目录。
  - 对每个配置目录依次执行：`claude plugin marketplace add <仓库根的绝对路径>`；`claude plugin install learn-anything@learn-anything-local --scope user`；给了 `--courses-dir` 时再执行 `claude plugin configure learn-anything@learn-anything-local --values-stdin`，标准输入为 `{"courses_dir":"<路径>"}`。
  - 默认目录的命令不加前缀，其他目录的命令加 `CLAUDE_CONFIG_DIR=<目录>` 前缀。
  - `--dry-run` 只打印命令，每条一行，以 `+ ` 开头，不执行。
  - `--uninstall` 对每个配置目录卸载 plugin 并移除 marketplace。
  - 未知参数退出码 2。

- [ ] **Step 1: 写失败的测试**

```js
// tests/unit/examples.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ASSETS_DIR, ROOT, SCRIPTS_DIR, example } from '../helpers/paths.mjs';
import { loadCore, plain } from '../helpers/load-core.mjs';

const { readDataFile } = await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));
const C = loadCore();
const slugs = ['macro-intro', 'realtime-billing'];
const data = Object.fromEntries(slugs.map((s) => [s, readDataFile(example(s), 'LEARN_COURSE')]));

test('示例都合法，没有警告', () => {
  for (const s of slugs) assert.deepEqual(plain(C.validateCourse(data[s], { dirName: s })), { errors: [], warnings: [] });
});

test('通用示例：经过调研、挂了资料、有检验记录、不套模板', () => {
  const d = data['macro-intro'];
  assert.deepEqual([d.template, d.researched], [null, 'yes']);
  assert.ok(d.resources.some((r) => r.kind === 'book'));
  assert.ok(d.lessons.some((l) => l.readings.length > 0));
  assert.ok(d.lessons.some((l) => l.cards.some((c) => c.type === 'practice')));
  assert.ok(d.lessons.some((l) => l.status === 'done' && l.mastered) && d.lessons.some((l) => l.status === 'done' && !l.mastered));
});

test('面试示例：套用面试模板，有 diagram 面板', () => {
  const d = data['realtime-billing'];
  assert.deepEqual([d.template, d.templateData.type], ['interview', 'system-design']);
  assert.ok(d.growth.some((p) => p.kind === 'diagram'));
});

test('示例里的页面与模板逐字节一致，登记齐全', () => {
  for (const s of slugs) assert.deepEqual(readFileSync(path.join(ROOT, 'examples', s, 'course.html')), readFileSync(path.join(ASSETS_DIR, 'course.html')));
  assert.deepEqual(readFileSync(path.join(ROOT, 'examples/index.html')), readFileSync(path.join(ASSETS_DIR, 'index.html')));
  assert.deepEqual(readDataFile(path.join(ROOT, 'examples/index-data.js'), 'LEARN_INDEX').courses.map((c) => c.slug).sort(), slugs);
});

test('README 中英文都在，写了安装命令', () => {
  for (const f of ['README.md', 'README.zh-CN.md']) assert.match(readFileSync(path.join(ROOT, f), 'utf8'), /bash install\.sh/);
});
```

`tests/install.test.sh`（bash，全部用 `--dry-run`，不触碰真实配置）要检查：

- `bash install.sh --dry-run --config-dir /tmp/a --config-dir /tmp/b --courses-dir /tmp/c` 的输出里，以 `+ ` 开头的行正好 6 条；其中 3 条带 `CLAUDE_CONFIG_DIR=/tmp/a`，3 条带 `CLAUDE_CONFIG_DIR=/tmp/b`；出现 `marketplace add`、`install learn-anything@learn-anything-local --scope user`、`configure learn-anything@learn-anything-local --values-stdin`。
- 不给 `--courses-dir` 时没有 `configure` 行。
- `--uninstall --dry-run --config-dir /tmp/a` 的输出里有 `uninstall` 和 `marketplace remove`，没有 `install learn-anything`。
- 未知参数 `--nope` 退出码 2。
- 任何一项不符则脚本退出码 1。

- [ ] **Step 2: 运行，确认失败**

Run: `node --test tests/unit/examples.test.mjs; bash tests/install.test.sh`
Expected: 都 FAIL

- [ ] **Step 3: 生成示例**

```bash
node plugins/learn-anything/skills/learn/scripts/migrate-interview.mjs /Users/chenjianrui/workspaces/skills/interview_sprint/examples/realtime-billing examples
node plugins/learn-anything/skills/learn/scripts/new-course.mjs examples macro-intro
```

迁移出来的 `realtime-billing` 如果校验有警告，改示例数据直到没有警告。

然后手写 `examples/macro-intro/course-data.js`：一门「宏观经济学入门」，满足上面测试的要求，写入后运行 `validate.mjs`。资料清单里只写你能确认真实存在的书，章节号拿不准就只写到「第 N 章」这一级并核对目录。

- [ ] **Step 4: 写 `install.sh`、两份 README，并扩充 `tests/run-all.sh`**

- 先运行 `claude plugin --help` 和 `claude plugin marketplace --help`，确认卸载 plugin 和移除 marketplace 的子命令名，再写进 `install.sh`。
- README 的内容：是什么、安装（`bash install.sh --courses-dir <目录>`）、怎么开课和续学、课程存在哪、面试模板、怎么写新模板、开发与测试。两份内容对应。
- `tests/run-all.sh` 最终依次执行：把两份页面模板同步到 `examples/`；`node --test tests/unit`；`node --test --test-concurrency=1 --test-timeout=180000 tests/e2e`，有测试被跳过即算失败；`bash tests/install.test.sh`；`claude plugin validate plugins/learn-anything --strict`。

- [ ] **Step 5: 运行，确认通过**

Run: `bash tests/run-all.sh`
Expected: 全部通过，没有被跳过的测试

- [ ] **Step 6: 提交**

```bash
git add examples install.sh README.md README.zh-CN.md tests
git commit -m "feat: 示例课程、安装脚本与说明文档"
```

---

### Task 15: 实机安装、迁移、验收与退役

这个任务的每一步都改动用户的真实环境，必须和用户一起做。标了「先确认」的步骤，动手前向用户说明要执行的命令并得到同意。

**Files:**
- Modify: `docs/specs/2026-11-17-learn-anything-design.md`（最后把状态改为已实施）

- [ ] **Step 1: 全量检查**

Run: `bash tests/run-all.sh`
Expected: 全部通过

- [ ] **Step 2: 安装（先确认）**

Run: `bash install.sh --dry-run --courses-dir /Users/chenjianrui/projects`，把输出给用户看。同意后去掉 `--dry-run` 再运行。
Expected: 两个配置目录里都装上了 plugin。在桌面应用和命令行里各开一个新会话，输入 `/learn-anything:learn` 能看到这个 skill。

- [ ] **Step 2b: 实机冒烟（迁移真实数据之前）**

整体审查要求先确认下面这些，再碰真实课程。每一项把结果记在这一步下面；有问题先修，修完用 `bash install.sh --reinstall` 刷新，再重测。

1. 安装后的 plugin 是缓存里的拷贝还是就地加载：改一处仓库里的文字，开新会话看是否生效。
2. `plugin install` 在有必填配置项时是否成功；`configure` 接受还不存在的课程目录、能否重复执行。
3. 用 `/learn-anything:learn` 显式调用（退役之前和 interview-sprint 的触发词有重叠）：skill 能加载；正文里的课程目录和 skill 目录已替换成实际路径。
4. 课程目录没配置时，skill 停下并提示配置，不在别处建课。
5. `allowed-tools` 是否生效：运行校验和建课脚本时有没有权限弹窗。
6. 课程目录在工作目录之外：读写 `course-data.js` 会不会每次都弹权限。会的话把课程目录加进 `additionalDirectories`，并写进 README。
7. 两个子代理的调用名（预期 `learn-anything:course-researcher`、`learn-anything:answer-grader`）。
8. 桌面应用里 hook 能否找到 `node`；新会话开始时提醒那一行是否显示。提醒状态按配置目录分开存，桌面和命令行各提醒一次属于正常。
9. 发题时评分标准会不会通过文件编辑的 diff 或权限确认框显示在对话里（页面上已经隐藏）。看实际观感，由用户决定要不要改成别的落盘方式。
10. `~/.claude-ccswitch` 用的是第三方网关和非 Anthropic 模型，令牌目前失效：plugin 装进这个配置目录后能否工作单独确认，评分子代理指定的 `sonnet` 在那边可能解析不了。

**结果（2026-11-18）**

- 第 1 项：是缓存里的拷贝，位置在 `<配置目录>/plugins/cache/learn-anything-local/learn-anything/0.1.0`。改了仓库之后要运行 `bash install.sh --reinstall`。
- 第 2 项：必填配置项没填时 `plugin install` 也成功，随后 `configure` 把课程目录写入；目标目录当时已存在且为空。重复执行没有单独测。
- 第 3、5、7 项：所有者在桌面应用的新会话里用 `/learn-anything:learn` 试过，报告「都正常」，没有给出逐项细节。第 7 项另有旁证：安装后的会话里可用的子代理类型列出了 `learn-anything:course-researcher` 和 `learn-anything:answer-grader`，skill 列表里有 `learn-anything:learn`。
- 第 4 项：没有测（课程目录已经配置好，要测得先清掉配置）。脚本一侧有保护：建课和迁移脚本拒绝空路径、相对路径和没替换的占位符。
- 第 6、8、9 项：留到验收时看（需要真实的课程读写、待回顾内容和发题）。
- 第 10 项：没有测，网关令牌仍然失效。

- [ ] **Step 3: 迁移两门课（先确认）**

```bash
node plugins/learn-anything/skills/learn/scripts/migrate-interview.mjs /Users/chenjianrui/workspaces/skills/interview_sprint/.interview_points/billing-system /Users/chenjianrui/projects
node plugins/learn-anything/skills/learn/scripts/migrate-interview.mjs /Users/chenjianrui/workspaces/skills/interview_sprint/.interview_points/customer-service-agent /Users/chenjianrui/projects
```

Expected: 两条命令都退出 0，各输出一行数量。打开 `/Users/chenjianrui/projects/index.html`，两门课都在；逐课翻看，和原来的课程页内容一致。源目录没有变化（`git -C /Users/chenjianrui/workspaces/skills/interview_sprint status --short` 的输出和迁移前相同）。

**结果（2026-11-18）**

- 两条命令都退出 0：billing-system `lessons=11 cards=58`，customer-service-agent `lessons=19 cards=170`。两份 `course-data.js` 校验都是 0 错误 0 警告。
- 用无头 Chrome 打开真实目录核对：总览页两门课都在，没有加载失败；billing-system 显示 11/11，11 课共 58 张卡片全部显示；customer-service-agent 显示 10/19，打开停在断点 `session-state`，已开始的课共显示 160 张卡片，另有 10 张寄存在三门未开始的课里（`observability` 2、`rollout` 4、`pitch` 4），按设计讲到时才显示；「迁移来的备忘」卡片在 `session-state` 里可见。页面没有报错。
- 旧仓库的 `git status --short` 迁移前后相同。
- 没有迁移、仍留在旧目录的文件：billing-system 的 4 个 `.mmd`，customer-service-agent 的 `course-data.backup-20261111.js`。

- [ ] **Step 4: 人工验收**

按设计第 6 节的表格，和用户一起走完五行。前三门各自至少完成：开题；讲完第一课并做一次检验；换一个新会话续学并先回顾。另外确认新会话启动时的提醒出现一次，同一天不重复。把每一行的结果和发现的问题记在本文件这一步下面。发现的问题先修好并补测试，再继续。

- [ ] **Step 5: interview-sprint 退役（验收通过后，再次确认）**

向用户确认后，只删除这两个符号链接，先检查它们确实是链接：

```bash
test -L ~/.claude/skills/interview-sprint && rm ~/.claude/skills/interview-sprint
test -L ~/.claude-ccswitch/skills/interview-sprint && rm ~/.claude-ccswitch/skills/interview-sprint
```

Expected: 新会话的 skill 列表里不再有 interview-sprint；说「我想准备 Go 面试」时由 learn-anything 接手；guokao-sprint 不受影响。

- [ ] **Step 6: 更新设计文档的状态并提交**

```bash
git add docs
git commit -m "docs: 第一版已实施并验收"
```
