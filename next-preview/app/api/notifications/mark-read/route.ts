import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { markNotificationRead, NotificationForbiddenError } from '@/lib/dms/notifications/notificationService';

export const dynamic = 'force-dynamic';

// POST /api/notifications/mark-read  body: { id } — chỉ chủ sở hữu mới đánh dấu đã đọc.
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Thiếu id.' }, { status: 400 });
  }
  try {
    const ok = await markNotificationRead(email, id);
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Không tìm thấy thông báo.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotificationForbiddenError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
