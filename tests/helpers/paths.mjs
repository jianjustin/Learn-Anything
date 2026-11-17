import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PLUGIN_DIR = path.join(ROOT, 'plugins/learn-anything');
export const SKILL_DIR = path.join(PLUGIN_DIR, 'skills/learn');
export const ASSETS_DIR = path.join(SKILL_DIR, 'assets');
export const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');

// 只拼路径，不检查文件是否存在
export const fixture = (name) => path.join(ROOT, 'tests/fixtures', name, 'course-data.js');
export const example = (slug) => path.join(ROOT, 'examples', slug, 'course-data.js');
