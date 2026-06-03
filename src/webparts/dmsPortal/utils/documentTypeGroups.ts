// Nhóm loại văn bản cho Hero quick filter.
//
// ⚠️ QUAN TRỌNG: Đây là nhóm TÌM KIẾM theo metadata `LoaiVanBan` (+ `TrangThai`
// cho nhóm "Hết hiệu lực"). KHÔNG nhóm theo folder/path. Việc gom nhóm dựa hoàn
// toàn vào field nghiệp vụ, để khi schema/metadata evolve thì chỉ cần cập nhật
// danh sách `loaiVanBan` ở đây, không động vào component.
//
// Quick filter = NHÓM (coarse). Advanced Search vẫn giữ field LoaiVanBan chi
// tiết (fine) để lọc đúng 1 loại cụ thể.

import { IDocument, DocStatus } from '../models/IDocument';

/** Khóa ổn định cho từng nhóm quick filter. */
export type DocGroupKey =
  | 'CHINH_SACH'
  | 'QUY_CHE'
  | 'TO_CHUC'
  | 'DIEU_HANH'
  | 'HOP_DONG'
  | 'HET_HIEU_LUC'
  | 'KHAC';

/** Định nghĩa một nhóm quick filter. */
export interface IDocGroup {
  key: DocGroupKey;
  /** Nhãn hiển thị trên pill. */
  label: string;
  /** Tên icon trong Icons.tsx (map sang component ở Hero). */
  icon: string;
  /** Màu accent cho icon. */
  color: string;
  /**
   * Giá trị NhomTaiLieu (V2) tương ứng nhóm này — nguồn phân loại CHÍNH THỨC.
   * Khi doc có `nhomTaiLieu` thì match trực tiếp field này (chính xác 100%).
   * Undefined với nhóm KHAC.
   */
  nhom?: string;
  /**
   * (Fallback V1) Danh sách giá trị LoaiVanBan (full name) thuộc nhóm này,
   * chỉ dùng khi doc CHƯA có NhomTaiLieu V2.
   * Rỗng với nhóm đặc biệt (HET_HIEU_LUC lọc theo TrangThai, KHAC là phần dư).
   */
  loaiVanBan: string[];
}

/**
 * 7 nhóm quick filter.
 * Thứ tự trong mảng = thứ tự hiển thị trên Hero.
 */
export const DOC_GROUPS: IDocGroup[] = [
  {
    key: 'CHINH_SACH',
    label: 'Chính sách – Định hướng',
    icon: 'StarIcon',
    color: '#0F6CBD',
    nhom: 'Chính sách – Định hướng',
    loaiVanBan: ['Chính sách', 'Định hướng', 'Chiến lược', 'Chỉ thị']
  },
  {
    key: 'QUY_CHE',
    label: 'Quy chế – Quy định – Quy trình – Hướng dẫn',
    icon: 'BookIcon',
    color: '#107C41',
    nhom: 'Quy chế – Quy định – Quy trình – Hướng dẫn',
    loaiVanBan: ['Quy chế', 'Quy định', 'Quy trình', 'Hướng dẫn', 'Tiêu chuẩn', 'Biểu mẫu', 'Sổ tay']
  },
  {
    key: 'TO_CHUC',
    label: 'Tổ chức – Nhân sự',
    icon: 'BuildingIcon',
    color: '#8764B8',
    nhom: 'Tổ chức – Nhân sự',
    loaiVanBan: [
      'Chức năng nhiệm vụ',
      'Sơ đồ tổ chức',
      'Quyết định nhân sự',
      'Ủy quyền',
      'Giấy ủy quyền',
      'Bổ nhiệm',
      'Miễn nhiệm',
      'Bổ nhiệm/Miễn nhiệm',
      'Mô tả công việc'
    ]
  },
  {
    key: 'DIEU_HANH',
    label: 'Điều hành – Tác nghiệp',
    icon: 'SendIcon',
    color: '#CA5010',
    nhom: 'Điều hành – Tác nghiệp',
    loaiVanBan: [
      'Quyết định',
      'Thông báo',
      'Thông cáo',
      'Công văn',
      'Văn bản đến',
      'Văn bản đi',
      'Tờ trình',
      'Báo cáo',
      'Biên bản họp',
      'Biên bản',
      'Kế hoạch tác nghiệp',
      'Kế hoạch',
      'Chương trình',
      'Phương án',
      'Đề án',
      'Dự án',
      'Đề xuất',
      'Giấy mời'
    ]
  },
  {
    key: 'HOP_DONG',
    label: 'Hợp đồng – Văn bản pháp lý',
    icon: 'GavelIcon',
    color: '#038387',
    nhom: 'Hợp đồng – Văn bản pháp lý',
    loaiVanBan: [
      'Hợp đồng',
      'Phụ lục hợp đồng',
      'Văn bản pháp lý',
      'Biên bản thỏa thuận',
      'Biên bản giao nhận',
      'Cam kết',
      'Nghị quyết'
    ]
  },
  {
    key: 'HET_HIEU_LUC',
    label: 'Hết hiệu lực',
    icon: 'ClockAlertIcon',
    color: '#C4314B',
    nhom: 'Hết hiệu lực',
    loaiVanBan: []
  },
  {
    key: 'KHAC',
    label: 'Khác',
    icon: 'GridIcon',
    color: '#605E5C',
    loaiVanBan: []
  }
];

/** Nhóm "Khác" — phần dư, không match nhóm 1-5 và không phải Hết hiệu lực. */
export function isOtherGroup(key: DocGroupKey): boolean {
  return key === 'KHAC';
}

/** Lấy định nghĩa nhóm theo key (undefined nếu không có). */
export function getGroup(key: DocGroupKey): IDocGroup | undefined {
  for (let i: number = 0; i < DOC_GROUPS.length; i++) {
    if (DOC_GROUPS[i].key === key) { return DOC_GROUPS[i]; }
  }
  return undefined;
}

/** Kiểm tra LoaiVanBan của doc có nằm trong nhóm "chính" (1-5) nào không. */
function loaiInMainGroups(loaiVanBan: string): boolean {
  for (let i: number = 0; i < DOC_GROUPS.length; i++) {
    const g: IDocGroup = DOC_GROUPS[i];
    if (g.loaiVanBan.length === 0) { continue; }
    for (let j: number = 0; j < g.loaiVanBan.length; j++) {
      if (g.loaiVanBan[j] === loaiVanBan) { return true; }
    }
  }
  return false;
}

/** Giá trị NhomTaiLieu (V2) có thuộc 5 nhóm "chính" (không tính Hết hiệu lực / Khác) không. */
function nhomInMainGroups(nhom: string): boolean {
  for (let i: number = 0; i < DOC_GROUPS.length; i++) {
    const g: IDocGroup = DOC_GROUPS[i];
    if (g.key === 'HET_HIEU_LUC' || g.key === 'KHAC') { continue; }
    if (g.nhom && g.nhom === nhom) { return true; }
  }
  return false;
}

/**
 * Một document có thuộc nhóm `key` không.
 *
 * - HET_HIEU_LUC : TrangThai === Hết hiệu lực (theo metadata, không theo folder).
 * - KHAC         : KHÔNG hết hiệu lực VÀ LoaiVanBan không thuộc nhóm 1-5.
 * - 1-5          : LoaiVanBan nằm trong danh sách của nhóm (so khớp full name).
 *
 * Lưu ý: nhóm theo LoaiVanBan độc lập với TrangThai, nên một văn bản đã hết
 * hiệu lực vẫn có thể khớp nhóm 1-5 (vd "Quyết định" hết hiệu lực vẫn là
 * Điều hành – Tác nghiệp). Người dùng chọn đúng 1 nhóm tại 1 thời điểm.
 */
export function matchesGroup(doc: IDocument, key: DocGroupKey): boolean {
  // V2: nếu doc có NhomTaiLieu thì phân nhóm theo field này (nguồn chính thức).
  const nhom: string = (doc.nhomTaiLieu ?? '').trim();
  const hasV2: boolean = nhom.length > 0;

  if (key === 'HET_HIEU_LUC') {
    if (hasV2) { return nhom === 'Hết hiệu lực' || doc.trangThai === DocStatus.Expired; }
    return doc.trangThai === DocStatus.Expired;
  }
  if (key === 'KHAC') {
    if (hasV2) { return nhom !== 'Hết hiệu lực' && !nhomInMainGroups(nhom); }
    return doc.trangThai !== DocStatus.Expired && !loaiInMainGroups(doc.loaiVanBan);
  }

  const g: IDocGroup | undefined = getGroup(key);
  if (!g) { return false; }

  // V2 chính xác: so khớp NhomTaiLieu.
  if (hasV2 && g.nhom) { return nhom === g.nhom; }

  // Fallback V1: so khớp theo LoaiVanBan.
  for (let i: number = 0; i < g.loaiVanBan.length; i++) {
    if (g.loaiVanBan[i] === doc.loaiVanBan) { return true; }
  }
  return false;
}
