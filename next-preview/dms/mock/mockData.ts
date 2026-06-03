// Mock data for the UI-only phase.
//
// IMPORTANT: This file is the ONLY place that holds fake data. The future
// SharePoint service (reading the "vbdh-draft" library) must produce objects
// of the exact same shapes, after which this file can be deleted.

import {
  IDocument,
  IDocTypeFilter,
  IUnitStat,
  IKpiStat,
  DocStatus,
  SecurityLevel
} from '../models/IDocument';

/** Quick-filter pills shown under the hero search box. */
export const DOC_TYPE_FILTERS: IDocTypeFilter[] = [
  { key: 'QD', label: 'Quyết định', color: '#0F6CBD' },
  { key: 'QT', label: 'Quy trình', color: '#107C41' },
  { key: 'TB', label: 'Thông báo', color: '#CA5010' },
  { key: 'HD', label: 'Hướng dẫn', color: '#8764B8' },
  { key: 'CV', label: 'Công văn', color: '#038387' },
  { key: 'KHAC', label: 'Khác', color: '#605E5C' }
];

/** Options for the "Loại văn bản" dropdown in advanced search. */
export const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Quyết định', label: 'Quyết định' },
  { value: 'Quy trình', label: 'Quy trình' },
  { value: 'Thông báo', label: 'Thông báo' },
  { value: 'Hướng dẫn', label: 'Hướng dẫn' },
  { value: 'Công văn', label: 'Công văn' },
  { value: 'Quy định', label: 'Quy định' },
  { value: 'Quy chế', label: 'Quy chế' },
  { value: 'Kế hoạch', label: 'Kế hoạch' },
  { value: 'Báo cáo', label: 'Báo cáo' },
  { value: 'Khác', label: 'Khác' }
];

/** Document counts per organisational unit (also feeds the dropdown). */
export const UNIT_STATS: IUnitStat[] = [
  { code: 'HCNS', name: 'Hành chính nhân sự', count: 135, color: '#0F6CBD' },
  { code: 'KT', name: 'Kế toán', count: 98, color: '#107C41' },
  { code: 'SX', name: 'Sản xuất', count: 87, color: '#CA5010' },
  { code: 'KD', name: 'Kinh doanh', count: 76, color: '#8764B8' },
  { code: 'SHE', name: 'An toàn môi trường', count: 65, color: '#038387' },
  { code: 'KCS', name: 'Kiểm soát chất lượng', count: 54, color: '#C239B3' },
  { code: 'VP', name: 'Văn phòng', count: 42, color: '#605E5C' }
];

/** KPI tiles. Values are fixed per the project spec. */
export const KPI_STATS: IKpiStat[] = [
  { key: 'total', label: 'Tổng số văn bản', value: 1248, caption: '' },
  { key: 'byUnit', label: 'Văn bản theo cấp lưu trữ', value: 1248, caption: 'Xem theo cấp lưu trữ' },
  { key: 'active', label: 'Văn bản đang lưu hành', value: 1102, caption: '88.3% tổng số' },
  { key: 'recent', label: 'Văn bản mới ban hành', value: 86, caption: '2 tháng gần đây' },
  { key: 'expiringSoon', label: 'Văn bản sắp hết hiệu lực', value: 146, caption: '30 ngày tới' },
  { key: 'expired', label: 'Văn bản hết hiệu lực', value: 0, caption: 'Không có' },
  { key: 'needsReview', label: 'Cần chuẩn hóa', value: 312, caption: '25.0% tổng số' },
  { key: 'missingSource', label: 'Thiếu bản mềm', value: 280, caption: '22.4% tổng số' },
  { key: 'hasSource', label: 'Có bản mềm', value: 968, caption: '77.6% tổng số' }
];

/** "Văn bản mới ban hành" – 5 most recently issued documents. */
export const RECENT_DOCUMENTS: IDocument[] = [
  {
    id: 'r1',
    soVanBan: '295.2026.QĐ-HCNS',
    trichYeu: 'Điều chỉnh chức danh',
    namBanHanh: 2026,
    loaiVanBan: 'Quyết định',
    loaiVanBanKey: 'QD',
    donViSoanThao: 'Hành chính nhân sự',
    donViCode: 'HCNS',
    nguoiKy: 'Trần Thanh Huyền',
    ngayBanHanh: '2026-05-20',
    ngayHetHieuLuc: undefined,
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'pdf'
  },
  {
    id: 'r2',
    soVanBan: '42.2026.QT-SX',
    trichYeu: 'Quy trình sản xuất bia',
    namBanHanh: 2026,
    loaiVanBan: 'Quy trình',
    loaiVanBanKey: 'QT',
    donViSoanThao: 'Sản xuất',
    donViCode: 'SX',
    nguoiKy: 'Nguyễn Văn Nam',
    ngayBanHanh: '2026-05-19',
    ngayHetHieuLuc: undefined,
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'docx'
  },
  {
    id: 'r3',
    soVanBan: 'TB.18.2026-TB-VP',
    trichYeu: 'Thông báo nghỉ lễ 30/4',
    namBanHanh: 2026,
    loaiVanBan: 'Thông báo',
    loaiVanBanKey: 'TB',
    donViSoanThao: 'Văn phòng',
    donViCode: 'VP',
    nguoiKy: 'Phạm Thị Mai',
    ngayBanHanh: '2026-05-18',
    ngayHetHieuLuc: undefined,
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Public,
    fileKind: 'pdf'
  },
  {
    id: 'r4',
    soVanBan: '15.2026.HD-KT',
    trichYeu: 'Hướng dẫn lập dự toán',
    namBanHanh: 2026,
    loaiVanBan: 'Hướng dẫn',
    loaiVanBanKey: 'HD',
    donViSoanThao: 'Kế toán',
    donViCode: 'KT',
    nguoiKy: 'Lê Văn Dũng',
    ngayBanHanh: '2026-05-17',
    ngayHetHieuLuc: undefined,
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'docx'
  },
  {
    id: 'r5',
    soVanBan: '122.2026.QĐ-KT',
    trichYeu: 'Phê duyệt kế hoạch',
    namBanHanh: 2026,
    loaiVanBan: 'Quyết định',
    loaiVanBanKey: 'QD',
    donViSoanThao: 'Kế toán',
    donViCode: 'KT',
    nguoiKy: 'Lê Văn Dũng',
    ngayBanHanh: '2026-05-16',
    ngayHetHieuLuc: undefined,
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'pdf'
  }
];

/** "Văn bản sắp hết hiệu lực" – 5 documents nearing expiry. */
export const EXPIRING_DOCUMENTS: IDocument[] = [
  {
    id: 'e1',
    soVanBan: '122.2024.QĐ-HCNS',
    trichYeu: 'Quy định làm việc',
    namBanHanh: 2024,
    loaiVanBan: 'Quyết định',
    loaiVanBanKey: 'QD',
    donViSoanThao: 'Hành chính nhân sự',
    donViCode: 'HCNS',
    nguoiKy: 'Trần Thanh Huyền',
    ngayBanHanh: '2024-05-30',
    ngayHetHieuLuc: '2026-05-30',
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'pdf'
  },
  {
    id: 'e2',
    soVanBan: '07.2024.QT-SX',
    trichYeu: 'Quy trình kiểm tra chất lượng',
    namBanHanh: 2024,
    loaiVanBan: 'Quy trình',
    loaiVanBanKey: 'QT',
    donViSoanThao: 'Sản xuất',
    donViCode: 'SX',
    nguoiKy: 'Nguyễn Văn Nam',
    ngayBanHanh: '2024-06-05',
    ngayHetHieuLuc: '2026-06-05',
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'docx'
  },
  {
    id: 'e3',
    soVanBan: '55.2024.HD-NS',
    trichYeu: 'Hướng dẫn chấm công',
    namBanHanh: 2024,
    loaiVanBan: 'Hướng dẫn',
    loaiVanBanKey: 'HD',
    donViSoanThao: 'Hành chính nhân sự',
    donViCode: 'HCNS',
    nguoiKy: 'Phạm Thị Mai',
    ngayBanHanh: '2024-06-10',
    ngayHetHieuLuc: '2026-06-10',
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'docx'
  },
  {
    id: 'e4',
    soVanBan: '18.2024.QĐ-VP',
    trichYeu: 'Quy chế văn thư',
    namBanHanh: 2024,
    loaiVanBan: 'Quyết định',
    loaiVanBanKey: 'QD',
    donViSoanThao: 'Văn phòng',
    donViCode: 'VP',
    nguoiKy: 'Lê Văn Dũng',
    ngayBanHanh: '2024-06-15',
    ngayHetHieuLuc: '2026-06-15',
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'pdf'
  },
  {
    id: 'e5',
    soVanBan: '09.2024.QT-KT',
    trichYeu: 'Quy trình thanh toán',
    namBanHanh: 2024,
    loaiVanBan: 'Quy trình',
    loaiVanBanKey: 'QT',
    donViSoanThao: 'Kế toán',
    donViCode: 'KT',
    nguoiKy: 'Lê Văn Dũng',
    ngayBanHanh: '2024-06-20',
    ngayHetHieuLuc: '2026-06-20',
    trangThai: DocStatus.Active,
    mucDoBaoMat: SecurityLevel.Internal,
    fileKind: 'docx'
  }
];
