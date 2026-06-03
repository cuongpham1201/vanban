import { NextResponse } from 'next/server';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { resolveSiteId, resolveListId } from '@/lib/sharepoint/resolve';
import { GraphError } from '@/lib/graph/client';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const accessToken = await getGraphAccessToken();
    const site = await resolveSiteId(accessToken);
    const list = await resolveListId(accessToken);
    return NextResponse.json({
      ok: true,
      site: { id: site.id, displayName: site.displayName },
      list: { id: list.id, displayName: list.displayName },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    if (err instanceof GraphError) {
      return NextResponse.json(
        { ok: false, error: err.message, graph: { status: err.status, body: err.body } },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
