import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { listNotifications } from '@/lib/dms/notifications/notificationService';

export const dynamic = 'force-dynamic';

// GET /api/notifications?top=20 — thông báo của CHÍNH user hiện tại, mới nhất trước.
export async function GET(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  const topRaw = Number(new URL(req.url).searchParams.get('top') ?? '20');
  const top = Number.isFinite(topRaw) && topRaw > 0 && topRaw <= 100 ? topRaw : 20;
  try {
    const items = await listNotifications(email, top);
    return NextResponse.json({ ok: true, notifications: items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, notifications: [], error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
