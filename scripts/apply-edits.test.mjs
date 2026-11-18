import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPatches, readTarget, writeTarget } from './apply-edits.mjs';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'apply-edits-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('applies patches in order', () => {
  const { text, report } = applyPatches('第一段\n第二段\n第三段\n', [
    { id: 'A1', find: '第一段', replace: '甲' },
    { id: 'A2', find: '第二段', replace: '乙' },
    { id: 'A3', find: '第三段', replace: '丙' },
  ]);
  assert.equal(text, '甲\n乙\n丙\n');
  assert.deepEqual(report, [
    { id: 'A1', status: 'ok', count: 1 },
    { id: 'A2', status: 'ok', count: 1 },
    { id: 'A3', status: 'ok', count: 1 },
  ]);

  const chained = applyPatches('甲', [
    { id: 'S1', find: '甲', replace: '甲甲' },
    { id: 'S2', find: '甲甲', replace: '乙' },
  ]);
  assert.equal(chained.text, '乙');
  assert.deepEqual(chained.report.map((item) => item.status), ['ok', 'ok']);
});

test('reports missing and ambiguous finds without changing text', () => {
  const { text, report } = applyPatches('甲乙甲乙', [
    { find: '丙', replace: 'x' },
    { id: 'C', find: '甲乙', replace: 'x' },
  ]);
  assert.equal(text, '甲乙甲乙');
  assert.deepEqual(report, [
    { id: '1', status: 'missing', count: 0 },
    { id: 'C', status: 'ambiguous', count: 2 },
  ]);
});

test('deletes matched text when replace is empty', () => {
  const { text, report } = applyPatches('保留删除保留', [
    { id: 'D', find: '删除', replace: '' },
  ]);
  assert.equal(text, '保留保留');
  assert.deepEqual(report, [{ id: 'D', status: 'ok', count: 1 }]);
});

test('preserves CRLF and BOM on roundtrip', () => withTmpDir((dir) => {
  const crlfFile = join(dir, 'crlf.md');
  writeFileSync(crlfFile, '第一行\r\n第二行\r\n', 'utf8');
  const crlf = readTarget(crlfFile);
  assert.equal(crlf.bom, false);
  assert.equal(crlf.eol, '\r\n');
  const crlfEdit = applyPatches(crlf.text, [
    { find: '第一行\n第二行', replace: '第一行改\n第二行' },
  ]);
  writeTarget(crlfFile, crlfEdit.text, { bom: crlf.bom, eol: crlf.eol });
  assert.equal(readFileSync(crlfFile, 'utf8'), '第一行改\r\n第二行\r\n');

  const bomFile = join(dir, 'bom.md');
  writeFileSync(bomFile, Buffer.concat([BOM, Buffer.from('你好\n世界\n', 'utf8')]));
  const bomDoc = readTarget(bomFile);
  assert.equal(bomDoc.bom, true);
  assert.ok(!bomDoc.text.startsWith('\uFEFF'));
  const bomEdit = applyPatches(bomDoc.text, [
    { find: '世界', replace: '世界！' },
  ]);
  writeTarget(bomFile, bomEdit.text, { bom: bomDoc.bom, eol: bomDoc.eol });
  const raw = readFileSync(bomFile);
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(raw.subarray(3).toString('utf8'), '你好\n世界！\n');
}));

test('writes atomically without leftover temp files', () => withTmpDir((dir) => {
  const file = join(dir, 'atomic.md');
  writeFileSync(file, '旧内容\n', 'utf8');
  const target = readTarget(file);
  const edited = applyPatches(target.text, [
    { find: '旧内容', replace: '新内容' },
  ]);
  writeTarget(file, edited.text, { bom: target.bom, eol: target.eol });

  assert.equal(readFileSync(file, 'utf8'), '新内容\n');
  assert.deepEqual(readdirSync(dir), ['atomic.md']);
}));
