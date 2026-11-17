#!/usr/bin/env node
// 用法：node refresh-pages.mjs <courses_dir>
// 页面模板更新后运行：把 assets/index.html 复制到课程目录，把 assets/course.html 复制到每门登记过、
// 目录存在且 dir 安全的课里。只覆盖这两种文件，不碰 course-data.js 和别的文件。
// 没有登记表时什么也不做。
// 退出码：0 成功，1 课程目录不是绝对路径、登记表读不懂或写入失败，2 参数不对。
import { readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coursesDirProblem, isSafeDir, readIndexCourses } from './lib/course-index.mjs';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// 先写同目录的临时文件再改名，页面不会被读到一半
function replaceFile(file, content) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, content);
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

// 返回 { refreshed: [slug], skipped: [{ slug, reason }] }；没有登记表时返回 null
export function refreshPages(coursesDir) {
  const problem = coursesDirProblem(coursesDir);
  if (problem) throw new Error(problem);
  const courses = readIndexCourses(coursesDir);
  if (!courses) return null;
  const coursePage = readFileSync(path.join(ASSETS, 'course.html'));
  const indexPage = readFileSync(path.join(ASSETS, 'index.html'));

  const result = { refreshed: [], skipped: [] };
  replaceFile(path.join(coursesDir, 'index.html'), indexPage);
  for (const entry of courses) {
    if (entry === null || typeof entry !== 'object') continue;
    const slug = String(entry.slug);
    if (!isSafeDir(entry.dir)) result.skipped.push({ slug, reason: `登记的目录 "${entry.dir}" 不安全` });
    else if (!isDir(path.join(coursesDir, entry.dir))) result.skipped.push({ slug, reason: `目录 ${entry.dir} 不存在` });
    else {
      replaceFile(path.join(coursesDir, entry.dir, 'course.html'), coursePage);
      result.refreshed.push(slug);
    }
  }
  return result;
}

function main(args) {
  if (args.length !== 1) {
    console.error('用法：node refresh-pages.mjs <courses_dir>');
    return 2;
  }
  let result;
  try {
    result = refreshPages(args[0]);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
  if (!result) {
    console.log(`${args[0]} 下没有课程登记表，什么也没做`);
    return 0;
  }
  console.log(`✓ 刷新了总览页和 ${result.refreshed.length} 门课的课程页`);
  for (const s of result.skipped) console.log(`△ 跳过 ${s.slug}：${s.reason}`);
  return 0;
}

// 只有直接运行本文件时才执行命令行入口
const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) process.exitCode = main(process.argv.slice(2));
