import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/token';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';
import { getCacheMetrics } from '@/lib/dms/documentsCache';
import { getDocsForRequest } from '@/lib/dms/docsForRequest';
import { toLiteDoc } from '@/lib/dms/docProjection';
import { IDocument } from '@dms/models/IDocument';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 50;
// Cap cứng 100 (giảm payload; trước là 500). Muốn lấy toàn bộ → dùng ?all=1 (nội bộ/admin).
const MAX_PAGE_SIZE = 100;

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
  // ?fields=lite → trả tập field tối thiểu (cắt payload). Mặc định = full (giữ tương thích).
  const lite = url.searchParams.get('fields') === 'lite';
  // ?all=1 → escape hatch nội bộ/admin: trả TOÀN BỘ dataset (bỏ phân trang). Giữ hành vi full cũ.
  const all = url.searchParams.get('all') === '1';
  const hasPaging = !all && (url.searchParams.has('page') || url.searchParams.has('pageSize'));
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));

  const t0 = performance.now();
  try {
    const result = await getDocsForRequest(forceRefresh); // Azure AD → token delegated; Teams SSO → app-only read
    const cached = result.cached;

    // Filter in-memory (KHÔNG fetch lại Graph). Khi không có filter → trả nguyên (giữ UI hiện tại).
    let docs = result.documents;
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

    // Projection lite: chỉ chiếu field cần cho list/search (sau khi đã phân trang → chỉ map trang hiện tại).
    const outDocs = lite ? docs.map(toLiteDoc) : docs;

    // eslint-disable-next-line no-console
    console.log(`[PERF] api-documents-finish ${(performance.now() - t0).toFixed(0)}ms source=${result.source} docs=${total} fields=${lite ? 'lite' : 'full'}${all ? ' all=1' : ''}`);

    return NextResponse.json({
      ok: true,
      source: result.source,
      count: outDocs.length,
      total,
      ...(pageInfo ?? {}),
      rawItemCount: cached?.rawItemCount,
      fileItemCount: cached?.fileItemCount,
      truncated: cached?.truncated ?? false,
      ...(debug && cached
        ? { debug: { pages: cached.pages, stats: cached.stats, buildMs: Math.round(cached.buildMs), builtAt: cached.builtAt, cacheMetrics: getCacheMetrics() } }
        : {}),
      documents: outDocs,
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
