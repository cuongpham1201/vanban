import { NextResponse } from 'next/server';
import { getCachedDocuments } from '@/lib/dms/documentsCache';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { computeRecent } from '@/lib/dms/derive';

// GET /api/dashboard/user?email=<UPN> — widget dashboard cho HRM (server-to-server).
// - KHÔNG dùng session người dùng: docs lấy qua app-only READ token; notifications qua notificationService (app-only).
// - Auth: header X-Internal-Token == HRM_WIDGET_TOKEN. Sai/thiếu → 401.
// - CHỈ nội bộ (localhost:3004): nếu request đến QUA Cloudflare tunnel (có header cf-*) → 404 (không lộ tồn tại).
//   Không cần sửa cấu hình tunnel — chặn tại app bằng dấu hiệu cf-ray/cf-connecting-ip do edge chèn.
// - vanban KHÔNG có "văn bản cần user X xử lý" (không có field assigned) → chỉ widget recentDocuments.
//   (myDocNotifications đã bỏ theo yêu cầu HRM.) Khi có luồng giao việc sẽ bổ sung key="needsMyAction".
export const dynamic = 'force-dynamic';

const APP = 'vanban';
const BASE = 'https://vanban.biahalong.com';

function cameViaCloudflare(h: Headers): boolean {
  return !!(h.get('cf-ray') || h.get('cf-connecting-ip'));
}

export async function GET(request: Request): Promise<NextResponse> {
  const h = request.headers;

  // 1) Chỉ nội bộ — request qua tunnel (edge chèn cf-*) coi như không tồn tại.
  if (cameViaCloudflare(h)) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  // 2) Auth server-to-server (fail-closed nếu chưa cấu hình token).
  const token = process.env.HRM_WIDGET_TOKEN;
  const provided = h.get('x-internal-token');
  if (!token || !provided || provided !== token) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const email = (new URL(request.url).searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Thiếu tham số email.' }, { status: 400 });
  }

  try {
    // --- Widget: recentDocuments — TOP 10 văn bản mới ban hành (toàn công ty) ---
    // computeRecent = Active + chưa hết hiệu lực, sort NgayBanHanh desc → SoVanBan desc, top 10.
    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const { documents } = await getCachedDocuments(accessToken, false);
    const cutoff7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().substring(0, 10);
    const newIn7 = documents.filter((d) => (d.ngayBanHanh || '') >= cutoff7).length;
    const recentItems = computeRecent(documents).map((d) => ({
      title: d.trichYeu || d.soVanBan || '(không tiêu đề)',
      subtitle: [d.soVanBan, d.loaiVanBanPhapLy ?? d.loaiVanBan].filter(Boolean).join(' · '),
      url: `${BASE}/documents/${d.id}`,
      at: d.ngayBanHanh || undefined,
    }));

    return NextResponse.json({
      ok: true,
      app: APP,
      email,
      generatedAt: new Date().toISOString(),
      widgets: [
        { key: 'recentDocuments', label: 'Văn bản mới', count: newIn7, items: recentItems },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[hrm-widget] error', message);
    return NextResponse.json({ ok: false, app: APP, error: message }, { status: 502 });
  }
}
