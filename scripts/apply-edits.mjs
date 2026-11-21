// Apply a list of literal replacements from a JSON patch file to one target file.
// Usage: node scripts/apply-edits.mjs --target <file> --patches <patch.json>
import {
  readFileSync,
  writeFileSync,
  statSync,
  chmodSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);
const USAGE = '用法：node scripts/apply-edits.mjs --target <待改文件> --patches <补丁文件>';

function toLF(value) {
  return value.replace(/\r\n/g, '\n');
}

// Patches apply in order; each one must match exactly once in the text left by
// the patch before it.
export function applyPatches(text, patches) {
  if (typeof text !== 'string') throw new TypeError('text 必须是字符串');
  if (!Array.isArray(patches)) throw new TypeError('patches 必须是数组');

  let current = toLF(text);
  const report = [];

  patches.forEach((patch, index) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new TypeError(`第 ${index + 1} 条补丁必须是对象`);
    }
    if (typeof patch.find !== 'string' || patch.find === '') {
      throw new TypeError(`第 ${index + 1} 条补丁的 find 必须是非空字符串`);
    }
    if (typeof patch.replace !== 'string') {
      throw new TypeError(`第 ${index + 1} 条补丁的 replace 必须是字符串`);
    }

    const id = patch.id === undefined || patch.id === null
      ? String(index + 1)
      : String(patch.id);
    const find = toLF(patch.find);
    const replace = toLF(patch.replace);
    if (find === '') {
      throw new TypeError(`第 ${index + 1} 条补丁的 find 归一化后为空`);
    }

    const count = current.split(find).length - 1;
    if (count === 0) {
      report.push({ id, status: 'missing', count: 0 });
    } else if (count > 1) {
      report.push({ id, status: 'ambiguous', count });
    } else {
      const at = current.indexOf(find);
      current = current.slice(0, at) + replace + current.slice(at + find.length);
      report.push({ id, status: 'ok', count: 1 });
    }
  });

  return { text: current, report };
}

export function readTarget(targetPath) {
  const buf = readFileSync(targetPath);
  const bom = buf.length >= 3
    && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = buf.subarray(bom ? 3 : 0).toString('utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { text, bom, eol };
}

// Atomic write: temp file in the same directory, then rename. Keeps BOM, line
// endings and file mode.
export function writeTarget(targetPath, text, { bom = false, eol = '\n' } = {}) {
  let mode = 0o666;
  try {
    mode = statSync(targetPath).mode & 0o7777;
  } catch {
    // target may not exist yet
  }

  const body = toLF(text).split('\n').join(eol);
  const buf = bom
    ? Buffer.concat([BOM_BYTES, Buffer.from(body, 'utf8')])
    : Buffer.from(body, 'utf8');

  const tmp = join(
    dirname(targetPath),
    `.${basename(targetPath)}.tmp-${process.pid}-${Date.now()}`,
  );
  try {
    writeFileSync(tmp, buf, { mode });
    try {
      chmodSync(tmp, mode);
    } catch {
      // Windows only keeps a subset of the mode bits
    }
    renameSync(tmp, targetPath);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // temp file may not have been created
    }
    throw err;
  }
  return buf.length;
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target' || arg === '--patches') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`参数 ${arg} 缺少路径值`);
      }
      opts[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  if (!opts.target) throw new Error('缺少参数 --target');
  if (!opts.patches) throw new Error('缺少参数 --patches');
  return opts;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail(`${err.message}\n${USAGE}`);
    return;
  }

  let before;
  try {
    before = statSync(opts.target).size;
  } catch (err) {
    fail(err.code === 'ENOENT'
      ? `目标文件不存在：${opts.target}`
      : `读取目标文件失败：${err.message}`);
    return;
  }

  let target;
  try {
    target = readTarget(opts.target);
  } catch (err) {
    fail(`读取目标文件失败：${err.message}`);
    return;
  }

  let raw;
  try {
    raw = readFileSync(opts.patches, 'utf8');
  } catch (err) {
    fail(`读取补丁文件失败：${err.message}`);
    return;
  }

  let patches;
  try {
    patches = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (err) {
    fail(`补丁文件 JSON 解析失败：${err.message}`);
    return;
  }

  if (!Array.isArray(patches)) {
    fail('补丁文件必须是 JSON 数组');
    return;
  }

  if (patches.length === 0) {
    console.log('没有补丁');
    return;
  }

  let text;
  let report;
  try {
    ({ text, report } = applyPatches(target.text, patches));
  } catch (err) {
    fail(`${err.message}\n未写文件`);
    return;
  }

  for (const item of report) {
    if (item.status === 'ok') {
      console.log(`ok ${item.id} x${item.count}`);
    } else if (item.status === 'missing') {
      console.log(`missing ${item.id}`);
    } else {
      console.log(`ambiguous ${item.id} x${item.count}`);
    }
  }

  const okCount = report.filter((item) => item.status === 'ok').length;
  const missingCount = report.filter((item) => item.status === 'missing').length;
  const ambiguousCount = report.filter((item) => item.status === 'ambiguous').length;

  let summary = `${report.length} 条补丁：${okCount} 通过`;
  if (missingCount > 0) summary += `，${missingCount} 缺失`;
  if (ambiguousCount > 0) summary += `，${ambiguousCount} 歧义`;
  console.log(summary);

  if (missingCount > 0 || ambiguousCount > 0) {
    console.log('未写文件（有失败条目）');
    process.exitCode = 2;
    return;
  }

  let after;
  try {
    after = writeTarget(opts.target, text, { bom: target.bom, eol: target.eol });
  } catch (err) {
    fail(`写入失败：${err.message}`);
    return;
  }
  console.log(`已写 ${opts.target}：${okCount} 处改动，字节 ${before} → ${after}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
