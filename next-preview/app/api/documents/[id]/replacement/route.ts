import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';
import { getCachedDocuments, invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';

export const dynamic = 'force-dynamic';

const eq = (a?: string, b?: string): boolean => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

function badId(id: string): NextResponse | null {
  return /^\d+$/.test(id) ? null : NextResponse.json({ ok: false, error: 'id không hợp lệ.' }, { status: 400 });
}

// POST {targetId} — văn bản hiện tại (A) thay thế văn bản cũ (B = targetId).
// B tự chuyển 'Hết hiệu lực'. Chặn tự-thay-thế, vòng lặp A->B->A, và thay thế VB đã bị thay thế bởi VB khác.
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const id = (params.id ?? '').trim();
  const bad = badId(id);
  if (bad) {
    return bad;
  }
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }

  let targetId = '';
  try {
    const body = (await req.json()) as { targetId?: string };
    targetId = (body.targetId ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ ok: false, error: 'Thiếu targetId (văn bản bị thay thế).' }, { status: 422 });
  }
  if (targetId === id) {
    return NextResponse.json({ ok: false, error: 'Văn bản không thể tự thay thế chính nó.' }, { status: 422 });
  }

  try {
    const appToken = await getAppOnlyGraphToken();
    const cached = await getCachedDocuments(appToken);
    const a = cached.documents.find((d) => d.id === id);
    const b = cached.documents.find((d) => d.id === targetId);
    if (!a) {
      return NextResponse.json({ ok: false, error: 'Không tìm thấy văn bản hiện tại.' }, { status: 404 });
    }
    if (!b) {
      return NextResponse.json({ ok: false, error: 'Không tìm thấy văn bản bị thay thế.' }, { status: 404 });
    }
    if (eq(a.soVanBan, b.soVanBan)) {
      return NextResponse.json({ ok: false, error: 'Hai văn bản trùng Số văn bản — không thể thay thế.' }, { status: 422 });
    }
    // Vòng lặp: B đã thay thế A.
    if (eq(b.vanBanThayThe, a.soVanBan)) {
      return NextResponse.json({ ok: false, error: 'Không hợp lệ: văn bản cũ đang thay thế chính văn bản này (vòng lặp).' }, { status: 409 });
    }
    // B đã bị thay thế bởi văn bản khác (C != A)?
    const replacedByOther = cached.documents.find((d) => d.id !== id && eq(d.vanBanThayThe, b.soVanBan));
    if (replacedByOther) {
      return NextResponse.json(
        { ok: false, error: `Văn bản cũ đã bị thay thế bởi "${replacedByOther.soVanBan}" — cần gỡ liên kết đó trước.` },
        { status: 409 }
      );
    }

    const svc = new SharePointDmsService(appToken);
    const { warning } = await svc.setReplacement(id, targetId, b.soVanBan);
    invalidateDocumentsCache('replacement-set');
    return NextResponse.json({ ok: true, targetId, targetSoVanBan: b.soVanBan, ...(warning ? { warning } : {}) });
  } catch (e) {
    return mapErr(e);
  }
}

// DELETE — hủy liên kết thay thế trên văn bản hiện tại. KHÔNG tự khôi phục hiệu lực văn bản cũ.
export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const id = (params.id ?? '').trim();
  const bad = badId(id);
  if (bad) {
    return bad;
  }
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }
  try {
    const appToken = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(appToken);
    await svc.clearReplacement(id);
    invalidateDocumentsCache('replacement-clear');
    return NextResponse.json({ ok: true, note: 'Đã gỡ liên kết. Trạng thái văn bản cũ KHÔNG tự khôi phục.' });
  } catch (e) {
    return mapErr(e);
  }
}

function mapErr(e: unknown): NextResponse {
  if (e instanceof DmsWriteError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (e instanceof LibraryResolveError) {
    return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
  }
  if (e instanceof GraphError) {
    const status = e.status >= 400 && e.status < 600 ? e.status : 502;
    return NextResponse.json({ ok: false, error: `Cập nhật thay thế thất bại (Graph ${e.status}).` }, { status });
  }
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
}
