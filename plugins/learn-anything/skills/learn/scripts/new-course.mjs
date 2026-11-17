#!/usr/bin/env node
// 用法：node new-course.mjs <courses_dir> <slug>
// 建课程目录，复制 course.html；index.html 不存在时复制；把课程登记进 index-data.js。不写 course-data.js。
// 成功时 stdout 只有课程页的绝对路径。
// 退出码：0 成功，1 slug 不合法、目录已存在、index-data.js 读不懂或写入失败，2 参数不对。
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDataFile, writeDataFile } from './lib/data-file.mjs';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

// 读 index-data.js；不存在返回空登记表，存在但读不懂就拒绝，绝不覆盖
function loadIndex(file) {
  if (!existsSync(file)) return { version: 1, courses: [] };
  let data;
  try {
    data = readDataFile(file, 'LEARN_INDEX');
  } catch (e) {
    throw fail('index', `无法读取 ${file}：${e.message}`);
  }
  if (!Array.isArray(data.courses)) {
    throw fail('index', `无法读取 ${file}：courses 必须是数组`);
  }
  return data;
}

export function createCourse(coursesDir, slug) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) {
    throw fail('slug', `课程名 "${slug}" 不合法：只能用小写字母、数字和连字符，如 macro-intro`);
  }
  const home = path.resolve(coursesDir);
  const dir = path.join(home, slug);
  const coursePage = path.join(dir, 'course.html');
  if (existsSync(dir)) throw fail('exists', `课程目录已存在：${dir}`);

  // 能失败的先做完，再动磁盘
  const indexFile = path.join(home, 'index-data.js');
  const index = loadIndex(indexFile);
  const courseTemplate = readFileSync(path.join(ASSETS, 'course.html'));
  const indexPageFile = path.join(home, 'index.html');
  const needIndexPage = !existsSync(indexPageFile);
  const indexTemplate = needIndexPage ? path.join(ASSETS, 'index.html') : null;
  if (indexTemplate) readFileSync(indexTemplate);

  // 记下这次运行创建的东西，失败时只清掉它们
  const createdHome = mkdirSync(home, { recursive: true }); // 返回新建的最外层目录，没建则 undefined
  const undo = [];
  try {
    try {
      mkdirSync(dir);
    } catch (e) {
      if (e.code === 'EEXIST') throw fail('exists', `课程目录已存在：${dir}`);
      throw e;
    }
    undo.push(dir);
    writeFileSync(coursePage, courseTemplate);
    if (indexTemplate) {
      undo.push(indexPageFile);
      copyFileSync(indexTemplate, indexPageFile);
    }
    if (!index.courses.some((c) => c && c.slug === slug)) index.courses.push({ slug, dir: slug });
    writeDataFile(indexFile, 'LEARN_INDEX', index);
  } catch (e) {
    for (const p of undo.reverse()) rmSync(p, { recursive: true, force: true });
    if (createdHome) rmSync(createdHome, { recursive: true, force: true });
    throw e;
  }
  return { dir, coursePage };
}

function main(args) {
  if (args.length !== 2) {
    console.error('用法：node new-course.mjs <courses_dir> <slug>');
    return 2;
  }
  try {
    console.log(createCourse(args[0], args[1]).coursePage);
    return 0;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 1;
  }
}

// 只有直接运行本文件时才执行命令行入口，被别的脚本 import 时没有副作用
const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) process.exitCode = main(process.argv.slice(2));
