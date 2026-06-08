import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { getEmailConfig, resolveRecipient, isGraphReady } from '@/lib/dms/notifications/channels/emailChannel';

export const dynamic = 'force-dynamic';

// GET /api/admin/notifications/email-status — chẩn đoán email channel. CHỈ admin (allowlist).
// KHÔNG gửi mail; chỉ đọc cấu hình + kiểm tra điều kiện Graph.
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }
  const cfg = getEmailConfig();
  return NextResponse.json({
    ok: true,
    enabled: cfg.enabled,
    testMode: cfg.testMode,
    dryRun: cfg.dryRun,
    recipient: resolveRecipient(cfg) || null, // recipient hiệu lực hiện tại
    broadcastRecipient: cfg.broadcastRecipient,
    testRecipient: cfg.testRecipient || null,
    from: cfg.from || null,
    graphReady: isGraphReady(cfg),
  });
}
