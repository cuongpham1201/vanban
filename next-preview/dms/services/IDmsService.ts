import {
  IDocument,
  IUnitStat,
  IKpiStat,
  IDocSearchFilter,
  IMetadataChoices,
  IStorageFolder
} from '../models/IDocument';

/** Tham số upload 1 văn bản mới. */
export interface IUploadRequest {
  /** Nội dung file (ArrayBuffer đọc từ File). */
  fileBuffer: ArrayBuffer;
  /** Tên file gồm phần mở rộng (vd "295.2026.QĐ-HCNS.pdf"). */
  fileName: string;
  /** Cấp lưu trữ = nhãn folder cấp 1 (vd "[18] CĐ - Phòng Cơ điện"). Dùng để chọn folder upload. */
  capLuuTru: string;
  /** Metadata map InternalName -> value (đã chuẩn hóa: ngày ISO 8601, năm dạng số-string). */
  metadata: { [internalName: string]: string };
  /** Id văn bản cũ sẽ bị thay thế (nếu có). */
  replacementOldId?: string;
  /** (Tùy chọn) Bản mềm DOCX/XLSX/PPTX upload đồng thời với PDF — lưu cùng thư mục, cùng metadata. */
  editableFileBuffer?: ArrayBuffer;
  /** Tên file bản mềm (gồm phần mở rộng). Bắt buộc nếu có editableFileBuffer. */
  editableFileName?: string;
}

/** Kết quả upload. */
export interface IUploadResult {
  /** Văn bản mới (đọc lại từ nguồn) nếu resolve được. */
  document?: IDocument;
  /** Đã đánh dấu văn bản cũ hết hiệu lực thành công chưa (chỉ khi có thay thế). */
  oldDocUpdated: boolean;
  /** Cảnh báo (vd: upload OK nhưng cập nhật văn bản cũ lỗi). */
  warning?: string;
}

/**
 * Data access contract for the Văn bản điều hành portal.
 *
 * Phase 1 (now)   : MockDmsService returns in-memory arrays.
 * Phase 2 (later) : SharePointDmsService implements this same interface by
 *                   querying the "vbdh-draft" Document Library via SPHttpClient
 *                   or PnPjs. The UI components depend only on this interface,
 *                   so no component code needs to change.
 */
export interface IDmsService {
  /** Văn bản mới ban hành. */
  getRecentDocuments(): Promise<IDocument[]>;
  /** Văn bản sắp hết hiệu lực. */
  getExpiringDocuments(): Promise<IDocument[]>;
  /** Văn bản theo đơn vị (aggregated counts) — dựa trên folder cấp 1 thật + số văn bản còn hiệu lực. */
  getUnitStats(): Promise<IUnitStat[]>;
  /**
   * Danh sách folder cấp 1 (cấp lưu trữ) HIỆN CÓ trong DMS Library — nguồn chuẩn.
   * Bao gồm cả folder chưa có văn bản. Đã loại folder hệ thống (Forms, _...).
   */
  getStorageFolders(): Promise<IStorageFolder[]>;
  /** KPI tiles. */
  getKpis(): Promise<IKpiStat[]>;
  /** Search/filter documents (advanced search + quick filters). */
  searchDocuments(filter: IDocSearchFilter): Promise<IDocument[]>;
  /** Toàn bộ documents trong DMS Library (cho list view). */
  getAllDocuments(): Promise<IDocument[]>;
  /** Bỏ cache + tải lại toàn bộ documents (nút "Tải lại dữ liệu"). */
  refreshDocuments(): Promise<IDocument[]>;
  /**
   * Cập nhật metadata cho 1 item (sửa tại chỗ khi data chưa chuẩn).
   * @param id     SharePoint item Id (string).
   * @param values map InternalName -> giá trị mới (string). Bỏ qua field rỗng nếu muốn giữ nguyên.
   * Trả về document đã cập nhật (đọc lại từ nguồn) để UI refresh.
   */
  updateMetadata(id: string, values: { [internalName: string]: string }): Promise<IDocument | undefined>;
  /**
   * Cập nhật cùng 1 bộ giá trị cho NHIỀU item (sửa hàng loạt ở trang Cần chuẩn hóa).
   * Ghi từng item rồi refresh 1 lần. Trả về số item lỗi (0 = tất cả OK).
   */
  updateMetadataMany(ids: string[], values: { [internalName: string]: string }, onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: number; errors: string[] }>;
  /**
   * Upload 1 văn bản mới vào DMS Library (folder cấp 1 theo Cấp lưu trữ), set metadata,
   * và nếu có văn bản thay thế thì đánh dấu văn bản cũ "Hết hiệu lực" + ghi liên kết 2 chiều.
   * KHÔNG move file cũ (phase 1). Trả về kết quả + cảnh báo nếu cập nhật văn bản cũ lỗi.
   */
  uploadDocument(req: IUploadRequest): Promise<IUploadResult>;
  /**
   * Lấy danh sách Choices của các Choice field trong DMS Library (động từ field schema).
   * Dùng cho dropdown ở Upload + sửa metadata. Có cache runtime + fallback khi API lỗi.
   */
  getMetadataChoices(): Promise<IMetadataChoices>;
  /**
   * Xóa (đưa vào Thùng rác) 1 văn bản: item PDF chính + file bản mềm đi kèm (nếu có).
   * Dùng REST recycle() → có thể khôi phục từ Thùng rác site.
   */
  deleteDocument(doc: IDocument): Promise<void>;
  /**
   * Xóa (đưa vào Thùng rác) NHIỀU văn bản. Xóa tuần tự, lỗi 1 văn bản không chặn các văn bản khác.
   * Refresh cache 1 lần sau khi xong. Trả về số thành công / thất bại.
   */
  deleteDocuments(docs: IDocument[], onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: number; errors: string[] }>;
  /**
   * Upload bản mềm (DOCX/XLSX/PPTX...) cho 1 văn bản PDF đang thiếu bản mềm.
   * - Lưu CÙNG thư mục với PDF (không tạo folder mới).
   * - Copy toàn bộ metadata của PDF sang file bản mềm.
   * - Set HasEditableSource=Yes + EditableSourceUrl trên cả PDF và bản mềm; PrimaryPdfUrl trên bản mềm.
   * Trả về document PDF đã cập nhật (đọc lại từ nguồn).
   */
  uploadEditableSource(doc: IDocument, fileBuffer: ArrayBuffer, fileName: string): Promise<IDocument | undefined>;
  /**
   * Gắn link bản mềm sẵn có (URL SharePoint) cho 1 văn bản PDF.
   * Set HasEditableSource=Yes + EditableSourceUrl=URL trên item PDF (không upload file).
   * Trả về document PDF đã cập nhật.
   */
  linkEditableSource(doc: IDocument, editableSourceUrl: string): Promise<IDocument | undefined>;
}
