#!/usr/bin/env node
// 用法：node migrate-interview.mjs <旧课程目录> <courses_dir>
// 把 interview-sprint 的旧课程（<旧课程目录>/course-data.js）转换成新格式，建课并写入 <courses_dir>/<slug>/。
// 转换规则见设计 5.15。不修改源目录。先在内存里转换、校验、核对数量，全部通过才动磁盘；
// 写入失败时清掉这次创建的东西（包括新建的上级目录），index-data.js 恢复原样。
// <courses_dir> 必须是绝对路径；<旧课程目录> 可以是相对路径。
// 成功时 stdout 只有一行数量；错误和警告写到 stderr。
// 退出码：0 成功，1 课程目录不合法、读不了源文件、转换不了、校验有错误、数量不一致、目标已存在或写入失败，2 参数不对。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourseCore } from './lib/core-loader.mjs';
import { coursesDirProblem } from './lib/course-index.mjs';
import { readDataFile, writeDataFile } from './lib/data-file.mjs';
import { createCourse, rollback } from './new-course.mjs';

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
// 整个项目只有 old-course-worker.mjs 执行它，而且是在短命的子进程里：进程内的 vm 限时管不住旧文件能让宿主做的所有事
// （getter、Proxy、抛出对象的 stack、微任务），所以父进程只给子进程一个硬性的墙钟限时，超时直接 SIGKILL。
// 从子进程到这里的只有 stdout 里的一个 JSON 字符串。超时、被信号杀掉、退出码非 0、没有输出、输出不是 JSON 对象，一律是 MigrateError。
const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib/old-course-worker.mjs');
const HARD_LIMIT_MS = 5000;
const MAX_OUTPUT = 64 * 1024 * 1024;

export function loadOldCourse(file) {
  const abs = path.resolve(file);
  const r = spawnSync(process.execPath, [WORKER, abs], {
    encoding: 'utf8',
    timeout: HARD_LIMIT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_OUTPUT,
  });
  const why = (reason) => new MigrateError(`无法读取旧课程文件 ${abs}：${reason}`);
  if (r.error) {
    throw why(r.error.code === 'ETIMEDOUT' ? `执行超过 ${HARD_LIMIT_MS / 1000} 秒，已终止` : `无法运行读取进程（${r.error.code || r.error.message}）`);
  }
  if (r.signal) throw why(`读取进程被信号 ${r.signal} 终止`);
  if (r.status !== 0) throw why(String(r.stderr).trim().split('\n')[0] || `读取进程退出码 ${r.status}`);
  let course;
  try {
    course = JSON.parse(r.stdout);
  } catch {
    throw why('读取进程没有给出可解析的 JSON');
  }
  if (!isObj(course)) throw why('window.INTERVIEW_COURSE 不是一个对象');
  return course;
}

const NODE_STYLE = { service: 'box', store: 'pill', external: 'outline', placeholder: 'ghost' };
const NOTICE = '示范案例，请换成你自己的经历';
const MEMO_TITLE = '迁移来的备忘';
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

// 旧 review 是搁置的问题和备忘，不是掌握缺口：合成一张备忘卡，放在这里返回的那一课的最前面。
// resume.lesson 那一课；没有 resume 时第一门不是 done 的课；都是 done 就放最后一课。没有课时返回 -1
export function memoLessonIndex(lessons, resume) {
  const byResume = isObj(resume) ? lessons.findIndex((l) => isObj(l) && l.id === resume.lesson) : -1;
  if (byResume >= 0) return byResume;
  const notDone = lessons.findIndex((l) => isObj(l) && l.status !== 'done');
  return notDone >= 0 ? notDone : lessons.length - 1;
}

// 旧格式 → 新格式。不修改传入的对象。规则没提到的字段（未知的顶层字段、卡片类型、卡片/课程/面板元素字段）原样带过去。
export function convertCourse(old) {
  if (!isObj(old)) throw CONVERT_ERR('旧课程不是对象');
  let o;
  try {
    o = clone(old);
  } catch (e) {
    throw CONVERT_ERR(`旧课程里有无法转成 JSON 的值：${e.message}`);
  }
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
  out.review = [];
  out.growth = list(o.growth).map(convertPanel);
  out.lessons = list(o.lessons).map(convertLesson);
  const memoAt = memoLessonIndex(out.lessons, out.resume);
  if (list(o.review).length > 0 && isObj(out.lessons[memoAt])) {
    out.lessons[memoAt].cards.unshift({ type: 'note', title: MEMO_TITLE, text: o.review.join('\n') });
  }
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

// a 是 b 本身或在 b 里面
function isInside(a, b) {
  const r = path.relative(b, a);
  return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r));
}

// 解析符号链接后的绝对路径；路径还不存在时，对最近的已存在的上级解析，再接上剩下的部分
function realish(p) {
  let cur = path.resolve(p);
  const rest = [];
  while (!existsSync(cur)) {
    rest.unshift(path.basename(cur));
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return path.join(realpathSync.native(cur), ...rest);
}

const summaryLine = (c) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ');

// 转换后应有的数量：与源一致，只有放了备忘卡的那一课多一张
function expectedCounts(old) {
  const counts = countsOf(old);
  const shape = shapeOf(old);
  if (list(old.review).length > 0) {
    const at = memoLessonIndex(list(old.lessons), old.resume);
    if (shape.lessons[at]) {
      counts.cards += 1;
      shape.lessons[at][1] += 1;
    }
  }
  return { counts, shape };
}

// p 不存在时，返回这次要新建的最外层目录；p 已存在时返回 null
function outermostMissing(p) {
  let cur = path.resolve(p);
  if (existsSync(cur)) return null;
  while (!existsSync(path.dirname(cur)) && path.dirname(cur) !== cur) cur = path.dirname(cur);
  return cur;
}

// 读、转换、校验、核对都在内存里完成，通过之后才建课和写文件。返回 { dir, counts, warnings }
// write、remove 只供测试注入失败
export function migrateCourse(oldDir, coursesDir, { write = writeDataFile, remove = rmSync } = {}) {
  const problem = coursesDirProblem(coursesDir);
  if (problem) throw new MigrateError(problem);
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
  const { counts: before, shape } = expectedCounts(old);
  const after = countsOf(out);
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(shape) !== JSON.stringify(shapeOf(out))) {
    throw new MigrateError('转换前后的数量不一致', [`旧：${summaryLine(before)}`, `新：${summaryLine(after)}`]);
  }

  // courses_dir 不能是源目录或在它里面，源目录也不能是这次要建的目录或在它里面：否则会写进源目录
  const srcReal = realish(oldDir);
  const homeReal = realish(coursesDir);
  const targetReal = path.join(homeReal, slug);
  if (isInside(homeReal, srcReal) || isInside(srcReal, targetReal)) {
    throw new MigrateError(`目标位置与源目录重叠，拒绝写入：源目录 ${srcReal}，课程目录 ${homeReal}（将创建 ${targetReal}）`);
  }

  // 记下现状，写入失败时据此还原
  const home = path.resolve(coursesDir);
  const createdRoot = outermostMissing(home);
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
    const error = new MigrateError(`写入失败：${e.message}`);
    if (indexBefore !== null) {
      try {
        writeFileSync(indexFile, indexBefore);
      } catch (restoreError) {
        error.message += `（index-data.js 没能恢复：${restoreError.message}）`;
      }
    }
    const undo = [createdRoot, created.dir, indexPageExisted ? null : indexPage, indexBefore === null ? indexFile : null];
    throw rollback(error, undo.filter(Boolean), remove);
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
