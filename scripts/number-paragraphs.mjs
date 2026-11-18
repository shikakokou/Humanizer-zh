#!/usr/bin/env node
// 给 Markdown 文本编段号，输出编号副本，供 Humanizer-zh 的扫描/复核子 agent 直接引用。
// 段号规则：空行分段；标题、列表项、表格行各算一段；引用块、代码块整体各算一段。
// 副本除每段首行前加 `[N] ` 和开头 4 行说明外，与原文件逐行一致。
// 用法：node scripts/number-paragraphs.mjs --target <原文> [--out <编号副本>]

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const isBlank = (s) => s.trim() === "";
const fenceMarker = (s) => {
  const m = /^\s*(```|~~~)/.exec(s);
  return m ? m[1] : null;
};
const isQuote = (s) => /^\s*>/.test(s);
const isHeading = (s) => /^\s*#{1,6}\s/.test(s);
const isListItem = (s) => /^\s*([-*+]|\d+[.)])\s/.test(s);
const isTableRow = (s) => /^\s*\|/.test(s);

// 返回每个段首所在的行下标（0 起）。
function segmentStarts(lines) {
  const blocks = [];
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = fenceMarker(lines[i]);
    if (marker) {
      if (start !== null) { blocks.push([start, i - 1]); start = null; }
      const fenceStart = i;
      for (i++; i < lines.length; i++) if (fenceMarker(lines[i]) === marker) break;
      blocks.push([fenceStart, i]);
      continue;
    }
    if (isBlank(lines[i])) {
      if (start !== null) { blocks.push([start, i - 1]); start = null; }
      continue;
    }
    if (start === null) start = i;
  }
  if (start !== null) blocks.push([start, lines.length - 1]);

  const starts = [];
  for (const [from, to] of blocks) {
    if (fenceMarker(lines[from])) { starts.push(from); continue; }
    let allQuote = true;
    for (let i = from; i <= to; i++) if (!isQuote(lines[i])) { allQuote = false; break; }
    if (allQuote) { starts.push(from); continue; }
    let plainStart = null;
    const flushPlain = () => { if (plainStart !== null) { starts.push(plainStart); plainStart = null; } };
    for (let i = from; i <= to; i++) {
      const line = lines[i];
      if (isHeading(line) || isListItem(line) || isTableRow(line)) {
        flushPlain();
        starts.push(i);
      } else if (plainStart === null) {
        plainStart = i;
      }
    }
    flushPlain();
  }
  return starts.sort((a, b) => a - b);
}

// 返回编号副本正文、段数和原文件是否带 BOM；除前缀外逐行等于输入。
export function numberSegments(source, name = "文本") {
  const bom = source.charCodeAt(0) === 0xfeff;
  const raw = bom ? source.slice(1) : source;
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r\n|\n|\r/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const starts = segmentStarts(lines);
  const segOf = new Map(starts.map((ln, k) => [ln, k + 1]));
  const out = [
    `# 编号副本：${name}（${starts.length} 段）`,
    "",
    "段号见每段开头的 `[N]`。直接引用这个编号，不要自己数；标题、列表项、表格行各算一段，引用块和代码块整体各算一段。",
    "",
  ];
  lines.forEach((line, i) => out.push(segOf.has(i) ? `[${segOf.get(i)}] ${line}` : line));
  return { text: out.join(eol) + eol, count: starts.length, bom, eol };
}

function main(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target") opt.target = argv[++i];
    else if (argv[i] === "--out") opt.out = argv[++i];
  }
  if (!opt.target) {
    console.error("用法：node scripts/number-paragraphs.mjs --target <原文> [--out <编号副本>]");
    return 2;
  }
  const source = fs.readFileSync(opt.target, "utf8");
  const { text, count, bom } = numberSegments(source, path.basename(opt.target));
  if (opt.out) {
    const body = bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]) : Buffer.from(text, "utf8");
    fs.writeFileSync(opt.out, body);
    console.log(`已写 ${opt.out}：${count} 段，${body.length} 字节`);
    return 0;
  }
  console.log(`段数 ${count}（预览前 3 段）`);
  for (const line of text.split("\n").filter((l) => /^\[\d+\] /.test(l)).slice(0, 3)) console.log(line.slice(0, 80));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
