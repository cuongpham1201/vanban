// Search Center — adapter từ IDocument (backend thật) sang view model + helper.
// Port nhãn/badge/confidence từ dms-design/assets/sc-app.js, dùng metadata V2 thật.
import { IDocument, DocStatus, SecurityLevel } from '@dms/models/IDocument';
import { formatDate, daysUntil } from '@dms/utils/format';
import { isExpired } from '@dms/utils/standardization';

export interface ConfInfo {
  pct: number;
  label: string;
  color: string;
}

export interface SearchDoc {
  id: string;
  num: string; // soVanBan
  title: string; // trichYeu
  type: 'pdf' | 'doc';
  nhom: string;
  loaiPL: string;
  loaiTL: string;
  chude: string;
  donViPH: string;
  donViSH: string;
  nguoiKy: string;
  ngayBH: string;
  hetHL: string;
  statusLabel: string;
  statusClass: string;
  baomat: string;
  baomatClass: string;
  softcopy: boolean;
  editable: boolean;
  conf: ConfInfo | null;
  nguon: string;
  tags: string[];
  thaythe: string;
  webUrl?: string;
}

const DASH = '—';
function v(s?: string | null): string {
  return s && s.trim() ? s.trim() : DASH;
}

export function splitTags(tags?: string): string[] {
  return (tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** MetadataConfidence (nhãn phân loại) -> {pct đại diện, nhãn VN, màu}. */
export function confInfo(raw?: string): ConfInfo | null {
  switch ((raw ?? '').trim()) {
    case 'High':
      return { pct: 95, label: 'Cao', color: 'var(--conf-high)' };
    case 'Medium':
      return { pct: 75, label: 'Trung bình', color: 'var(--conf-mid)' };
    case 'Low':
      return { pct: 50, label: 'Thấp', color: 'var(--conf-low)' };
    case 'NeedsReview':
      return { pct: 40, label: 'Cần rà soát', color: 'var(--conf-low)' };
    default:
      return null;
  }
}

function statusOf(d: IDocument): { label: string; cls: string } {
  if (isExpired(d)) {
    return { label: 'Hết hiệu lực', cls: 'badge-danger' };
  }
  if (d.ngayHetHieuLuc) {
    const dd = daysUntil(d.ngayHetHieuLuc);
    if (dd !== undefined && dd >= 0 && dd <= 30) {
      return { label: 'Sắp hết hiệu lực', cls: 'badge-warn' };
    }
  }
  switch (d.trangThai) {
    case DocStatus.Active:
      return { label: 'Đang lưu hành', cls: 'badge-ok' };
    case DocStatus.Expired:
      return { label: 'Hết hiệu lực', cls: 'badge-danger' };
    case DocStatus.Draft:
      return { label: 'Bản nháp', cls: 'badge-neutral' };
    case DocStatus.Revoked:
      return { label: 'Thu hồi', cls: 'badge-warn' };
    default:
      return { label: String(d.trangThai ?? '—'), cls: 'badge-neutral' };
  }
}

function securityClass(level?: string): string {
  switch (level) {
    case SecurityLevel.Public:
      return 'badge-ok';
    case SecurityLevel.Internal:
      return 'badge-info';
    case SecurityLevel.Confidential:
      return 'badge-warn';
    case SecurityLevel.TopSecret:
      return 'badge-danger';
    default:
      return 'badge-neutral';
  }
}

export function toSearchDoc(d: IDocument): SearchDoc {
  const st = statusOf(d);
  const hasSoft = !!d.editableSource || !!d.hasPair;
  return {
    id: d.id,
    num: v(d.soVanBan),
    title: v(d.trichYeu),
    type: d.fileKind === 'pdf' ? 'pdf' : 'doc',
    nhom: v(d.nhomTaiLieu),
    loaiPL: v(d.loaiVanBanPhapLy ?? d.loaiVanBan),
    loaiTL: v(d.loaiTaiLieu),
    chude: v(d.chuDeNghiepVu),
    donViPH: v(d.donViPhatHanh ?? d.donViSoanThao),
    donViSH: v(d.donViSoHuu),
    nguoiKy: v(d.nguoiKy),
    ngayBH: d.ngayBanHanh ? formatDate(d.ngayBanHanh) : DASH,
    hetHL: d.ngayHetHieuLuc ? formatDate(d.ngayHetHieuLuc) : DASH,
    statusLabel: st.label,
    statusClass: st.cls,
    baomat: v(d.mucDoBaoMat),
    baomatClass: securityClass(d.mucDoBaoMat),
    softcopy: hasSoft,
    editable: !!d.editableSource,
    conf: confInfo(d.metadataConfidence),
    nguon: v(d.nguonMetadata),
    tags: splitTags(d.tags),
    thaythe: v(d.vanBanThayThe) === DASH ? '' : (d.vanBanThayThe as string),
    webUrl: d.webUrl,
  };
}

// ── Facet groups (Metadata V2) ──────────────────────────────────────────────
export interface FacetDef {
  key: string;
  label: string;
  open: boolean;
  get: (d: IDocument) => string;
}

const NA = '(Chưa có)';
const g = (s?: string | number | null): string => {
  const t = s === undefined || s === null ? '' : String(s).trim();
  return t || NA;
};

export const FACET_DEFS: FacetDef[] = [
  { key: 'nhomTaiLieu', label: 'Nhóm tài liệu', open: true, get: (d) => g(d.nhomTaiLieu) },
  { key: 'loaiTaiLieu', label: 'Loại tài liệu', open: true, get: (d) => g(d.loaiTaiLieu) },
  { key: 'loaiVanBanPhapLy', label: 'Loại VB pháp lý', open: true, get: (d) => g(d.loaiVanBanPhapLy ?? d.loaiVanBan) },
  { key: 'chuDeNghiepVu', label: 'Chủ đề nghiệp vụ', open: false, get: (d) => g(d.chuDeNghiepVu) },
  { key: 'donViPhatHanh', label: 'Đơn vị phát hành', open: true, get: (d) => g(d.donViPhatHanh ?? d.donViSoanThao) },
  { key: 'donViSoHuu', label: 'Đơn vị sở hữu', open: false, get: (d) => g(d.donViSoHuu) },
  { key: 'namBanHanh', label: 'Năm ban hành', open: false, get: (d) => g(d.namBanHanh) },
  { key: 'trangThai', label: 'Trạng thái', open: false, get: (d) => statusOf(d).label },
  { key: 'mucDoBaoMat', label: 'Mức độ bảo mật', open: false, get: (d) => g(d.mucDoBaoMat) },
  { key: 'metadataConfidence', label: 'Độ tin cậy', open: false, get: (d) => (confInfo(d.metadataConfidence)?.label ?? NA) },
  { key: 'nguonMetadata', label: 'Nguồn metadata', open: false, get: (d) => g(d.nguonMetadata) },
  { key: 'hasEditableSource', label: 'Bản mềm', open: false, get: (d) => (d.editableSource ? 'Có bản mềm' : 'Thiếu bản mềm') },
];

/** Chuẩn hóa tiếng Việt: bỏ dấu, đ→d, lowercase (để match không phụ thuộc dấu/hoa thường). */
export function normalizeVi(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Token search: tách query theo khoảng trắng, MỖI token phải xuất hiện trong haystack
 * (không cần liền nhau). VD "quy xử" → match "quy tắc ứng xử". Bỏ dấu + không phân biệt hoa thường.
 */
export function matchesKeyword(d: IDocument, kw: string): boolean {
  const tokens = normalizeVi(kw).split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  const hay = normalizeVi(
    [
      d.soVanBan, d.trichYeu, d.loaiVanBan, d.loaiVanBanPhapLy, d.loaiTaiLieu, d.nhomTaiLieu,
      d.chuDeNghiepVu, d.donViPhatHanh, d.donViSoHuu, d.donViSoanThao, d.nguoiKy, d.tags, d.fileName,
    ]
      .filter(Boolean)
      .join(' ')
  );
  return tokens.every((t) => hay.includes(t));
}
