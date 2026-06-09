// Admin Center V2 — types + seed data (MOCK, local state only).
// KHÔNG kết nối SharePoint, KHÔNG gọi API write. Seed lấy từ Metadata V2 (dms/models/IDocument.ts)
// + danh mục thực tế (dms/utils/documentTypeGroups.ts, Admin.html units).

// Tab 1 (Bộ lọc tìm kiếm): FilterConfig + default + store đã chuyển sang shared module
// '@/lib/dms/filterConfig' (dùng chung với Search Center). Xem FilterManagerTab.

/** Tab 2 — cấu hình từng trường Metadata V2. */
export type MetaFieldType = 'Văn bản' | 'Văn bản dài' | 'Chọn' | 'Ngày' | 'Số' | 'Có/Không' | 'Nhiều';

export interface MetaFieldConfig {
  key: string;
  label: string;
  type: MetaFieldType;
  source: string;
  visible: boolean;
  required: boolean;
  searchable: boolean;
  filterable: boolean;
  sortable: boolean;
}

/** Tab 3 — một mục trong danh mục. */
export interface CatalogItem {
  id: string;
  name: string;
  /** Mã viết tắt (chỉ Đơn vị phát hành dùng). */
  code?: string;
  /** Trực thuộc (chỉ Đơn vị phát hành). */
  parent?: string;
  count: number;
  active: boolean;
}

export interface CatalogDef {
  key: 'nhom' | 'loaiTaiLieu' | 'loaiPhapLy' | 'donVi';
  label: string;
  hint: string;
  /** true → hiển thị cột Mã + Trực thuộc (đơn vị). */
  hasCode: boolean;
  items: CatalogItem[];
}

// ── Tab 2 seed — toàn bộ trường Metadata V2 ────────────────────────────────────
export const SEED_META: MetaFieldConfig[] = [
  { key: 'SoVanBan', label: 'Số văn bản', type: 'Văn bản', source: 'Hệ thống', visible: true, required: true, searchable: true, filterable: false, sortable: true },
  { key: 'TrichYeu', label: 'Trích yếu', type: 'Văn bản dài', source: 'OCR', visible: true, required: true, searchable: true, filterable: false, sortable: false },
  { key: 'NhomTaiLieu', label: 'Nhóm tài liệu', type: 'Chọn', source: 'AI gợi ý', visible: true, required: true, searchable: true, filterable: true, sortable: true },
  { key: 'LoaiTaiLieu', label: 'Loại tài liệu', type: 'Chọn', source: 'AI gợi ý', visible: true, required: false, searchable: true, filterable: true, sortable: true },
  { key: 'LoaiVanBanPhapLy', label: 'Loại VB pháp lý', type: 'Chọn', source: 'AI gợi ý', visible: true, required: false, searchable: true, filterable: true, sortable: true },
  { key: 'ChuDeNghiepVu', label: 'Chủ đề nghiệp vụ', type: 'Chọn', source: 'AI gợi ý', visible: true, required: false, searchable: true, filterable: true, sortable: false },
  { key: 'DonViPhatHanh', label: 'Đơn vị soạn thảo', type: 'Chọn', source: 'Thủ công', visible: true, required: false, searchable: true, filterable: true, sortable: true },
  { key: 'DonViSoHuu', label: 'Cấp lưu trữ', type: 'Chọn', source: 'Hệ thống', visible: false, required: false, searchable: false, filterable: true, sortable: false },
  { key: 'NguoiKy', label: 'Người ký', type: 'Văn bản', source: 'OCR', visible: true, required: true, searchable: true, filterable: false, sortable: true },
  { key: 'NgayBanHanh', label: 'Ngày ban hành', type: 'Ngày', source: 'OCR', visible: true, required: true, searchable: false, filterable: true, sortable: true },
  { key: 'NgayHetHieuLuc', label: 'Ngày hết hiệu lực', type: 'Ngày', source: 'Thủ công', visible: true, required: false, searchable: false, filterable: true, sortable: true },
  { key: 'NamBanHanh', label: 'Năm ban hành', type: 'Số', source: 'Hệ thống', visible: true, required: false, searchable: false, filterable: true, sortable: true },
  { key: 'TrangThai', label: 'Trạng thái', type: 'Chọn', source: 'Thủ công', visible: true, required: true, searchable: false, filterable: true, sortable: true },
  { key: 'MucDoBaoMat', label: 'Mức độ bảo mật', type: 'Chọn', source: 'Thủ công', visible: true, required: true, searchable: false, filterable: true, sortable: false },
  { key: 'NguonMetadata', label: 'Nguồn metadata', type: 'Chọn', source: 'Hệ thống', visible: false, required: false, searchable: false, filterable: true, sortable: false },
  { key: 'MetadataConfidence', label: 'Độ tin cậy metadata', type: 'Chọn', source: 'Hệ thống', visible: false, required: false, searchable: false, filterable: true, sortable: true },
  { key: 'VanBanThayThe', label: 'Văn bản thay thế', type: 'Văn bản', source: 'Thủ công', visible: true, required: false, searchable: true, filterable: false, sortable: false },
  { key: 'VanBanLienQuan', label: 'Văn bản liên quan', type: 'Văn bản', source: 'Thủ công', visible: false, required: false, searchable: true, filterable: false, sortable: false },
  { key: 'Tags', label: 'Tags / Từ khóa', type: 'Nhiều', source: 'AI + thủ công', visible: true, required: false, searchable: true, filterable: true, sortable: false },
  { key: 'HasEditableSource', label: 'Có bản mềm (DOCX)', type: 'Có/Không', source: 'Hệ thống', visible: true, required: false, searchable: false, filterable: true, sortable: false },
];

// ── Tab 3 seed — 4 danh mục ────────────────────────────────────────────────────
const mk = (name: string, count: number, active = true, code?: string, parent?: string): CatalogItem => ({
  id: `${name}-${code ?? ''}`,
  name,
  code,
  parent,
  count,
  active,
});

export const SEED_CATALOGS: CatalogDef[] = [
  {
    key: 'nhom',
    label: 'Nhóm tài liệu',
    hint: 'Nhóm tra cứu cấp cao — quyết định cây phân loại ở Search Center',
    hasCode: false,
    items: [
      mk('Chính sách – Định hướng', 142),
      mk('Quy chế – Quy định – Quy trình – Hướng dẫn', 1186),
      mk('Tổ chức – Nhân sự', 638),
      mk('Điều hành – Tác nghiệp', 1492),
      mk('Hợp đồng – Văn bản pháp lý', 642),
      mk('Khác', 82, false),
    ],
  },
  {
    key: 'loaiTaiLieu',
    label: 'Loại tài liệu',
    hint: 'Bản chất nghiệp vụ của tài liệu (Quy trình / Quy định / Hướng dẫn…)',
    hasCode: false,
    items: [
      mk('Quy trình', 540),
      mk('Quy định', 312),
      mk('Quy chế', 96),
      mk('Hướng dẫn', 248),
      mk('Chính sách', 84),
      mk('Tiêu chuẩn', 73),
      mk('Biểu mẫu', 161),
      mk('Sổ tay', 28, false),
    ],
  },
  {
    key: 'loaiPhapLy',
    label: 'Loại VB pháp lý',
    hint: 'Hình thức ban hành theo quy định pháp lý',
    hasCode: false,
    items: [
      mk('Quyết định', 624),
      mk('Thông báo', 372),
      mk('Công văn', 488),
      mk('Tờ trình', 156),
      mk('Báo cáo', 284),
      mk('Nghị quyết', 96),
      mk('Kế hoạch', 174),
      mk('Hợp đồng', 642),
      mk('Biên bản', 132),
    ],
  },
  {
    key: 'donVi',
    label: 'Đơn vị soạn thảo',
    hint: 'Cây đơn vị / phòng ban phát hành & cấp số văn bản',
    hasCode: true,
    items: [
      mk('Ban Tổng Giám đốc', 214, true, 'TGD', '—'),
      mk('Phòng QA/QC', 386, true, 'QA', 'Khối Sản xuất'),
      mk('Phòng Kỹ thuật – Công nghệ', 512, true, 'KTCN', 'Khối Sản xuất'),
      mk('Nhà máy Bia', 470, true, 'NMB', 'Khối Sản xuất'),
      mk('Phòng Kinh doanh', 298, true, 'KD', 'Khối Thương mại'),
      mk('Phòng HCNS', 264, true, 'HCNS', 'Khối Hỗ trợ'),
      mk('Phòng Tài chính – Kế toán', 332, true, 'TCKT', 'Khối Hỗ trợ'),
    ],
  },
];
