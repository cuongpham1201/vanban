import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { provisionConfigList } from '@/lib/dms/configList';

export const dynamic = 'force-dynamic';

// POST /api/admin/provision-config — tạo/validate SharePoint list DMSConfig (cấu hình filter admin).
// CHỈ admin/canWrite. Sau khi chạy, /admin filter-config load/save được.
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
    const result = await provisionConfigList(accessToken);
    // eslint-disable-next-line no-console
    console.log('[dms-config][provision]', JSON.stringify({ by: session?.user?.email, ...result }));
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
