#!/usr/bin/env node
// 用法：node migrate-interview.mjs <旧课程目录> <courses_dir>
// 把 interview-sprint 的旧课程（<旧课程目录>/course-data.js）转换成新格式，建课并写入 <courses_dir>/<slug>/。
// 转换规则见设计 5.15。不修改源目录。先在内存里转换、校验、核对数量，全部通过才动磁盘；
// 写入失败时清掉这次创建的东西（包括新建的上级目录），index-data.js 恢复原样。
// <courses_dir> 必须是绝对路径；<旧课程目录> 可以是相对路径。
// 成功时 stdout 只有一行数量；错误和警告写到 stderr。
// 退出码：0 成功，1 课程目录不合法、读不了源文件、转换不了、校验有错误、数量不一致、目标已存在或写入失败，2 参数不对。
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourseCore } from './lib/core-loader.mjs';
import { coursesDirProblem } from './lib/course-index.mjs';
import {
  MigrateError, countsOf, isObj, list, loadOldCourse as loadWith, requireValid, shapeOf, summaryLine, writeMigrated,
} from './lib/migrate-common.mjs';

export { MigrateError, countsOf };

const clone = (v) => JSON.parse(JSON.stringify(v));

// 旧课程文件在子进程里执行，见 lib/migrate-common.mjs
export const loadOldCourse = (file) => loadWith(file, 'INTERVIEW_COURSE');

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

// 读、转换、校验、核对都在内存里完成，通过之后才建课和写文件。返回 { dir, counts, warnings }
// write、remove 只供测试注入失败
export function migrateCourse(oldDir, coursesDir, { write, remove } = {}) {
  const problem = coursesDirProblem(coursesDir);
  if (problem) throw new MigrateError(problem);
  const oldFile = path.join(path.resolve(oldDir), 'course-data.js');
  if (!existsSync(oldFile)) throw new MigrateError(`找不到旧课程文件：${oldFile}`);
  const old = loadOldCourse(oldFile);
  const out = convertCourse(old);

  const warnings = requireValid(loadCourseCore(), out);
  const { counts: before, shape } = expectedCounts(old);
  const after = countsOf(out);
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(shape) !== JSON.stringify(shapeOf(out))) {
    throw new MigrateError('转换前后的数量不一致', [`旧：${summaryLine(before)}`, `新：${summaryLine(after)}`]);
  }
  const dir = writeMigrated(out, oldDir, coursesDir, { write, remove });
  return { dir, counts: after, warnings };
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
