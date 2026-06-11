import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';
import { invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';

export const dynamic = 'force-dynamic';

// DELETE — gỡ 1 file đính kèm. attachmentId = driveItem id. Cần ?soVanBan= để xác minh thuộc văn bản.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; attachmentId: string } }
): Promise<NextResponse> {
  const id = (params.id ?? '').trim();
  const attachmentId = (params.attachmentId ?? '').trim();
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: 'id không hợp lệ.' }, { status: 400 });
  }
  if (!attachmentId) {
    return NextResponse.json({ ok: false, error: 'Thiếu attachmentId.' }, { status: 400 });
  }
  const soVanBan = (new URL(req.url).searchParams.get('soVanBan') ?? '').trim();
  if (!soVanBan) {
    return NextResponse.json({ ok: false, error: 'Thiếu soVanBan.' }, { status: 422 });
  }
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }
  try {
    const token = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(token);
    await svc.deleteAttachment(id, soVanBan, attachmentId);
    invalidateDocumentsCache('attachment-remove');
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DmsWriteError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    if (e instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
    }
    if (e instanceof GraphError) {
      const status = e.status >= 400 && e.status < 600 ? e.status : 502;
      return NextResponse.json({ ok: false, error: `Xóa đính kèm thất bại (Graph ${e.status}).` }, { status });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
