#!/usr/bin/env node
// 用法：
//   node config.mjs                       读配置，stdout 输出一行 JSON：{"courses_dir", "guokao_repo", "file"}，没配置的项是 null
//   node config.mjs set [--courses-dir <绝对路径>] [--guokao-repo <绝对路径>]
//                                         按键合并写入配置文件（没给的项保留），然后同样输出一行 JSON
// 给不经过 Claude Code userConfig 的宿主（Codex）用；文件位置见 lib/host-config.mjs。
// 退出码：0 成功，1 配置文件读不懂或写不进去（stderr 输出 ✗ 开头的一行），2 参数不对。
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, configPath, readConfig, writeConfig } from './lib/host-config.mjs';

const USAGE = '用法：node config.mjs [set [--courses-dir <绝对路径>] [--guokao-repo <绝对路径>]]';
const FLAGS = { '--courses-dir': 'courses_dir', '--guokao-repo': 'guokao_repo' };

function parseSet(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 1) {
    let flag = args[i];
    let value;
    const eq = flag.indexOf('=');
    if (flag.startsWith('--') && eq > 0) {
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    } else {
      value = args[i + 1];
      i += 1;
    }
    const key = FLAGS[flag];
    if (!key || value === undefined || value === '') return null;
    values[key] = value;
  }
  return Object.keys(values).length > 0 ? values : null;
}

function main(args) {
  const file = configPath();
  let result;
  try {
    if (args.length === 0) {
      result = readConfig(file);
    } else if (args[0] === 'set') {
      const values = parseSet(args.slice(1));
      if (!values) {
        console.error(USAGE);
        return 2;
      }
      result = writeConfig(values, file);
    } else {
      console.error(USAGE);
      return 2;
    }
  } catch (e) {
    if (e instanceof ConfigError && /必须是绝对路径|不认识的配置项/.test(e.message)) {
      console.error(`✗ ${e.message}`);
      return 2;
    }
    console.error(`✗ ${e.message}`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify({ ...result, file })}\n`);
  return 0;
}

// 只有直接运行本文件时才执行命令行入口
const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) process.exitCode = main(process.argv.slice(2));
