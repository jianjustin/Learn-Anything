#!/usr/bin/env node
// 用法：node review-reminder.mjs [<courses_dir>]
// 不给 courses_dir（或给空串）时，从配置文件里取（Codex 的 hook 拿不到 userConfig），见 lib/host-config.mjs。
// SessionStart hook：有待回顾条目、且今天还没提醒过时，stdout 输出一行 JSON；否则什么都不输出。
// 状态目录取环境变量 CLAUDE_PLUGIN_DATA（Codex 也会设置它），没有时取 ~/.cache/learn-anything。
// 每个新会话都会跑，所以只读 index-data.js 和各课的 course-data.js，任何失败都当作「不提醒」。
// 退出码恒为 0，不向 stderr 输出。
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSafeDir } from './lib/course-index.mjs';
import { readDataFile } from './lib/data-file.mjs';
import { readConfig } from './lib/host-config.mjs';

const STATE_FILE = 'review-reminder.json';

function isReviewItem(item) {
  return item !== null && typeof item === 'object' && !Array.isArray(item)
    && typeof item.text === 'string' && item.text !== '';
}

// 一门课里格式正确的待回顾条数；读不出来算 0
function countReview(coursesDir, dir) {
  try {
    const { review } = readDataFile(path.join(coursesDir, dir, 'course-data.js'), 'LEARN_COURSE');
    return Array.isArray(review) ? review.filter(isReviewItem).length : 0;
  } catch {
    return 0;
  }
}

function lastReminded(stateFile) {
  try {
    const { lastReminded: date } = JSON.parse(readFileSync(stateFile, 'utf8'));
    return typeof date === 'string' ? date : null;
  } catch {
    return null;
  }
}

export function runReminder({ coursesDir, stateDir, today }) {
  try {
    if (typeof coursesDir !== 'string' || coursesDir === '') return null;
    const stateFile = path.join(stateDir, STATE_FILE);
    if (lastReminded(stateFile) === today) return null;

    const { courses } = readDataFile(path.join(coursesDir, 'index-data.js'), 'LEARN_INDEX');
    if (!Array.isArray(courses)) return null;
    let courseCount = 0;
    let itemCount = 0;
    for (const entry of courses) {
      if (entry === null || typeof entry !== 'object' || !isSafeDir(entry.dir)) continue;
      const n = countReview(coursesDir, entry.dir);
      if (n > 0) {
        courseCount += 1;
        itemCount += n;
      }
    }
    if (itemCount === 0) return null;

    // 决定要提醒了才写状态
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ lastReminded: today }));
    const message = `learn-anything：${courseCount} 门课共有 ${itemCount} 条待回顾，说「继续学习」可以先回顾。`;
    return JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message },
    });
  } catch {
    return null;
  }
}

function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 命令行给了课程目录就用它，否则读配置文件；读不出来返回 null
export function resolveCoursesDir(arg) {
  if (typeof arg === 'string' && arg !== '') return arg;
  try {
    return readConfig().courses_dir;
  } catch {
    return null;
  }
}

function main(args) {
  try {
    const stateDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.cache', 'learn-anything');
    const out = runReminder({ coursesDir: resolveCoursesDir(args[0]), stateDir, today: localDate() });
    if (out) process.stdout.write(`${out}\n`);
  } catch {
    // 不能妨碍会话启动
  }
  return 0;
}

// 只有直接运行本文件时才执行命令行入口
let invoked = false;
try {
  invoked = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  // 当作被 import
}
if (invoked) process.exitCode = main(process.argv.slice(2));
