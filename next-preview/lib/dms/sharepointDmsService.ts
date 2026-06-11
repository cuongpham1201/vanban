// Phase 10C — SharePoint write service FOUNDATION (server-side).
//
// QUAN TRỌNG:
//  - KHÔNG chạy bất kỳ Graph write nào lúc import (chỉ chạy khi method được gọi tường minh).
//  - Mọi write thật bị chặn 2 lớp: (1) flag isDmsWriteEnabled, (2) chưa implement → NotImplemented.
//  - Phase 10C chỉ dựng khung + helper read-only an toàn (duplicate-check). Upload/PATCH thật để 10D+.
import { graphFetch, type GraphFetchOptions } from '@/lib/graph/client';
import { resolveSiteId, resolveListId, getDrives } from '@/lib/sharepoint/resolve';
import { isDmsWriteEnabled, DMS_WRITE_DISABLED_MSG } from './writeConfig';
import { buildFileName, normalizeMetadataPayload, validateUploadMetadata, type ValidationResult } from './writeHelpers';
import { isEditableSourceFile } from '@dms/utils/documentPair';

/** Escape chuỗi để dùng an toàn trong RegExp (tên file có thể chứa ký tự đặc biệt). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Content-Type theo extension cho upload Office/PDF (Graph chấp nhận octet-stream nếu thiếu). */
function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'pdf': return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc': return 'application/msword';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

/** Làm sạch 1 segment tên folder (subfolder Attachments theo SoVanBan). */
function sanitizeFolderSegment(s: string): string {
  return (s ?? '').replace(/[/\\:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').trim();
}

/** Làm sạch tên file đính kèm (giữ extension). */
function sanitizeAttachmentName(s: string): string {
  const cleaned = (s ?? '').replace(/[/\\:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'file';
}

/** 1 child trong drive (file hoặc folder). */
export interface DriveChild {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: unknown;
  createdDateTime?: string;
  createdBy?: { user?: { displayName?: string; email?: string } };
  lastModifiedDateTime?: string;
}

/** Thông tin 1 file đính kèm trả về UI. */
export interface AttachmentInfo {
  id: string;
  name: string;
  ext: string;
  sizeKB?: number;
  webUrl: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

/** 1 phiên bản listItem (version history gốc SharePoint). */
export interface RawItemVersion {
  id: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string; email?: string } };
  fields?: Record<string, unknown>;
}

function toAttachmentInfo(c: DriveChild): AttachmentInfo {
  const ext = (c.name.split('.').pop() ?? '').toLowerCase();
  return {
    id: c.id,
    name: c.name,
    ext,
    sizeKB: typeof c.size === 'number' ? Math.round(c.size / 1024) : undefined,
    webUrl: c.webUrl ?? '',
    uploadedBy: c.createdBy?.user?.displayName,
    uploadedAt: c.createdDateTime,
  };
}

export class NotImplementedError extends Error {
  status = 501;
  constructor(what: string) {
    super(`${what} chưa được triển khai (Phase 10C là nền tảng — upload thật ở Phase 10D).`);
    this.name = 'NotImplementedError';
  }
}

export class WriteDisabledError extends Error {
  status = 403;
  constructor() {
    super(DMS_WRITE_DISABLED_MSG);
    this.name = 'WriteDisabledError';
  }
}

export interface DuplicateCheckResult {
  exists: boolean;
  matches: { id: string; soVanBan: string; trichYeu: string }[];
}

export interface AppAccessInfo {
  siteId: string;
  siteUrl?: string;
  listId: string;
  library: string;
}

export interface FolderResolveResult {
  found: boolean;
  driveId?: string;
  driveName?: string;
  folderId?: string;
  folderName?: string;
  candidates: string[]; // tên folder cấp 1 hiện có (chẩn đoán)
}

// Giới hạn simple upload (PUT /content). File lớn hơn → lỗi rõ; resumable upload = follow-up.
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024; // 60MB

// BUG#18: cột Hyperlink — Microsoft Graph KHÔNG ghi được qua PATCH .../items/{id}/fields (→ 400).
// LUÔN bỏ qua trong coerceFields để không bao giờ PATCH (cả upload lẫn edit metadata).
const UNWRITABLE_HYPERLINK_COLUMNS = new Set(['EditableSourceUrl', 'PrimaryPdfUrl']);

export class UploadTooLargeError extends Error {
  status = 413;
  constructor(bytes: number) {
    super(`File ${(bytes / 1024 / 1024).toFixed(1)}MB vượt giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024}MB (simple upload).`);
    this.name = 'UploadTooLargeError';
  }
}
export class FolderNotFoundError extends Error {
  status = 404;
  candidates: string[];
  constructor(input: string, candidates: string[]) {
    super(`Không tìm thấy folder cấp lưu trữ khớp "${input}".`);
    this.name = 'FolderNotFoundError';
    this.candidates = candidates;
  }
}
export class PatchRolledBackError extends Error {
  status = 502;
  rolledBack = true;
  constructor(cause: unknown) {
    super(`PATCH metadata thất bại sau retry — đã rollback xóa file đã upload. ${cause instanceof Error ? cause.message : ''}`.trim());
    this.name = 'PatchRolledBackError';
  }
}

export interface CreateUploadRequest {
  fileName: string;
  fileBuffer: ArrayBuffer;
  capLuuTru: string; // nhãn folder cấp 1 (vị trí lưu file) — TÁCH KHỎI DonViSoHuu metadata
  metadata: Record<string, string>; // internal column names (đã normalize; gồm DonViSoHuu choice nếu có)
  editableFileName?: string;
  editableFileBuffer?: ArrayBuffer;
}
export interface CreateUploadResult {
  listItemId: string;
  driveItemId: string;
  webUrl: string;
  hasEditableSource: boolean;
  warning?: string;
}

/**
 * Khung dịch vụ write. Khởi tạo với accessToken delegated (server-side).
 * Tạo instance KHÔNG gây side-effect; chỉ method mới hành động.
 */
export class SharePointDmsService {
  private readonly accessToken: string;
  private _columns?: Map<string, { type: string; choices?: string[]; readOnly: boolean }>;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /** Chặn cứng: ném nếu write flag tắt. Gọi đầu mọi method có khả năng ghi. */
  private assertWriteEnabled(): void {
    if (!isDmsWriteEnabled()) {
      throw new WriteDisabledError();
    }
  }

  /**
   * READ-ONLY: kiểm tra trùng SoVanBan bằng cách QUERY SharePoint TRỰC TIẾP (KHÔNG dùng cache)
   * → luôn phản ánh trạng thái mới nhất ngay trước khi ghi. Lọc bằng $filter fields/SoVanBan.
   */
  async checkDuplicateBySoVanBan(soVanBan: string): Promise<DuplicateCheckResult> {
    const raw = (soVanBan ?? '').trim();
    if (!raw) {
      return { exists: false, matches: [] };
    }
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const escaped = raw.replace(/'/g, "''"); // escape nháy đơn cho OData
    const path =
      `/sites/${site.id}/lists/${list.id}/items` +
      `?$expand=fields($select=SoVanBan,TrichYeu)&$filter=fields/SoVanBan eq '${encodeURIComponent(escaped)}'&$top=50`;
    const resp = await graphFetch<{ value: { id: string; fields?: { SoVanBan?: string; TrichYeu?: string } }[] }>(
      path,
      {
        accessToken: this.accessToken,
        // Cho phép filter trên cột chưa index (DMS Library) — tránh lỗi 'not indexed'.
        headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' },
      }
    );
    const key = raw.toLowerCase();
    const matches = (resp.value ?? [])
      .filter((it) => (it.fields?.SoVanBan ?? '').trim().toLowerCase() === key)
      .map((it) => ({ id: it.id, soVanBan: it.fields?.SoVanBan ?? '', trichYeu: it.fields?.TrichYeu ?? '' }));
    return { exists: matches.length > 0, matches };
  }

  /** PURE wrapper: validate + chuẩn hóa payload (không ghi). Tận dụng được ở UI lẫn API sau. */
  prepareMetadata(
    input: Record<string, string | undefined>,
    opts: { hasEditableSource?: boolean } = {}
  ): { metadata: Record<string, string>; validation: ValidationResult } {
    const metadata = normalizeMetadataPayload(input, opts);
    return { metadata, validation: validateUploadMetadata(metadata) };
  }

  /** PURE: tên file đích từ SoVanBan. */
  buildFileName(soVanBan: string, ext = '.pdf'): string {
    return buildFileName(soVanBan, ext);
  }

  // ───────────────────────── WRITE (chưa mở — Phase 10D+) ─────────────────────────
  // Tất cả method dưới: assertWriteEnabled() trước, rồi NotImplemented.
  // ⇒ flag tắt → "DMS write is disabled"; flag bật → "NotImplemented" (vẫn KHÔNG ghi).

  /**
   * READ-ONLY: xác minh app-only token đọc được site + library (chứng minh Application
   * permissions hoạt động) — KHÔNG ghi gì. Flag-guarded.
   */
  async verifyAppAccess(): Promise<AppAccessInfo> {
    this.assertWriteEnabled();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    return { siteId: site.id, siteUrl: site.webUrl, listId: list.id, library: list.displayName };
  }

  /**
   * READ-ONLY: resolve folder cấp 1 theo Cấp lưu trữ (DonViSoHuu) — chỉ LIỆT KÊ + so khớp,
   * KHÔNG tạo folder, KHÔNG ghi. Flag-guarded. Trả found + candidates để chẩn đoán.
   */
  async resolveUploadFolder(donViSoHuu: string): Promise<FolderResolveResult> {
    this.assertWriteEnabled();
    const wanted = (donViSoHuu ?? '').trim().toLowerCase();
    const norm = (s: string): string => s.trim().toLowerCase();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const drives = await getDrives(this.accessToken, site.id);
    const drive = drives.find((d) => norm(d.name) === norm(list.displayName)) ?? drives[0];
    if (!drive) {
      return { found: false, candidates: [] };
    }
    const children = await graphFetch<{ value: { id: string; name: string; folder?: unknown }[] }>(
      `/drives/${drive.id}/root/children?$select=id,name,folder&$top=200`,
      { accessToken: this.accessToken }
    );
    const folders = (children.value ?? []).filter((c) => c.folder);
    const candidates = folders.map((f) => f.name);
    if (!wanted) {
      return { found: false, driveId: drive.id, driveName: drive.name, candidates };
    }
    const hit = folders.find((f) => norm(f.name) === wanted || norm(f.name).includes(wanted));
    return hit
      ? { found: true, driveId: drive.id, driveName: drive.name, folderId: hit.id, folderName: hit.name, candidates }
      : { found: false, driveId: drive.id, driveName: drive.name, candidates };
  }

  /**
   * Upload 1 file (simple PUT /content) vào folder. Trả driveItemId + webUrl + listItemId.
   * Giới hạn MAX_UPLOAD_BYTES (simple upload). File lớn hơn → ném lỗi rõ (resumable = follow-up).
   */
  async uploadFile(
    driveId: string,
    folderId: string,
    fileName: string,
    buffer: ArrayBuffer,
    contentType: string
  ): Promise<{ driveItemId: string; webUrl: string; listItemId: string }> {
    this.assertWriteEnabled();
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new UploadTooLargeError(buffer.byteLength);
    }
    const enc = encodeURIComponent(fileName);
    const item = await this.graphWrite<{ id: string; webUrl: string }>(
      `/drives/${driveId}/items/${folderId}:/${enc}:/content`,
      { method: 'PUT', body: buffer as BodyInit, headers: { 'Content-Type': contentType } }
    );
    const li = await graphFetch<{ id: string }>(
      `/drives/${driveId}/items/${item.id}/listItem?$select=id`,
      { accessToken: this.accessToken }
    );
    return { driveItemId: item.id, webUrl: item.webUrl, listItemId: li.id };
  }

  /** PATCH metadata (listItem fields) — siteId/listId từ resolve. Retry do caller xử lý. */
  async patchMetadata(siteId: string, listId: string, listItemId: string, fields: Record<string, unknown>): Promise<void> {
    this.assertWriteEnabled();
    await this.graphWrite<unknown>(
      `/sites/${siteId}/lists/${listId}/items/${listItemId}/fields`,
      { method: 'PATCH', body: JSON.stringify(fields), headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Cập nhật metadata 1 listItem (edit tại chỗ). Coerce theo schema (number/boolean/dateTime/choice;
   * omit person/lookup/readOnly/choice-invalid kèm skipped). PATCH rồi đọc lại fields + updatedAt.
   * KHÔNG đụng file content / tên / folder.
   */
  async updateMetadata(
    listItemId: string,
    rawFields: Record<string, string>
  ): Promise<{ fields: Record<string, unknown>; skipped: string[]; updatedAt?: string }> {
    this.assertWriteEnabled();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const { coerced, skipped } = await this.coerceFields(rawFields);
    if (Object.keys(coerced).length === 0) {
      // Không có field hợp lệ để ghi → đọc lại hiện trạng, trả skipped để UI báo.
      const cur = await graphFetch<{ lastModifiedDateTime?: string; fields?: Record<string, unknown> }>(
        `/sites/${site.id}/lists/${list.id}/items/${listItemId}?$expand=fields`,
        { accessToken: this.accessToken }
      );
      return { fields: cur.fields ?? {}, skipped, updatedAt: cur.lastModifiedDateTime };
    }
    await this.patchMetadata(site.id, list.id, listItemId, coerced);
    const updated = await graphFetch<{ lastModifiedDateTime?: string; fields?: Record<string, unknown> }>(
      `/sites/${site.id}/lists/${list.id}/items/${listItemId}?$expand=fields`,
      { accessToken: this.accessToken }
    );
    return { fields: updated.fields ?? {}, skipped, updatedAt: updated.lastModifiedDateTime };
  }

  /** Lấy schema cột (cache theo instance) → {type, choices, readOnly} cho coerce kiểu. */
  private async getListColumns(): Promise<Map<string, { type: string; choices?: string[]; readOnly: boolean }>> {
    if (this._columns) {
      return this._columns;
    }
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const r = await graphFetch<{ value: Record<string, unknown>[] }>(
      `/sites/${site.id}/lists/${list.id}/columns?$top=200`,
      { accessToken: this.accessToken }
    );
    const m = new Map<string, { type: string; choices?: string[]; readOnly: boolean }>();
    for (const c of r.value ?? []) {
      const name = c.name as string;
      const type = c.text ? 'text' : c.number ? 'number' : c.boolean ? 'boolean' : c.dateTime ? 'dateTime'
        : c.choice ? 'choice' : c.hyperlinkOrPicture ? 'hyperlink' : c.personOrGroup ? 'person' : c.lookup ? 'lookup' : 'other';
      m.set(name, { type, choices: (c.choice as { choices?: string[] } | undefined)?.choices, readOnly: !!c.readOnly });
    }
    this._columns = m;
    return m;
  }

  /** Choices ĐỘNG từ schema cột SharePoint (nguồn chuẩn, thay FALLBACK). READ-ONLY. */
  async getMetadataChoices(): Promise<Record<string, string[]>> {
    const cols = await this.getListColumns();
    const pick = (name: string): string[] => cols.get(name)?.choices ?? [];
    return {
      nhomTaiLieu: pick('NhomTaiLieu'),
      loaiVanBanPhapLy: pick('LoaiVanBanPhapLy'),
      loaiTaiLieu: pick('LoaiTaiLieu'),
      trangThai: pick('TrangThai'),
      mucDoBaoMat: pick('MucDoBaoMat'),
      nguonMetadata: pick('NguonMetadata'),
      metadataConfidence: pick('MetadataConfidence'),
      donViPhatHanh: pick('DonViPhatHanh'),
      donViSoHuu: pick('DonViSoHuu'),
    };
  }

  /** Danh sách tên folder cấp 1 (cấp lưu trữ) trong DMS Library. READ-ONLY. */
  async listStorageFolders(): Promise<string[]> {
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const drives = await getDrives(this.accessToken, site.id);
    const norm = (s: string): string => s.trim().toLowerCase();
    const drive = drives.find((d) => norm(d.name) === norm(list.displayName)) ?? drives[0];
    if (!drive) {
      return [];
    }
    const children = await graphFetch<{ value: { name: string; folder?: unknown }[] }>(
      `/drives/${drive.id}/root/children?$select=name,folder&$top=200`,
      { accessToken: this.accessToken }
    );
    return (children.value ?? []).filter((c) => c.folder).map((f) => f.name);
  }

  /**
   * Coerce field theo kiểu cột SharePoint → tránh 400. Bỏ qua: cột không tồn tại, readOnly,
   * person/lookup (không set từ free-text), choice không hợp lệ, giá trị rỗng. Trả {coerced, skipped}.
   */
  private async coerceFields(fields: Record<string, string>): Promise<{ coerced: Record<string, unknown>; skipped: string[] }> {
    const cols = await this.getListColumns();
    const coerced: Record<string, unknown> = {};
    const skipped: string[] = [];
    for (const [name, raw] of Object.entries(fields)) {
      const val = (raw ?? '').trim();
      // BUG#18: cột Hyperlink không ghi được qua Graph → luôn skip (mọi path PATCH).
      if (UNWRITABLE_HYPERLINK_COLUMNS.has(name)) {
        if (val) skipped.push(name);
        continue;
      }
      const col = cols.get(name);
      if (!col || col.readOnly) {
        if (val) skipped.push(name);
        continue;
      }
      if (!val) {
        continue; // omit field rỗng
      }
      switch (col.type) {
        case 'number': {
          const n = Number(val);
          if (Number.isNaN(n)) { skipped.push(name); } else { coerced[name] = n; }
          break;
        }
        case 'boolean':
          coerced[name] = val === 'true' || val === '1' || val.toLowerCase() === 'yes';
          break;
        case 'dateTime': {
          // date-only → thêm giờ + Z; giữ nguyên nếu đã có time.
          coerced[name] = /^\d{4}-\d{2}-\d{2}$/.test(val) ? `${val}T00:00:00Z` : val;
          break;
        }
        case 'choice':
          if (col.choices && col.choices.includes(val)) { coerced[name] = val; } else { skipped.push(name); }
          break;
        case 'hyperlink':
          coerced[name] = { Url: val };
          break;
        case 'person':
        case 'lookup':
          skipped.push(name); // không set từ free-text
          break;
        default:
          coerced[name] = val; // text/other
      }
    }
    return { coerced, skipped };
  }

  /** Xóa driveItem (rollback). Không ném (best-effort). */
  async deleteUploadedFile(driveId: string, driveItemId: string): Promise<void> {
    this.assertWriteEnabled();
    await this.graphWrite<unknown>(`/drives/${driveId}/items/${driveItemId}`, { method: 'DELETE' }).catch(() => undefined);
  }

  /**
   * Orchestrator tạo văn bản từ upload (app-only). Giả định route đã: assertCanWriteDms +
   * validate + duplicate-check. Thực hiện: resolve folder → upload PDF → (optional) bản mềm →
   * PATCH metadata (retry 2) → rollback xóa file nếu PATCH vẫn fail.
   */
  async createDocumentFromUpload(req: CreateUploadRequest): Promise<CreateUploadResult> {
    this.assertWriteEnabled();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const folder = await this.resolveUploadFolder(req.capLuuTru);
    if (!folder.found || !folder.driveId || !folder.folderId) {
      throw new FolderNotFoundError(req.capLuuTru, folder.candidates);
    }
    const driveId = folder.driveId;

    // 1) PDF (bắt buộc) — fail là fail luôn.
    const pdf = await this.uploadFile(driveId, folder.folderId, req.fileName, req.fileBuffer, 'application/pdf');

    // 2) Bản mềm (tùy chọn) — fail thì giữ PDF + warning.
    let editableWebUrl = '';
    let editableDriveItemId: string | undefined;
    let warning: string | undefined;
    if (req.editableFileBuffer && req.editableFileName) {
      try {
        const ed = await this.uploadFile(driveId, folder.folderId, req.editableFileName, req.editableFileBuffer, 'application/octet-stream');
        editableWebUrl = ed.webUrl;
        editableDriveItemId = ed.driveItemId;
      } catch {
        warning = 'Bản mềm chưa tải lên được — đã giữ PDF, HasEditableSource=false.';
      }
    }

    // 3) PATCH metadata (retry 2) → rollback nếu vẫn fail.
    // BUG#18: KHÔNG ghi cột Hyperlink (EditableSourceUrl/PrimaryPdfUrl). Microsoft Graph KHÔNG
    // hỗ trợ PATCH .../items/{id}/fields cho cột Hyperlink → 400 → rollback toàn bộ upload
    // (đã chứng minh trên production). Chỉ set cờ HasEditableSource (boolean). File DOCX vẫn nằm
    // cùng folder + cùng base filename nên truy ra được mà không cần URL link.
    const rawFields: Record<string, string> = { ...req.metadata };
    delete rawFields.EditableSourceUrl;
    delete rawFields.PrimaryPdfUrl;
    rawFields.HasEditableSource = editableWebUrl ? 'true' : 'false';
    // Coerce theo schema cột (number/boolean/dateTime/choice/person) → tránh Graph 400.
    const { coerced, skipped } = await this.coerceFields(rawFields);
    if (skipped.length) {
      warning = [warning, `Bỏ qua field không hợp lệ/không set được: ${skipped.join(', ')}`].filter(Boolean).join(' · ');
    }
    let patched = false;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3 && !patched; attempt++) {
      try {
        await this.patchMetadata(site.id, list.id, pdf.listItemId, coerced);
        patched = true;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!patched) {
      // ROLLBACK AUDIT LOG (an toàn, không token/secret) — xóa file đã upload vì PATCH metadata fail.
      // eslint-disable-next-line no-console
      console.error(
        '[dms-write][rollback]',
        JSON.stringify({
          reason: 'patch-metadata-failed',
          soVanBan: req.metadata.SoVanBan ?? '',
          fileName: req.fileName,
          driveId,
          pdfDriveItemId: pdf.driveItemId,
          editableDriveItemId: editableDriveItemId ?? null,
          error: lastErr instanceof Error ? lastErr.message : String(lastErr),
        })
      );
      await this.deleteUploadedFile(driveId, pdf.driveItemId);
      if (editableDriveItemId) {
        await this.deleteUploadedFile(driveId, editableDriveItemId);
      }
      throw new PatchRolledBackError(lastErr);
    }

    return {
      listItemId: pdf.listItemId,
      driveItemId: pdf.driveItemId,
      webUrl: pdf.webUrl,
      hasEditableSource: !!editableWebUrl,
      warning,
    };
  }

  /**
   * Xóa văn bản theo listItem id (app-only). Đưa vào recycle bin (Graph DELETE mặc định, KHÔNG
   * permanent). Xóa file chính + mọi file nguồn cùng base trong cùng folder (.docx/.doc/.xlsx/
   * .xls/.pptx/.ppt). Trả {deleted, skipped, warnings}. Ném GraphError (404) nếu item không tồn tại.
   */
  async deleteDocumentByListItemId(
    id: string
  ): Promise<{ deleted: string[]; skipped: string[]; warnings: string[] }> {
    this.assertWriteEnabled();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);

    // 1) Resolve driveItem từ listItem id.
    const main = await graphFetch<{
      id: string;
      name?: string;
      file?: unknown;
      parentReference?: { driveId?: string; id?: string };
    }>(`/sites/${site.id}/lists/${list.id}/items/${id}/driveItem?$select=id,name,file,parentReference`, {
      accessToken: this.accessToken,
    });

    const deleted: string[] = [];
    const skipped: string[] = [];
    const warnings: string[] = [];

    const driveId = main.parentReference?.driveId;
    const folderId = main.parentReference?.id;
    const mainName = main.name ?? '';
    if (!driveId || !main.id) {
      warnings.push('Không xác định được driveItem/driveId cho văn bản này.');
      return { deleted, skipped, warnings };
    }

    // base filename = bỏ phần mở rộng cuối.
    const baseOf = (n: string): string => {
      const dot = n.lastIndexOf('.');
      return dot > 0 ? n.slice(0, dot) : n;
    };
    const extOf = (n: string): string => {
      const dot = n.lastIndexOf('.');
      return dot > 0 ? n.slice(dot).toLowerCase() : '';
    };
    const base = baseOf(mainName);

    // 2) Xóa file chính (PDF/main). Lỗi để propagate → route map 404/403/502.
    await this.graphWrite<unknown>(`/drives/${driveId}/items/${main.id}`, { method: 'DELETE' });
    deleted.push(mainName || main.id);

    // 3) Tìm + xóa file nguồn cùng base trong CÙNG folder.
    const SOURCE_EXTS = new Set(['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt']);
    if (folderId) {
      try {
        const children = await graphFetch<{ value: { id: string; name: string; file?: unknown }[] }>(
          `/drives/${driveId}/items/${folderId}/children?$select=id,name,file&$top=999`,
          { accessToken: this.accessToken }
        );
        for (const c of children.value ?? []) {
          if (c.id === main.id) continue;
          if (baseOf(c.name) === base && SOURCE_EXTS.has(extOf(c.name))) {
            try {
              await this.graphWrite<unknown>(`/drives/${driveId}/items/${c.id}`, { method: 'DELETE' });
              deleted.push(c.name);
            } catch {
              warnings.push(`Không xóa được file nguồn: ${c.name}`);
              skipped.push(c.name);
            }
          }
        }
      } catch {
        warnings.push('Không liệt kê được folder để xóa file nguồn (chỉ xóa file chính).');
      }
    }

    return { deleted, skipped, warnings };
  }

  // ═══════════════════ DETAIL PHASE: bản mềm / đính kèm / quan hệ / thay thế / lịch sử ═══════════════════

  /** READ: ngữ cảnh file/folder của 1 listItem (driveId, folder cha, tên file, base name). */
  async getItemFolderContext(listItemId: string): Promise<{
    driveId: string; parentFolderId: string; fileName: string; baseName: string; webUrl: string;
  }> {
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const di = await graphFetch<{
      id: string; name?: string; webUrl?: string; parentReference?: { driveId?: string; id?: string };
    }>(
      `/sites/${site.id}/lists/${list.id}/items/${listItemId}/driveItem?$select=id,name,webUrl,parentReference`,
      { accessToken: this.accessToken }
    );
    const driveId = di.parentReference?.driveId ?? '';
    const parentFolderId = di.parentReference?.id ?? '';
    const fileName = di.name ?? '';
    if (!driveId || !parentFolderId || !fileName) {
      throw new Error('Không xác định được vị trí file của văn bản (driveItem thiếu thông tin).');
    }
    return { driveId, parentFolderId, fileName, baseName: fileName.replace(/\.[^.]+$/, ''), webUrl: di.webUrl ?? '' };
  }

  /** READ: liệt kê children của 1 folder (file + folder). */
  async listFolderChildren(driveId: string, folderId: string): Promise<DriveChild[]> {
    const r = await graphFetch<{ value: DriveChild[] }>(
      `/drives/${driveId}/items/${folderId}/children?$top=400&$select=id,name,size,file,folder,webUrl,createdDateTime,createdBy,lastModifiedDateTime`,
      { accessToken: this.accessToken }
    );
    return r.value ?? [];
  }

  /** WRITE: đổi tên 1 driveItem. */
  async renameDriveItem(driveId: string, itemId: string, newName: string): Promise<void> {
    this.assertWriteEnabled();
    await this.graphWrite(`/drives/${driveId}/items/${itemId}`, {
      method: 'PATCH', body: JSON.stringify({ name: newName }), headers: { 'Content-Type': 'application/json' },
    });
  }

  /** WRITE: tìm hoặc tạo folder con theo tên (tạo folder = drive write, OK với Sites.ReadWrite.All). */
  async ensureChildFolder(driveId: string, parentFolderId: string, name: string): Promise<string> {
    const children = await this.listFolderChildren(driveId, parentFolderId);
    const hit = children.find((c) => c.folder && c.name.toLowerCase() === name.toLowerCase());
    if (hit) {
      return hit.id;
    }
    this.assertWriteEnabled();
    const created = await this.graphWrite<{ id: string }>(
      `/drives/${driveId}/items/${parentFolderId}/children`,
      {
        method: 'POST',
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return created.id;
  }

  /** WRITE: xóa driveItem (ném lỗi nếu thất bại — khác deleteUploadedFile best-effort). */
  async deleteDriveItem(driveId: string, itemId: string): Promise<void> {
    this.assertWriteEnabled();
    await this.graphWrite(`/drives/${driveId}/items/${itemId}`, { method: 'DELETE' });
  }

  /**
   * WRITE: upload (lần đầu) hoặc thay thế bản mềm chính. Tên = <base PDF>.<ext>.
   * Thay thế: rename bản cũ -> <base>.verN.<extCũ> rồi upload bản mới. Upload lỗi sau rename -> rename ngược.
   * Patch cột HasEditableSource (boolean) là thứ yếu — EditableSourceUrl (hyperlink) KHÔNG ghi được
   * qua Graph (BUG#18) nên bỏ; pairDocuments nhận bản mềm theo tên file trong cùng folder.
   */
  async putEditableSource(
    listItemId: string, uploadName: string, buffer: ArrayBuffer
  ): Promise<{ webUrl: string; fileName: string; replaced: boolean; archivedName?: string; warning?: string }> {
    this.assertWriteEnabled();
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new UploadTooLargeError(buffer.byteLength);
    }
    const ext = (uploadName.split('.').pop() ?? '').toLowerCase();
    if (!isEditableSourceFile(`.${ext}`)) {
      throw new Error('Bản mềm chỉ chấp nhận .docx/.doc/.xlsx/.xls/.pptx/.ppt.');
    }
    const ctx = await this.getItemFolderContext(listItemId);
    const targetName = `${ctx.baseName}.${ext}`;
    const children = await this.listFolderChildren(ctx.driveId, ctx.parentFolderId);
    const baseLower = ctx.baseName.toLowerCase();

    // Bản mềm hiện tại = file editable cùng base, KHÔNG phải bản .verN (đã lưu trữ).
    const verRe = new RegExp('^' + escapeRegExp(ctx.baseName) + '\\.ver(\\d+)\\.', 'i');
    const current = children.find((c) => {
      if (c.folder || verRe.test(c.name)) {
        return false;
      }
      const cExt = (c.name.split('.').pop() ?? '').toLowerCase();
      return c.name.replace(/\.[^.]+$/, '').toLowerCase() === baseLower && isEditableSourceFile(`.${cExt}`);
    });

    let replaced = false;
    let archivedName: string | undefined;
    let archivedFrom: { id: string; oldName: string } | undefined;
    if (current) {
      let maxN = 0;
      for (const c of children) {
        const m = verRe.exec(c.name);
        if (m) {
          maxN = Math.max(maxN, Number(m[1]));
        }
      }
      const curExt = (current.name.split('.').pop() ?? ext).toLowerCase();
      archivedName = `${ctx.baseName}.ver${maxN + 1}.${curExt}`;
      await this.renameDriveItem(ctx.driveId, current.id, archivedName);
      replaced = true;
      archivedFrom = { id: current.id, oldName: current.name };
    }

    let uploaded: { driveItemId: string; webUrl: string; listItemId: string };
    try {
      uploaded = await this.uploadFile(ctx.driveId, ctx.parentFolderId, targetName, buffer, contentTypeForExt(ext));
    } catch (e) {
      if (archivedFrom) {
        await this.renameDriveItem(ctx.driveId, archivedFrom.id, archivedFrom.oldName).catch(() => undefined);
      }
      throw e;
    }

    let warning: string | undefined;
    try {
      const site = await resolveSiteId(this.accessToken);
      const list = await resolveListId(this.accessToken);
      // Chỉ HasEditableSource (boolean) ghi được; EditableSourceUrl (hyperlink) Graph không PATCH được.
      const { coerced } = await this.coerceFields({ HasEditableSource: 'true' });
      if (Object.keys(coerced).length) {
        await this.patchMetadata(site.id, list.id, listItemId, coerced);
      }
    } catch {
      warning = 'Đã tải bản mềm nhưng cập nhật cờ HasEditableSource chưa thành công (vẫn nhận bản mềm theo tên file).';
    }
    return { webUrl: uploaded.webUrl, fileName: targetName, replaced, archivedName, warning };
  }

  /** READ: danh sách file đính kèm trong Attachments/<SoVanBan> (trả [] nếu chưa có folder). */
  async listAttachments(listItemId: string, soVanBan: string): Promise<AttachmentInfo[]> {
    const ctx = await this.getItemFolderContext(listItemId);
    const sub = sanitizeFolderSegment(soVanBan) || 'VanBan';
    const level1 = await this.listFolderChildren(ctx.driveId, ctx.parentFolderId);
    const attachRoot = level1.find((c) => c.folder && c.name.toLowerCase() === 'attachments');
    if (!attachRoot) {
      return [];
    }
    const level2 = await this.listFolderChildren(ctx.driveId, attachRoot.id);
    const docFolder = level2.find((c) => c.folder && c.name.toLowerCase() === sub.toLowerCase());
    if (!docFolder) {
      return [];
    }
    const files = await this.listFolderChildren(ctx.driveId, docFolder.id);
    return files.filter((f) => f.file).map(toAttachmentInfo);
  }

  /** WRITE: upload 1 file đính kèm vào Attachments/<SoVanBan>. */
  async uploadAttachment(
    listItemId: string, soVanBan: string, fileName: string, buffer: ArrayBuffer
  ): Promise<AttachmentInfo> {
    this.assertWriteEnabled();
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new UploadTooLargeError(buffer.byteLength);
    }
    const ctx = await this.getItemFolderContext(listItemId);
    const sub = sanitizeFolderSegment(soVanBan) || 'VanBan';
    const attachRoot = await this.ensureChildFolder(ctx.driveId, ctx.parentFolderId, 'Attachments');
    const docFolderId = await this.ensureChildFolder(ctx.driveId, attachRoot, sub);
    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    const safeName = sanitizeAttachmentName(fileName);
    const up = await this.uploadFile(ctx.driveId, docFolderId, safeName, buffer, contentTypeForExt(ext));
    const meta = await graphFetch<DriveChild>(
      `/drives/${ctx.driveId}/items/${up.driveItemId}?$select=id,name,size,file,webUrl,createdDateTime,createdBy`,
      { accessToken: this.accessToken }
    );
    return toAttachmentInfo(meta);
  }

  /** WRITE: xóa 1 file đính kèm (xác minh thuộc về văn bản này trước khi xóa). */
  async deleteAttachment(listItemId: string, soVanBan: string, attachmentId: string): Promise<void> {
    this.assertWriteEnabled();
    const atts = await this.listAttachments(listItemId, soVanBan);
    if (!atts.some((a) => a.id === attachmentId)) {
      throw new Error('Không tìm thấy file đính kèm để xóa (hoặc không thuộc văn bản này).');
    }
    const ctx = await this.getItemFolderContext(listItemId);
    await this.deleteDriveItem(ctx.driveId, attachmentId);
  }

  /** WRITE: ghi thẳng cột text VanBanLienQuan (danh sách SoVanBan, '' để xóa). */
  async setRelated(listItemId: string, value: string): Promise<void> {
    this.assertWriteEnabled();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    await this.patchMetadata(site.id, list.id, listItemId, { VanBanLienQuan: value });
  }

  /**
   * WRITE: A thay thế B — A.VanBanThayThe = SoVanBan(B); B.TrangThai = 'Hết hiệu lực'.
   * Caller phải validate không tự-thay-thế / vòng lặp. Patch B lỗi -> trả warning (A vẫn liên kết).
   */
  async setReplacement(aListItemId: string, bListItemId: string, bSoVanBan: string): Promise<{ warning?: string }> {
    this.assertWriteEnabled();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const { coerced: aC, skipped: aS } = await this.coerceFields({ VanBanThayThe: bSoVanBan });
    if (!('VanBanThayThe' in aC)) {
      throw new Error(`Không ghi được cột VanBanThayThe (${aS.join(', ') || 'cột không tồn tại/không hợp lệ'}).`);
    }
    await this.patchMetadata(site.id, list.id, aListItemId, aC);
    let warning: string | undefined;
    try {
      const { coerced: bC } = await this.coerceFields({ TrangThai: 'Hết hiệu lực' });
      if ('TrangThai' in bC) {
        await this.patchMetadata(site.id, list.id, bListItemId, bC);
      } else {
        warning = 'Đã liên kết thay thế nhưng giá trị "Hết hiệu lực" không khớp choice TrangThai — chưa đổi trạng thái văn bản cũ.';
      }
    } catch {
      warning = 'Đã liên kết thay thế nhưng cập nhật trạng thái văn bản cũ thất bại.';
    }
    return { warning };
  }

  /** WRITE: hủy liên kết thay thế trên A (xóa VanBanThayThe). KHÔNG tự khôi phục hiệu lực B (theo rule). */
  async clearReplacement(aListItemId: string): Promise<void> {
    this.assertWriteEnabled();
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    await this.patchMetadata(site.id, list.id, aListItemId, { VanBanThayThe: '' });
  }

  /** READ: version history gốc của listItem (kèm fields để diff nhãn hành động). */
  async getItemVersions(listItemId: string): Promise<RawItemVersion[]> {
    const site = await resolveSiteId(this.accessToken);
    const list = await resolveListId(this.accessToken);
    const r = await graphFetch<{ value: RawItemVersion[] }>(
      `/sites/${site.id}/lists/${list.id}/items/${listItemId}/versions?$expand=fields&$top=50`,
      { accessToken: this.accessToken }
    );
    return r.value ?? [];
  }

  /**
   * Low-level Graph write — chặn cứng nếu flag tắt. Dùng bởi các method write ở trên.
   */
  protected async graphWrite<T = unknown>(path: string, options: Omit<GraphFetchOptions, 'accessToken'>): Promise<T> {
    this.assertWriteEnabled();
    return graphFetch<T>(path, { ...options, accessToken: this.accessToken });
  }
}
