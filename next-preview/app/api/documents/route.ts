import { NextResponse } from 'next/server';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';
import { getCachedDocuments, getCacheMetrics } from '@/lib/dms/documentsCache';
import { IDocument } from '@dms/models/IDocument';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

function matchesKeyword(d: IDocument, kw: string): boolean {
  const hay = [
    d.soVanBan, d.trichYeu, d.loaiVanBan, d.donViSoanThao, d.donViCode, d.nguoiKy,
    d.fileName ?? '', d.nhomTaiLieu ?? '', d.loaiTaiLieu ?? '', d.chuDeNghiepVu ?? '', d.donViPhatHanh ?? '',
  ].join(' ').toLowerCase();
  return hay.indexOf(kw) !== -1;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const debug = url.searchParams.get('debug') === '1';
  const forceRefresh = url.searchParams.get('forceRefresh') === '1' || url.searchParams.get('force') === '1';
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const nhomTaiLieu = url.searchParams.get('nhomTaiLieu') ?? '';
  const hasPaging = url.searchParams.has('page') || url.searchParams.has('pageSize');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));

  const t0 = performance.now();
  try {
    const accessToken = await getGraphAccessToken();
    const cached = await getCachedDocuments(accessToken, forceRefresh);

    // Filter in-memory (KHÔNG fetch lại Graph). Khi không có filter → trả nguyên (giữ UI hiện tại).
    let docs = cached.documents;
    if (q) {
      docs = docs.filter((d) => matchesKeyword(d, q));
    }
    if (nhomTaiLieu) {
      docs = docs.filter((d) => (d.nhomTaiLieu ?? '') === nhomTaiLieu);
    }
    const total = docs.length;

    // Pagination: chỉ áp dụng khi client yêu cầu (?page/?pageSize) → backward-compatible.
    let pageInfo: { page: number; pageSize: number; totalPages: number } | undefined;
    if (hasPaging) {
      const start = (page - 1) * pageSize;
      docs = docs.slice(start, start + pageSize);
      pageInfo = { page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
    }

    // eslint-disable-next-line no-console
    console.log(`[PERF] api-documents-finish ${(performance.now() - t0).toFixed(0)}ms source=${cached.source} docs=${total}`);

    return NextResponse.json({
      ok: true,
      source: cached.source,
      count: docs.length,
      total,
      ...(pageInfo ?? {}),
      rawItemCount: cached.rawItemCount,
      fileItemCount: cached.fileItemCount,
      truncated: cached.truncated,
      ...(debug
        ? { debug: { pages: cached.pages, stats: cached.stats, buildMs: Math.round(cached.buildMs), builtAt: cached.builtAt, cacheMetrics: getCacheMetrics() } }
        : {}),
      documents: docs,
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
