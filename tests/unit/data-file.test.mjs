import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCRIPTS_DIR } from '../helpers/paths.mjs';

const { parseDataFile, serializeDataFile, readDataFile, writeDataFile, DataFileError } =
  await import(path.join(SCRIPTS_DIR, 'lib/data-file.mjs'));

test('往返后内容不变', () => {
  const d = { version: 1, topic: '宏观经济学 "入门"\n第二行', lessons: [{ id: 'a' }] };
  assert.deepEqual(parseDataFile(serializeDataFile('LEARN_COURSE', d), 'LEARN_COURSE'), d);
});

test('序列化的形态', () => {
  assert.equal(serializeDataFile('LEARN_INDEX', { version: 1 }), 'window.LEARN_INDEX = {\n  "version": 1\n};\n');
});

test('容忍 BOM 和首尾空白', () => {
  assert.deepEqual(parseDataFile('﻿\n  window.LEARN_COURSE = {"version":1};\n\n', 'LEARN_COURSE'), { version: 1 });
});

for (const [name, text, code] of [
  ['键没加引号', 'window.LEARN_COURSE = { version: 1 };', 'json'],
  ['尾逗号', 'window.LEARN_COURSE = { "version": 1, };', 'json'],
  ['注释', 'window.LEARN_COURSE = { /* x */ "version": 1 };', 'json'],
  ['分号后还有语句', 'window.LEARN_COURSE = { "version": 1 }; alert(1);', 'json'],
  ['顶层不是对象', 'window.LEARN_COURSE = [1];', 'json'],
  ['全局变量名不对', 'window.OTHER = { "version": 1 };', 'wrapper'],
  ['缺结尾分号', 'window.LEARN_COURSE = { "version": 1 }', 'wrapper'],
  ['写到一半', 'window.LEARN_COURSE = { "version": 1, "top', 'wrapper'],
]) {
  test(`拒绝：${name}`, () => {
    assert.throws(() => parseDataFile(text, 'LEARN_COURSE'), (e) => e instanceof DataFileError && e.code === code);
  });
}

test('writeDataFile 写完后没有残留的临时文件，内容可读回', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '学习 目录-'));
  const file = path.join(dir, 'course-data.js');
  writeDataFile(file, 'LEARN_COURSE', { version: 1 });
  assert.deepEqual(readdirSync(dir), ['course-data.js']);
  assert.deepEqual(readDataFile(file, 'LEARN_COURSE'), { version: 1 });
  assert.equal(readFileSync(file, 'utf8'), serializeDataFile('LEARN_COURSE', { version: 1 }));
});
