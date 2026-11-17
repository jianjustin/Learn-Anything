#!/usr/bin/env node
// 用法：node validate.mjs <course-data.js>
// 校验逻辑只有一份，在 course.html 的 <script id="course-core"> 里，这里把它抽出来运行。
// 退出码：0 通过（可以有警告），1 数据有错误或读不了，2 参数不对。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DataFileError, readDataFile } from './lib/data-file.mjs';

const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/course.html');

function loadCore() {
  const m = readFileSync(HTML, 'utf8').match(/<script id="course-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${HTML} 里找不到 <script id="course-core">`);
  const sandbox = { window: {} };
  vm.runInNewContext(m[1], sandbox);
  return sandbox.window.CourseCore;
}

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('用法：node validate.mjs <course-data.js>');
  process.exit(2);
}

const file = path.resolve(args[0]);
let data;
try {
  data = readDataFile(file, 'LEARN_COURSE');
} catch (e) {
  const reason = e instanceof DataFileError ? e.message : `无法读取 ${file}：${e.message}`;
  console.log(`✗ ${reason}`);
  process.exit(1);
}

const { errors, warnings } = loadCore().validateCourse(data, { dirName: path.basename(path.dirname(file)) });
for (const e of errors) console.log(`✗ ${e}`);
for (const w of warnings) console.log(`△ ${w}`);
if (errors.length > 0) {
  console.log(`${errors.length} 个错误，${warnings.length} 个警告`);
  process.exit(1);
}
console.log(`✓ ${file} 通过校验（${warnings.length} 个警告）`);
