// 从 assets/course.html 里抽出 <script id="course-core">，在只有 { window: {} } 的 vm 上下文里执行，
// 返回 CourseCore。校验逻辑只有这一份；validate.mjs、migrate-interview.mjs 和测试都从这里取。
// core 一旦碰了 document、console、定时器等任何其他全局，这里会直接抛 ReferenceError。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/course.html');

export function loadCourseCore() {
  const m = readFileSync(HTML, 'utf8').match(/<script id="course-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${HTML} 里找不到 <script id="course-core">`);
  const sandbox = { window: {} };
  vm.runInNewContext(m[1], sandbox);
  return sandbox.window.CourseCore;
}
