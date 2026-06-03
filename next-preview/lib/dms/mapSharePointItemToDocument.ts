// Map 1 Microsoft Graph list item (có `fields` + optional `driveItem`) sang IDocument.
// PORT từ SharePointDmsService._mapItem (giữ nguyên business rule), đổi nguồn:
//   - SP REST item.<Field>            -> Graph item.fields.<Field>
//   - EncodedAbsUrl / FileRef         -> driveItem.webUrl / fields.FileRef
// Ưu tiên Metadata V2, fallback V1; field thiếu thì fallback an toàn, KHÔNG crash.

import {
  IDocument,
  IEditableSource,
  DocStatus,
  SecurityLevel,
  DocTypeKey,
  FileKind,
} from '@dms/models/IDocument';

// LoaiVanBan / LoaiVanBanPhapLy (full name) -> stable key cho UI quick filter.
const LOAI_TO_KEY: { [k: string]: DocTypeKey } = {
  'Quyết định': 'QD',
  'Quy trình': 'QT',
  'Thông báo': 'TB',
  'Hướng dẫn': 'HD',
  'Văn bản đến': 'CV',
  'Văn bản đi': 'CV',
  'Công văn': 'CV',
  'Tờ trình': 'CV',
  'Nghị quyết': 'KHAC',
  'Biên bản': 'KHAC',
  'Giấy ủy quyền': 'KHAC',
};

// DonViSoanThao (full name) -> mã viết tắt cho UI badge / search.
const DON_VI_TO_CODE: { [k: string]: string } = {
  'Tổng Giám đốc': 'TGD',
  'Giám đốc Kinh Doanh': 'GDKD',
  'Giám đốc Tài chính và Quản trị': 'GDTC-QT',
  'Giám đốc Vận hành và Chuỗi Cung ứng': 'GDVH',
  'Giám đốc Sản xuất – Kỹ thuật': 'GDSX',
  'Phó Giám đốc Phụ trách Thiết bị': 'PGDTB',
  'Phó Giám đốc Sản xuất – Kỹ thuật': 'PGDSX',
  'Ban Pháp chế – Tuân thủ': 'PCTT',
  'Ban Tài chính – Kiểm soát nội bộ': 'TCKS',
  'Ban S-H-E': 'SHE',
  'Phòng Kỹ thuật, Công nghệ và Cải tiến Sản xuất': 'KTCN',
  'Phòng Vận hành Kinh doanh': 'VHKD',
  'Phòng Marketing': 'MKT',
  'Phòng Kinh doanh Bia hơi': 'KDBH',
  'Phòng Kế toán': 'KT',
  'Phòng Kế hoạch – Vật tư': 'KHVT',
  'Phòng Hành chính – Nhân sự': 'HCNS',
  'Phòng Kiểm soát Chất lượng – KCS': 'KCS',
  'Phòng Cơ điện': 'CD',
  'Kênh Phân phối': 'KPP',
  'Kênh Khách hàng Tổ chức': 'KHTC',
  'Trung tâm Điều hành': 'TTDH',
  'Phân xưởng Sản xuất Đông Mai': 'PXDM',
  'Phân xưởng Cơ điện – Động lực Đông Mai': 'CDDM',
  'Phân xưởng Sản xuất Hạ Long': 'PXHL',
  'Phân xưởng Cơ điện – Động lực Hạ Long': 'CDHL',
  'Văn bản điều hành chung (cấp Công ty)': 'CTY',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GraphListItem {
  id?: string | number;
  fields?: Record<string, any>;
  driveItem?: {
    id?: string;
    name?: string;
    webUrl?: string;
    size?: number;
    file?: { mimeType?: string };
    folder?: unknown;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    createdBy?: { user?: { displayName?: string } };
    lastModifiedBy?: { user?: { displayName?: string } };
    parentReference?: { path?: string };
  };
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName?: string } };
  lastModifiedBy?: { user?: { displayName?: string } };
}

function isoDate(raw?: string): string {
  if (!raw) {
    return '';
  }
  return String(raw).substring(0, 10);
}

function yearFromDate(raw?: string): number {
  if (!raw) {
    return new Date().getFullYear();
  }
  return parseInt(String(raw).substring(0, 4), 10) || new Date().getFullYear();
}

function extractTrichYeuFromName(filename?: string): string {
  if (!filename) {
    return '';
  }
  let stem = filename.replace(/\.[^.]+$/, '');
  stem = stem.replace(/^[^-]*-[^-]*-/, '');
  stem = stem.replace(/\.\d{1,2}[-.]\d{1,2}[-.]\d{4}.*$/, '');
  return stem.trim();
}

function mapStatus(raw: any): DocStatus {
  switch (raw) {
    case 'Bản nháp':
      return DocStatus.Draft;
    case 'Đang lưu hành':
      return DocStatus.Active;
    case 'Hết hiệu lực':
      return DocStatus.Expired;
    case 'Thu hồi':
      return DocStatus.Revoked;
    default:
      return DocStatus.Active;
  }
}

function mapSecurity(raw: any): SecurityLevel {
  switch (raw) {
    case 'Công khai':
      return SecurityLevel.Public;
    case 'Nội bộ':
      return SecurityLevel.Internal;
    case 'Bảo mật':
      return SecurityLevel.Confidential;
    case 'Tuyệt mật':
      return SecurityLevel.TopSecret;
    default:
      return SecurityLevel.Internal;
  }
}

function mapFileKind(ext: string): FileKind {
  if (ext === 'pdf') {
    return 'pdf';
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return 'xlsx';
  }
  return 'docx';
}

function unitCode(donViSoHuu: string | undefined, donViDisplay: string): string {
  if (donViSoHuu) {
    const m = donViSoHuu.match(/^\s*\[(\d{2}(?:\.\d{2})?)\]/);
    if (m) {
      return m[1];
    }
  }
  return DON_VI_TO_CODE[donViDisplay] ?? 'KHAC';
}

function asUrlString(raw: any): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw && typeof raw === 'object' && typeof raw.Url === 'string') {
    return raw.Url;
  }
  return '';
}

/** NguoiKy có thể là Person field (object) hoặc text — đọc an toàn. */
function readPerson(raw: any): string {
  if (!raw) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'object') {
    return raw.LookupValue ?? raw.DisplayName ?? raw.Title ?? raw.displayName ?? raw.email ?? '';
  }
  return '';
}

function editableSourceFromColumns(f: Record<string, any>): IEditableSource | undefined {
  try {
    const rawFlag = f.HasEditableSource;
    const flag = (typeof rawFlag === 'string' ? rawFlag : rawFlag === true ? 'yes' : '').toLowerCase();
    const declared = flag === 'yes' || flag === 'true' || flag === '1' || rawFlag === true;
    if (!declared) {
      return undefined;
    }
    const url = asUrlString(f.EditableSourceUrl);
    if (!url) {
      return undefined;
    }
    const leaf = url.split('?')[0].split('/').slice(-1)[0] || 'Bản mềm';
    const extMatch = leaf.match(/\.([^.]+)$/);
    let fileName = leaf;
    try {
      fileName = decodeURIComponent(leaf);
    } catch {
      /* giữ nguyên */
    }
    return {
      fileName,
      fileExt: extMatch ? `.${extMatch[1].toLowerCase()}` : '',
      webUrl: url,
      serverRelativeUrl: undefined,
      sizeKB: undefined,
    };
  } catch {
    return undefined;
  }
}

export function mapSharePointItemToDocument(item: GraphListItem): IDocument {
  const f = item.fields ?? {};
  const drive = item.driveItem;

  const loaiVanBan = f.LoaiVanBanPhapLy ?? f.LoaiVanBan ?? 'Khác';
  const donViSoanThao = f.DonViSoHuu ?? f.DonViSoanThao ?? 'Khác';

  // Tên file + extension: ưu tiên driveItem.name, fallback FileLeafRef.
  const fileName: string = drive?.name ?? f.FileLeafRef ?? '';
  const extMatch = fileName.match(/\.([^.]+)$/);
  const ext = (extMatch ? extMatch[1] : '').toLowerCase();

  // Folder server-relative (cho pairing + hiển thị): FileDirRef hoặc parentReference.path.
  const fileRef: string | undefined = f.FileRef;
  const folderPath: string | undefined =
    f.FileDirRef ?? (drive?.parentReference?.path ? drive.parentReference.path.replace(/^.*?root:/, '') : undefined);

  const created = drive?.createdDateTime ?? item.createdDateTime;
  const modified = drive?.lastModifiedDateTime ?? item.lastModifiedDateTime;
  const author = drive?.createdBy?.user?.displayName ?? item.createdBy?.user?.displayName;
  const editor = drive?.lastModifiedBy?.user?.displayName ?? item.lastModifiedBy?.user?.displayName;

  const doc: IDocument = {
    id: String(item.id ?? f.id ?? ''),
    soVanBan: f.SoVanBan ?? '',
    trichYeu: f.TrichYeu ?? extractTrichYeuFromName(fileName),
    namBanHanh: f.NamBanHanh != null ? Number(f.NamBanHanh) || yearFromDate(f.NgayBanHanh) : yearFromDate(f.NgayBanHanh),
    loaiVanBan,
    loaiVanBanKey: LOAI_TO_KEY[loaiVanBan] ?? 'KHAC',
    donViSoanThao,
    donViCode: unitCode(f.DonViSoHuu, donViSoanThao),
    nguoiKy: readPerson(f.NguoiKy),
    ngayBanHanh: isoDate(f.NgayBanHanh),
    ngayHetHieuLuc: f.NgayHetHieuLuc ? isoDate(f.NgayHetHieuLuc) : undefined,
    trangThai: mapStatus(f.TrangThai ?? DocStatus.Active),
    mucDoBaoMat: mapSecurity(f.MucDoBaoMat ?? SecurityLevel.Internal),
    fileKind: mapFileKind(ext),
    webUrl: drive?.webUrl,
    serverRelativeUrl: fileRef ?? (folderPath && fileName ? `${folderPath}/${fileName}` : undefined),
    fileName,
    fileExt: ext ? `.${ext}` : '',
    fileSizeKB: typeof drive?.size === 'number' ? Math.round(drive.size / 1024) : undefined,
    hasDocx: ext === 'doc' || ext === 'docx',
    hasPdf: ext === 'pdf',
    // Metadata V2
    nhomTaiLieu: f.NhomTaiLieu ?? undefined,
    loaiVanBanPhapLy: f.LoaiVanBanPhapLy ?? undefined,
    loaiTaiLieu: f.LoaiTaiLieu ?? undefined,
    chuDeNghiepVu: f.ChuDeNghiepVu ?? undefined,
    donViPhatHanh: f.DonViPhatHanh ?? undefined,
    donViSoHuu: f.DonViSoHuu ?? undefined,
    nguonMetadata: f.NguonMetadata ?? undefined,
    metadataConfidence: f.MetadataConfidence ?? undefined,
    vanBanThayThe: f.VanBanThayThe ?? undefined,
    vanBanLienQuan: f.VanBanLienQuan ?? undefined,
    tags: f.Tags ?? undefined,
    editableSource: editableSourceFromColumns(f),
    folderUrl: folderPath ?? undefined,
  };

  // Thông tin author/editor/created/modified gắn kèm (không thuộc IDocument core nhưng UI có thể dùng).
  (doc as IDocument & { created?: string; modified?: string; author?: string; editor?: string }).created = created
    ? String(created)
    : undefined;
  (doc as IDocument & { created?: string; modified?: string; author?: string; editor?: string }).modified = modified
    ? String(modified)
    : undefined;
  (doc as IDocument & { created?: string; modified?: string; author?: string; editor?: string }).author = author;
  (doc as IDocument & { created?: string; modified?: string; author?: string; editor?: string }).editor = editor;

  return doc;
}
