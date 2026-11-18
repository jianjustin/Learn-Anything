#!/usr/bin/env node
// 用法：node guokao.mjs sync <guokao_repo> <课程文件> [--demo <行标签-题号>]...
// 国考模板（template 为 guokao 的课）自己的脚本。目前只有 sync：
// 从题库（<guokao_repo>/guokao-sprint/references/，只读）同步课程的真题覆盖和题型地图：
// 重算 templateData.growth（题型地图的 count、新增题型、真题覆盖的 years 和 items），再按它重写两张带 generated 标记的表格卡。
// 只改这两处；课程里已有的 demo 标记按「行标签-题号」保留，题库里没有的题的标记丢掉并列出。
// --demo 给对应的真题加 demo 标记（已示范）；该题不在题库里或是 hold（留作整卷）题时报错。
// 先在内存里算好、校验，通过才写（临时文件 + 改名）；任何一步出错，课程文件都不动。
// 成功时 stdout 一行 nodes=<题型数> items=<真题数> demo=<已示范数>；丢掉的标记、新增的题型和校验警告以 △ 开头写到 stderr，错误以 ✗ 开头。
// 退出码：0 成功，1 出错（仓库路径不合法、课程文件读不了或不是 guokao 模板、题库补不进来、--demo 的题不行、校验有错误），2 参数不对。
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCourseCore } from './lib/core-loader.mjs';
import { readDataFile, writeDataFile } from './lib/data-file.mjs';
import {
  loadRepo, placeTables, questionKey, repoProblem, syncGrowth,
} from './lib/guokao.mjs';
import { MigrateError, isObj, list, requireValid } from './lib/migrate-common.mjs';

const USAGE = '用法：node guokao.mjs sync <guokao_repo> <课程文件> [--demo <行标签-题号>]...';

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

// 在内存里算出同步后的课程：不写盘。返回 { out, dropped, added, summary }
export function syncCourse(course, repo, demos = []) {
  if (course.template !== 'guokao') throw new MigrateError(`课程的 template 是 ${JSON.stringify(course.template)}，不是 guokao，不能用 guokao.mjs 同步`);
  const slug = course.slug;
  const { growth, dropped, added } = syncGrowth(course, repo.zhenti(slug), repo.outline(slug));
  const examgrid = growth.find((g) => isObj(g) && g.kind === 'examgrid');
  for (const key of demos) {
    const it = list(examgrid?.items).find((x) => isObj(x) && questionKey(x) === key);
    if (!it) throw new MigrateError(`--demo ${key}：题库里没有这道题`);
    if (it.hold) throw new MigrateError(`--demo ${key}：这道题留作整卷，不能做示范`);
    it.demo = true;
  }
  const out = placeTables({ ...course, templateData: { ...course.templateData, growth } });
  const typemap = growth.find((g) => isObj(g) && g.kind === 'typemap');
  const summary = {
    nodes: list(typemap?.nodes).length,
    items: list(examgrid?.items).length,
    demo: list(examgrid?.items).filter((x) => isObj(x) && x.demo === true).length,
  };
  return { out, dropped, added, summary };
}

function sync(args) {
  const parsed = parseSyncArgs(args);
  if (!parsed) {
    console.error(USAGE);
    return 2;
  }
  const { repo, file, demos } = parsed;
  const problem = repoProblem(repo);
  if (problem) throw new MigrateError(problem);
  if (!existsSync(file)) throw new MigrateError(`找不到课程文件：${file}`);
  let course;
  try {
    course = readDataFile(file, 'LEARN_COURSE');
  } catch (e) {
    throw new MigrateError(`无法读取课程文件 ${file}：${e.message}`);
  }
  const { out, dropped, added, summary } = syncCourse(course, loadRepo(repo), demos);
  const warnings = requireValid(loadCourseCore(), out);
  try {
    writeDataFile(file, 'LEARN_COURSE', out);
  } catch (e) {
    throw new MigrateError(`写入失败：${e.message}`);
  }
  if (dropped.length) console.error(`△ 题库里没有或已改为留作整卷，示范标记已丢掉：${dropped.join('、')}`);
  if (added.length) console.error(`△ 从仓库大纲补进的新题型：${added.join('、')}`);
  for (const w of warnings) console.error(`△ ${w}`);
  console.log(Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(' '));
  return 0;
}

function main(args) {
  if (args[0] !== 'sync') {
    console.error(USAGE);
    return 2;
  }
  try {
    return sync(args.slice(1));
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
