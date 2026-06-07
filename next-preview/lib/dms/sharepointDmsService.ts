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
   * Low-level Graph write — chặn cứng nếu flag tắt. Dùng bởi các method write ở trên.
   */
  protected async graphWrite<T = unknown>(path: string, options: Omit<GraphFetchOptions, 'accessToken'>): Promise<T> {
    this.assertWriteEnabled();
    return graphFetch<T>(path, { ...options, accessToken: this.accessToken });
  }
}
