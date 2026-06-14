import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import {
  SharePointDmsService,
  FolderNotFoundError,
  UploadTooLargeError,
  PatchRolledBackError,
} from '@/lib/dms/sharepointDmsService';
import { normalizeMetadataPayload, validateUploadMetadata } from '@/lib/dms/writeHelpers';
import { buildDocumentFileName, sanitizeOriginalFileName } from '@/lib/dms/fileNaming';
import { invalidateDocumentsCache, getCachedDocuments } from '@/lib/dms/documentsCache';
import { idemBegin, idemComplete, idemRelease } from '@/lib/dms/idempotency';
import { notifyNewDocument } from '@/lib/dms/notifications/events';

export const dynamic = 'force-dynamic';

// UI (camelCase UploadForm) → SharePoint internal column. Auto fields (Nguon/Confidence/
// EditableSourceUrl/HasEditableSource/PrimaryPdfUrl) KHÔNG nhận từ client.
const UI_TO_COLUMN: Record<string, string> = {
  soVanBan: 'SoVanBan', trichYeu: 'TrichYeu', nhomTaiLieu: 'NhomTaiLieu',
  loaiVanBanPhapLy: 'LoaiVanBanPhapLy', loaiTaiLieu: 'LoaiTaiLieu', chuDeNghiepVu: 'ChuDeNghiepVu',
  nguoiKy: 'NguoiKy', namBanHanh: 'NamBanHanh', ngayBanHanh: 'NgayBanHanh', ngayHetHieuLuc: 'NgayHetHieuLuc',
  trangThai: 'TrangThai', mucDoBaoMat: 'MucDoBaoMat', donViPhatHanh: 'DonViPhatHanh', donViSoHuu: 'DonViSoHuu',
  tags: 'Tags', vanBanThayThe: 'VanBanThayThe', vanBanLienQuan: 'VanBanLienQuan',
};

function mapToColumns(ui: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [uiKey, col] of Object.entries(UI_TO_COLUMN)) {
    const v = ui[uiKey];
    if (typeof v === 'string' && v.trim()) {
      out[col] = v.trim();
    }
  }
  return out;
}

// POST /api/documents/upload — Upload Write (sandbox/allowlist). Gate assertCanWriteDms.
// (Đặt ở /upload thay vì POST /api/documents vì route GET /api/documents mang thay đổi dev-login.)
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  // 1+2. Guard.
  try {
    assertCanWriteDms(session);
  } catch {
    // FIX A: chuẩn hóa 403 cho mọi trường hợp không đủ quyền ghi (dùng assertCanWriteDms — nguồn duy nhất).
    return NextResponse.json({ ok: false, error: 'Không có quyền ghi DMS.' }, { status: 403 });
  }
  const email = session!.user!.email as string;

  // 3. Parse multipart.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải multipart/form-data hợp lệ.' }, { status: 400 });
  }
  const pdf = form.get('pdf');
  const editable = form.get('editable');
  const metadataRaw = form.get('metadata');
  const idempotencyKey = (form.get('idempotencyKey') as string | null)?.trim() ?? '';
  const override = (form.get('override') as string | null) === 'true';

  if (!idempotencyKey) {
    return NextResponse.json({ ok: false, error: 'Thiếu idempotencyKey.' }, { status: 422 });
  }

  try {
    // 4. Validate input.
    if (!(pdf instanceof File) || pdf.size === 0) {
      return NextResponse.json({ ok: false, error: 'Thiếu file PDF.' }, { status: 422 });
    }
    let ui: Record<string, unknown>;
    try {
      ui = JSON.parse((metadataRaw as string) ?? '{}');
    } catch {
      return NextResponse.json({ ok: false, error: 'metadata không phải JSON hợp lệ.' }, { status: 422 });
    }
    const columns = mapToColumns(ui);
    const metadata = normalizeMetadataPayload(columns, { hasEditableSource: editable instanceof File });
    const v = validateUploadMetadata(metadata);
    if (!v.ok) {
      return NextResponse.json({ ok: false, error: 'Thiếu trường bắt buộc.', validation: v }, { status: 422 });
    }

    // 4b. Tên file VẬT LÝ (P1) = TÊN GỐC đã sanitize NHẸ — giữ dấu tiếng Việt/khoảng trắng/mã VB,
    //     chỉ bỏ ký tự cấm SP/URL. KHÔNG dùng buildDocumentFileName làm tên vật lý nữa.
    const naming = sanitizeOriginalFileName(pdf.name, 'pdf');
    if (!naming.ok || !naming.fileName || !naming.base) {
      return NextResponse.json({ ok: false, error: naming.error ?? 'Tên file không hợp lệ.' }, { status: 422 });
    }
    // Canonical name (chỉ để log/debug — KHÔNG đặt làm tên file, best-effort, KHÔNG gate upload).
    const canonical = buildDocumentFileName({
      soVanBan: metadata.SoVanBan,
      trichYeu: metadata.TrichYeu,
      ngayBanHanh: metadata.NgayBanHanh,
      loaiVanBanPhapLy: metadata.LoaiVanBanPhapLy,
      loaiTaiLieu: metadata.LoaiTaiLieu,
      ext: 'pdf',
    });
    // eslint-disable-next-line no-console
    console.log('[upload][filename]', JSON.stringify({
      original: pdf.name,
      stored: naming.fileName,
      canonical: canonical.ok ? canonical.fileName : `(n/a: ${canonical.error ?? ''})`,
    }));

    // Cấp lưu trữ (folder vật lý) TÁCH KHỎI DonViSoHuu (choice metadata).
    // Ưu tiên field 'capLuuTru'; fallback DonViSoHuu để tương thích ngược.
    const capLuuTru = ((form.get('capLuuTru') as string | null) ?? metadata.DonViSoHuu ?? '').trim();
    if (!capLuuTru) {
      return NextResponse.json({ ok: false, error: 'Thiếu Cấp lưu trữ (folder) để chọn nơi lưu file.' }, { status: 422 });
    }

    // 5. App-only token + duplicate-check.
    const appToken = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(appToken);
    const dup = await svc.checkDuplicateBySoVanBan(metadata.SoVanBan);
    if (dup.exists && !override) {
      // BUG#34: trùng SoVanBan CHỈ là cảnh báo — KHÔNG chiếm idempotency lock, KHÔNG ghi.
      // User bấm "Vẫn tạo mới" (override=true) sẽ qua được nhánh này và upload bình thường.
      return NextResponse.json(
        { ok: false, error: 'duplicate', matches: dup.matches },
        { status: 409 }
      );
    }

    // 5b. Idempotency — CHỈ khóa quanh thao tác GHI (sau validate + duplicate-check).
    //     ⇒ trùng SoVanBan / lỗi validate KHÔNG để lại khóa 'pending' → "Vẫn tạo mới"/sửa rồi
    //     thử lại được NGAY (sửa #34 stuck "Yêu cầu đang được xử lý"). Key = UUID per-attempt (KHÔNG dùng SoVanBan).
    const idem = idemBegin(email, idempotencyKey);
    if (idem.state === 'done') {
      return NextResponse.json({ ...(idem.value as object), idempotentReplay: true }, { status: 200 });
    }
    if (idem.state === 'pending') {
      return NextResponse.json({ ok: false, error: 'Yêu cầu đang được xử lý.' }, { status: 409 });
    }

    // 6+7+8. Tạo văn bản (resolve folder → upload PDF → editable → patch, retry+rollback).
    const pdfBuf = await pdf.arrayBuffer();
    let editableFileName: string | undefined;
    let editableBuf: ArrayBuffer | undefined;
    if (editable instanceof File && editable.size > 0) {
      const ext = (editable.name.split('.').pop() ?? 'docx').toLowerCase();
      editableFileName = `${naming.base}.${ext}`;
      editableBuf = await editable.arrayBuffer();
    }

    const result = await svc.createDocumentFromUpload({
      fileName: naming.fileName,
      fileBuffer: pdfBuf,
      capLuuTru,
      metadata,
      editableFileName,
      editableFileBuffer: editableBuf,
    });

    // 9. Invalidate cache để Search thấy ngay.
    invalidateDocumentsCache('upload');
    // 10. Read-back.
    let document: unknown;
    try {
      const refreshed = await getCachedDocuments(appToken, true);
      document = refreshed.documents.find((d) => d.id === result.listItemId) ?? null;
    } catch {
      document = null;
    }

    const body = {
      ok: true,
      document,
      listItemId: result.listItemId,
      webUrl: result.webUrl,
      hasEditableSource: result.hasEditableSource,
      fileName: naming.fileName,
      ...(result.warning ? { warning: result.warning } : {}),
    };
    idemComplete(email, idempotencyKey, body);
    // Phase 1 web notification — recipient = uploader hiện tại. Không throw nếu lỗi.
    await notifyNewDocument({
      actorEmail: email,
      documentId: String(result.listItemId),
      documentNumber: metadata.SoVanBan,
      documentTitle: metadata.TrichYeu,
      donViSoanThao: metadata.DonViPhatHanh,
      ngayBanHanh: metadata.NgayBanHanh,
      trangThai: metadata.TrangThai,
    });
    return NextResponse.json(body, { status: 201 });
  } catch (e) {
    idemRelease(email, idempotencyKey); // cho phép thử lại
    if (e instanceof FolderNotFoundError) {
      return NextResponse.json({ ok: false, error: e.message, candidates: e.candidates }, { status: 404 });
    }
    if (e instanceof UploadTooLargeError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 413 });
    }
    if (e instanceof PatchRolledBackError) {
      // eslint-disable-next-line no-console
      console.error('[dms-write][audit] rollback', JSON.stringify({ user: email, idempotencyKey, status: 502 }));
      return NextResponse.json({ ok: false, error: e.message, rolledBack: true }, { status: 502 });
    }
    if (e instanceof DmsWriteError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
