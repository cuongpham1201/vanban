// Domain models for the Văn bản điều hành portal.
//
// These map 1:1 to the metadata columns of the SharePoint Document Library
// "DMS Library" (site: /sites/vanbandieuhanh) so that a future SharePoint
// service can be swapped in without changing the UI components.
//
// SharePoint internal column names (current schema v1):
//   SoVanBan, NamBanHanh, LoaiVanBan, DonViSoanThao, NguoiKy,
//   NgayBanHanh, NgayHetHieuLuc, TrangThai, MucDoBaoMat, TrichYeu
//
// ⚠️ SEMANTICS CAVEAT (xem doc/DMS_SEMANTICS.md):
//   - Metadata hiện tại được parse từ tên file → best-effort.
//   - `loaiVanBan` = form pháp lý (QĐ/QT/HD...) ~90% chính xác.
//   - `donViSoanThao` = lấy theo folder ~30-40% chính xác (HCNS chiếm 90% file vì là đơn vị cấp số).
//   - Schema target v2 sẽ tách thành: loaiVanBanPhapLy + chuDeNghiepVu + donViSoanThao + donViPhatHanh.
//   - Code UI/service KHÔNG hardcode assumption "tên file = truth".
//   - Khi schema evolve: thêm field optional, fallback về field cũ.

/** TrangThai – document status (Choice). */
export enum DocStatus {
  Draft = 'Bản nháp',
  Active = 'Đang lưu hành',
  Expired = 'Hết hiệu lực',
  Revoked = 'Thu hồi'
}

/** MucDoBaoMat – security/confidentiality level (Choice). */
export enum SecurityLevel {
  Public = 'Công khai',
  Internal = 'Nội bộ',
  Confidential = 'Bảo mật',
  TopSecret = 'Tuyệt mật'
}

/** Stable keys used by the quick-filter buttons in the hero banner. */
export type DocTypeKey = 'QD' | 'QT' | 'TB' | 'HD' | 'CV' | 'KHAC';

/** Visual hint for the file-type icon shown in lists. */
export type FileKind = 'pdf' | 'docx' | 'xlsx';

/**
 * A single document record.
 * One field per "vbdh-draft" metadata column, plus a couple of presentation
 * helpers (trichYeu, fileKind) derived from the file name / content type.
 */
export interface IDocument {
  /** SharePoint item id (string so it survives a GUID/lookup move later). */
  id: string;
  /** SoVanBan – e.g. "295.2026.QĐ-HCNS". */
  soVanBan: string;
  /** Trích yếu / tiêu đề ngắn – e.g. "Điều chỉnh chức danh". */
  trichYeu: string;
  /** NamBanHanh. */
  namBanHanh: number;
  /** LoaiVanBan – display label, e.g. "Quyết định". */
  loaiVanBan: string;
  /** Stable doc-type key for filtering. */
  loaiVanBanKey: DocTypeKey;
  /** DonViSoanThao – display label, e.g. "Hành chính nhân sự". */
  donViSoanThao: string;
  /** Đơn vị mã viết tắt, e.g. "HCNS". */
  donViCode: string;
  /** NguoiKy – signer display name. */
  nguoiKy: string;
  /** NgayBanHanh – ISO date string (yyyy-mm-dd). */
  ngayBanHanh: string;
  /** NgayHetHieuLuc – ISO date string, undefined = vô thời hạn. */
  ngayHetHieuLuc?: string;
  /** TrangThai. */
  trangThai: DocStatus;
  /** MucDoBaoMat. */
  mucDoBaoMat: SecurityLevel;
  /** File-type icon hint. */
  fileKind: FileKind;
  /** Absolute URL to open the file in browser (Office Web Apps / PDF viewer). */
  webUrl?: string;
  /** Server-relative URL (vd: /sites/.../DMS Library/[NN].../filename.pdf). */
  serverRelativeUrl?: string;
  /** Tên file gốc. */
  fileName?: string;
  /** Extension (vd ".pdf"). */
  fileExt?: string;
  /** Size in KB. */
  fileSizeKB?: number;
  /** Có bản .docx/.doc trong cùng folder không. */
  hasDocx?: boolean;
  /** Có bản .pdf trong cùng folder không. */
  hasPdf?: boolean;
  /** Có cả PDF + DOCX (đủ cặp). */
  hasPair?: boolean;
  /** Bản mềm editable (DOCX/XLSX/...) đi cùng với PDF. */
  editableSource?: IEditableSource;

  // ===== Metadata V2 (optional; nếu trống thì fallback về field V1 ở trên) =====
  /** NhomTaiLieu (V2) — nhóm tra cứu cấp cao, 1 trong 6 nhóm. */
  nhomTaiLieu?: string;
  /** LoaiVanBanPhapLy (V2) — hình thức ban hành (Quyết định/Thông báo/Công văn...). */
  loaiVanBanPhapLy?: string;
  /** LoaiTaiLieu (V2) — bản chất nghiệp vụ (Quy trình/Quy định/Quy chế/Hướng dẫn...). */
  loaiTaiLieu?: string;
  /** ChuDeNghiepVu (V2) — chủ đề nghiệp vụ. */
  chuDeNghiepVu?: string;
  /** DonViPhatHanh (V2) — đơn vị phát hành / cấp số. */
  donViPhatHanh?: string;
  /** DonViSoHuu (V2) — đơn vị sở hữu nội dung (nhãn folder cấp 1, vd "[18] CĐ - Phòng Cơ điện"). */
  donViSoHuu?: string;
  /** NguonMetadata (V2) — ParsedFromFolder / ParsedFromFilename / ManualReviewed... */
  nguonMetadata?: string;
  /** MetadataConfidence (V2) — High / Medium / Low / NeedsReview. */
  metadataConfidence?: string;
  /** VanBanThayThe — văn bản thay thế (số VB / id / text). Cột tùy chọn. */
  vanBanThayThe?: string;
  /** VanBanLienQuan — văn bản liên quan (text). Cột tùy chọn. */
  vanBanLienQuan?: string;
  /** Tags — từ khóa, cách nhau bởi dấu phẩy. Cột tùy chọn. */
  tags?: string;

  // ===== Hỗ trợ chỉnh sửa nhanh khi data chưa chuẩn (giai đoạn đầu) =====
  /** URL mở thư mục chứa file trên SharePoint (xem vị trí đang đặt file). */
  folderUrl?: string;
  /** URL mở form Sửa thuộc tính (EditForm) của chính item này để sửa metadata. */
  editPropertiesUrl?: string;
}

/** Bản mềm editable (DOCX/XLSX/PPTX) gắn với 1 document PDF chính. */
export interface IEditableSource {
  fileName: string;
  fileExt: string;     // ".docx" | ".xlsx" | ".pptx" | ".doc" | ...
  webUrl: string;      // URL mở/tải bản mềm
  serverRelativeUrl?: string;
  sizeKB?: number;
}

/** A quick-filter definition rendered as a pill in the hero banner. */
export interface IDocTypeFilter {
  key: DocTypeKey;
  label: string;
  /** Hex accent colour for the pill icon. */
  color: string;
}

/**
 * Folder cấp 1 (cấp lưu trữ) lấy trực tiếp từ DMS Library — NGUỒN CHUẨN của "Cấp lưu trữ".
 * Folder tồn tại nhưng chưa có văn bản vẫn xuất hiện (itemCount/count = 0).
 */
export interface IStorageFolder {
  /** Tên folder cấp 1, vd "[01] Tổng Giám đốc". */
  name: string;
  /** Server-relative URL của folder. */
  serverRelativeUrl?: string;
  /** Số item thô do SharePoint trả về (không dùng để đếm "văn bản"; chỉ tham khảo). */
  itemCount?: number;
}

/** Aggregated count of documents per organisational unit. */
export interface IUnitStat {
  code: string;
  name: string;
  count: number;
  /** Hex accent colour for the unit icon. */
  color: string;
}

/** Identifies which KPI a tile represents (keeps rendering data-driven). */
export type KpiKey =
  | 'total'
  | 'byUnit'
  | 'active'
  | 'recent'
  | 'expiringSoon'
  | 'expired'
  | 'needsReview'
  | 'missingSource'
  | 'hasSource'
  | 'pending';

/** A single KPI tile. */
export interface IKpiStat {
  key: KpiKey;
  label: string;
  value: number;
  /** Sub-caption shown under the value, e.g. "+24 so với tháng trước". */
  caption: string;
}

/** Sidebar nav item keys — quyết định view + filter khi click. */
export type NavKey =
  | 'home'
  | 'search'
  | 'upload'
  | 'recent'
  | 'expiring'
  | 'byUnit'
  | 'byType'
  | 'review'
  | 'stats'
  | 'help'
  | 'favorites'
  | 'following'
  | 'trash';

/**
 * Choices của các Choice field trong DMS Library — lấy động từ SharePoint field schema.
 * Mảng rỗng = chưa có/không phải Choice field → component tự fallback (vd derive từ documents).
 */
export interface IMetadataChoices {
  nhomTaiLieu: string[];
  loaiVanBanPhapLy: string[];
  loaiTaiLieu: string[];
  trangThai: string[];
  mucDoBaoMat: string[];
  nguonMetadata: string[];
  metadataConfidence: string[];
  /** DonViPhatHanh — nếu là Choice field; nếu không thì rỗng (UI dùng text input). */
  donViPhatHanh: string[];
  /** DonViSoHuu (Cấp lưu trữ) — nếu là Choice field; nếu rỗng UI derive từ documents. */
  capLuuTru: string[];
}

/** Filter criteria for the advanced search panel / future SharePoint query. */
export interface IDocSearchFilter {
  /** Free-text term (matches số văn bản, trích yếu, loại, người ký, đơn vị). */
  keyword?: string;
  /** Restrict to a single doc-type key (quick filters). */
  typeKey?: DocTypeKey;
  soVanBan?: string;
  loaiVanBan?: string;
  donViCode?: string;
  nguoiKy?: string;
  /** ISO date string. */
  tuNgay?: string;
  /** ISO date string. */
  denNgay?: string;
  /** Lọc theo NhomTaiLieu (V2). */
  nhomTaiLieu?: string;
  /** Lọc theo LoaiTaiLieu (V2). */
  loaiTaiLieu?: string;
  /** Lọc theo DonViPhatHanh (V2 — đơn vị phát hành/cấp số). */
  donViPhatHanh?: string;
}
