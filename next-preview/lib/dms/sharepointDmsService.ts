// Phase 10C — SharePoint write service FOUNDATION (server-side).
//
// QUAN TRỌNG:
//  - KHÔNG chạy bất kỳ Graph write nào lúc import (chỉ chạy khi method được gọi tường minh).
//  - Mọi write thật bị chặn 2 lớp: (1) flag isDmsWriteEnabled, (2) chưa implement → NotImplemented.
//  - Phase 10C chỉ dựng khung + helper read-only an toàn (duplicate-check). Upload/PATCH thật để 10D+.
import { graphFetch, type GraphFetchOptions } from '@/lib/graph/client';
import { getCachedDocuments } from '@/lib/dms/documentsCache';
import { isDmsWriteEnabled, DMS_WRITE_DISABLED_MSG } from './writeConfig';
import { buildFileName, normalizeMetadataPayload, validateUploadMetadata, type ValidationResult } from './writeHelpers';
import type { IDocument } from '@dms/models/IDocument';

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

/**
 * Khung dịch vụ write. Khởi tạo với accessToken delegated (server-side).
 * Tạo instance KHÔNG gây side-effect; chỉ method mới hành động.
 */
export class SharePointDmsService {
  private readonly accessToken: string;

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
   * READ-ONLY: kiểm tra trùng SoVanBan trên dữ liệu hiện có (không ghi gì).
   * Dùng cache chung với /api/documents. An toàn kể cả khi write flag tắt.
   */
  async checkDuplicateBySoVanBan(soVanBan: string): Promise<DuplicateCheckResult> {
    const key = (soVanBan ?? '').trim().toLowerCase();
    if (!key) {
      return { exists: false, matches: [] };
    }
    const cached = await getCachedDocuments(this.accessToken);
    const matches = cached.documents
      .filter((d: IDocument) => (d.soVanBan ?? '').trim().toLowerCase() === key)
      .map((d: IDocument) => ({ id: d.id, soVanBan: d.soVanBan, trichYeu: d.trichYeu }));
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

  /** Resolve folder upload theo Cấp lưu trữ (DonViSoHuu). Phase 10D. */
  async resolveUploadFolder(_capLuuTru: string): Promise<never> {
    this.assertWriteEnabled();
    throw new NotImplementedError('resolveUploadFolder');
  }

  /** Upload PDF (uploadSession cho file lớn). Phase 10D. */
  async uploadPdf(): Promise<never> {
    this.assertWriteEnabled();
    throw new NotImplementedError('uploadPdf');
  }

  /** Upload bản mềm DOCX/XLSX/PPTX (tùy chọn). Phase 10D. */
  async uploadEditableSource(): Promise<never> {
    this.assertWriteEnabled();
    throw new NotImplementedError('uploadEditableSource');
  }

  /** PATCH metadata cho listItem. Phase 10D/10E. */
  async patchMetadata(): Promise<never> {
    this.assertWriteEnabled();
    throw new NotImplementedError('patchMetadata');
  }

  /**
   * Low-level Graph write — Phase 10D mới dùng. Chặn cứng nếu flag tắt.
   * Hiện CHƯA có caller nào (không method nào gọi) → đảm bảo không ghi gì ở 10C.
   */
  protected async graphWrite<T = unknown>(path: string, options: Omit<GraphFetchOptions, 'accessToken'>): Promise<T> {
    this.assertWriteEnabled();
    return graphFetch<T>(path, { ...options, accessToken: this.accessToken });
  }
}
