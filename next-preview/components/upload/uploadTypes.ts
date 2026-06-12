// Upload Wizard — định nghĩa form metadata V2. Reuse choices từ FALLBACK_METADATA_CHOICES
// (fallback khi chưa có schema động). Upload Write ghi thật khi có quyền (DMS_WRITE).
import { FALLBACK_METADATA_CHOICES as C } from '@dms/utils/metadataChoices';

export interface UploadForm {
  soVanBan: string;
  loaiVanBanPhapLy: string;
  trichYeu: string;
  nguoiKy: string;
  namBanHanh: string;
  ngayBanHanh: string;
  ngayHetHieuLuc: string;
  trangThai: string;
  mucDoBaoMat: string;
  nhomTaiLieu: string;
  loaiTaiLieu: string;
  chuDeNghiepVu: string;
  donViPhatHanh: string;
  donViSoHuu: string;
  capLuuTru: string; // nhãn folder cấp 1 (vị trí lưu file) — TÁCH khỏi DonViSoHuu metadata
  nguonMetadata: string;
  metadataConfidence: string;
  hasEditableSource: string;
  editableSourceUrl: string;
  primaryPdfUrl: string;
  vanBanThayThe: string;
  vanBanLienQuan: string;
  tags: string;
}

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface FieldDef {
  key: keyof UploadForm;
  label: string;
  type: FieldType;
  choices?: string[];
  full?: boolean;
  placeholder?: string;
  required?: boolean;
}

// Thứ tự + bố cục 2 cột (full = span cả hàng) — theo tinh thần UploadWizard.html, mở rộng đủ V2.
export const FIELDS: FieldDef[] = [
  { key: 'soVanBan', label: 'Số văn bản', type: 'text', required: true, placeholder: 'VD: QĐ-2024/142' },
  { key: 'loaiVanBanPhapLy', label: 'Loại văn bản pháp lý', type: 'select', choices: C.loaiVanBanPhapLy },
  { key: 'trichYeu', label: 'Trích yếu', type: 'textarea', full: true, required: true },
  { key: 'nguoiKy', label: 'Người ký', type: 'text' },
  { key: 'namBanHanh', label: 'Năm ban hành', type: 'number', placeholder: 'VD: 2024' },
  { key: 'ngayBanHanh', label: 'Ngày ban hành', type: 'date' },
  { key: 'ngayHetHieuLuc', label: 'Ngày hết hiệu lực', type: 'date' },
  { key: 'trangThai', label: 'Trạng thái', type: 'select', choices: C.trangThai },
  { key: 'mucDoBaoMat', label: 'Mức độ bảo mật', type: 'select', choices: C.mucDoBaoMat },
  { key: 'nhomTaiLieu', label: 'Nhóm tài liệu', type: 'select', choices: C.nhomTaiLieu, required: true },
  { key: 'loaiTaiLieu', label: 'Loại tài liệu', type: 'select', choices: C.loaiTaiLieu },
  { key: 'chuDeNghiepVu', label: 'Chủ đề nghiệp vụ', type: 'text' },
  { key: 'donViPhatHanh', label: 'Đơn vị soạn thảo', type: 'select', choices: C.donViPhatHanh },
  { key: 'donViSoHuu', label: 'Cấp lưu trữ (metadata)', type: 'select', choices: C.capLuuTru },
  { key: 'capLuuTru', label: 'Cấp lưu trữ — folder lưu file', type: 'select', choices: [], required: true },
  { key: 'nguonMetadata', label: 'Nguồn metadata', type: 'select', choices: C.nguonMetadata },
  { key: 'metadataConfidence', label: 'Độ tin cậy metadata', type: 'select', choices: C.metadataConfidence },
  { key: 'hasEditableSource', label: 'Có bản mềm', type: 'select', choices: ['Có', 'Không'] },
  { key: 'editableSourceUrl', label: 'EditableSourceUrl', type: 'text', full: true, placeholder: 'URL file nguồn .docx (nếu có)' },
  { key: 'primaryPdfUrl', label: 'PrimaryPdfUrl', type: 'text', full: true, placeholder: 'URL PDF chính (nếu có)' },
  { key: 'vanBanThayThe', label: 'Văn bản thay thế', type: 'text', placeholder: 'Số VB bị thay thế (nếu có)' },
  { key: 'vanBanLienQuan', label: 'Văn bản liên quan', type: 'text', full: true, placeholder: 'Danh sách số VB liên quan' },
  { key: 'tags', label: 'Tags', type: 'text', full: true, placeholder: 'Cách nhau bằng dấu phẩy: chất lượng, QA' },
];

export const EMPTY_FORM: UploadForm = FIELDS.reduce((acc, f) => {
  acc[f.key] = '';
  return acc;
}, {} as UploadForm);

export const REQUIRED_KEYS: (keyof UploadForm)[] = FIELDS.filter((f) => f.required).map((f) => f.key);

export interface SelectedFile {
  name: string;
  sizeKB: number;
  ext: string;
  /** File gốc — chỉ dùng khi upload write thật (Phase 10D.3); undefined ở chế độ xem trước. */
  raw?: File;
}

// A2: định dạng cho phép với File đính kèm (khớp allowlist của POST /api/documents/[id]/attachments).
export const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip';

/** Cảnh báo UI (không chặn cứng) — thiếu file hoặc field bắt buộc. */
export function computeWarnings(form: UploadForm, file: SelectedFile | null): string[] {
  const w: string[] = [];
  if (!file) {
    w.push('Chưa chọn file văn bản.');
  }
  for (const f of FIELDS) {
    if (f.required && !form[f.key].trim()) {
      w.push(`Thiếu trường bắt buộc: ${f.label}.`);
    }
  }
  return w;
}

// Field hiển thị ở bước Kiểm tra (review) — các field chính.
export const REVIEW_KEYS: (keyof UploadForm)[] = [
  'soVanBan', 'loaiVanBanPhapLy', 'trichYeu', 'nguoiKy', 'ngayBanHanh', 'ngayHetHieuLuc',
  'trangThai', 'mucDoBaoMat', 'nhomTaiLieu', 'loaiTaiLieu', 'chuDeNghiepVu', 'donViPhatHanh',
];

export const FIELD_LABEL: Record<keyof UploadForm, string> = FIELDS.reduce((acc, f) => {
  acc[f.key] = f.label;
  return acc;
}, {} as Record<keyof UploadForm, string>);
