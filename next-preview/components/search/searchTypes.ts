// Search Center — adapter từ IDocument (backend thật) sang view model + helper.
// Port nhãn/badge/confidence từ dms-design/assets/sc-app.js, dùng metadata V2 thật.
import { IDocument, DocStatus, SecurityLevel } from '@dms/models/IDocument';
import { formatDate, daysUntil } from '@dms/utils/format';
import { isExpired } from '@dms/utils/standardization';
import { sortDocumentsByIssuedDateThenNumber } from '@dms/utils/sortDocs';

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
  { key: 'donViPhatHanh', label: 'Đơn vị soạn thảo', open: true, get: (d) => g(d.donViPhatHanh ?? d.donViSoanThao) },
  { key: 'donViSoHuu', label: 'Cấp lưu trữ', open: false, get: (d) => g(d.donViSoHuu) },
  { key: 'namBanHanh', label: 'Năm ban hành', open: false, get: (d) => g(d.namBanHanh) },
  { key: 'trangThai', label: 'Trạng thái', open: false, get: (d) => statusOf(d).label },
  { key: 'mucDoBaoMat', label: 'Mức độ bảo mật', open: false, get: (d) => g(d.mucDoBaoMat) },
  { key: 'metadataConfidence', label: 'Độ tin cậy', open: false, get: (d) => (confInfo(d.metadataConfidence)?.label ?? NA) },
  { key: 'nguonMetadata', label: 'Nguồn metadata', open: false, get: (d) => g(d.nguonMetadata) },
  { key: 'hasEditableSource', label: 'Bản mềm', open: false, get: (d) => (d.editableSource ? 'Có bản mềm' : 'Thiếu bản mềm') },
];

// ── Facet item ordering (BUG#37 + FIX B) ─────────────────────────────────────
// Một số facet KHÔNG sort theo count mà theo quy tắc riêng. Dùng chung cho left panel,
// mobile drawer, quick dropdown (đều đọc cùng facetGroups). Giá trị "(Chưa có)" = NA.
const FACET_NA = NA; // '(Chưa có)'

/** Mã cấp lưu trữ trong [..]: "[06.01] …" → [6,1]; "[06]" → [6,0]. null nếu không có. */
export function storageCodeKey(value: string): [number, number] | null {
  const m = /^\s*\[(\d+)(?:\.(\d+))?\]/.exec(value ?? '');
  return m ? [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0] : null;
}

function cmpStorage(a: string, b: string): number {
  const ca = storageCodeKey(a);
  const cb = storageCodeKey(b);
  if (ca && cb) return ca[0] - cb[0] || ca[1] - cb[1] || a.localeCompare(b, 'vi');
  if (ca) return -1; // có mã → trước
  if (cb) return 1;
  return a.localeCompare(b, 'vi'); // cả hai không mã → theo tên
}

function cmpAlphaNaLast(a: string, b: string): number {
  if (a === FACET_NA) return b === FACET_NA ? 0 : 1; // "(Chưa có)" luôn cuối
  if (b === FACET_NA) return -1;
  return a.localeCompare(b, 'vi');
}

function cmpYearDesc(a: string, b: string): number {
  const ya = /^\d{3,4}$/.test(a) ? parseInt(a, 10) : null;
  const yb = /^\d{3,4}$/.test(b) ? parseInt(b, 10) : null;
  if (ya !== null && yb !== null) return yb - ya; // năm giảm dần
  if (ya !== null) return -1; // năm hợp lệ trước
  if (yb !== null) return 1;
  return a.localeCompare(b, 'vi'); // "(Chưa có)"/không hợp lệ → cuối
}

// Nhóm tài liệu — thứ tự nghiệp vụ cố định (không theo count). Khoan dung dấu gạch (- – —),
// hoa thường, khoảng trắng thừa. Giá trị lạ → sau (alpha VI); "(Chưa có)" → cuối cùng.
const NHOM_ORDER = [
  'Chính sách – Định hướng',
  'Quy chế – Quy định – Quy trình – Hướng dẫn',
  'Tổ chức – Nhân sự',
  'Điều hành – Tác nghiệp',
  'Hợp đồng – Văn bản pháp lý',
  'Văn bản đến',
  'Văn bản đi',
  'Hết hiệu lực',
];
function normNhom(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[–—]/g, '-') // mọi dạng gạch → '-'
    .replace(/\s*-\s*/g, '-') // bỏ khoảng trắng quanh gạch
    .replace(/\s+/g, ' ')
    .trim();
}
const NHOM_INDEX = new Map<string, number>(NHOM_ORDER.map((l, i) => [normNhom(l), i]));
function cmpNhom(a: string, b: string): number {
  if (a === FACET_NA) return b === FACET_NA ? 0 : 1;
  if (b === FACET_NA) return -1;
  const ia = NHOM_INDEX.has(normNhom(a)) ? (NHOM_INDEX.get(normNhom(a)) as number) : Number.POSITIVE_INFINITY;
  const ib = NHOM_INDEX.has(normNhom(b)) ? (NHOM_INDEX.get(normNhom(b)) as number) : Number.POSITIVE_INFINITY;
  if (ia !== ib) return ia - ib;
  return a.localeCompare(b, 'vi'); // cả hai lạ → alpha
}

/** Facet có quy tắc sort riêng (không dùng count). */
export const SPECIAL_SORTED_FACETS: ReadonlySet<string> = new Set([
  'donViSoHuu',
  'loaiTaiLieu',
  'namBanHanh',
  'nhomTaiLieu',
]);

/** So sánh item facet theo quy tắc của từng facet (xem SPECIAL_SORTED_FACETS). */
export function compareFacetItems(facetKey: string, a: string, b: string): number {
  switch (facetKey) {
    case 'donViSoHuu':
      return cmpStorage(a, b);
    case 'loaiTaiLieu':
      return cmpAlphaNaLast(a, b);
    case 'namBanHanh':
      return cmpYearDesc(a, b);
    case 'nhomTaiLieu':
      return cmpNhom(a, b);
    default:
      return 0;
  }
}

// ── Sort (BUG#19) ──────────────────────────────────────────────────────────
export type SortKey =
  | 'ngayBanHanh_desc'
  | 'ngayBanHanh_asc'
  | 'soVanBan_asc'
  | 'soVanBan_desc'
  | 'relevance'
  | 'conf_desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'ngayBanHanh_desc', label: 'Ngày ban hành mới nhất' },
  { key: 'ngayBanHanh_asc', label: 'Ngày ban hành cũ nhất' },
  { key: 'soVanBan_asc', label: 'Số văn bản A→Z' },
  { key: 'soVanBan_desc', label: 'Số văn bản Z→A' },
  { key: 'relevance', label: 'Độ liên quan' },
  { key: 'conf_desc', label: 'Độ tin cậy cao trước' },
];

export const DEFAULT_SORT: SortKey = 'ngayBanHanh_desc';

const CONF_RANK: Record<string, number> = { High: 4, Medium: 3, Low: 2, NeedsReview: 1 };

function dateKey(d: IDocument): string {
  const ext = d as IDocument & { modified?: string; created?: string };
  return (d.ngayBanHanh || (d.namBanHanh ? `${d.namBanHanh}-00-00` : '') || ext.modified || ext.created || '').toString();
}

export function sortDocuments(
  docs: IDocument[],
  sort: SortKey,
  scoreOf?: (d: IDocument) => number
): IDocument[] {
  const arr = [...docs];
  if (sort === 'relevance') {
    if (!scoreOf) return docs;
    // relevance desc → NgayBanHanh desc → id (ổn định). Văn bản kém liên quan KHÔNG lên trước.
    arr.sort(
      (a, b) =>
        scoreOf(b) - scoreOf(a) ||
        dateKey(b).localeCompare(dateKey(a)) ||
        (b.id ?? '').localeCompare(a.id ?? '')
    );
    return arr;
  }
  switch (sort) {
    case 'ngayBanHanh_desc':
      // A4: dùng helper chung để đồng bộ thứ tự với Dashboard (ngày desc → số VB desc → id).
      return sortDocumentsByIssuedDateThenNumber(arr);
    case 'ngayBanHanh_asc':
      arr.sort((a, b) => dateKey(a).localeCompare(dateKey(b)) || (a.id ?? '').localeCompare(b.id ?? ''));
      break;
    case 'soVanBan_asc':
      arr.sort((a, b) => (a.soVanBan ?? '').localeCompare(b.soVanBan ?? '', 'vi', { numeric: true }));
      break;
    case 'soVanBan_desc':
      arr.sort((a, b) => (b.soVanBan ?? '').localeCompare(a.soVanBan ?? '', 'vi', { numeric: true }));
      break;
    case 'conf_desc':
      arr.sort(
        (a, b) =>
          (CONF_RANK[b.metadataConfidence ?? ''] ?? 0) - (CONF_RANK[a.metadataConfidence ?? ''] ?? 0) ||
          dateKey(b).localeCompare(dateKey(a))
      );
      break;
  }
  return arr;
}

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

// ── Relevance scoring (DMS V2) ───────────────────────────────────────────────
// Ưu tiên field: TrichYeu > SoVanBan > ChuDeNghiepVu > LoaiTaiLieu/NhomTaiLieu/LoaiVanBanPhapLy
// > Tags > DonViPhatHanh/DonViSoHuu (điểm thấp). CỐ Ý KHÔNG tính fileName/path/đơn vị soạn thảo/
// người ký để match phụ không đẩy kết quả lên cao.
interface ScoredField {
  get: (d: IDocument) => string | undefined;
  w: number;
}
const SCORE_FIELDS: ScoredField[] = [
  { get: (d) => d.trichYeu, w: 10 },
  { get: (d) => d.soVanBan, w: 6 },
  { get: (d) => d.chuDeNghiepVu, w: 5 },
  { get: (d) => d.loaiTaiLieu, w: 3 },
  { get: (d) => d.nhomTaiLieu, w: 3 },
  { get: (d) => d.loaiVanBanPhapLy ?? d.loaiVanBan, w: 3 },
  { get: (d) => d.tags, w: 2 },
  { get: (d) => d.donViPhatHanh, w: 1 },
  { get: (d) => d.donViSoHuu, w: 1 },
];

/** Điểm tối thiểu để 1 văn bản được coi là "đủ liên quan" với keyword (lọc match yếu). */
export const MIN_RELEVANCE = 4;

/** Tách 1 chuỗi đã chuẩn hóa thành danh sách âm tiết/từ (ngắt theo ký tự không phải chữ-số). */
function wordsOf(norm: string): string[] {
  return norm.split(/[^a-z0-9]+/).filter(Boolean);
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  coverage: number;
}

/**
 * Chấm điểm relevance 1 văn bản với keyword tiếng Việt.
 *  - normalize: lowercase, bỏ dấu, trim, gộp khoảng trắng.
 *  - PHRASE match (cụm liền nhau, vd "danh gia") = tín hiệu mạnh nhất, nhân trọng số field.
 *  - TOKEN match theo NGUYÊN TỪ (âm tiết) — tránh substring khớp nhầm (vd "gia" KHÔNG khớp "giam").
 *    Token ≥4 ký tự cho phép khớp tiền tố (chịu được biến thể nhẹ).
 *  - Yêu cầu MỌI token khớp nguyên-từ ở ≥1 field; thiếu coverage → 0 (loại match 1 từ phổ thông).
 */
export function scoreDocumentDetailed(d: IDocument, kw: string): ScoreResult {
  const nq = normalizeVi(kw).replace(/\s+/g, ' ').trim();
  if (!nq) {
    return { score: 0, reasons: [], coverage: 0 };
  }
  const tokens = nq.split(' ').filter(Boolean);
  const multi = tokens.length > 1;
  let score = 0;
  const reasons: string[] = [];
  const covered = new Set<string>();

  for (const f of SCORE_FIELDS) {
    const fv = normalizeVi(f.get(d) ?? '').replace(/\s+/g, ' ').trim();
    if (!fv) {
      continue;
    }
    const words = wordsOf(fv);
    const wordSet = new Set(words);

    // 1) Phrase / nguyên-cụm.
    if (multi && fv.includes(nq)) {
      score += f.w * 10;
      reasons.push(`phrase@${f.w}`);
      if (fv === nq) {
        score += f.w * 5;
        reasons.push(`exact@${f.w}`);
      }
      tokens.forEach((t) => covered.add(t));
    } else if (!multi && wordSet.has(nq)) {
      score += f.w * 4;
      reasons.push(`word@${f.w}`);
      covered.add(nq);
    }

    // 2) Token nguyên-từ (cộng theo trọng số field).
    let fieldHits = 0;
    for (const t of tokens) {
      if (wordSet.has(t)) {
        score += f.w * 2;
        covered.add(t);
        fieldHits++;
      } else if (t.length >= 4 && words.some((w) => w.startsWith(t))) {
        score += f.w * 1;
        covered.add(t);
        fieldHits++;
      }
    }
    // 3) Bonus: tất cả token cùng xuất hiện trong 1 field.
    if (multi && fieldHits === tokens.length) {
      score += f.w;
      reasons.push(`allTokens@${f.w}`);
    }
  }

  // Mọi token phải khớp nguyên-từ ở đâu đó → chặn match 1 từ phổ thông / substring nhầm.
  if (covered.size < tokens.length) {
    return { score: 0, reasons: ['incomplete-coverage'], coverage: covered.size };
  }
  return { score, reasons, coverage: covered.size };
}

/** Điểm relevance (số). 0 = không đủ liên quan. */
export function scoreDocument(d: IDocument, kw: string): number {
  return scoreDocumentDetailed(d, kw).score;
}

/** Filter: đủ liên quan khi đạt điểm tối thiểu. Keyword rỗng → luôn true. */
export function matchesKeyword(d: IDocument, kw: string): boolean {
  if (!normalizeVi(kw).trim()) {
    return true;
  }
  return scoreDocument(d, kw) >= MIN_RELEVANCE;
}
