import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { renderTemplatePreview, validateTemplateInput } from '@/lib/dms/notifications/templates/notificationTemplateService';
import {
  isTemplateChannel,
  isTemplateEvent,
  NotificationTemplate,
  NotificationTemplateContext,
  SAMPLE_CONTEXT,
} from '@/lib/dms/notifications/templates/templateConstants';

export const dynamic = 'force-dynamic';

// POST /api/admin/notifications/templates/preview — render thử 1 template với context mẫu.
// Body: { eventType, channel, template: Partial<NotificationTemplate>, context?: NotificationTemplateContext }
// Chỉ admin. KHÔNG ghi SharePoint (pure render).
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }

  let body: {
    eventType?: string;
    channel?: string;
    template?: Partial<NotificationTemplate>;
    context?: NotificationTemplateContext;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const { eventType, channel, template } = body;
  if (!eventType || !isTemplateEvent(eventType) || !channel || !isTemplateChannel(channel)) {
    return NextResponse.json({ ok: false, error: 'eventType hoặc channel không hợp lệ.' }, { status: 400 });
  }
  const tpl = template ?? {};
  const check = validateTemplateInput(eventType, channel, tpl);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  }

  const ctx: NotificationTemplateContext = { ...SAMPLE_CONTEXT, ...(body.context ?? {}) };
  const rendered = renderTemplatePreview(tpl, channel, eventType, ctx, { html: channel === 'email' });
  return NextResponse.json({ ok: true, rendered });
}
