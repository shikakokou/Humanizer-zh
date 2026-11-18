import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberSegments } from './number-paragraphs.mjs';

const body = (result) => result.text.split('\n').slice(4).join('\n');
const strip = (result) => body(result).replace(/^\[\d+\] /gm, '');

test('编号副本除前缀外与原文件逐行一致', () => {
  const src = '# 标题\n\n第一段。\n\n- 列表一\n- 列表二\n\n| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n';
  const res = numberSegments(src);
  assert.equal(strip(res), src);
  assert.equal(res.count, 7);
  assert.match(body(res), /^\[1\] # 标题$/m);
  assert.match(body(res), /^\[2\] 第一段。$/m);
  assert.match(body(res), /^\[3\] - 列表一$/m);
  assert.match(body(res), /^\[5\] \| 甲 \| 乙 \|$/m);
});

test('代码块和引用块各算一段，内部空行不切', () => {
  const src = '前言\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n> 一行\n> 二行\n\n结尾\n';
  const res = numberSegments(src);
  assert.equal(res.count, 4);
  assert.equal(strip(res), src);
  assert.match(body(res), /^\[2\] ```ts$/m);
  assert.match(body(res), /^\[3\] > 一行$/m);
});

test('多行普通段落算一段，续行不加前缀', () => {
  const src = '第一行\n第二行\n\n下一段\n';
  const res = numberSegments(src);
  assert.equal(res.count, 2);
  assert.equal(body(res), '[1] 第一行\n第二行\n\n[2] 下一段\n');
});

test('保留 CRLF 输入的逐行内容和 BOM 标记', () => {
  const src = '\uFEFF甲\r\n\r\n乙\r\n';
  const res = numberSegments(src);
  assert.equal(res.bom, true);
  assert.equal(res.count, 2);
  assert.equal(strip(res), '甲\r\n\r\n乙\r\n');
});

test('空输入不产生段号', () => {
  const res = numberSegments('');
  assert.equal(res.count, 0);
  assert.equal(body(res).trim(), '');
});
