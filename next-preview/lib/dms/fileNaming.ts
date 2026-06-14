// SOURCE OF TRUTH — chuẩn đặt tên file vật lý cho DMS (Upload/Replace/Import/OCR...).
// MỌI nơi tạo tên file PHẢI gọi buildDocumentFileName(). KHÔNG đặt tên file trực tiếp.
//
// Nguyên tắc:
//  - Metadata SharePoint GIỮ NGUYÊN tiếng Việt có dấu (không đụng tới ở đây).
//  - Tên file VẬT LÝ: bỏ dấu phần Trích yếu, loại ký tự cấm, chuẩn hóa, ≤150 ký tự.
//  - Thiếu dữ liệu để sinh đúng tên → trả lỗi (KHÔNG fallback, KHÔNG suy diễn).

export interface FileNameInput {
  soVanBan: string;
  trichYeu: string;
  ngayBanHanh?: string; // ISO yyyy-mm-dd (tùy chọn → thêm .dd-mm-yyyy)
  loaiVanBanPhapLy?: string; // để chặn các loại cần field chưa có trong schema
  loaiTaiLieu?: string;
  ext?: string; // mặc định 'pdf'
}

export interface FileNameResult {
  ok: boolean;
  fileName?: string;
  base?: string; // phần không gồm extension (để ghép PDF/DOCX cùng tên)
  error?: string;
}

export const MAX_FILENAME_LENGTH = 150;

// Loại VB cần field CHƯA CÓ trong schema DMS Library (audit 10D.3A) → chưa hỗ trợ sinh tên.
//  Giấy ủy quyền (Người được UQ) · Văn bản đến (Cơ quan gửi) · Văn bản đi (Nơi nhận)
const UNSUPPORTED_PHAPLY = new Set(['Giấy ủy quyền', 'Văn bản đến', 'Văn bản đi']);
//  Hợp đồng (Đối tác) · Biểu mẫu (Mã loại + Tên biểu mẫu; format chứa '/')
const UNSUPPORTED_LOAITL = new Set(['Hợp đồng', 'Biểu mẫu']);

// Ký tự cấm (SharePoint + Windows): / \ : * ? " < > | # %
const FORBIDDEN = /[/\\:*?"<>|#%]/g;
// Ký tự điều khiển (control chars).
const CONTROL = /[\x00-\x1f\x7f]/g;

/** Bỏ dấu tiếng Việt → ASCII (đ/Đ xử lý riêng vì không tách bằng NFD). */
export function removeVietnameseDiacritics(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Trích yếu → PascalCase không dấu, không khoảng trắng (vd "Điều chỉnh chức danh" → "DieuChinhChucDanh"). */
export function trichYeuToToken(s: string): string {
  const ascii = removeVietnameseDiacritics(s);
  return ascii
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** Làm sạch định danh (SoVanBan): GIỮ dấu mã loại (QĐ/HĐ...), bỏ ký tự cấm, gộp khoảng trắng. */
export function sanitizeIdentifier(s: string): string {
  return (s ?? '')
    .replace(FORBIDDEN, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .trim();
}

/** dd-mm-yyyy từ ISO yyyy-mm-dd; '' nếu không hợp lệ. */
function dateToken(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/**
 * P1 — Làm sạch NHẸ tên file GỐC để lưu SharePoint (giữ tên gốc tối đa):
 *   - GIỮ Unicode/dấu tiếng Việt, khoảng trắng, dấu chấm, gạch ngang, gạch dưới, ngoặc.
 *   - CHỈ bỏ ký tự cấm SP/URL (" * : < > ? / \ | # %) + ký tự điều khiển → thay bằng khoảng trắng.
 *   - Gộp khoảng trắng thừa, bỏ chấm/space ở rìa, cắt ≤ MAX_FILENAME_LENGTH (GIỮ phần mở rộng).
 *   - forceExt: ép phần mở rộng (vd 'pdf') — KHÔNG bỏ dấu, KHÔNG PascalCase, KHÔNG đổi mã văn bản.
 */
export function sanitizeOriginalFileName(rawName: string, forceExt?: string): FileNameResult {
  const name = (rawName ?? '').trim();
  if (!name) {
    return { ok: false, error: 'Thiếu tên file.' };
  }
  const dot = name.lastIndexOf('.');
  const rawStem = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot + 1) : '';
  const ext = ((forceExt ?? rawExt) || 'pdf').replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'pdf';

  let stem = rawStem
    .replace(CONTROL, ' ')
    .replace(FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
  if (!stem) {
    stem = 'van-ban';
  }
  const room = MAX_FILENAME_LENGTH - (ext.length + 1);
  if (room > 0 && stem.length > room) {
    stem = stem.slice(0, room).trim();
  }
  return { ok: true, fileName: `${stem}.${ext}`, base: stem };
}

/**
 * Sinh tên file vật lý theo chuẩn BHL:
 *   <SoVanBan>-<TrichYeuKhôngDấu>[.dd-mm-yyyy].<ext>
 * (SoVanBan đã chứa Số.Năm.MãLoại-ĐơnVị). Loại cần field thiếu → lỗi.
 * LƯU Ý (P1): KHÔNG còn dùng làm tên file VẬT LÝ khi upload; giữ cho canonical/debug.
 */
export function buildDocumentFileName(input: FileNameInput): FileNameResult {
  const ext = (input.ext ?? 'pdf').replace(/^\./, '').toLowerCase();

  const soVanBan = sanitizeIdentifier(input.soVanBan);
  if (!soVanBan) {
    return { ok: false, error: 'Thiếu Số văn bản để sinh tên file.' };
  }
  const trichToken = trichYeuToToken(input.trichYeu);
  if (!trichToken) {
    return { ok: false, error: 'Thiếu/không hợp lệ Trích yếu để sinh tên file.' };
  }
  if (input.loaiVanBanPhapLy && UNSUPPORTED_PHAPLY.has(input.loaiVanBanPhapLy.trim())) {
    return { ok: false, error: `Loại "${input.loaiVanBanPhapLy}" cần thông tin chưa có trong schema (chưa hỗ trợ ở phase này).` };
  }
  if (input.loaiTaiLieu && UNSUPPORTED_LOAITL.has(input.loaiTaiLieu.trim())) {
    return { ok: false, error: `Loại tài liệu "${input.loaiTaiLieu}" cần thông tin chưa có trong schema (chưa hỗ trợ ở phase này).` };
  }

  const dt = dateToken(input.ngayBanHanh);
  const datePart = dt ? `.${dt}` : '';
  // Cố định: soVanBan + date + ext; chỉ truncate trichToken nếu vượt 150.
  const fixed = `${soVanBan}-` + `${datePart}.${ext}`; // độ dài phần cố định (chừa chỗ trichToken)
  const room = MAX_FILENAME_LENGTH - fixed.length;
  const trich = room > 0 ? trichToken.slice(0, room) : '';
  const base = `${soVanBan}-${trich}${datePart}`;
  const fileName = `${base}.${ext}`;
  if (fileName.length > MAX_FILENAME_LENGTH) {
    return { ok: false, error: 'Số văn bản quá dài, không thể sinh tên file ≤150 ký tự.' };
  }
  return { ok: true, fileName, base };
}
