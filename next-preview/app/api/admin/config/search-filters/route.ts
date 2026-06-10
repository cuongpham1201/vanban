import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken, getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { getConfigRecord, upsertConfigRecord, ConfigListError, GraphError } from '@/lib/dms/configList';
import { SEARCH_FILTERS_CONFIG_KEY, mergeWithDefaults, FilterConfig } from '@/lib/dms/filterConfig';
import { failJson, isPermissionError } from '@/lib/server/apiResponse';

export const dynamic = 'force-dynamic';

// API cấu hình "Bộ lọc tìm kiếm" — source of truth là SharePoint list DMSConfig (ConfigKey=search-filters).
//   GET  — mọi user đã đăng nhập đọc được (Search Center + Admin). App-only read token.
//   PUT  — chỉ admin/canWrite (assertCanWriteDms). App-only write token. Body = FilterConfig[].
// KHÔNG đụng metadata key / document schema.

interface ConfigMeta {
  updatedAt?: string;
  updatedBy?: string;
}

function parseConfig(json: string): FilterConfig[] | null {
  try {
    const arr = JSON.parse(json);
    return mergeWithDefaults(arr);
  } catch {
    return null;
  }
}

// GET /api/admin/config/search-filters → { ok, config: FilterConfig[] | null, source, meta }
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  try {
    const accessToken = session.accessToken ?? (await getAppOnlyGraphTokenReadOnly());
    const rec = await getConfigRecord(accessToken, SEARCH_FILTERS_CONFIG_KEY);
    if (!rec) {
      // Chưa có cấu hình trong SharePoint → client tự fallback default.
      return NextResponse.json({ ok: true, config: null, source: 'default', meta: {} as ConfigMeta });
    }
    const config = parseConfig(rec.json);
    return NextResponse.json({
      ok: true,
      config, // có thể null nếu JSON hỏng → client fallback default
      source: config ? 'sharepoint' : 'default',
      meta: { updatedAt: rec.updatedAt, updatedBy: rec.updatedBy } as ConfigMeta,
    });
  } catch (err) {
    // Lỗi đọc SharePoint → 200 ok:false để client fallback (cache/default), KHÔNG 5xx (tránh proxy HTML).
    return failJson('config/search-filters:GET', 'Không đọc được cấu hình bộ lọc.', {
      cause: err,
      detail: err instanceof Error ? err.message : String(err),
      extra: { config: null, source: 'default' },
    });
  }
}

// PUT /api/admin/config/search-filters — body: FilterConfig[] → lưu SharePoint. Chỉ admin/canWrite.
export async function PUT(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  if (!Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'Body phải là mảng FilterConfig[].' }, { status: 400 });
  }

  // Chuẩn hóa về canonical (loại key lạ, label theo code, đánh số order liền mạch).
  const config = mergeWithDefaults(body);
  const updatedBy = (session?.user?.email ?? 'unknown').toLowerCase().trim();

  try {
    const accessToken = await getAppOnlyGraphToken(); // write-gated
    const rec = await upsertConfigRecord(accessToken, SEARCH_FILTERS_CONFIG_KEY, JSON.stringify(config), updatedBy);
    // eslint-disable-next-line no-console
    console.log('[dms-config][search-filters][put]', JSON.stringify({ updatedBy, itemId: rec.itemId, count: config.length, ts: rec.updatedAt }));
    return NextResponse.json({ ok: true, config, source: 'sharepoint', meta: { updatedAt: rec.updatedAt, updatedBy } as ConfigMeta });
  } catch (err) {
    if (err instanceof ConfigListError) {
      return failJson('config/search-filters:PUT', err.message, { status: err.status, cause: err });
    }
    if (err instanceof DmsWriteError) {
      return failJson('config/search-filters:PUT', err.message, { status: err.status, cause: err });
    }
    if (err instanceof GraphError) {
      const msg = isPermissionError(err.message) ? 'Không đủ quyền lưu cấu hình lên SharePoint.' : `Lưu cấu hình thất bại (Graph ${err.status}).`;
      return failJson('config/search-filters:PUT', msg, { detail: err.message, cause: err });
    }
    return failJson('config/search-filters:PUT', 'Lưu cấu hình thất bại.', { cause: err, detail: err instanceof Error ? err.message : String(err) });
  }
}
