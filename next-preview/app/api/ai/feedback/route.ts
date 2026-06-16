import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { recordFeedback, pickAuditFields, AuditMetadataFields } from '@/lib/ai/auditStore';

export const dynamic = 'force-dynamic';

// AI-3 — Feedback loop. Khi user PUBLISH văn bản, client gọi route này với { id, finalMetadata }
// để so AI suggestion vs metadata cuối → tính accepted + lưu finalMetadata vào audit store.
// KHÔNG đụng luồng upload/SharePoint: đây là endpoint ĐỘC LẬP (best-effort), sẵn sàng để UI
// Publish gọi sau (chưa wiring để tránh sửa workflow upload theo phạm vi AI-3).
//
// Body: { "id": "<auditId từ /api/ai/metadata-suggest>", "finalMetadata": { LoaiVanBanPhapLy, ... } }
// Resp: { success, accepted, record } | { success:false, error }
const ALLOWED_DOMAIN = '@' + ((process.env.ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'biahalong.com');

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email ?? '').toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return NextResponse.json({ success: false, error: 'Tài khoản ngoài tổ chức.' }, { status: 403 });
  }

  let body: { id?: unknown; finalMetadata?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; finalMetadata?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ success: false, error: "Thiếu 'id' audit record." }, { status: 422 });
  }
  if (typeof body.finalMetadata !== 'object' || body.finalMetadata === null) {
    return NextResponse.json({ success: false, error: "'finalMetadata' phải là object." }, { status: 422 });
  }
  const finalMetadata: AuditMetadataFields = pickAuditFields(body.finalMetadata as Record<string, unknown>);

  try {
    const rec = await recordFeedback(id, finalMetadata);
    if (!rec) {
      return NextResponse.json({ success: false, error: `Không tìm thấy audit id ${id}.` }, { status: 404 });
    }
    return NextResponse.json({ success: true, accepted: rec.accepted, record: rec });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[ai-feedback] error', JSON.stringify({ by: email, id, error: msg }));
    return NextResponse.json({ success: false, error: 'Không ghi được feedback.' }, { status: 500 });
  }
}
