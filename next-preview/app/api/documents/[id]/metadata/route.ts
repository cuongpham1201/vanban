import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';
import { invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { notifyDocumentUpdated } from '@/lib/dms/notifications/events';

export const dynamic = 'force-dynamic';

// Cột metadata CHO PHÉP sửa (internal name). Loại trừ: NguoiKy (person), file name/path,
// folder/capLuuTru, content. Cột không thuộc danh sách này bị bỏ qua.
const ALLOWED_EDIT_COLUMNS = new Set<string>([
  'SoVanBan', 'NamBanHanh', 'NgayBanHanh', 'NgayHetHieuLuc', 'TrangThai', 'MucDoBaoMat',
  'TrichYeu', 'NhomTaiLieu', 'LoaiVanBanPhapLy', 'LoaiTaiLieu', 'ChuDeNghiepVu',
  'DonViPhatHanh', 'DonViSoHuu', 'NguonMetadata', 'MetadataConfidence',
  'HasEditableSource', 'EditableSourceUrl', 'PrimaryPdfUrl', 'Tags', 'VanBanLienQuan', 'VanBanThayThe',
]);

// PATCH /api/documents/[id]/metadata — sửa metadata listItem (sandbox/allowlist).
//   Gate: assertCanWriteDms. App-only token. Coerce + validate choice theo schema.
//   KHÔNG sửa NguoiKy/file/folder/content.
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const id = (params.id ?? '').trim();
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: 'id không hợp lệ (cần list item id dạng số).' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  // Hỗ trợ cả { fields: {...} } lẫn object phẳng.
  const src = (body && typeof body.fields === 'object' && body.fields ? body.fields : body) as Record<string, unknown>;

  // Whitelist + chỉ nhận string (số/ngày gửi dạng string, service coerce sau).
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    if (ALLOWED_EDIT_COLUMNS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      fields[k] = String(v);
    }
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: 'Không có trường hợp lệ để cập nhật.' }, { status: 422 });
  }

  try {
    const token = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(token);
    const { fields: updated, skipped, updatedAt } = await svc.updateMetadata(id, fields);
    // BUG#23: clear server cache (dùng chung bởi /api/documents, /api/documents/[id], /api/dashboard)
    // → Search/Detail/Dashboard re-fetch thấy metadata mới ngay, không stale tới 5 phút.
    invalidateDocumentsCache('edit');
    // Phase 1 web notification — recipient = actor hiện tại. Không throw nếu lỗi.
    await notifyDocumentUpdated({
      actorEmail: (session?.user?.email as string | undefined) ?? 'unknown',
      documentId: id,
      documentNumber: typeof fields.SoVanBan === 'string' ? fields.SoVanBan : undefined,
      changedFields: Object.keys(updated),
    });
    return NextResponse.json({ ok: true, fields: updated, skipped, updatedAt });
  } catch (e) {
    if (e instanceof DmsWriteError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    if (e instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
    }
    if (e instanceof GraphError) {
      const status = e.status === 404 ? 404 : e.status >= 400 && e.status < 600 ? e.status : 502;
      return NextResponse.json({ ok: false, error: `Cập nhật thất bại (Graph ${e.status}).` }, { status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
