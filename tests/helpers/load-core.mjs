// 从 course.html 里抽出 <script id="course-core">，在只有 { window: {} } 的 vm 上下文里执行。
// core 一旦碰了 document、console、定时器等任何其他全局，这里会直接抛 ReferenceError。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ASSETS_DIR, fixture } from './paths.mjs';
import { readDataFile } from '../../plugins/learn-anything/skills/learn/scripts/lib/data-file.mjs';

export function loadCore() {
  const html = readFileSync(path.join(ASSETS_DIR, 'course.html'), 'utf8');
  const m = html.match(/<script id="course-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('course.html 里找不到 <script id="course-core">');
  const sandbox = { window: {} };
  vm.runInNewContext(m[1], sandbox);
  return sandbox.window.CourseCore;
}

export const loadFixture = (name) => readDataFile(fixture(name), 'LEARN_COURSE');

// vm 里造出来的对象原型属于另一个 realm，deepStrictEqual 会不认；转成本 realm 的普通对象再比较
export const plain = (v) => JSON.parse(JSON.stringify(v));
