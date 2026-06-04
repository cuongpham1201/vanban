import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isDmsWriteEnabled } from '@/lib/dms/writeConfig';
import { canWriteDms } from '@/lib/dms/writeGuard';

export const dynamic = 'force-dynamic';

// GET /api/dms/write-status — cho UI biết có bật write thật hay không (read-only).
// canWrite = flag bật + user trong allowlist. UI dùng để chọn: ghi thật vs mô phỏng.
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  return NextResponse.json({
    ok: true,
    writeEnabled: isDmsWriteEnabled(),
    canWrite: canWriteDms(session),
  });
}
