import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getUnreadCount } from '@/lib/dms/notifications/notificationService';
import { failJson } from '@/lib/server/apiResponse';

export const dynamic = 'force-dynamic';

// GET /api/notifications/unread-count — số chưa đọc của user hiện tại.
// Lỗi đọc SharePoint KHÔNG trả 5xx (chuông không được vỡ) → 200 { ok:false, count:0 }.
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ ok: false, count: 0, error: 'Chưa đăng nhập.' }, { status: 401 });
    }
    const count = await getUnreadCount(email);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return failJson('unread-count', 'Không lấy được số thông báo chưa đọc.', { cause: e, extra: { count: 0 } });
  }
}
