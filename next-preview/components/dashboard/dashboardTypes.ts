// Dashboard nghiệp vụ — tổng hợp (aggregate) client-side từ IDocument[] (read-only).
// Tái dùng định nghĩa thống nhất isExpired (standardization) + daysUntil/formatDate (format).
import { IDocument, DocStatus } from '@dms/models/IDocument';
import { isExpired } from '@dms/utils/standardization';
import { daysUntil, formatDate } from '@dms/utils/format';

export const EXPIRING_WINDOW_DAYS = 30;

// Sắp hết hiệu lực = CÒN hiệu lực + có NgayHetHieuLuc trong vòng N ngày tới.
export function isExpiringSoon(d: IDocument, withinDays = EXPIRING_WINDOW_DAYS): boolean {
  if (isExpired(d)) {
    return false;
  }
  const dd = daysUntil(d.ngayHetHieuLuc);
  return dd !== undefined && dd >= 0 && dd <= withinDays;
}

export interface Kpis {
  total: number;
  active: number;
  expired: number;
  expiringSoon: number;
}

// KPI:
//  - total        = tổng số văn bản trả về.
//  - expired      = isExpired (TrangThai = "Hết hiệu lực" HOẶC NhomTaiLieu = "Hết hiệu lực").
//  - active       = CÒN hiệu lực + TrangThai = "Đang lưu hành".
//  - expiringSoon = CÒN hiệu lực + NgayHetHieuLuc trong vòng 30 ngày.
export function computeKpis(docs: IDocument[]): Kpis {
  let active = 0;
  let expired = 0;
  let expiringSoon = 0;
  for (const d of docs) {
    if (isExpired(d)) {
      expired++;
      continue;
    }
    if (d.trangThai === DocStatus.Active) {
      active++;
    }
    if (isExpiringSoon(d)) {
      expiringSoon++;
    }
  }
  return { total: docs.length, active, expired, expiringSoon };
}

export interface DistItem {
  label: string;
  count: number;
  pct: number; // % so với mục lớn nhất (cho bề rộng thanh bar)
}

// Đếm theo key, sắp xếp giảm dần, tính pct theo max. limit<=0 = lấy hết.
export function distribution(
  docs: IDocument[],
  keyOf: (d: IDocument) => string,
  limit = 0
): DistItem[] {
  const counts = new Map<string, number>();
  for (const d of docs) {
    const k = keyOf(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
  const max = sorted.length ? sorted[0].count : 0;
  const sliced = limit > 0 ? sorted.slice(0, limit) : sorted;
  return sliced.map((x) => ({ ...x, pct: max ? Math.round((x.count / max) * 100) : 0 }));
}

const NA = '(Chưa phân loại)';
const text = (s?: string | number | null): string => {
  const t = s === undefined || s === null ? '' : String(s).trim();
  return t || NA;
};

// Phân bố theo Loại VB pháp lý (fallback LoaiVanBan v1).
export const typeOf = (d: IDocument): string => text(d.loaiVanBanPhapLy ?? d.loaiVanBan);
// Phân bố theo Đơn vị phát hành (fallback DonViSoanThao v1).
export const deptOf = (d: IDocument): string => text(d.donViPhatHanh ?? d.donViSoanThao);
// Phân bố theo Năm ban hành.
export const yearOf = (d: IDocument): string => text(d.namBanHanh);

export interface RecentDoc {
  id: string;
  num: string;
  title: string;
  ngayBH: string;
  type: 'pdf' | 'doc';
  donVi: string;
}

// Top N văn bản mới nhất theo NgayBanHanh (giảm dần). Văn bản thiếu ngày xếp cuối.
export function recentDocuments(docs: IDocument[], limit = 10): RecentDoc[] {
  return [...docs]
    .sort((a, b) => (b.ngayBanHanh ?? '').localeCompare(a.ngayBanHanh ?? ''))
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      num: text(d.soVanBan),
      title: text(d.trichYeu),
      ngayBH: d.ngayBanHanh ? formatDate(d.ngayBanHanh) : '—',
      type: d.fileKind === 'pdf' ? 'pdf' : 'doc',
      donVi: deptOf(d),
    }));
}
