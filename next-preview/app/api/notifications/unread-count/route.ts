import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getUnreadCount } from '@/lib/dms/notifications/notificationService';

export const dynamic = 'force-dynamic';

// GET /api/notifications/unread-count — số chưa đọc của user hiện tại.
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  try {
    const count = await getUnreadCount(email);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ ok: false, count: 0, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
