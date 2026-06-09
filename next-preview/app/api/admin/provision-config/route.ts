import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { provisionConfigList } from '@/lib/dms/configList';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/admin/provision-config — tạo/validate SharePoint list DMSConfig (cấu hình filter admin).
// CHỈ admin/canWrite. LUÔN trả JSON (không bao giờ HTML) để client không vỡ khi parse.
// #36: KHÔNG trả 5xx cho lỗi provision "kỳ vọng" (vd thiếu quyền Graph) — reverse proxy có thể
//      can thiệp body 5xx và trả HTML. Dùng 200 + { ok:false, error } cho kết quả provision;
//      chỉ dùng 4xx cho auth và 500 cho exception ngoài dự kiến.
export async function POST(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    try {
      assertCanWriteDms(session); // admin + DMS_WRITE_ENABLED + allowlist
    } catch (e) {
      const err = e as DmsWriteError;
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
    }

    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const result = await provisionConfigList(accessToken);
    // eslint-disable-next-line no-console
    console.log(
      '[dms-config][provision]',
      JSON.stringify({ by: session?.user?.email ?? 'unknown', ok: result.ok, created: result.created, error: result.error })
    );
    // Trả 200 kể cả khi result.ok=false (client đọc cờ ok). Tránh proxy thay body 5xx -> HTML.
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[dms-config][provision] error', detail);
    return NextResponse.json(
      { ok: false, error: 'Lỗi máy chủ khi tạo list cấu hình.', detail },
      { status: 500 }
    );
  }
}
