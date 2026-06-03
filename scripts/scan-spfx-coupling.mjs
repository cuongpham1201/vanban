#!/usr/bin/env node
/**
 * scan-spfx-coupling.mjs
 *
 * AUDIT helper (read-only) — quét toàn bộ source để liệt kê:
 *   1. Các file phụ thuộc SPFx (@microsoft/sp-*, SPHttpClient, WebPartContext,
 *      BaseClientSideWebPart, PropertyPane, this.context, AMD define()).
 *   2. Tần suất từng "coupling marker".
 *
 * KHÔNG sửa file. Chỉ in báo cáo ra stdout (hoặc --json).
 *
 * Cách chạy (từ /web/vanban):
 *   node scripts/scan-spfx-coupling.mjs              # bảng text
 *   node scripts/scan-spfx-coupling.mjs --json       # JSON cho tooling
 *   node scripts/scan-spfx-coupling.mjs --root lib   # đổi thư mục quét
 *
 * Lưu ý: kho hiện tại chỉ có build output (lib/*.js + *.d.ts). Khi copy lại
 * `src/` (TypeScript gốc) từ project dms-portal, chạy lại với `--root src`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : 'lib';
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

// (label, regex) — mỗi marker = 1 dấu hiệu SPFx coupling cần thay thế.
const MARKERS = [
  ['import @microsoft/sp-*', /from\s+['"]@microsoft\/sp-[^'"]+['"]/g],
  ['SPHttpClient', /\bSPHttpClient\b/g],
  ['WebPartContext', /\bWebPartContext\b/g],
  ['BaseClientSideWebPart', /\bBaseClientSideWebPart\b/g],
  ['PropertyPane*', /\bPropertyPane[A-Za-z]*\b/g],
  ['this.context', /\bthis\.context\b/g],
  ['spHttpClient', /\bspHttpClient\b/g],
  ['pageContext', /\bpageContext\b/g],
  ['microsoftTeams sdk', /sdks\.microsoftTeams/g],
  ['AMD define()', /^\s*define\(\[/m],
  ['@fluentui/react', /from\s+['"]@fluentui\/react[^'"]*['"]/g],
];

// Loại comment (// dòng, /* block */, * jsdoc) để tránh false-positive khi marker
// chỉ xuất hiện trong chú thích (vd IDmsService.ts nhắc "SPHttpClient" trong doc).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      out.push(...walk(p));
    } else if (EXT.has(extname(name)) && !name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

let files;
try {
  files = walk(ROOT);
} catch (e) {
  console.error(`Không quét được thư mục "${ROOT}": ${e.message}`);
  process.exit(1);
}

const perFile = [];
const totals = Object.fromEntries(MARKERS.map(([l]) => [l, 0]));

for (const f of files) {
  const src = stripComments(readFileSync(f, 'utf8'));
  const hits = {};
  for (const [label, re] of MARKERS) {
    const m = src.match(re);
    if (m && m.length) {
      hits[label] = m.length;
      totals[label] += m.length;
    }
  }
  if (Object.keys(hits).length) {
    perFile.push({ file: relative('.', f).replace(/\\/g, '/'), hits });
  }
}

if (asJson) {
  console.log(JSON.stringify({ root: ROOT, scanned: files.length, totals, perFile }, null, 2));
  process.exit(0);
}

console.log(`\nSPFx coupling scan — root="${ROOT}", ${files.length} file quét\n`);
console.log('TỔNG THEO MARKER');
for (const [label, n] of Object.entries(totals)) {
  console.log(`  ${String(n).padStart(4)}  ${label}`);
}
console.log(`\nFILE CÓ COUPLING (${perFile.length})`);
for (const { file, hits } of perFile.sort((a, b) => a.file.localeCompare(b.file))) {
  const tags = Object.entries(hits).map(([k, v]) => `${k}×${v}`).join(', ');
  console.log(`  ${file}\n      ${tags}`);
}
console.log('');
