// Helper xuất CSV (Unicode tiếng Việt, BOM UTF-8 cho Excel, escape an toàn).
// Không phụ thuộc thư viện ngoài.

function escapeCell(value: string): string {
  const s: string = value ?? '';
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Tạo + tải file CSV.
 * @param filename tên file (kèm .csv)
 * @param headers  hàng tiêu đề
 * @param rows     các dòng dữ liệu (mảng chuỗi)
 */
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(','));
  rows.forEach((r: string[]): void => { lines.push(r.map(escapeCell).join(',')); });
  // BOM UTF-8 để Excel nhận diện Unicode đúng font tiếng Việt
  const csv: string = '﻿' + lines.join('\r\n');

  const blob: Blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url: string = URL.createObjectURL(blob);
  const a: HTMLAnchorElement = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Tên file dạng can-chuan-hoa-metadata-YYYYMMDD-HHmm.csv */
export function timestampedName(prefix: string): string {
  const d: Date = new Date();
  const p: (n: number) => string = (n: number): string => (n < 10 ? '0' + n : '' + n);
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`;
}
