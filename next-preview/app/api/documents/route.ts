import { NextResponse } from 'next/server';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';
import { getCachedDocuments, getCacheMetrics } from '@/lib/dms/documentsCache';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const debug = url.searchParams.get('debug') === '1';
  const force = url.searchParams.get('force') === '1';
  try {
    const accessToken = await getGraphAccessToken();
    const cached = await getCachedDocuments(accessToken, force); // P2: cache + in-flight dedupe

    return NextResponse.json({
      ok: true,
      count: cached.documents.length,
      rawItemCount: cached.rawItemCount,
      fileItemCount: cached.fileItemCount,
      truncated: cached.truncated,
      ...(debug
        ? {
            debug: {
              pages: cached.pages,
              stats: cached.stats,
              buildMs: Math.round(cached.buildMs),
              builtAt: cached.builtAt,
              cacheMetrics: getCacheMetrics(),
            },
          }
        : {}),
      documents: cached.documents,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    if (err instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: err.message, ...err.detail }, { status: err.status });
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
