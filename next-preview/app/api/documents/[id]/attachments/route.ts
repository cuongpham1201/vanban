import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService, UploadTooLargeError } from '@/lib/dms/sharepointDmsService';
import { invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';

export const dynamic = 'force-dynamic';

// File đính kèm cho phép (theo rule hiện tại + ảnh/zip thông dụng).
const ALLOWED_ATTACHMENT_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'zip'];

function badId(id: string): NextResponse | null {
  return /^\d+$/.test(id) ? null : NextResponse.json({ ok: false, error: 'id không hợp lệ.' }, { status: 400 });
}

// GET — danh sách file đính kèm (read, dùng token session). Cần ?soVanBan= để định vị subfolder.
export async function GET(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const id = (params.id ?? '').trim();
  const bad = badId(id);
  if (bad) {
    return bad;
  }
  const soVanBan = (new URL(req.url).searchParams.get('soVanBan') ?? '').trim();
  if (!soVanBan) {
    return NextResponse.json({ ok: false, error: 'Thiếu soVanBan.' }, { status: 422 });
  }
  try {
    const token = await getGraphAccessToken();
    const svc = new SharePointDmsService(token);
    const attachments = await svc.listAttachments(id, soVanBan);
    return NextResponse.json({ ok: true, attachments });
  } catch (e) {
    return mapErr(e);
  }
}

// POST — thêm file đính kèm (multipart: file + soVanBan). Gate write.
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải multipart/form-data hợp lệ.' }, { status: 400 });
  }
  const file = form.get('file');
  const soVanBan = ((form.get('soVanBan') as string | null) ?? '').trim();
  if (!soVanBan) {
    return NextResponse.json({ ok: false, error: 'Thiếu soVanBan.' }, { status: 422 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'Thiếu file đính kèm.' }, { status: 422 });
  }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_ATTACHMENT_EXT.includes(ext)) {
    return NextResponse.json(
      { ok: false, error: `Định dạng .${ext} không được phép. Cho phép: ${ALLOWED_ATTACHMENT_EXT.join(', ')}.` },
      { status: 422 }
    );
  }
  try {
    const token = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(token);
    const buffer = await file.arrayBuffer();
    const attachment = await svc.uploadAttachment(id, soVanBan, file.name, buffer);
    invalidateDocumentsCache('attachment-add');
    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (e) {
    return mapErr(e);
  }
}

function mapErr(e: unknown): NextResponse {
  if (e instanceof UploadTooLargeError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 413 });
  }
  if (e instanceof AuthError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (e instanceof DmsWriteError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (e instanceof LibraryResolveError) {
    return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
  }
  if (e instanceof GraphError) {
    const status = e.status >= 400 && e.status < 600 ? e.status : 502;
    return NextResponse.json({ ok: false, error: `Thao tác đính kèm thất bại (Graph ${e.status}).` }, { status });
  }
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
}
