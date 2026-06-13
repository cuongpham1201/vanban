import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { graphFetch, GraphError } from '@/lib/graph/client';
import { resolveSiteId, resolveListId, LibraryResolveError } from '@/lib/sharepoint/resolve';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { graphCallWithRetry, fetchPdfWithRetry, PdfProxyError, isNetworkError } from '@/lib/dms/pdfProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/documents/[id]/file — proxy stream PDF của 1 văn bản (READ-ONLY).
//   Browser → /api/documents/<listItemId>/file
//          → app-only Graph: /sites/{site}/lists/{list}/items/{id}/driveItem (name + downloadUrl)
//          → stream PDF về client (Content-Type: application/pdf). Token KHÔNG rời server.
// Auth: yêu cầu đăng nhập (getServerSession). Chỉ ĐỌC. App-only token để chạy đồng nhất
// (kể cả phiên không có Graph token); WRITE vẫn bị chặn riêng ở service.
interface DriveItemMeta {
  name?: string;
  size?: number;
  file?: { mimeType?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

function jsonErr(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const id = (params.id ?? '').trim();
  // List item id là số nguyên (SharePoint). Mock id (vd "r1") sẽ bị từ chối → frontend fallback.
  if (!/^\d+$/.test(id)) {
    return jsonErr(400, 'id không hợp lệ (cần list item id dạng số).');
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return jsonErr(401, 'Chưa đăng nhập.');
  }

  try {
    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const site = await resolveSiteId(accessToken);
    const list = await resolveListId(accessToken);

    // A7: driveItem qua Graph — retry lỗi tạm thời (network/429/5xx), KHÔNG retry 404/415…
    const item = await graphCallWithRetry<DriveItemMeta>(
      () => graphFetch<DriveItemMeta>(`/sites/${site.id}/lists/${list.id}/items/${id}/driveItem`, { accessToken }),
      { documentId: id, phase: 'driveItem' }
    );

    const name = item.name ?? '';
    const isPdf = name.toLowerCase().endsWith('.pdf') || item.file?.mimeType === 'application/pdf';
    if (!isPdf) {
      return jsonErr(415, `File không phải PDF (${name || 'unknown'}). Dùng nút tải xuống để mở file gốc.`);
    }

    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      return jsonErr(502, 'Không lấy được link nội dung PDF từ Microsoft Graph.');
    }

    // A7: stream nội dung — timeout 15s + retry lỗi tạm thời. downloadUrl pre-authenticated →
    // fetch KHÔNG kèm Authorization (token không rời server).
    const upstream = await fetchPdfWithRetry(downloadUrl, { documentId: id, phase: 'stream' });
    if (!upstream.ok || !upstream.body) {
      return jsonErr(502, `Tải nội dung PDF thất bại (HTTP ${upstream.status}).`);
    }

    const safeName = name.replace(/["\r\n]/g, '') || 'document.pdf';
    const headers = new Headers({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    const len = upstream.headers.get('content-length');
    if (len) {
      headers.set('Content-Length', len);
    }
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof PdfProxyError) {
      return jsonErr(err.httpStatus, err.userMessage);
    }
    if (err instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: err.message, ...err.detail }, { status: err.status });
    }
    if (err instanceof GraphError) {
      if (err.status === 404) {
        return jsonErr(404, 'Không tìm thấy file PDF trên SharePoint.');
      }
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      return jsonErr(status, `Không lấy được file từ SharePoint (Graph ${err.status}).`);
    }
    // Lỗi mạng còn sót → thông báo thân thiện thay vì "fetch failed".
    if (isNetworkError(err)) {
      return jsonErr(504, 'Lỗi mạng tạm thời khi tải PDF. Vui lòng thử lại.');
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonErr(500, message);
  }
}
