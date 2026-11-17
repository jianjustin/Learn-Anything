#!/usr/bin/env node
// 用法：node migrate-interview.mjs <旧课程目录> <courses_dir>
// 把 interview-sprint 的旧课程（<旧课程目录>/course-data.js）转换成新格式，建课并写入 <courses_dir>/<slug>/。
// 转换规则见设计 5.15。不修改源目录。先在内存里转换、校验、核对数量，全部通过才动磁盘；
// 写入失败时清掉这次创建的东西，index-data.js 恢复原样。
// 成功时 stdout 只有一行数量；错误和警告写到 stderr。
// 退出码：0 成功，1 读不了源文件、转换不了、校验有错误、数量不一致、目标已存在或写入失败，2 参数不对。
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadCourseCore } from './lib/core-loader.mjs';
import { readDataFile, writeDataFile } from './lib/data-file.mjs';
import { createCourse } from './new-course.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

// 迁移失败。lines 是要逐行打印的细节（校验错误等）
export class MigrateError extends Error {
  constructor(message, lines = []) {
    super(message);
    this.name = 'MigrateError';
    this.lines = lines;
  }
}

// 旧课程文件是 JavaScript（键不加引号、有注释和尾逗号、用 join 拼多行字符串），不是 JSON。
// 整个项目只有这里执行数据文件：沙箱里只有 window，限时，结果立刻转成普通 JSON 数据，沙箱里的对象不外泄。
export function loadOldCourse(file) {
  const source = readFileSync(file, 'utf8');
  const sandbox = vm.createContext({ window: {} }, { codeGeneration: { strings: false, wasm: false } });
  try {
    vm.runInContext(source, sandbox, { timeout: 2000 });
  } catch (e) {
    throw new MigrateError(`无法执行旧课程文件 ${file}：${e.message}`);
  }
  const course = sandbox.window.INTERVIEW_COURSE;
  if (!isObj(course)) throw new MigrateError(`${file} 没有给 window.INTERVIEW_COURSE 赋一个对象`);
  return clone(course);
}

const NODE_STYLE = { service: 'box', store: 'pill', external: 'outline', placeholder: 'ghost' };
const NOTICE = '示范案例，请换成你自己的经历';
const CONVERT_ERR = (msg) => new MigrateError(`无法转换：${msg}`);

// 新格式里由转换补出来的顶层字段；旧课程已经有同名字段时不知道该留哪个，宁可拒绝也不覆盖
const GENERATED_TOP = ['template', 'templateData', 'mission', 'approach', 'researched', 'resources', 'notice'];
const OLD_TOP = ['version', 'topic', 'slug', 'type', 'demoCase', 'updatedAt', 'resume', 'review', 'growth', 'lessons'];
const LESSON_KNOWN = ['id', 'title', 'summary', 'optional', 'status', 'cards'];

function convertNode(n, where) {
  if (!isObj(n)) return n;
  if ('style' in n) throw CONVERT_ERR(`${where} 已经有 style 字段`);
  const style = n.kind === undefined ? 'box' : Object.hasOwn(NODE_STYLE, n.kind) ? NODE_STYLE[n.kind] : undefined;
  if (style === undefined) throw CONVERT_ERR(`${where} 的 kind 是 ${JSON.stringify(n.kind)}，没有对应的 style`);
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(n)) {
    if (k === 'kind') { out.style = style; placed = true; continue; }
    if (k === 'since' && !placed) { out.style = style; placed = true; }
    out[k] = v;
  }
  if (!placed) out.style = style;
  return out;
}

function convertPanel(g, i) {
  if (!isObj(g) || g.kind !== 'architecture') return g;
  const out = {};
  for (const [k, v] of Object.entries(g)) {
    if (k === 'kind') out.kind = 'diagram';
    else if (k === 'nodes' && Array.isArray(v)) out.nodes = v.map((n, j) => convertNode(n, `growth[${i}].nodes[${j}]`));
    else out[k] = v;
  }
  return out;
}

// 旧卡片里没有标题（或标题为空，旧页面此时用默认标题）的，补上新格式的默认标题
function convertCard(c) {
  if (!isObj(c)) return c;
  const type = c.type === 'interview' ? 'problem' : c.type;
  const fill = c.title ? undefined : c.type === 'interview' ? '面试题' : c.type === 'quote' ? '面试怎么讲' : undefined;
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'type') {
      out.type = type;
      if (fill !== undefined) out.title = fill;
    } else if (k === 'title' && fill !== undefined) {
      // 空标题已被默认标题取代
    } else out[k] = v;
  }
  return out;
}

function convertLesson(l, i) {
  if (!isObj(l)) return l;
  for (const k of ['mastered', 'readings']) {
    if (k in l) throw CONVERT_ERR(`lessons[${i}] 已经有 ${k} 字段`);
  }
  if ('cards' in l && !Array.isArray(l.cards)) throw CONVERT_ERR(`lessons[${i}].cards 不是数组`);
  const out = {};
  for (const k of LESSON_KNOWN.slice(0, 5)) if (k in l) out[k] = l[k];
  out.mastered = false;
  out.readings = [];
  out.cards = list(l.cards).map(convertCard); // todo 的课旧格式不写卡片，新格式要求是空数组
  for (const [k, v] of Object.entries(l)) if (!LESSON_KNOWN.includes(k)) out[k] = v;
  return out;
}

// 旧格式 → 新格式。不修改传入的对象。规则没提到的字段（未知的顶层字段、卡片类型、卡片/课程/面板元素字段）原样带过去。
export function convertCourse(old) {
  if (!isObj(old)) throw CONVERT_ERR('旧课程不是对象');
  const o = clone(old);
  for (const k of GENERATED_TOP) {
    if (k in o) throw CONVERT_ERR(`旧课程已经有 ${k} 字段`);
  }
  if ('review' in o) {
    if (!Array.isArray(o.review)) throw CONVERT_ERR('review 不是数组');
    o.review.forEach((r, i) => { if (typeof r !== 'string') throw CONVERT_ERR(`review[${i}] 不是字符串`); });
  }
  if ('growth' in o && !Array.isArray(o.growth)) throw CONVERT_ERR('growth 不是数组');
  if ('lessons' in o && !Array.isArray(o.lessons)) throw CONVERT_ERR('lessons 不是数组');

  const out = {};
  for (const k of ['version', 'topic', 'slug']) if (k in o) out[k] = o[k];
  out.template = 'interview';
  if ('type' in o) out.templateData = { type: o.type };
  out.mission = { why: '', target: '', background: '' };
  out.approach = '';
  out.researched = 'skipped';
  out.resources = [];
  if (o.demoCase === true) out.notice = NOTICE;
  for (const k of ['updatedAt', 'resume']) if (k in o) out[k] = o[k];
  out.review = list(o.review).map((text) => ({ lesson: null, text }));
  out.growth = list(o.growth).map(convertPanel);
  out.lessons = list(o.lessons).map(convertLesson);
  // demoCase: false 没有对应的新字段；其他取值保留，免得悄悄丢掉
  if ('demoCase' in o && o.demoCase !== true && o.demoCase !== false) out.demoCase = o.demoCase;
  for (const [k, v] of Object.entries(o)) if (!OLD_TOP.includes(k)) out[k] = v;
  return out;
}

const PANEL_PARTS = ['nodes', 'edges', 'groups', 'annotations', 'routes', 'versions', 'events'];

// 新旧两种格式都能数：课数、卡片数，以及各面板里各种元素的总数
export function countsOf(course) {
  const total = (key, items) => items.reduce((n, x) => n + list(isObj(x) ? x[key] : undefined).length, 0);
  const lessons = list(course.lessons);
  const panels = list(course.growth);
  return {
    lessons: lessons.length,
    cards: total('cards', lessons),
    nodes: total('nodes', panels),
    edges: total('edges', panels),
    groups: total('groups', panels),
    annotations: total('annotations', panels),
    routes: total('routes', panels),
    versions: total('versions', panels),
    events: total('events', panels),
  };
}

// 逐课、逐面板的数量，用来核对迁移前后一致（countsOf 只给总数）
function shapeOf(course) {
  return {
    lessons: list(course.lessons).map((l) => [isObj(l) ? l.id : undefined, list(isObj(l) ? l.cards : undefined).length]),
    panels: list(course.growth).map((g) => PANEL_PARTS.map((k) => list(isObj(g) ? g[k] : undefined).length)),
  };
}

const summaryLine = (c) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ');

// 读、转换、校验、核对都在内存里完成，通过之后才建课和写文件。返回 { dir, counts, warnings }
export function migrateCourse(oldDir, coursesDir, { write = writeDataFile } = {}) {
  const oldFile = path.join(path.resolve(oldDir), 'course-data.js');
  if (!existsSync(oldFile)) throw new MigrateError(`找不到旧课程文件：${oldFile}`);
  const old = loadOldCourse(oldFile);
  const out = convertCourse(old);

  const slug = out.slug;
  const { errors, warnings } = loadCourseCore().validateCourse(out, { dirName: slug });
  if (errors.length > 0) {
    throw new MigrateError(`转换后的课程没有通过校验（${errors.length} 个错误，${warnings.length} 个警告）`, [
      ...errors.map((e) => `✗ ${e}`),
      ...warnings.map((w) => `△ ${w}`),
    ]);
  }
  const before = countsOf(old);
  const after = countsOf(out);
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(shapeOf(old)) !== JSON.stringify(shapeOf(out))) {
    throw new MigrateError('转换前后的数量不一致', [`旧：${summaryLine(before)}`, `新：${summaryLine(after)}`]);
  }

  // 记下现状，写入失败时据此还原
  const home = path.resolve(coursesDir);
  const homeExisted = existsSync(home);
  const indexFile = path.join(home, 'index-data.js');
  const indexPage = path.join(home, 'index.html');
  const indexBefore = existsSync(indexFile) ? readFileSync(indexFile) : null;
  const indexPageExisted = existsSync(indexPage);

  let created;
  try {
    created = createCourse(home, slug); // 自己失败时自己清理
  } catch (e) {
    throw new MigrateError(e.message);
  }
  const file = path.join(created.dir, 'course-data.js');
  try {
    write(file, 'LEARN_COURSE', out);
    if (JSON.stringify(readDataFile(file, 'LEARN_COURSE')) !== JSON.stringify(out)) {
      throw new Error('写入后读回的内容与转换结果不一致');
    }
  } catch (e) {
    rmSync(created.dir, { recursive: true, force: true });
    if (!indexPageExisted) rmSync(indexPage, { force: true });
    if (indexBefore === null) rmSync(indexFile, { force: true });
    else writeFileSync(indexFile, indexBefore);
    if (!homeExisted) rmSync(home, { recursive: true, force: true });
    throw new MigrateError(`写入失败，已还原：${e.message}`);
  }
  return { dir: created.dir, counts: after, warnings };
}

function main(args) {
  if (args.length !== 2) {
    console.error('用法：node migrate-interview.mjs <旧课程目录> <courses_dir>');
    return 2;
  }
  try {
    const { counts, warnings } = migrateCourse(args[0], args[1]);
    for (const w of warnings) console.error(`△ ${w}`);
    console.log(summaryLine(counts));
    return 0;
  } catch (e) {
    if (!(e instanceof MigrateError)) throw e;
    console.error(`✗ ${e.message}`);
    for (const line of e.lines) console.error(line);
    return 1;
  }
}

// 只有直接运行本文件时才执行命令行入口，被 import 时没有副作用
const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) process.exitCode = main(process.argv.slice(2));
