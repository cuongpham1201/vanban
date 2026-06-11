import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService, UploadTooLargeError } from '@/lib/dms/sharepointDmsService';
import { invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';

export const dynamic = 'force-dynamic';

// POST = upload bản mềm lần đầu · PUT = thay thế bản mềm. Cùng logic (putEditableSource tự xử lý
// rename version cũ nếu đã có). Gate assertCanWriteDms + app-only token.
async function handle(req: Request, id: string): Promise<NextResponse> {
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải multipart/form-data hợp lệ.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Thiếu file bản mềm.' }, { status: 422 });
  }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext)) {
    return NextResponse.json({ ok: false, error: 'Bản mềm chỉ chấp nhận .docx/.doc/.xlsx/.xls/.pptx/.ppt.' }, { status: 422 });
  }

  try {
    const token = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(token);
    const buffer = await file.arrayBuffer();
    const result = await svc.putEditableSource(id, file.name, buffer);
    invalidateDocumentsCache('editable-source');
    return NextResponse.json({ ok: true, ...result }, { status: result.replaced ? 200 : 201 });
  } catch (e) {
    if (e instanceof UploadTooLargeError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 413 });
    }
    if (e instanceof DmsWriteError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    if (e instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
    }
    if (e instanceof GraphError) {
      const status = e.status >= 400 && e.status < 600 ? e.status : 502;
      return NextResponse.json({ ok: false, error: `Thao tác bản mềm thất bại (Graph ${e.status}).` }, { status });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(req, (params.id ?? '').trim());
}
export async function PUT(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(req, (params.id ?? '').trim());
}
