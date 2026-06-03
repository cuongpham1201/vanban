import { NextResponse } from 'next/server';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';
import { getCachedDocuments } from '@/lib/dms/documentsCache';
import { DocStatus } from '@dms/models/IDocument';
import { isExpired, isNotExpired, needsStandardization } from '@dms/utils/standardization';
import {
  computeKpis,
  computeRecent,
  computeExpiring,
  computeUnitStats,
  computeStorageFolders,
} from '@/lib/dms/derive';

export const dynamic = 'force-dynamic';

// P3: GET /api/dashboard — trả aggregate cho trang chủ, KHÔNG ship toàn bộ documents.
// Dùng CHUNG cache với /api/documents (getCachedDocuments) → ≤1 Graph fetch / đợt refresh.
export async function GET(): Promise<NextResponse> {
  const t0 = performance.now();
  try {
    const accessToken = await getGraphAccessToken();
    const cached = await getCachedDocuments(accessToken);
    const docs = cached.documents;

    const visible = docs.filter(isNotExpired);
    const totals = {
      totalDocuments: visible.length,
      activeDocuments: visible.filter((d) => d.trangThai === DocStatus.Active).length,
      expiredDocuments: docs.filter(isExpired).length,
      needsReview: visible.filter(needsStandardization).length,
      missingSource: visible.filter((d) => !d.editableSource).length,
      hasSource: visible.filter((d) => !!d.editableSource).length,
    };

    const body = {
      ok: true,
      source: cached.source,
      totals,
      kpis: computeKpis(docs),
      recentDocuments: computeRecent(docs),
      expiringDocuments: computeExpiring(docs),
      storageStats: computeUnitStats(docs),
      storageFolders: computeStorageFolders(docs),
      generatedAt: new Date(cached.builtAt).toISOString(),
      cacheTtlSeconds: 60,
    };
    // eslint-disable-next-line no-console
    console.log(`[PERF] api-dashboard ${(performance.now() - t0).toFixed(0)}ms source=${cached.source} docs=${docs.length}`);
    return NextResponse.json(body);
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
