// Tính KPI / recent / expiring / unit-stats / search / storage-folders TỪ danh sách documents.
// PORT logic từ SharePointDmsService (getKpis/getRecentDocuments/... ) — tính client-side
// sau khi fetch all qua /api/documents. Giữ nguyên định nghĩa nghiệp vụ.
import {
  IDocument,
  IKpiStat,
  IUnitStat,
  IStorageFolder,
  IDocSearchFilter,
  DocStatus,
} from '@dms/models/IDocument';
import {
  isExpired,
  isNotExpired,
  isRecentlyIssued,
  needsStandardization,
} from '@dms/utils/standardization';

const UNIT_COLORS = [
  '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#06B6D4', '#84CC16',
];

function folderCode(name: string): string {
  const m = (name ?? '').match(/^\s*\[(\d{2}(?:\.\d{2})?)\]/);
  return m ? m[1] : name ?? 'KHAC';
}
function folderSortKey(name: string): number {
  const m = (name ?? '').match(/^\s*\[(\d+(?:\.\d+)?)\]/);
  return m ? parseFloat(m[1]) : Number.MAX_VALUE;
}

export function computeKpis(all: IDocument[]): IKpiStat[] {
  const visible = all.filter(isNotExpired);
  const today = new Date().toISOString().substring(0, 10);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const cutoff30 = in30.toISOString().substring(0, 10);

  const total = visible.length;
  const active = visible.filter((d) => d.trangThai === DocStatus.Active).length;
  const expired = all.filter(isExpired).length;
  const expiring = visible.filter(
    (d) => !!d.ngayHetHieuLuc && d.ngayHetHieuLuc >= today && d.ngayHetHieuLuc <= cutoff30
  ).length;
  const hasSource = visible.filter((d) => !!d.editableSource).length;
  const missingSource = total - hasSource;
  const recent = visible.filter((d) => isRecentlyIssued(d, 2)).length;
  const needsReview = visible.filter(needsStandardization).length;
  const pct = (n: number): string => (total ? `${((n * 100) / total).toFixed(1)}% tổng số` : '');

  return [
    { key: 'total', label: 'Tổng số văn bản', value: total, caption: '' },
    { key: 'byUnit', label: 'Văn bản theo cấp lưu trữ', value: total, caption: 'Xem theo cấp lưu trữ' },
    { key: 'active', label: 'Văn bản đang lưu hành', value: active, caption: pct(active) },
    { key: 'recent', label: 'Văn bản mới ban hành', value: recent, caption: '2 tháng gần đây' },
    { key: 'expiringSoon', label: 'Văn bản sắp hết hiệu lực', value: expiring, caption: '30 ngày tới' },
    { key: 'expired', label: 'Văn bản hết hiệu lực', value: expired, caption: expired === 0 ? 'Không có' : '' },
    { key: 'needsReview', label: 'Cần chuẩn hóa', value: needsReview, caption: pct(needsReview) },
    { key: 'missingSource', label: 'Thiếu bản mềm', value: missingSource, caption: pct(missingSource) },
    { key: 'hasSource', label: 'Có bản mềm', value: hasSource, caption: pct(hasSource) },
  ];
}

export function computeRecent(all: IDocument[]): IDocument[] {
  return all
    .filter((d) => d.trangThai === DocStatus.Active && isNotExpired(d))
    .sort((a, b) => b.ngayBanHanh.localeCompare(a.ngayBanHanh))
    .slice(0, 10);
}

export function computeExpiring(all: IDocument[]): IDocument[] {
  const today = new Date().toISOString().substring(0, 10);
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const cutoff = in60.toISOString().substring(0, 10);
  return all
    .filter((d) => {
      if (isExpired(d)) {
        return false;
      }
      if (!d.ngayHetHieuLuc) {
        return false;
      }
      return d.ngayHetHieuLuc >= today && d.ngayHetHieuLuc <= cutoff;
    })
    .sort((a, b) => (a.ngayHetHieuLuc ?? '').localeCompare(b.ngayHetHieuLuc ?? ''))
    .slice(0, 10);
}

/** Folder cấp lưu trữ — derive từ DonViSoHuu xuất hiện trong documents (preview read-only). */
export function computeStorageFolders(all: IDocument[]): IStorageFolder[] {
  const seen = new Map<string, number>();
  for (const d of all) {
    const name = (d.donViSoHuu ?? '').trim();
    if (!name) {
      continue;
    }
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  const folders: IStorageFolder[] = Array.from(seen.entries()).map(([name, count]) => ({
    name,
    serverRelativeUrl: undefined,
    itemCount: count,
  }));
  folders.sort((a, b) => {
    const ka = folderSortKey(a.name);
    const kb = folderSortKey(b.name);
    if (ka !== kb) {
      return ka - kb;
    }
    return a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' });
  });
  return folders;
}

export function computeUnitStats(all: IDocument[]): IUnitStat[] {
  const folders = computeStorageFolders(all);
  const docs = all.filter(isNotExpired);
  const countByCode: { [code: string]: number } = {};
  for (const doc of docs) {
    const code = doc.donViCode || 'KHAC';
    countByCode[code] = (countByCode[code] ?? 0) + 1;
  }
  const result: IUnitStat[] = folders.map((fld, idx) => {
    const code = folderCode(fld.name);
    return {
      code,
      name: fld.name,
      count: countByCode[code] ?? 0,
      color: UNIT_COLORS[idx % UNIT_COLORS.length],
    };
  });
  result.sort((a, b) => {
    const ka = folderSortKey(a.name);
    const kb = folderSortKey(b.name);
    if (ka !== kb) {
      return ka - kb;
    }
    return a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' });
  });
  return result;
}

export function searchDocuments(all: IDocument[], filter: IDocSearchFilter): IDocument[] {
  const keyword = (filter.keyword ?? '').trim().toLowerCase();
  return all.filter((d) => {
    if (isExpired(d)) {
      return false;
    }
    if (filter.typeKey && d.loaiVanBanKey !== filter.typeKey) {
      return false;
    }
    if (filter.soVanBan && d.soVanBan.toLowerCase().indexOf(filter.soVanBan.toLowerCase()) === -1) {
      return false;
    }
    if (filter.loaiVanBan && d.loaiVanBan !== filter.loaiVanBan) {
      return false;
    }
    if (filter.donViCode && d.donViCode !== filter.donViCode) {
      return false;
    }
    if (filter.nhomTaiLieu && (d.nhomTaiLieu ?? '') !== filter.nhomTaiLieu) {
      return false;
    }
    if (filter.loaiTaiLieu && (d.loaiTaiLieu ?? '') !== filter.loaiTaiLieu) {
      return false;
    }
    if (filter.donViPhatHanh && (d.donViPhatHanh ?? '') !== filter.donViPhatHanh) {
      return false;
    }
    if (filter.nguoiKy && d.nguoiKy.toLowerCase().indexOf(filter.nguoiKy.toLowerCase()) === -1) {
      return false;
    }
    if (filter.tuNgay && d.ngayBanHanh < filter.tuNgay) {
      return false;
    }
    if (filter.denNgay && d.ngayBanHanh > filter.denNgay) {
      return false;
    }
    if (keyword) {
      const haystack = [
        d.soVanBan, d.trichYeu, d.loaiVanBan, d.donViSoanThao, d.donViCode, d.nguoiKy,
        d.nhomTaiLieu ?? '', d.loaiTaiLieu ?? '', d.chuDeNghiepVu ?? '', d.donViPhatHanh ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (haystack.indexOf(keyword) === -1) {
        return false;
      }
    }
    return true;
  });
}
