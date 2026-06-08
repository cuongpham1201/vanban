import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { markAllNotificationsRead } from '@/lib/dms/notifications/notificationService';

export const dynamic = 'force-dynamic';

// POST /api/notifications/mark-all-read — đánh dấu tất cả thông báo của user hiện tại là đã đọc.
export async function POST(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  try {
    const updated = await markAllNotificationsRead(email);
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
