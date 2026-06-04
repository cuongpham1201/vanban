// Replace Document — view types + helpers (UI only, read-only).
// Reuse SearchDoc/toSearchDoc từ Search Center (Phase 2) để không trùng logic mapping.
import { SearchDoc, toSearchDoc } from '@/components/search/searchTypes';

export type ReplaceStep = 1 | 2 | 3 | 4;

export interface StepDef {
  step: ReplaceStep;
  label: string;
}

export const STEPS: StepDef[] = [
  { step: 1, label: 'Chọn văn bản cũ' },
  { step: 2, label: 'Chọn văn bản mới' },
  { step: 3, label: 'So sánh' },
  { step: 4, label: 'Xác nhận' },
];

// 5 trường so sánh song song (Trạng thái render riêng dạng badge ở CompareStep).
export interface CompareRow {
  label: string;
  get: (d: SearchDoc) => string;
}

export const COMPARE_ROWS: CompareRow[] = [
  { label: 'Số văn bản', get: (d) => d.num },
  { label: 'Trích yếu', get: (d) => d.title },
  { label: 'Ngày ban hành', get: (d) => d.ngayBH },
  { label: 'Đơn vị', get: (d) => d.donViPH },
];

// Lọc gợi ý trong picker — chỉ dựa trên SearchDoc (không cần IDocument).
export function matchesPick(d: SearchDoc, kw: string): boolean {
  const q = kw.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [d.num, d.title, d.donViPH, d.nguoiKy, d.loaiPL, d.nhom]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export { toSearchDoc };
export type { SearchDoc };
