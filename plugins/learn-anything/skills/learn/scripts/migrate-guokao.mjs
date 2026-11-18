#!/usr/bin/env node
// 用法：node migrate-guokao.mjs <旧课程目录> <courses_dir>
// 把 guokao-sprint 的旧课程（<旧课程目录>/course-data.js，即 .guokao_points/<slug>/）转换成新格式，建课并写入 <courses_dir>/<slug>/。
// 不修改源目录。先在内存里转换、校验、核对数量，全部通过才动磁盘；写入失败时清掉这次创建的东西，index-data.js 恢复原样。
// <courses_dir> 必须是绝对路径；<旧课程目录> 可以是相对路径。
// 成功时 stdout 只有一行数量；错误和警告写到 stderr。
// 退出码：0 成功，1 课程目录不合法、读不了源文件或题图、转换不了、校验有错误、数量不一致、目标已存在或写入失败，2 参数不对。
//
// 转换规则：
// - 顶层：template 为 guokao；templateData.from 为 guokao-sprint（guokao.mjs new 新建的课是 guokao-outline）；
//   subject、exam 和原来的两个面板放进 templateData（面板里 hold 题的 img 去掉，其余原样）；series 统一为「国考」，order 按 guokao-sprint 的九门课顺序；
//   mission 按科目和 exam 写出，approach 写 guokao-sprint 的上法，researched 为 "skipped"，resources 为空。
// - 面板：typemap（题型地图）和 examgrid（真题覆盖）在新格式里没有对应的面板，各转成一张表格卡，放在考情课（id 为 kaoqing，
//   没有时第一课）的末尾；growth 为空。两张表格卡带 generated 标记（guokao-typemap、guokao-examgrid），模板之后靠标记原地重写。
// - 卡片：image（题图）转成 html 卡，图片按 data:image 内嵌；interview 改名 problem；其余类型原样。
// - practice 条目：basedOn 接在题目后面；timeMin 接在回答后面；cause 译成中文放在 why 前面；yours 为「跳过」的记为 skipped: true，
//   跳题依据写进 why。
// - 课程：补 readings: []；mastered 按旧练习记录推出：讲完（done）的考情课为 true，其余 done 的课看练习里最后一条判过对错的 ok，
//   没讲完的为 false；待回顾转换之后，凡是有待回顾条目挂在这一课上的，mastered 一律改为 false（待回顾不能指向已掌握的课）。
// - review：旧的待回顾是没过关的问题，迁成待回顾条目；条目以「第 N 课」开头时挂到第 N 课，否则 lesson 为 null。
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourseCore } from './lib/core-loader.mjs';
import { coursesDirProblem, isSafeDir } from './lib/course-index.mjs';
import {
  APPROACH, FROM, MIGRATED_NOTE, SERIES_NAME, SERIES_ORDER, imageHtml, inferMastered, placeTables, tableLessonIndex,
} from './lib/guokao.mjs';
import {
  MigrateError, countsOf, isInside, isObj, list, loadOldCourse as loadWith, requireValid, shapeOf, summaryLine, writeMigrated,
} from './lib/migrate-common.mjs';

export { MigrateError, countsOf, SERIES_NAME, tableLessonIndex };

const clone = (v) => JSON.parse(JSON.stringify(v));
const CONVERT_ERR = (msg) => new MigrateError(`无法转换：${msg}`);

export const loadOldCourse = (file) => loadWith(file, 'GUOKAO_COURSE');

const SUBJECT = { xingce: '行测', shenlun: '申论', computer: '计算机专业科目', finance: '证券期货专业科目' };
const CAUSE = {
  concept: '概念不清', reading: '审题', method: '方法', calculation: '计算', condition: '条件用错', time: '时间', unknown: '不明',
};
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

const OLD_TOP = ['version', 'topic', 'slug', 'subject', 'exam', 'updatedAt', 'resume', 'review', 'growth', 'lessons'];
const GENERATED_TOP = ['template', 'templateData', 'mission', 'approach', 'researched', 'resources', 'notice', 'series'];
const LESSON_KNOWN = ['id', 'title', 'summary', 'optional', 'status', 'cards'];

// 题图转成 html 卡。readImage(src) 返回图片的 Buffer
function convertImage(c, where, readImage) {
  if (typeof c.src !== 'string' || !isSafeDir(c.src) || c.src !== c.src.trim()) {
    throw CONVERT_ERR(`${where}.src 不是课程目录内的相对路径：${JSON.stringify(c.src)}`);
  }
  const ext = path.extname(c.src).slice(1).toLowerCase();
  if (!IMAGE_EXT.includes(ext)) throw CONVERT_ERR(`${where}.src 的图片格式不认识：${c.src}`);
  const alt = typeof c.alt === 'string' ? c.alt : '';
  const html = imageHtml(c.src, alt, readImage(c.src));
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'type') {
      out.type = 'html';
      out.title = typeof c.title === 'string' && c.title ? c.title : '题图';
      out.html = html;
    } else if (!['title', 'src', 'alt'].includes(k)) out[k] = v;
  }
  return out;
}

function convertPracticeItem(it, where) {
  if (!isObj(it)) return it;
  for (const k of ['skipped', 'rubric']) if (k in it) throw CONVERT_ERR(`${where} 已经有 ${k} 字段`);
  if (it.cause !== undefined && !Object.hasOwn(CAUSE, it.cause)) throw CONVERT_ERR(`${where}.cause 是 ${JSON.stringify(it.cause)}，不认识`);
  const skipped = it.yours === '跳过' && it.ok === undefined;
  const time = it.timeMin !== undefined ? `（用时 ${it.timeMin} 分钟）` : '';
  const out = {};
  out.q = typeof it.basedOn === 'string' && it.basedOn ? `${it.q}\n出题依据：${it.basedOn}` : it.q;
  if (skipped && time) out.q += `\n${time}`;
  if (skipped) out.skipped = true;
  else if ('yours' in it) out.yours = time ? `${it.yours}\n${time}` : it.yours;
  else if (time) out.q += `\n${time}`;
  if (!skipped && 'ok' in it) out.ok = it.ok;
  let why = typeof it.why === 'string' ? it.why : '';
  if (skipped && why) why = `跳题依据：${why}`;
  if (it.cause !== undefined) why = `错因：${CAUSE[it.cause]}${why ? `。${why}` : ''}`;
  if (why) out.why = why;
  if ('answer' in it) out.answer = it.answer;
  for (const [k, v] of Object.entries(it)) {
    if (!['q', 'basedOn', 'yours', 'ok', 'why', 'cause', 'timeMin', 'answer'].includes(k)) out[k] = v;
  }
  return out;
}

function convertCard(c, where, readImage) {
  if (!isObj(c)) return c;
  if (c.type === 'image') return convertImage(c, where, readImage);
  if (c.type === 'interview') {
    const out = {};
    for (const [k, v] of Object.entries(c)) {
      if (k === 'type') {
        out.type = 'problem';
        if (!c.title) out.title = '追问';
      } else if (!(k === 'title' && !c.title)) out[k] = v;
    }
    return out;
  }
  if (c.type === 'practice' && Array.isArray(c.items)) {
    return { ...c, items: c.items.map((it, i) => convertPracticeItem(it, `${where}.items[${i}]`)) };
  }
  return c;
}

function convertLesson(l, i, readImage) {
  if (!isObj(l)) return l;
  for (const k of ['mastered', 'readings']) if (k in l) throw CONVERT_ERR(`lessons[${i}] 已经有 ${k} 字段`);
  if ('cards' in l && !Array.isArray(l.cards)) throw CONVERT_ERR(`lessons[${i}].cards 不是数组`);
  const out = {};
  for (const k of LESSON_KNOWN.slice(0, 5)) if (k in l) out[k] = l[k];
  out.mastered = false; // 先占住字段顺序，卡片转换完再按练习记录推出
  out.readings = [];
  out.cards = list(l.cards).map((c, j) => convertCard(c, `lessons[${i}].cards[${j}]`, readImage));
  out.mastered = inferMastered(out);
  for (const [k, v] of Object.entries(l)) if (!LESSON_KNOWN.includes(k)) out[k] = v;
  return out;
}

function missionOf(o) {
  const subject = SUBJECT[o.subject] ?? '';
  const why = `准备国考${subject}${subject && o.topic !== subject ? `的${o.topic}` : subject ? '' : o.topic}`;
  let target = '';
  if (isObj(o.exam)) {
    const e = o.exam;
    const parts = [];
    if (e.paper || e.range) parts.push(`${e.paper ? `${e.paper}卷` : ''}${e.range ? `第 ${e.range} 题` : ''}`);
    if (e.count) parts.push(`共 ${e.count} 题`);
    if (e.timeLimitMin) parts.push(`限时约 ${e.timeLimitMin} 分钟`);
    if (parts.length) target = `做好${parts.join('，')}`;
  }
  return { why, target, background: '' };
}

const REVIEW_LESSON = /^第\s*(\d+)\s*课/;
export function convertReview(review, lessons) {
  return review.map((text) => {
    const m = REVIEW_LESSON.exec(text);
    const lesson = m ? lessons[Number(m[1]) - 1] : undefined;
    return { lesson: isObj(lesson) && typeof lesson.id === 'string' ? lesson.id : null, text };
  });
}

// 旧格式 → 新格式。不修改传入的对象。readImage(src) 读课程目录里的题图，返回 Buffer。
// 规则没提到的字段（未知的顶层字段、卡片类型、卡片/课程/条目字段）原样带过去。
// migrated 为 false 时是 guokao.mjs new 按仓库大纲新建的课：templateData.from 为 guokao-outline，approach 不写迁移说明。
export function convertCourse(old, readImage, { migrated = true } = {}) {
  if (!isObj(old)) throw CONVERT_ERR('旧课程不是对象');
  let o;
  try {
    o = clone(old);
  } catch (e) {
    throw CONVERT_ERR(`旧课程里有无法转成 JSON 的值：${e.message}`);
  }
  for (const k of GENERATED_TOP) if (k in o) throw CONVERT_ERR(`旧课程已经有 ${k} 字段`);
  if ('review' in o) {
    if (!Array.isArray(o.review)) throw CONVERT_ERR('review 不是数组');
    o.review.forEach((r, i) => { if (typeof r !== 'string') throw CONVERT_ERR(`review[${i}] 不是字符串`); });
  }
  if ('growth' in o && !Array.isArray(o.growth)) throw CONVERT_ERR('growth 不是数组');
  if (!Array.isArray(o.lessons) || o.lessons.length === 0) throw CONVERT_ERR('lessons 不是非空数组');
  const panels = list(o.growth);
  panels.forEach((g, i) => {
    if (!isObj(g) || !['typemap', 'examgrid'].includes(g.kind)) throw CONVERT_ERR(`growth[${i}] 不是 typemap 或 examgrid`);
  });
  // hold（留作整卷）题的题图不进课程文件，和 sync、新建课一样
  for (const g of panels) {
    if (g.kind === 'examgrid' && Array.isArray(g.items)) {
      g.items = g.items.map((it) => {
        if (!isObj(it) || !it.hold) return it;
        const { img, ...rest } = it;
        return rest;
      });
    }
  }
  const typemap = panels.find((g) => g.kind === 'typemap');
  const examgrid = panels.find((g) => g.kind === 'examgrid');
  if (examgrid && !typemap) throw CONVERT_ERR('有真题覆盖但没有题型地图');

  const out = {};
  for (const k of ['version', 'topic', 'slug']) if (k in o) out[k] = o[k];
  out.template = 'guokao';
  out.templateData = { from: migrated ? FROM.migrated : FROM.outline, subject: o.subject };
  if ('exam' in o) out.templateData.exam = o.exam;
  if (panels.length) out.templateData.growth = panels;
  out.mission = missionOf(o);
  out.approach = migrated ? APPROACH + MIGRATED_NOTE : APPROACH;
  out.researched = 'skipped';
  out.resources = [];
  const order = SERIES_ORDER.indexOf(o.slug);
  out.series = order >= 0 ? { name: SERIES_NAME, order: order + 1 } : { name: SERIES_NAME };
  for (const k of ['updatedAt', 'resume']) if (k in o) out[k] = o[k];
  out.lessons = o.lessons.map((l, i) => convertLesson(l, i, readImage));
  out.review = convertReview(list(o.review), out.lessons);
  // learn 的不变量：待回顾不能指向已掌握的课，有条目挂在这课上就不算掌握
  for (const l of out.lessons) if (isObj(l) && out.review.some((r) => r.lesson === l.id)) l.mastered = false;
  out.growth = [];
  // 字段顺序与 data-format.md 第 3 节一致：review、growth 在 lessons 前面
  const { lessons, ...rest } = out;
  const ordered = { ...rest, lessons };
  for (const [k, v] of Object.entries(o)) if (!OLD_TOP.includes(k)) ordered[k] = v;
  try {
    return placeTables(ordered);
  } catch (e) {
    throw CONVERT_ERR(e.message);
  }
}

const practiceCount = (course) => list(course.lessons).reduce((n, l) => n + list(l?.cards)
  .filter((c) => isObj(c) && c.type === 'practice').reduce((m, c) => m + list(c.items).length, 0), 0);

// 转换后应有的数量：课数、各课卡片数不变，只有放表格卡的那一课多出两张面板转来的卡；面板清空；练习条目数不变
function expectedShape(old) {
  const shape = shapeOf(old);
  const panels = list(old.growth).length;
  const at = tableLessonIndex(list(old.lessons));
  if (shape.lessons[at]) shape.lessons[at][1] += panels;
  shape.panels = [];
  return { shape, practice: practiceCount(old) };
}

// 题图只从源目录里读，解析符号链接后仍须在源目录里
function imageReader(oldDir) {
  const root = realpathSync.native(path.resolve(oldDir));
  return (src) => {
    const file = path.join(root, src);
    let real;
    try {
      real = realpathSync.native(file);
    } catch {
      throw new MigrateError(`找不到题图：${file}`);
    }
    if (!isInside(real, root)) throw new MigrateError(`题图不在旧课程目录里：${file}`);
    return readFileSync(real);
  };
}

// 读、转换、校验、核对都在内存里完成，通过之后才建课和写文件。返回 { dir, counts, warnings }
// write、remove 只供测试注入失败
export function migrateCourse(oldDir, coursesDir, { write, remove } = {}) {
  const problem = coursesDirProblem(coursesDir);
  if (problem) throw new MigrateError(problem);
  const oldFile = path.join(path.resolve(oldDir), 'course-data.js');
  if (!existsSync(oldFile)) throw new MigrateError(`找不到旧课程文件：${oldFile}`);
  const old = loadOldCourse(oldFile);
  const out = convertCourse(old, imageReader(oldDir));

  const warnings = requireValid(loadCourseCore(), out);
  const want = expectedShape(old);
  const got = { shape: shapeOf(out), practice: practiceCount(out) };
  if (JSON.stringify(want) !== JSON.stringify(got)) {
    throw new MigrateError('转换前后的数量不一致', [`旧：${JSON.stringify(want)}`, `新：${JSON.stringify(got)}`]);
  }
  const dir = writeMigrated(out, oldDir, coursesDir, { write, remove });
  const counts = countsOf(out);
  return { dir, counts: { lessons: counts.lessons, cards: counts.cards, practice: got.practice, review: out.review.length }, warnings };
}

function main(args) {
  if (args.length !== 2) {
    console.error('用法：node migrate-guokao.mjs <旧课程目录> <courses_dir>');
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
