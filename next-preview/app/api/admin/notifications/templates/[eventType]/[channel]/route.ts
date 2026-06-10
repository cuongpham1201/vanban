import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted, assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken, getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { ConfigListError, GraphError } from '@/lib/dms/configList';
import {
  getNotificationTemplate,
  saveNotificationTemplate,
  validateTemplateInput,
} from '@/lib/dms/notifications/templates/notificationTemplateService';
import {
  isTemplateChannel,
  isTemplateEvent,
  NotificationChannel,
  NotificationTemplate,
} from '@/lib/dms/notifications/templates/templateConstants';
import { NotificationType } from '@/lib/dms/notifications/types';
import { failJson, isPermissionError } from '@/lib/server/apiResponse';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: { eventType: string; channel: string };
}

function validateParams(p: Ctx['params']): { eventType: NotificationType; channel: NotificationChannel } | null {
  if (!isTemplateEvent(p.eventType) || !isTemplateChannel(p.channel)) return null;
  return { eventType: p.eventType, channel: p.channel };
}

// GET /api/admin/notifications/templates/[eventType]/[channel] → { saved, default, effective }. Admin only.
export async function GET(_req: Request, { params }: Ctx): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }
  const valid = validateParams(params);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'eventType hoặc channel không hợp lệ.' }, { status: 400 });
  }
  try {
    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const result = await getNotificationTemplate(accessToken, valid.eventType, valid.channel);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return failJson('templates/[event]/[channel]:GET', 'Không đọc được template.', { cause: e, detail: e instanceof Error ? e.message : String(e) });
  }
}

// PUT /api/admin/notifications/templates/[eventType]/[channel] — lưu template. Chỉ admin/canWrite.
export async function PUT(req: Request, { params }: Ctx): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }
  const valid = validateParams(params);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'eventType hoặc channel không hợp lệ.' }, { status: 400 });
  }

  let body: Partial<NotificationTemplate>;
  try {
    body = (await req.json()) as Partial<NotificationTemplate>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const check = validateTemplateInput(valid.eventType, valid.channel, body);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  }

  const updatedBy = (session?.user?.email ?? 'unknown').toLowerCase().trim();
  try {
    const accessToken = await getAppOnlyGraphToken(); // write-gated
    const effective = await saveNotificationTemplate(accessToken, valid.eventType, valid.channel, body, updatedBy);
    // eslint-disable-next-line no-console
    console.log(
      '[dms-noti][template][put]',
      JSON.stringify({ eventType: valid.eventType, channel: valid.channel, updatedBy, enabled: effective.enabled })
    );
    return NextResponse.json({ ok: true, effective });
  } catch (err) {
    if (err instanceof ConfigListError) {
      return failJson('templates/[event]/[channel]:PUT', err.message, { status: err.status, cause: err });
    }
    if (err instanceof GraphError) {
      const msg = isPermissionError(err.message) ? 'Không đủ quyền lưu template lên SharePoint.' : `Lưu template thất bại (Graph ${err.status}).`;
      return failJson('templates/[event]/[channel]:PUT', msg, { detail: err.message, cause: err });
    }
    return failJson('templates/[event]/[channel]:PUT', 'Lưu template thất bại.', { cause: err, detail: err instanceof Error ? err.message : String(err) });
  }
}
