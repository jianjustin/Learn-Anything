#!/usr/bin/env node
// 用法：node list-courses.mjs <courses_dir>
// 只读。每门登记过的课在 stdout 输出一行 JSON：
//   { slug, dir, topic, template, done, total, mastered, review, resumeLesson, resumeNote, updatedAt }
// 读不出来的课输出 { slug, dir, error }，error 取 missing（文件读不到）、syntax（不是合法的数据文件）、
// unsafe（登记的 dir 不安全，不去读）。统计口径用 CourseCore.progressOf。
// 退出码：0 成功（课程目录不存在或没有登记表时输出零行），1 登记表读不懂，2 参数不对。
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourseCore } from './lib/core-loader.mjs';
import { isSafeDir, readIndexCourses } from './lib/course-index.mjs';
import { DataFileError, readDataFile } from './lib/data-file.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const strOrNull = (v) => (typeof v === 'string' ? v : null);

function summarize(core, coursesDir, entry) {
  const head = { slug: entry.slug, dir: entry.dir };
  if (!isSafeDir(entry.dir)) return { ...head, error: 'unsafe' };
  let data;
  try {
    data = readDataFile(path.join(coursesDir, entry.dir, 'course-data.js'), 'LEARN_COURSE');
  } catch (e) {
    return { ...head, error: e instanceof DataFileError ? 'syntax' : 'missing' };
  }
  const p = core.progressOf(data);
  const resume = isObj(data.resume) ? data.resume : {};
  return {
    ...head,
    topic: strOrNull(data.topic),
    template: strOrNull(data.template),
    done: p.done,
    total: p.total,
    mastered: p.mastered,
    review: p.review,
    resumeLesson: strOrNull(resume.lesson),
    resumeNote: strOrNull(resume.note),
    updatedAt: strOrNull(data.updatedAt),
  };
}

export function listCourses(coursesDir) {
  const home = path.resolve(coursesDir);
  const courses = readIndexCourses(home);
  if (!courses) return [];
  const core = loadCourseCore();
  return courses.filter(isObj).map((entry) => summarize(core, home, entry));
}

function main(args) {
  if (args.length !== 1 || args[0] === '') {
    console.error('用法：node list-courses.mjs <courses_dir>');
    return 2;
  }
  let rows;
  try {
    rows = listCourses(args[0]);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
  for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
  return 0;
}

// 只有直接运行本文件时才执行命令行入口
const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) process.exitCode = main(process.argv.slice(2));
