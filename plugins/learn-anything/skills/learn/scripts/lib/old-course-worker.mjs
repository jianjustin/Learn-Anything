// 在子进程里执行旧课程文件（interview-sprint 的 course-data.js，是 JavaScript 不是 JSON）。
// 用法：node old-course-worker.mjs <旧课程文件> [全局变量名]
// 全局变量名默认 INTERVIEW_COURSE（interview-sprint），guokao-sprint 的课程是 GUOKAO_COURSE。
// 成功：stdout 只有一个字符串，是 JSON.stringify(window.<全局变量名>) 的结果，退出码 0。
// 失败：stderr 一行说明，退出码 1。
// 旧文件是不可信的代码：能让宿主做的事（getter、Proxy、抛出对象的 stack、微任务）进程内的 vm 限时管不全，
// 所以这里只是第一道防线，真正的兜底是父进程的硬性限时和 SIGKILL（见 migrate-common.mjs）。
import { readFileSync } from 'node:fs';
import { types } from 'node:util';
import vm from 'node:vm';

const TIMEOUT_MS = 2000;

// 抛出的东西不可信：只从原生 Error 的自有数据属性里取 message，其余不碰
function safeMessage(e) {
  if (!types.isNativeError(e)) return '';
  const d = Object.getOwnPropertyDescriptor(e, 'message');
  return d && typeof d.value === 'string' ? d.value : '';
}

function finish(code, stream, text) {
  stream.write(text, () => process.exit(code));
}
const fail = (message) => finish(1, process.stderr, `${message.replace(/\s+/g, ' ').slice(0, 500)}\n`);

function evaluate(file, name) {
  const source = readFileSync(file, 'utf8');
  // 没有任何宿主对象的上下文，window 在上下文里面创建；
  // 微任务留在上下文里、在每次执行结束时跑完并受同一个限时约束
  const ctx = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: 'afterEvaluate',
  });
  vm.runInContext('var window = {};', ctx);
  vm.runInContext(source, ctx, { timeout: TIMEOUT_MS });
  return vm.runInContext(`JSON.stringify(window.${name})`, ctx, { timeout: TIMEOUT_MS });
}

const file = process.argv[2];
const name = process.argv[3] || 'INTERVIEW_COURSE';
if (!file) {
  fail('缺少旧课程文件路径');
} else if (!/^[A-Z_]+$/.test(name)) {
  fail(`全局变量名 ${name} 不合法`);
} else {
  let json;
  let failed = false;
  try {
    json = evaluate(file, name);
  } catch (e) {
    failed = true;
    const m = safeMessage(e);
    fail(m || '执行出错、超时，或内容无法转成 JSON');
  }
  if (!failed) {
    if (typeof json === 'string') finish(0, process.stdout, json);
    else fail(`没有给 window.${name} 赋一个可以转成 JSON 的对象`);
  }
}
