import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { readAllAudits } from '@/lib/ai/auditStore';
import { computeStats } from '@/lib/ai/stats';

export const dynamic = 'force-dynamic';

// AI-3 — GET /api/admin/ai/stats. Thống kê độ chính xác AI từ audit store. CHỈ admin (allowlist),
// read-only (KHÔNG ghi gì). Domain guard + admin guard như các route /api/admin/* khác.
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }

  const records = await readAllAudits();
  const stats = computeStats(records);
  return NextResponse.json({
    ok: true,
    total: stats.total,
    accepted: stats.accepted,
    modified: stats.modified,
    pending: stats.pending,
    withFeedback: stats.withFeedback,
    acceptanceRate: stats.acceptanceRate,
    bySource: stats.bySource,
  });
}
