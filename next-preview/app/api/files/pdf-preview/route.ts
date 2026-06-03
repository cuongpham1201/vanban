import { NextResponse } from 'next/server';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { graphFetch, GraphError } from '@/lib/graph/client';
import { resolveSiteId, resolveListId, LibraryResolveError } from '@/lib/sharepoint/resolve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Proxy stream PDF qua Next.js (same-origin) để iframe không bị Chrome chặn cross-origin.
//   Browser → /api/files/pdf-preview?id=<listItemId>
//          → Graph: /sites/{site}/lists/{list}/items/{id}/driveItem  (lấy name + downloadUrl)
//          → stream nội dung PDF về client (Content-Type: application/pdf)
// KHÔNG expose Graph token ra client. downloadUrl của Graph là URL pre-authenticated,
// fetch server-side rồi pipe stream — token không rời server.
interface DriveItemMeta {
  id?: string;
  name?: string;
  size?: number;
  file?: { mimeType?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

function jsonErr(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id');
  // Validate: list item id là số nguyên.
  if (!id || !/^\d+$/.test(id)) {
    return jsonErr(400, 'Thiếu hoặc sai tham số id (list item id).');
  }

  try {
    const accessToken = await getGraphAccessToken();
    const site = await resolveSiteId(accessToken);
    const list = await resolveListId(accessToken);

    // Lấy metadata driveItem (gồm name + @microsoft.graph.downloadUrl, không $select để giữ downloadUrl).
    const item = await graphFetch<DriveItemMeta>(
      `/sites/${site.id}/lists/${list.id}/items/${id}/driveItem`,
      { accessToken }
    );

    const name = item.name ?? '';
    const isPdf = name.toLowerCase().endsWith('.pdf') || item.file?.mimeType === 'application/pdf';
    if (!isPdf) {
      return jsonErr(415, `File không phải PDF (${name || 'unknown'}). Chỉ hỗ trợ xem nhanh .pdf.`);
    }

    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
      return jsonErr(502, 'Không lấy được link tải nội dung PDF từ Microsoft Graph.');
    }

    // downloadUrl là pre-authenticated → fetch KHÔNG kèm Authorization (token không rời server).
    const upstream = await fetch(downloadUrl, { cache: 'no-store' });
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
    if (err instanceof AuthError) {
      return jsonErr(err.status, err.message);
    }
    if (err instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: err.message, ...err.detail }, { status: err.status });
    }
    if (err instanceof GraphError) {
      // 404 = item không tồn tại / không có quyền.
      const status = err.status === 404 ? 404 : err.status >= 400 && err.status < 600 ? err.status : 502;
      return jsonErr(status, `Không lấy được file từ SharePoint (Graph ${err.status}).`);
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonErr(500, message);
  }
}
