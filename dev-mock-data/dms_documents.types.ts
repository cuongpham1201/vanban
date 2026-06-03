// DMS Document TypeScript Types
// Auto-generated from dms_documents.json schema
// 13 metadata columns theo DMS_KIEN_TRUC_KY_THUAT.md Mục 4

export type TrangThai = 'Bản nháp' | 'Đang lưu hành' | 'Hết hiệu lực' | 'Thu hồi';

export type MucDoBaoMat = 'Công khai' | 'Nội bộ' | 'Bảo mật' | 'Tuyệt mật';

export interface DmsDocumentFile {
  name: string;       // tên file
  path: string;       // path tương đối từ workspace root
  ext: string;        // .pdf | .docx | .xlsx | ...
  sizeKB: number;
  hasDocx: boolean;
  hasPdf: boolean;
  hasPair: boolean;   // có đủ cặp .docx + .pdf
}

export interface DmsDocumentFolder {
  code: string;       // "00" | "01" | "06.01" | ...
  name: string;       // full folder name
}

export interface DmsDocument {
  // Unique ID (folderCode-namBanHanh-soVanBan-loaiVbCode)
  id: string;

  // 13 metadata columns
  soVanBan: string;                  // ✓ Required
  namBanHanh: number | undefined;    // ✓ Required (4 digits)
  loaiVanBan: string;                // ✓ Required, full name (e.g. "Quyết định")
  donViSoanThao: string;             // ✓ Required, full name (e.g. "Phòng Hành chính – Nhân sự")
  nguoiKy: string | undefined;       // ✓ Required (đang undefined vì cần bổ sung thủ công)
  ngayBanHanh: string | undefined;   // ✓ Required, ISO YYYY-MM-DD
  ngayHetHieuLuc: string | undefined;
  trangThai: TrangThai;              // ✓ Required, default "Đang lưu hành"
  mucDoBaoMat: MucDoBaoMat;          // ✓ Required, default "Nội bộ"
  trichYeu: string;                  // Multiple lines text
  vanBanThayThe: string | undefined; // Lookup ID
  vanBanLienQuan: string[];          // Multi-lookup IDs
  tags: string[];                    // Managed metadata (Phase 4)

  // Extras for UI
  file: DmsDocumentFile;
  folder: DmsDocumentFolder;
  loaiVbCode: string;           // viết tắt cho UI badge ("QĐ", "QT", ...)
}

export interface DmsStatistics {
  byTrangThai: Record<string, number>;
  byLoaiVanBan: Record<string, number>;
  byDonVi: Record<string, number>;
  byNam: Record<string, number>;
  pairing: {
    hasPair: number;
    pdfOnly: number;
    docxOnly: number;
  };
}

export interface DmsChoiceValues {
  trangThai: TrangThai[];
  mucDoBaoMat: MucDoBaoMat[];
  loaiVanBan: string[];
  donViSoanThao: string[];
}

export interface DmsDocumentsData {
  metadata: {
    totalRecords: number;
    generatedAt: string;
    schemaVersion: string;
    source: string;
  };
  documents: DmsDocument[];
  choiceValues: DmsChoiceValues;
  statistics: DmsStatistics;
}
