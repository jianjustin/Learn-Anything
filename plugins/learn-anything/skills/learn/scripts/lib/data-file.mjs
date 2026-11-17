// 课程数据文件的读写。文件形态固定为 `window.<名字> = <严格 JSON>;`，
// 这里只用 JSON.parse 读，绝不执行文件内容。
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class DataFileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DataFileError';
    this.code = code; // 'wrapper' | 'json'
  }
}

export function parseDataFile(text, globalName) {
  // trim() 去掉的空白包括开头的 BOM（U+FEFF），带 BOM 的文件不用另外处理
  const src = String(text).trim();
  const prefix = `window.${globalName} = `;
  if (!src.startsWith(prefix)) {
    throw new DataFileError('wrapper', `数据文件应以 "${prefix}" 开头`);
  }
  if (!src.endsWith(';')) {
    throw new DataFileError('wrapper', '数据文件应以分号结尾（可能写到一半）');
  }
  const body = src.slice(prefix.length, -1);
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    throw new DataFileError('json', `外壳里不是严格 JSON：${e.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new DataFileError('json', '外壳里的顶层值必须是 JSON 对象');
  }
  return data;
}

export function serializeDataFile(globalName, data) {
  return `window.${globalName} = ${JSON.stringify(data, null, 2)};\n`;
}

export function readDataFile(file, globalName) {
  return parseDataFile(readFileSync(file, 'utf8'), globalName);
}

// 先写同目录的临时文件再改名，读者不会看到写到一半的文件
export function writeDataFile(file, globalName, data) {
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(tmp, serializeDataFile(globalName, data));
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
