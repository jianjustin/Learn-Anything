// 不经过 Claude Code 的 userConfig 时（比如在 Codex 里），课程目录和国考题库存在一个 JSON 配置文件里：
//   {"courses_dir": "<绝对路径>", "guokao_repo": "<绝对路径>"}
// 文件位置：环境变量 LEARN_ANYTHING_CONFIG（绝对路径）；没有时取 $XDG_CONFIG_HOME/learn-anything/config.json；
// XDG_CONFIG_HOME 没设置或不是绝对路径时取 ~/.config/learn-anything/config.json。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const KEYS = ['courses_dir', 'guokao_repo'];

export class ConfigError extends Error {}

export function configPath(env = process.env) {
  if (env.LEARN_ANYTHING_CONFIG && path.isAbsolute(env.LEARN_ANYTHING_CONFIG)) return env.LEARN_ANYTHING_CONFIG;
  const xdg = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(os.homedir(), '.config');
  return path.join(xdg, 'learn-anything', 'config.json');
}

const isAbsPath = (v) => typeof v === 'string' && v !== '' && path.isAbsolute(v) && !/[\u0000-\u001f]/.test(v);

// 读配置。文件不存在时两项都是 null；文件读不懂、某一项不是绝对路径时抛 ConfigError
export function readConfig(file = configPath()) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { courses_dir: null, guokao_repo: null };
    throw new ConfigError(`读不了配置文件 ${file}：${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ConfigError(`配置文件 ${file} 不是合法的 JSON`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new ConfigError(`配置文件 ${file} 应当是一个 JSON 对象`);
  const out = {};
  for (const k of KEYS) {
    const v = data[k];
    if (v === undefined || v === null || v === '') out[k] = null;
    else if (isAbsPath(v)) out[k] = v;
    else throw new ConfigError(`配置文件 ${file} 里的 ${k} 应当是绝对路径`);
  }
  return out;
}

// 按键合并：只改给了的项，没给的保留；文件里别的键也原样保留
export function writeConfig(values, file = configPath()) {
  for (const [k, v] of Object.entries(values)) {
    if (!KEYS.includes(k)) throw new ConfigError(`不认识的配置项：${k}`);
    if (!isAbsPath(v)) throw new ConfigError(`${k} 必须是绝对路径：${v}`);
  }
  readConfig(file); // 现有文件读不懂时不覆盖它
  let current = {};
  try {
    current = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    current = {};
  }
  const next = { ...current };
  for (const [k, v] of Object.entries(values)) next[k] = v.length > 1 ? v.replace(/\/+$/, '') : v;
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, file);
  return readConfig(file);
}
