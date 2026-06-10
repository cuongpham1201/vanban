import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { provisionAllNotificationLists } from '@/lib/dms/notifications/provisionNotifications';
import { failJson, isPermissionError } from '@/lib/server/apiResponse';

export const dynamic = 'force-dynamic';

// POST /api/admin/provision-notifications — tạo/validate list DMSNotifications + DMSNotificationReads.
// CHỈ admin/canWrite. KHÔNG trả 5xx: lỗi quyền/provision → JSON ok:false (200/403) để UI hiển thị sạch.
export async function POST(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session); // admin + DMS_WRITE_ENABLED + allowlist
  } catch (e) {
    const err = e as DmsWriteError;
    return failJson('provision-notifications', err.message, { status: err.status ?? 403, cause: err });
  }
  try {
    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const result = await provisionAllNotificationLists(accessToken);
    const ok = result.notifications.ok && result.reads.ok;
    // eslint-disable-next-line no-console
    console.log('[dms-noti][provision]', JSON.stringify({ by: session?.user?.email, ok, ...result }));
    if (ok) {
      return NextResponse.json({ ok: true, ...result });
    }
    const detail = [result.notifications.error, result.reads.error].filter(Boolean).join(' | ');
    const message = isPermissionError(detail)
      ? 'Không đủ quyền tạo/cập nhật SharePoint list.'
      : 'Không tạo/cập nhật được SharePoint list thông báo.';
    return failJson('provision-notifications', message, { detail, extra: { ...result } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const message = isPermissionError(detail)
      ? 'Không đủ quyền tạo/cập nhật SharePoint list.'
      : 'Tạo SharePoint list thông báo thất bại.';
    return failJson('provision-notifications', message, { detail, cause: e });
  }
}
