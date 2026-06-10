import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { provisionAllNotificationLists, inspectAllNotificationLists } from '@/lib/dms/notifications/provisionNotifications';
import { failJson, isPermissionError } from '@/lib/server/apiResponse';

export const dynamic = 'force-dynamic';

// POST /api/admin/provision-notifications — tạo/validate DMSNotifications + DMSNotificationReads.
// CHỈ admin/canWrite. KHÔNG trả 5xx. Trả shape PHẲNG để UI đọc trực tiếp:
//   { ok, created, validated, addedColumns[], indexedColumns[], missingLists[], missingColumns[], missingIndexes[] }
// validated/ok lấy từ inspectAllNotificationLists (CÙNG nguồn với Health → không lệch nhau).
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
    // Sau khi provision → kiểm tra lại bằng nguồn chân lý chung.
    const health = await inspectAllNotificationLists(accessToken);

    const prefix = (listName: string, names: string[] | undefined): string[] =>
      (names ?? []).map((n) => `${listName}.${n}`);
    const created = result.notifications.created || result.reads.created;
    const addedColumns = [
      ...prefix(result.notifications.listName, result.notifications.addedColumns),
      ...prefix(result.reads.listName, result.reads.addedColumns),
    ];
    const indexedColumns = [
      ...prefix(result.notifications.listName, result.notifications.indexedColumns),
      ...prefix(result.reads.listName, result.reads.indexedColumns),
    ];
    const flat = {
      created,
      validated: health.schemaValid,
      addedColumns,
      indexedColumns,
      missingLists: health.missingLists,
      missingColumns: health.missingColumns,
      missingIndexes: health.missingIndexes,
    };
    // eslint-disable-next-line no-console
    console.log('[dms-noti][provision]', JSON.stringify({ by: session?.user?.email, ok: health.schemaValid, ...flat }));

    if (health.schemaValid) {
      return NextResponse.json({ ok: true, ...flat });
    }
    const detail = [result.notifications.error, result.reads.error].filter(Boolean).join(' | ');
    const message = isPermissionError(detail)
      ? 'Không đủ quyền tạo/cập nhật SharePoint list.'
      : 'Schema chưa đầy đủ — xem chi tiết cột/index còn thiếu.';
    return failJson('provision-notifications', message, { detail: detail || undefined, extra: flat });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const message = isPermissionError(detail)
      ? 'Không đủ quyền tạo/cập nhật SharePoint list.'
      : 'Tạo SharePoint list thông báo thất bại.';
    return failJson('provision-notifications', message, { detail, cause: e });
  }
}
