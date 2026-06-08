import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';
import { GraphError } from '@/lib/graph/client';
import { invalidateDocumentsCache } from '@/lib/dms/documentsCache';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 50;

interface BulkResult {
  id: string;
  ok: boolean;
  deleted?: string[];
  error?: string;
}

// POST /api/documents/bulk-delete — xóa nhiều văn bản. Partial success: 1 item lỗi KHÔNG
//   làm hỏng cả batch. Gate: session + assertCanWriteDms. App-only token. Tối đa 50/lần.
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }
  const actor = (session?.user?.email as string | undefined) ?? 'unknown';

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(new Set(rawIds.map((x) => String(x).trim()))).filter((x) => /^\d+$/.test(x));
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'Thiếu ids hợp lệ (list item id dạng số).' }, { status: 422 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: `Tối đa ${MAX_BATCH} văn bản mỗi lần (nhận ${ids.length}).` }, { status: 422 });
  }

  try {
    const token = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(token);
    const results: BulkResult[] = [];
    for (const id of ids) {
      try {
        const r = await svc.deleteDocumentByListItemId(id);
        results.push({ id, ok: true, deleted: r.deleted });
      } catch (e) {
        const msg = e instanceof GraphError
          ? (e.status === 404 ? `Không tìm thấy file (id ${id}).` : `Graph ${e.status}.`)
          : e instanceof Error ? e.message : String(e);
        results.push({ id, ok: false, error: msg });
      }
    }
    invalidateDocumentsCache('bulk-delete');
    const okCount = results.filter((r) => r.ok).length;
    // eslint-disable-next-line no-console
    console.log('[dms-write][bulk-delete]', JSON.stringify({ actor, total: ids.length, ok: okCount, ts: new Date().toISOString() }));
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    if (e instanceof DmsWriteError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
