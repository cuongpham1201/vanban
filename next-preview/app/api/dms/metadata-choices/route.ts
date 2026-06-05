import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';

export const dynamic = 'force-dynamic';

// GET /api/dms/metadata-choices — choices ĐỘNG từ schema cột + danh sách folder cấp lưu trữ.
// READ-ONLY. Gate assertCanWriteDms (chỉ cần khi ghi thật; UI preview vẫn dùng FALLBACK).
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }
  try {
    const token = await getAppOnlyGraphToken();
    const svc = new SharePointDmsService(token);
    const [choices, folders] = await Promise.all([svc.getMetadataChoices(), svc.listStorageFolders()]);
    return NextResponse.json({ ok: true, choices, folders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
