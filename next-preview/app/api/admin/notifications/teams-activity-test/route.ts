import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { sendTeamsActivityTest } from '@/lib/dms/notifications/channels/teamsActivityChannel';
import { normalizeDmsActivityType, DMS_TEAMS_ACTIVITY_TYPES } from '@/lib/dms/teams/activityTemplates';

export const dynamic = 'force-dynamic';

// POST /api/admin/notifications/teams-activity-test — gửi thử 1 Teams activity tới 1 email.
// BỎ QUA flag DMS_TEAMS_ACTIVITY_ENABLED (chẩn đoán setup). CHỈ admin.
// Body: { email, activityType?, documentId?, documentNumber?, documentTitle? }
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const adminEmail = session?.user?.email;
  if (!adminEmail) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, error: "Thiếu hoặc sai 'email'." }, { status: 400 });
  }

  const rawType = typeof body.activityType === 'string' && body.activityType.trim() ? body.activityType.trim() : 'dmsNewDocument';
  const activityType = normalizeDmsActivityType(rawType);
  if (!activityType) {
    return NextResponse.json(
      { ok: false, error: `activityType '${rawType}' không hợp lệ.`, validActivityTypes: DMS_TEAMS_ACTIVITY_TYPES },
      { status: 400 }
    );
  }

  try {
    const result = await sendTeamsActivityTest({
      email,
      activityType,
      documentId: typeof body.documentId === 'string' ? body.documentId : undefined,
      documentNumber: typeof body.documentNumber === 'string' ? body.documentNumber : undefined,
      documentTitle: typeof body.documentTitle === 'string' ? body.documentTitle : undefined,
    });
    const ok = result.status === 'sent' || result.status === 'mocked';
    return NextResponse.json({ ok, result }, { status: ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
