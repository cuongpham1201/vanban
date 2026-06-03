// Logic dùng chung cho "Cần chuẩn hóa" và "Văn bản mới ban hành"
// để KPI ở Trang chủ và trang "Cần chuẩn hóa" (ReviewView) luôn khớp nhau.
import { IDocument, DocStatus } from '../models/IDocument';

/** Nhãn NhomTaiLieu đặc biệt cho văn bản hết hiệu lực. */
export const EXPIRED_NHOM_LABEL: string = 'Hết hiệu lực';

/**
 * Văn bản HẾT HIỆU LỰC = TrangThai === "Hết hiệu lực" HOẶC NhomTaiLieu === "Hết hiệu lực".
 *
 * Đây là ĐỊNH NGHĨA THỐNG NHẤT (single source of truth) cho toàn portal. Văn bản
 * hết hiệu lực bị LOẠI khỏi mọi thống kê chung và mọi danh sách mặc định; chỉ xuất
 * hiện khi người dùng bấm KPI "Văn bản hết hiệu lực" hoặc menu/nhóm "Hết hiệu lực".
 */
export function isExpired(d: IDocument): boolean {
  return d.trangThai === DocStatus.Expired || (d.nhomTaiLieu ?? '').trim() === EXPIRED_NHOM_LABEL;
}

/** Còn hiệu lực (nghịch đảo isExpired) — dùng cho query/thống kê mặc định. */
export function isNotExpired(d: IDocument): boolean {
  return !isExpired(d);
}

/** Độ tin cậy metadata thấp (cần người rà soát). */
export function isLowConfidence(d: IDocument): boolean {
  return d.metadataConfidence === 'NeedsReview' || d.metadataConfidence === 'Low';
}

/** Thiếu bản mềm (không có file DOCX/XLSX đi kèm PDF). */
export function isMissingSource(d: IDocument): boolean {
  return !d.editableSource;
}

/** Thiếu trường khóa bắt buộc. */
export function isMissingKeyField(d: IDocument): boolean {
  return !d.soVanBan || !d.nhomTaiLieu || !d.donViSoHuu || !d.ngayBanHanh;
}

/**
 * Văn bản CẦN CHUẨN HÓA = độ tin cậy thấp HOẶC thiếu bản mềm HOẶC thiếu trường khóa.
 * Đây là định nghĩa thống nhất cho cả KPI Trang chủ và trang Cần chuẩn hóa.
 */
export function needsStandardization(d: IDocument): boolean {
  return isLowConfidence(d) || isMissingSource(d) || isMissingKeyField(d);
}

/**
 * Văn bản MỚI BAN HÀNH = có NgayBanHanh trong khoảng `monthsBack` tháng gần đây.
 * Mặc định 2 tháng.
 */
export function isRecentlyIssued(d: IDocument, monthsBack: number = 2): boolean {
  if (!d.ngayBanHanh) {
    return false;
  }
  const cutoff: Date = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr: string = cutoff.toISOString().substring(0, 10);
  const today: string = new Date().toISOString().substring(0, 10);
  return d.ngayBanHanh >= cutoffStr && d.ngayBanHanh <= today;
}
