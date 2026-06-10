import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { inspectNotificationsList } from '@/lib/dms/notifications/provisionNotifications';
import { getUnreadCount } from '@/lib/dms/notifications/notificationService';
import { getEmailConfig } from '@/lib/dms/notifications/channels/emailChannel';
import { failJson } from '@/lib/server/apiResponse';

export const dynamic = 'force-dynamic';

// GET /api/admin/notifications/health — chẩn đoán hệ thống thông báo. CHỈ admin (allowlist). Read-only.
export async function GET(): Promise<NextResponse> {
 try {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }

  const graphReady = Boolean(
    process.env.AZURE_AD_TENANT_ID && process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
  );
  const emailEnabled = getEmailConfig().enabled;

  let listExists = false;
  let schemaValid = false;
  let itemCount = 0;
  let inspectError: string | undefined;
  try {
    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const insp = await inspectNotificationsList(accessToken);
    listExists = insp.listExists;
    schemaValid = insp.schemaValid;
    itemCount = insp.itemCount;
  } catch (e) {
    inspectError = e instanceof Error ? e.message : String(e);
  }

  let unreadCount = 0;
  try {
    unreadCount = await getUnreadCount(email);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    ok: true,
    listExists,
    schemaValid,
    itemCount,
    unreadCount,
    emailEnabled,
    graphReady,
    ...(inspectError ? { inspectError } : {}),
  });
 } catch (e) {
    return failJson('notifications/health', 'Không lấy được tình trạng hệ thống thông báo.', { cause: e, detail: e instanceof Error ? e.message : String(e) });
 }
}
