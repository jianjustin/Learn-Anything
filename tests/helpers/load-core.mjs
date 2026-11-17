// loadCore 就是脚本用的 loadCourseCore：从 course.html 抽出 course-core，在只有 { window: {} } 的 vm 里执行。
import { fixture } from './paths.mjs';
import { loadCourseCore } from '../../plugins/learn-anything/skills/learn/scripts/lib/core-loader.mjs';
import { readDataFile } from '../../plugins/learn-anything/skills/learn/scripts/lib/data-file.mjs';

export const loadCore = loadCourseCore;

export const loadFixture = (name) => readDataFile(fixture(name), 'LEARN_COURSE');

// vm 里造出来的对象原型属于另一个 realm，deepStrictEqual 会不认；转成本 realm 的普通对象再比较
export const plain = (v) => JSON.parse(JSON.stringify(v));
