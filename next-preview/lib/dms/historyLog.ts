// Dựng timeline lịch sử từ SharePoint version history gốc (KHÔNG cần list audit riêng).
// Mỗi version = 1 mốc. Nhãn hành động suy ra bằng cách diff một số cột theo dõi giữa 2 version liền kề.
// Hạn chế đã biết (phương án tối thiểu schema): thao tác file đính kèm (lưu ở subfolder) KHÔNG tạo
// version trên listItem PDF nên không xuất hiện ở đây.
import type { RawItemVersion } from './sharepointDmsService';

export interface HistoryEntry {
  id: string;
  time?: string;        // ISO
  actor: string;        // người thực hiện
  label: string;        // nhãn hành động ngắn
  detail?: string;      // mô tả thêm (giá trị cũ -> mới)
}

// Các cột theo dõi để gắn nhãn hành động (diff version liền kề).
const TRACKED: { col: string; label: (oldV: string, newV: string) => string }[] = [
  { col: 'EditableSourceUrl', label: () => 'Cập nhật bản mềm' },
  { col: 'TrangThai', label: (o, n) => `Đổi trạng thái: ${o || '—'} → ${n || '—'}` },
  { col: 'VanBanThayThe', label: (o, n) => (n ? `Thiết lập thay thế: ${n}` : `Gỡ liên kết thay thế`) },
  { col: 'VanBanLienQuan', label: () => 'Cập nhật văn bản liên quan' },
  { col: 'NgayHetHieuLuc', label: (o, n) => `Cập nhật ngày hết hiệu lực: ${n || '—'}` },
];

function asText(raw: unknown): string {
  if (raw == null) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'object' && raw !== null && 'Url' in (raw as Record<string, unknown>)) {
    return String((raw as { Url?: unknown }).Url ?? '');
  }
  return String(raw);
}

function actorOf(v: RawItemVersion): string {
  return v.lastModifiedBy?.user?.displayName ?? v.lastModifiedBy?.user?.email ?? 'Hệ thống';
}

/**
 * Dựng timeline (mới nhất trước). Versions Graph trả mới->cũ; phần tử cuối là bản tạo đầu tiên.
 * Nhãn: bản đầu = "Tạo văn bản"; các bản sau = diff cột theo dõi, fallback "Cập nhật metadata".
 */
export function buildHistoryTimeline(versions: RawItemVersion[]): HistoryEntry[] {
  if (!versions.length) {
    return [];
  }
  // Sắp xếp cũ -> mới để diff với version trước đó.
  const asc = [...versions].sort((a, b) => (a.lastModifiedDateTime ?? '').localeCompare(b.lastModifiedDateTime ?? ''));
  const entries: HistoryEntry[] = [];
  for (let i = 0; i < asc.length; i++) {
    const v = asc[i];
    const f = v.fields ?? {};
    if (i === 0) {
      entries.push({ id: v.id, time: v.lastModifiedDateTime, actor: actorOf(v), label: 'Tạo văn bản' });
      continue;
    }
    const prev = asc[i - 1].fields ?? {};
    const changes: string[] = [];
    for (const t of TRACKED) {
      const oldV = asText(prev[t.col]);
      const newV = asText(f[t.col]);
      if (oldV !== newV) {
        changes.push(t.label(oldV, newV));
      }
    }
    entries.push({
      id: v.id,
      time: v.lastModifiedDateTime,
      actor: actorOf(v),
      label: changes[0] ?? 'Cập nhật metadata',
      detail: changes.length > 1 ? changes.slice(1).join(' · ') : undefined,
    });
  }
  // Mới nhất trước.
  return entries.reverse();
}
