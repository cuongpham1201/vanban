import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { getTeamsActivityStatus } from '@/lib/dms/notifications/channels/teamsActivityChannel';

export const dynamic = 'force-dynamic';

// GET /api/admin/notifications/teams-activity-status — chẩn đoán Teams Activity Feed. CHỈ admin. Read-only.
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...getTeamsActivityStatus() });
}
