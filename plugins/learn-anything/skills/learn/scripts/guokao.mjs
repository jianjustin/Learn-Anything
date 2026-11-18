#!/usr/bin/env node
// 用法：
//   node guokao.mjs sync <guokao_repo> <课程文件> [--demo <行标签-题号>]...
//   node guokao.mjs image <guokao_repo> <课程文件> <课程 id> <行标签-题号> [--alt <描述>]
//   node guokao.mjs new <guokao_repo> <courses_dir> <slug>
// 国考模板（template 为 guokao 的课）自己的脚本，有 sync、image 和 new 三个子命令。
//
// sync：
// 从题库（<guokao_repo>/guokao-sprint/references/，只读）同步课程的真题覆盖和题型地图：
// 重算 templateData.growth（题型地图的 count、新增题型、真题覆盖的 years 和 items），再按它重写两张带 generated 标记的表格卡。
// 只改这两处；课程里已有的 demo 标记按「行标签-题号」保留，题库里没有的题的标记丢掉并列出。
// --demo 给对应的真题加 demo 标记（已示范）；该题不在题库里或是 hold（留作整卷）题时报错。
// 先在内存里算好、校验，通过才写（临时文件 + 改名）；任何一步出错，课程文件都不动。
// 成功时 stdout 一行 nodes=<题型数> items=<真题数> demo=<已示范数>；丢掉的标记、新增的题型和校验警告以 △ 开头写到 stderr，错误以 ✗ 开头。
// 退出码：0 成功，1 出错（仓库路径不合法、课程文件读不了或不是 guokao 模板、题库补不进来、--demo 的题不行、校验有错误），2 参数不对。
//
// image：把题库里这道题的题图（examgrid 里该题的 img，内嵌成 data:image）做成一张 html 卡，标题「<行标签>-<题号> 题图」，
// 插在课程 id 那一课最后一张 steps 卡之后，没有 steps 卡就追加到末尾；--alt 是图下的说明。
// 可以重复运行：那一课里已有同标题的 html 卡时，原位替换，不再插入新卡。
// hold（留作整卷）题、没有 img 的题、题库里没有的题、课程 id 不存在都报错，课程文件不动。
// 成功时 stdout 一行 inserted <课程 id> <行标签-题号>。退出码同上。
//
// new：按题库仓库的默认大纲建一门国考课（slug 须是大纲里有的，如 xingce-shuliang）：课程全部 todo、cards 为空，
// 题型地图的 count 取题库，有真题清单就带真题覆盖；转成新格式（考情课末尾两张表格卡、系列「国考」，templateData.from 为 guokao-outline）后登记进 courses_dir 的 index-data.js。
// slug 不在大纲里、课程目录已存在、路径不合法、校验有错误都不建任何东西，退出 1；成功时 stdout 只有课程页（course.html）的绝对路径。
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourseCore } from './lib/core-loader.mjs';
import { coursesDirProblem } from './lib/course-index.mjs';
import { readDataFile, writeDataFile } from './lib/data-file.mjs';
import {
  buildInitial, imageHtml, loadRepo, localIso, placeTables, questionKey, repoProblem, syncGrowth,
} from './lib/guokao.mjs';
import {
  MigrateError, isObj, list, requireValid, writeMigrated,
} from './lib/migrate-common.mjs';
import { convertCourse } from './migrate-guokao.mjs';

const USAGE = [
  '用法：node guokao.mjs sync <guokao_repo> <课程文件> [--demo <行标签-题号>]...',
  '      node guokao.mjs image <guokao_repo> <课程文件> <课程 id> <行标签-题号> [--alt <描述>]',
  '      node guokao.mjs new <guokao_repo> <courses_dir> <slug>',
].join('\n');

// 返回 { repo, file, demos }；参数不对返回 null
export function parseSyncArgs(args) {
  const positional = [];
  const demos = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--demo') {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) return null;
      demos.push(v);
      i += 1;
    } else if (args[i].startsWith('--')) return null;
    else positional.push(args[i]);
  }
  if (positional.length !== 2) return null;
  return { repo: positional[0], file: positional[1], demos };
}

// 在内存里算出同步后的课程：不写盘。返回 { out, dropped, added, summary }。
// course 必须是 guokao 模板的课，由调用方（readGuokaoCourse）保证，这里不再检查
export function syncCourse(course, repo, demos = []) {
  const slug = course.slug;
  const { growth, dropped, added } = syncGrowth(course, repo.zhenti(slug), repo.outline(slug));
  const examgrid = growth.find((g) => isObj(g) && g.kind === 'examgrid');
  for (const key of demos) {
    const it = list(examgrid?.items).find((x) => isObj(x) && questionKey(x) === key);
    if (!it) throw new MigrateError(`--demo ${key}：题库里没有这道题`);
    if (it.hold) throw new MigrateError(`--demo ${key}：这道题留作整卷，不能做示范`);
    it.demo = true;
  }
  let out;
  try {
    out = placeTables({ ...course, templateData: { ...course.templateData, growth } });
  } catch (e) {
    // 题库数据对不上（题型不在题型地图、年份不在 years 里）：报成一行 ✗，不打堆栈
    throw new MigrateError(`无法重写表格卡：${e.message}`);
  }
  const typemap = growth.find((g) => isObj(g) && g.kind === 'typemap');
  const summary = {
    nodes: list(typemap?.nodes).length,
    items: list(examgrid?.items).length,
    demo: list(examgrid?.items).filter((x) => isObj(x) && x.demo === true).length,
  };
  return { out, dropped, added, summary };
}

// 读 guokao 课程文件：路径不存在、读不了、不是 guokao 模板都抛 MigrateError
function readGuokaoCourse(repo, file, what) {
  const problem = repoProblem(repo);
  if (problem) throw new MigrateError(problem);
  if (!existsSync(file)) throw new MigrateError(`找不到课程文件：${file}`);
  let course;
  try {
    course = readDataFile(file, 'LEARN_COURSE');
  } catch (e) {
    throw new MigrateError(`无法读取课程文件 ${file}：${e.message}`);
  }
  if (course.template !== 'guokao') throw new MigrateError(`课程的 template 是 ${JSON.stringify(course.template)}，不是 guokao，不能用 guokao.mjs ${what}`);
  return course;
}

function writeOut(file, out) {
  try {
    writeDataFile(file, 'LEARN_COURSE', out);
  } catch (e) {
    throw new MigrateError(`写入失败：${e.message}`);
  }
}

function sync(args) {
  const parsed = parseSyncArgs(args);
  if (!parsed) {
    console.error(USAGE);
    return 2;
  }
  const { repo, file, demos } = parsed;
  const course = readGuokaoCourse(repo, file, '同步');
  const { out, dropped, added, summary } = syncCourse(course, loadRepo(repo), demos);
  const warnings = requireValid(loadCourseCore(), out);
  writeOut(file, out);
  if (dropped.length) console.error(`△ 题库里没有或已改为留作整卷，示范标记已丢掉：${dropped.join('、')}`);
  if (added.length) console.error(`△ 从仓库大纲补进的新题型：${added.join('、')}`);
  for (const w of warnings) console.error(`△ ${w}`);
  console.log(Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(' '));
  return 0;
}

// 返回 { repo, file, lesson, key, alt }；参数不对返回 null
export function parseImageArgs(args) {
  const positional = [];
  let alt;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--alt') {
      const v = args[i + 1];
      if (v === undefined || alt !== undefined) return null;
      alt = v;
      i += 1;
    } else if (args[i].startsWith('--')) return null;
    else positional.push(args[i]);
  }
  if (positional.length !== 4) return null;
  return {
    repo: positional[0], file: positional[1], lesson: positional[2], key: positional[3], alt,
  };
}

// 在内存里算出插入题图卡后的课程：不写盘。题图的字节从题库读（readImage），课程里的 examgrid 不参与
export function insertImage(course, repo, lessonId, key, alt) {
  const lessons = list(course.lessons);
  const at = lessons.findIndex((l) => isObj(l) && l.id === lessonId);
  if (at < 0) throw new MigrateError(`课程里没有 id 为 ${lessonId} 的课`);
  const zhenti = repo.zhenti(course.slug);
  const item = list(zhenti?.items).find((x) => isObj(x) && questionKey(x) === key);
  if (!item) throw new MigrateError(`${key}：题库里没有这道题`);
  if (item.hold) throw new MigrateError(`${key}：这道题留作整卷（hold），题图不能放进课程`);
  if (typeof item.img !== 'string' || item.img === '') throw new MigrateError(`${key}：这道题在题库里没有题图`);
  let html;
  try {
    html = imageHtml(item.img, alt, repo.readImage(item.img));
  } catch (e) {
    if (e instanceof MigrateError) throw e;
    throw new MigrateError(`${key}：${e.message}`);
  }
  const card = { type: 'html', title: `${key} 题图`, html };
  const cards = list(lessons[at].cards).slice();
  const same = cards.findIndex((c) => isObj(c) && c.type === 'html' && c.title === card.title);
  if (same >= 0) cards[same] = card; // 重复运行：原位替换
  else {
    const lastSteps = cards.map((c) => isObj(c) && c.type === 'steps').lastIndexOf(true);
    cards.splice(lastSteps >= 0 ? lastSteps + 1 : cards.length, 0, card);
  }
  const newLessons = lessons.slice();
  newLessons[at] = { ...lessons[at], cards };
  return { ...course, lessons: newLessons };
}

function image(args) {
  const parsed = parseImageArgs(args);
  if (!parsed) {
    console.error(USAGE);
    return 2;
  }
  const {
    repo, file, lesson, key, alt,
  } = parsed;
  const course = readGuokaoCourse(repo, file, 'image');
  const out = insertImage(course, loadRepo(repo), lesson, key, alt);
  const warnings = requireValid(loadCourseCore(), out);
  writeOut(file, out);
  for (const w of warnings) console.error(`△ ${w}`);
  console.log(`inserted ${lesson} ${key}`);
  return 0;
}

// 返回 { repo, coursesDir, slug }；参数不对返回 null
export function parseNewArgs(args) {
  if (args.length !== 3 || args.some((a) => a.startsWith('--'))) return null;
  return { repo: args[0], coursesDir: args[1], slug: args[2] };
}

// 按仓库大纲在内存里造好并校验一门新课，返回 { out, warnings }：不写盘
export function newCourse(repo, slug) {
  const bank = loadRepo(repo);
  const outline = bank.outline(slug);
  if (!outline) throw new MigrateError(`题库的大纲里没有 ${slug} 这门课`);
  const initial = buildInitial(slug, outline, bank.zhenti(slug), localIso());
  // 初始课程没有题图卡，不会读图
  const noImage = () => {
    throw new MigrateError('初始课程不应该有题图');
  };
  const out = convertCourse(initial, noImage, { migrated: false });
  const warnings = requireValid(loadCourseCore(), out);
  return { out, bank, warnings };
}

function newCmd(args) {
  const parsed = parseNewArgs(args);
  if (!parsed) {
    console.error(USAGE);
    return 2;
  }
  const { repo, coursesDir, slug } = parsed;
  const problem = repoProblem(repo) ?? coursesDirProblem(coursesDir);
  if (problem) throw new MigrateError(problem);
  const { out, bank, warnings } = newCourse(repo, slug);
  const dir = writeMigrated(out, bank.refs, coursesDir);
  for (const w of warnings) console.error(`△ ${w}`);
  console.log(path.join(dir, 'course.html'));
  return 0;
}

function main(args) {
  const commands = { sync, image, new: newCmd };
  if (!Object.hasOwn(commands, args[0] ?? '')) {
    console.error(USAGE);
    return 2;
  }
  try {
    return commands[args[0]](args.slice(1));
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
