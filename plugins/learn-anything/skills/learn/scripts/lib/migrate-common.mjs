// 两个迁移脚本（migrate-interview.mjs、migrate-guokao.mjs）共用的部分：
// 在子进程里读旧课程文件、数数量、检查目标与源目录不重叠，以及建课、写入和失败时的清理。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDataFile, writeDataFile } from './data-file.mjs';
import { createCourse, rollback } from '../new-course.mjs';

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const list = (v) => (Array.isArray(v) ? v : []);

// 迁移失败。lines 是要逐行打印的细节（校验错误等）
export class MigrateError extends Error {
  constructor(message, lines = []) {
    super(message);
    this.name = 'MigrateError';
    this.lines = lines;
  }
}

// 旧课程文件是 JavaScript（键不加引号、有注释和尾逗号、用 join 拼多行字符串），不一定是 JSON。
// 整个项目只有 old-course-worker.mjs 执行它，而且是在短命的子进程里：进程内的 vm 限时管不住旧文件能让宿主做的所有事
// （getter、Proxy、抛出对象的 stack、微任务），所以父进程只给子进程一个硬性的墙钟限时，超时直接 SIGKILL。
// 从子进程到这里的只有 stdout 里的一个 JSON 字符串。超时、被信号杀掉、退出码非 0、没有输出、输出不是 JSON 对象，一律是 MigrateError。
const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'old-course-worker.mjs');
const HARD_LIMIT_MS = 5000;
const MAX_OUTPUT = 64 * 1024 * 1024;

// what：读的是什么文件，出错信息里用（旧课程文件、题库文件）
export function loadOldCourse(file, globalName, what = '旧课程文件') {
  const abs = path.resolve(file);
  const r = spawnSync(process.execPath, [WORKER, abs, globalName], {
    encoding: 'utf8',
    timeout: HARD_LIMIT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_OUTPUT,
  });
  const why = (reason) => new MigrateError(`无法读取${what} ${abs}：${reason}`);
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
  if (!isObj(course)) throw why(`window.${globalName} 不是一个对象`);
  return course;
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
export function shapeOf(course) {
  return {
    lessons: list(course.lessons).map((l) => [isObj(l) ? l.id : undefined, list(isObj(l) ? l.cards : undefined).length]),
    panels: list(course.growth).map((g) => PANEL_PARTS.map((k) => list(isObj(g) ? g[k] : undefined).length)),
  };
}

export const summaryLine = (c) => Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ');

// a 是 b 本身或在 b 里面
export function isInside(a, b) {
  const r = path.relative(b, a);
  return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r));
}

// 解析符号链接后的绝对路径；路径还不存在时，对最近的已存在的上级解析，再接上剩下的部分
export function realish(p) {
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

// p 不存在时，返回这次要新建的最外层目录；p 已存在时返回 null
function outermostMissing(p) {
  let cur = path.resolve(p);
  if (existsSync(cur)) return null;
  while (!existsSync(path.dirname(cur)) && path.dirname(cur) !== cur) cur = path.dirname(cur);
  return cur;
}

// 校验转换结果，没有错误时返回 warnings，否则抛出 MigrateError
export function requireValid(core, out) {
  const { errors, warnings } = core.validateCourse(out, { dirName: out.slug });
  if (errors.length > 0) {
    throw new MigrateError(`转换后的课程没有通过校验（${errors.length} 个错误，${warnings.length} 个警告）`, [
      ...errors.map((e) => `✗ ${e}`),
      ...warnings.map((w) => `△ ${w}`),
    ]);
  }
  return warnings;
}

// 已经校验、核对过的课程 out 写到 <coursesDir>/<out.slug>/：建课、写 course-data.js、读回核对。
// 写入失败时清掉这次创建的东西（包括新建的上级目录），index-data.js 恢复原样。返回新课程目录。
// write、remove 只供测试注入失败
export function writeMigrated(out, oldDir, coursesDir, { write = writeDataFile, remove = rmSync } = {}) {
  const slug = out.slug;
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
  return created.dir;
}
