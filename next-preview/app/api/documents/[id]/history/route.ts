import { NextResponse } from 'next/server';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';
import { buildHistoryTimeline } from '@/lib/dms/historyLog';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';

export const dynamic = 'force-dynamic';

// GET — lịch sử văn bản từ SharePoint version history gốc (read, token session).
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const id = (params.id ?? '').trim();
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: 'id không hợp lệ.' }, { status: 400 });
  }
  try {
    const token = await getGraphAccessToken();
    const svc = new SharePointDmsService(token);
    const versions = await svc.getItemVersions(id);
    return NextResponse.json({ ok: true, history: buildHistoryTimeline(versions) });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    if (e instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
    }
    if (e instanceof GraphError) {
      // Một số tenant chặn versions API -> trả lỗi mềm để UI hiển thị thông báo, không vỡ trang.
      const status = e.status >= 400 && e.status < 600 ? e.status : 502;
      return NextResponse.json({ ok: false, error: `Không tải được lịch sử (Graph ${e.status}).` }, { status });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
