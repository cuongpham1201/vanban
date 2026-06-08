import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';
import { getCachedDocuments, invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { MockDmsService } from '@dms/services/MockDmsService';
import { IDocument } from '@dms/models/IDocument';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';

export const dynamic = 'force-dynamic';

const IS_DEV = process.env.NODE_ENV === 'development';

// GET /api/documents/[id] — read-only detail. Tìm trong cache dùng chung (documentsCache).
// Auth-protected (getServerSession). KHÔNG write SharePoint.
// Nhánh dev (NODE_ENV-gated, MockDmsService) chỉ để preview khi dev-login (không có Graph token);
// inert ở production (session thật luôn có accessToken). Không phụ thuộc/đụng các file dev-login.
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  // Next.js đã percent-decode dynamic param → dùng thẳng, KHÔNG decodeURIComponent lại
  // (double-decode sẽ ném URIError với id chứa "%"). Client encode 1 lần khi build URL.
  const id = params.id;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    let documents: IDocument[];
    let source: string;
    if (IS_DEV && !session.accessToken) {
      documents = await new MockDmsService().getAllDocuments();
      source = 'mock-dev';
    } else if (!session.accessToken) {
      return NextResponse.json({ ok: false, error: 'Không lấy được access token Microsoft Graph.' }, { status: 401 });
    } else {
      const cached = await getCachedDocuments(session.accessToken);
      documents = cached.documents;
      source = cached.source;
    }

    const document = documents.find((d) => d.id === id);
    if (!document) {
      return NextResponse.json({ ok: false, error: `Không tìm thấy văn bản id ${id}.` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, source, document });
  } catch (err) {
    if (err instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: err.message, ...err.detail }, { status: err.status });
    }
    if (err instanceof GraphError) {
      return NextResponse.json(
        { ok: false, error: err.message, graph: { status: err.status, body: err.body } },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// DELETE /api/documents/[id] — xóa văn bản (file PDF chính + file nguồn cùng base) vào recycle bin.
//   Gate: session + assertCanWriteDms (write flag + allowlist). App-only token. id phải là số.
//   KHÔNG permanent delete (Graph DELETE driveItem → recycle bin).
export async function DELETE(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
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
  const actor = (session?.user?.email as string | undefined) ?? 'unknown';
  try {
    const token = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(token);
    const result = await svc.deleteDocumentByListItemId(id);
    invalidateDocumentsCache('delete');
    // eslint-disable-next-line no-console
    console.log('[dms-write][delete]', JSON.stringify({ actor, id, deleted: result.deleted, ts: new Date().toISOString() }));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) {
      // eslint-disable-next-line no-console
      console.warn('[dms-write][delete][notfound]', JSON.stringify({ actor, id }));
      return NextResponse.json({ ok: false, error: `Không tìm thấy file cho văn bản id ${id}.` }, { status: 404 });
    }
    if (e instanceof DmsWriteError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    if (e instanceof GraphError) {
      const status = e.status >= 400 && e.status < 600 ? e.status : 502;
      // eslint-disable-next-line no-console
      console.error('[dms-write][delete][error]', JSON.stringify({ actor, id, status, msg: e.message }));
      return NextResponse.json({ ok: false, error: `Xóa thất bại (Graph ${e.status}).` }, { status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[dms-write][delete][error]', JSON.stringify({ actor, id, msg }));
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
