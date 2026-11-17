// 课程登记表 index-data.js 的读取，以及登记项 dir 的安全规则。
// 只用 JSON.parse 读（经 data-file.mjs），绝不执行文件内容。
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readDataFile } from './data-file.mjs';

// 与总览页 isSafeDir 同一条规则：只接受朴素的相对路径
export function isSafeDir(dir) {
  if (typeof dir !== 'string' || dir === '') return false;
  if (/[\u0000-\u001f\u007f:\\]/.test(dir) || dir.startsWith('/') || dir.includes('..')) return false;
  return dir.split('/').every((seg) => seg !== '' && seg !== '.');
}

// 返回登记项数组；登记表不存在时返回 null；存在但读不懂时抛错
export function readIndexCourses(coursesDir) {
  const file = path.join(coursesDir, 'index-data.js');
  if (!existsSync(file)) return null;
  let data;
  try {
    data = readDataFile(file, 'LEARN_INDEX');
  } catch (e) {
    throw new Error(`无法读取 ${file}：${e.message}`);
  }
  if (!Array.isArray(data.courses)) throw new Error(`无法读取 ${file}：courses 必须是数组`);
  return data.courses;
}

// 写盘的脚本只接受绝对路径的课程目录。空值、相对路径和没被替换的 ${…} 占位符都会让课程
// 落进当前工作目录，一律拒绝。合格时返回 null，否则返回一句说明。
export function coursesDirProblem(dir) {
  if (typeof dir !== 'string' || dir.trim() === '') return '课程目录为空：plugin 的 courses_dir 可能还没配置';
  if (dir.includes('${')) return `课程目录 "${dir}" 含没有被替换的占位符：plugin 的 courses_dir 可能还没配置`;
  if (!path.isAbsolute(dir)) return `课程目录 "${dir}" 不是绝对路径`;
  return null;
}
