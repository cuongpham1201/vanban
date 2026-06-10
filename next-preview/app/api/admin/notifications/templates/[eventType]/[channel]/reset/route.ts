import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { ConfigListError, GraphError } from '@/lib/dms/configList';
import { resetNotificationTemplate } from '@/lib/dms/notifications/templates/notificationTemplateService';
import { isTemplateChannel, isTemplateEvent } from '@/lib/dms/notifications/templates/templateConstants';

export const dynamic = 'force-dynamic';

interface Ctx {
  params: { eventType: string; channel: string };
}

// POST /api/admin/notifications/templates/[eventType]/[channel]/reset — xóa config, về mặc định.
// Chỉ admin/canWrite.
export async function POST(_req: Request, { params }: Ctx): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }
  if (!isTemplateEvent(params.eventType) || !isTemplateChannel(params.channel)) {
    return NextResponse.json({ ok: false, error: 'eventType hoặc channel không hợp lệ.' }, { status: 400 });
  }
  try {
    const accessToken = await getAppOnlyGraphToken();
    const def = await resetNotificationTemplate(accessToken, params.eventType, params.channel);
    // eslint-disable-next-line no-console
    console.log('[dms-noti][template][reset]', JSON.stringify({ eventType: params.eventType, channel: params.channel, by: session?.user?.email }));
    return NextResponse.json({ ok: true, effective: def });
  } catch (err) {
    if (err instanceof ConfigListError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    if (err instanceof GraphError) {
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      return NextResponse.json({ ok: false, error: `Reset template thất bại (Graph ${err.status}).` }, { status });
    }
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
