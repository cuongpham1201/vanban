import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { getAllEffectiveTemplates } from '@/lib/dms/notifications/templates/notificationTemplateService';
import {
  TEMPLATE_EVENTS,
  TEMPLATE_CHANNELS,
  EVENT_LABELS,
  CHANNEL_LABELS,
  PLACEHOLDER_FIELDS,
} from '@/lib/dms/notifications/templates/templateConstants';

export const dynamic = 'force-dynamic';

// GET /api/admin/notifications/templates → tất cả template hiệu lực (5 event × 3 channel) + metadata UI.
// Chỉ admin (allowlist). Read-only.
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }
  try {
    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const templates = await getAllEffectiveTemplates(accessToken);
    return NextResponse.json({
      ok: true,
      templates,
      meta: {
        events: TEMPLATE_EVENTS,
        channels: TEMPLATE_CHANNELS,
        eventLabels: EVENT_LABELS,
        channelLabels: CHANNEL_LABELS,
        fields: PLACEHOLDER_FIELDS,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
