import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { provisionAllNotificationLists } from '@/lib/dms/notifications/provisionNotifications';

export const dynamic = 'force-dynamic';

// POST /api/admin/provision-notifications — tạo/validate list DMSNotifications. CHỈ admin/canWrite.
export async function POST(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session); // admin + DMS_WRITE_ENABLED + allowlist
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }
  try {
    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const result = await provisionAllNotificationLists(accessToken);
    const ok = result.notifications.ok && result.reads.ok;
    // eslint-disable-next-line no-console
    console.log('[dms-noti][provision]', JSON.stringify({ by: session?.user?.email, ok, ...result }));
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
