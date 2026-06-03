// Fallback choices dùng CHUNG cho Upload + sửa metadata khi SharePoint field schema
// chưa tải được (lỗi API). Source of truth thật là DMS Library field Choices
// (xem SharePointDmsService.getMetadataChoices). Đây CHỈ là phương án dự phòng.
import { IMetadataChoices } from '../models/IDocument';

export const FALLBACK_METADATA_CHOICES: IMetadataChoices = {
  nhomTaiLieu: [
    'Chính sách – Định hướng', 'Quy chế – Quy định – Quy trình – Hướng dẫn', 'Tổ chức – Nhân sự',
    'Điều hành – Tác nghiệp', 'Hợp đồng – Văn bản pháp lý', 'Hết hiệu lực', 'Khác'
  ],
  loaiVanBanPhapLy: [
    'Quyết định', 'Thông báo', 'Công văn', 'Tờ trình', 'Biên bản', 'Nghị quyết',
    'Giấy ủy quyền', 'Văn bản đến', 'Văn bản đi', 'Khác'
  ],
  loaiTaiLieu: [
    'Chính sách', 'Quy chế', 'Quy định', 'Quy trình', 'Hướng dẫn', 'Tiêu chuẩn', 'Biểu mẫu',
    'Sổ tay', 'Kế hoạch', 'Báo cáo', 'Hợp đồng', 'Phụ lục hợp đồng', 'Cam kết',
    'Mô tả công việc', 'Chức năng nhiệm vụ', 'Sơ đồ tổ chức', 'Khác'
  ],
  trangThai: ['Bản nháp', 'Đang lưu hành', 'Hết hiệu lực', 'Thu hồi'],
  mucDoBaoMat: ['Công khai', 'Nội bộ', 'Bảo mật', 'Tuyệt mật'],
  nguonMetadata: ['ParsedFromFilename', 'ParsedFromFolder', 'ManualReviewed', 'AIExtracted', 'Imported'],
  metadataConfidence: ['High', 'Medium', 'Low', 'NeedsReview'],
  donViPhatHanh: [],
  capLuuTru: []
};

/** Trả mảng dynamic nếu có phần tử, ngược lại dùng fallback. */
export function choiceOr(dynamic: string[] | undefined, fallback: string[]): string[] {
  return dynamic && dynamic.length > 0 ? dynamic : fallback;
}
