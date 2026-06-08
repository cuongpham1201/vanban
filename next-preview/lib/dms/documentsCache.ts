// Server-side cache cho documents — dùng CHUNG bởi /api/documents và /api/dashboard.
// - TTL 5 phút: trong 5 phút KHÔNG gọi Graph lại (warm load nhanh).
// - In-flight dedupe: nhiều request song song chỉ kích hoạt 1 lần fetch+build.
// - source = 'cache' | 'inflight' | 'graph' để route log benchmark.
// Logs: [CACHE] documents hit | miss | reuse-inflight | refresh done | invalidated.
//
// LƯU Ý: cache global (toàn org). Hợp lệ vì mọi user đã đăng nhập đều có quyền Read
// trên DMS Library (xem DMS_PERMISSION_MODEL.md). Không dùng cho dữ liệu per-user.
import { resolveSiteId, resolveListId } from '@/lib/sharepoint/resolve';
import { graphFetch } from '@/lib/graph/client';
import { mapSharePointItemToDocument, GraphListItem } from '@/lib/dms/mapSharePointItemToDocument';
import { pairDocuments } from '@/lib/dms/pairDocuments';
import { analyzePairing, PairingStats } from '@/lib/dms/pairingStats';
import { IDocument } from '@dms/models/IDocument';

const PAGE_SIZE = 200;
const SAFETY_MAX = 2000;
const TTL_MS = 5 * 60 * 1000; // 5 phút

export interface CachedDocs {
  documents: IDocument[];
  rawItemCount: number;
  fileItemCount: number;
  pages: number;
  truncated: boolean;
  stats: PairingStats;
  builtAt: number;
  buildMs: number;
}

export type DocsSource = 'cache' | 'inflight' | 'graph';
export type DocsResult = CachedDocs & { source: DocsSource };

interface ItemsResponse {
  value: GraphListItem[];
  '@odata.nextLink'?: string;
}

// Module-scope state (sống theo tiến trình server).
let _cache: CachedDocs | undefined;
let _inflight: Promise<CachedDocs> | undefined;

const _metrics = { requests: 0, cacheHits: 0, inflightHits: 0, graphFetches: 0 };

export function getCacheMetrics(): typeof _metrics & { hitRate: number } {
  const served = _metrics.requests;
  const hits = _metrics.cacheHits + _metrics.inflightHits;
  return { ..._metrics, hitRate: served ? +(hits / served).toFixed(3) : 0 };
}

function clog(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[CACHE] ${msg}`);
}

async function fetchAndBuild(accessToken: string): Promise<CachedDocs> {
  const t0 = performance.now();
  _metrics.graphFetches++;
  const site = await resolveSiteId(accessToken);
  const list = await resolveListId(accessToken);

  // BUG#26: $select driveItem ĐÚNG field cần (bỏ thumbnails/downloadUrl/... nặng) → giảm payload + thời gian Graph build.
  const driveSelect = 'id,name,webUrl,size,file,folder,lastModifiedDateTime,lastModifiedBy,parentReference';
  const first = `/sites/${site.id}/lists/${list.id}/items?$expand=fields,driveItem($select=${driveSelect})&$top=${PAGE_SIZE}`;
  const rawItems: GraphListItem[] = [];
  let nextUrl: string | undefined = first;
  let truncated = false;
  let pages = 0;

  while (nextUrl) {
    const page: ItemsResponse = await graphFetch<ItemsResponse>(nextUrl, { accessToken });
    pages++;
    if (page.value && page.value.length) {
      rawItems.push(...page.value);
    }
    if (rawItems.length >= SAFETY_MAX) {
      truncated = true;
      break;
    }
    nextUrl = page['@odata.nextLink'];
  }

  const fileItems = rawItems.filter((it) => it.driveItem && it.driveItem.file && !it.driveItem.folder);
  const mapped = fileItems.map(mapSharePointItemToDocument);
  const documents = pairDocuments(mapped);
  const stats = analyzePairing(mapped);
  const buildMs = performance.now() - t0;

  // eslint-disable-next-line no-console
  console.log(
    `[MAP] raw=${rawItems.length} file=${fileItems.length} mapped=${mapped.length} documents=${documents.length} ` +
      `pages=${pages} byExt=${JSON.stringify(stats.byExt)} missingKeyField=${JSON.stringify(stats.missingKeyField)}`
  );
  clog(`documents refresh done ${buildMs.toFixed(0)}ms (docs=${documents.length}, pages=${pages})`);

  return { documents, rawItemCount: rawItems.length, fileItemCount: fileItems.length, pages, truncated, stats, builtAt: Date.now(), buildMs };
}

function hitRate(): string {
  const hits = _metrics.cacheHits + _metrics.inflightHits;
  return _metrics.requests ? `${Math.round((hits / _metrics.requests) * 100)}%` : '0%';
}

// Chạy 1 lần fetch (dedupe qua _inflight). Cập nhật _cache khi xong. Có [dms-perf] graph-fetch.
function runRefresh(accessToken: string): Promise<CachedDocs> {
  if (_inflight) {
    return _inflight;
  }
  const tFetch = performance.now();
  _inflight = fetchAndBuild(accessToken)
    .then((built) => {
      _cache = built;
      // eslint-disable-next-line no-console
      console.log(`[dms-perf] documents graph-fetch=${(performance.now() - tFetch).toFixed(0)}ms docs=${built.documents.length} pages=${built.pages}`);
      return built;
    })
    .finally(() => {
      _inflight = undefined;
    });
  return _inflight;
}

/**
 * Lấy documents (mapped + paired) qua cache dùng chung. Stale-while-revalidate (BUG#26):
 *  - Cache còn hạn → trả ngay.
 *  - Cache QUÁ HẠN → trả STALE ngay + refresh NỀN (không block UI).
 *  - Chưa có cache + đang inflight → reuse.
 *  - Chưa có cache (cold) → fetch (block lần đầu duy nhất; prewarm để tránh).
 * @param forceRefresh bỏ qua cache (admin/dev: ?forceRefresh=1).
 */
export async function getCachedDocuments(accessToken: string, forceRefresh = false): Promise<DocsResult> {
  _metrics.requests++;

  if (forceRefresh) {
    clog('documents force-refresh');
    return { ...(await runRefresh(accessToken)), source: 'graph' };
  }

  // 1) Cache còn hạn → trả ngay.
  if (_cache && Date.now() - _cache.builtAt < TTL_MS) {
    _metrics.cacheHits++;
    const age = Math.round((Date.now() - _cache.builtAt) / 1000);
    clog(`documents hit (age ${age}s, docs=${_cache.documents.length})`);
    // eslint-disable-next-line no-console
    console.log(`[dms-perf] documents cache-hit age=${age}s docs=${_cache.documents.length} hitRate=${hitRate()}`);
    return { ..._cache, source: 'cache' };
  }

  // 2) Cache quá hạn → SERVE STALE ngay + refresh nền (không chặn UI).
  if (_cache) {
    _metrics.cacheHits++;
    const age = Math.round((Date.now() - _cache.builtAt) / 1000);
    clog(`documents stale-serve (age ${age}s) + refresh nền`);
    // eslint-disable-next-line no-console
    console.log(`[dms-perf] documents stale-serve age=${age}s docs=${_cache.documents.length} hitRate=${hitRate()} (refresh nền)`);
    void runRefresh(accessToken).catch(() => undefined); // nền, nuốt lỗi (vẫn còn stale để dùng)
    return { ..._cache, source: 'cache' };
  }

  // 3) Chưa có cache nhưng đang fetch → reuse inflight.
  if (_inflight) {
    _metrics.inflightHits++;
    clog('documents reuse-inflight');
    // eslint-disable-next-line no-console
    console.log(`[dms-perf] documents reuse-inflight hitRate=${hitRate()}`);
    return { ...(await _inflight), source: 'inflight' };
  }

  // 4) Cold (chưa từng có cache) → fetch chặn (chỉ lần đầu; prewarm để né).
  clog('documents miss (cold)');
  return { ...(await runRefresh(accessToken)), source: 'graph' };
}

/**
 * BUG#26 — Prewarm cache (non-blocking). Gọi từ instrumentation lúc server start.
 * Không làm gì nếu đã có cache hoặc đang fetch. Nuốt lỗi (không crash boot).
 */
export function prewarmDocumentsCache(accessToken: string): void {
  if (_cache || _inflight) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log('[dms-perf] prewarm start');
  void runRefresh(accessToken)
    .then((b) => {
      // eslint-disable-next-line no-console
      console.log(`[dms-perf] prewarm done docs=${b.documents.length} pages=${b.pages}`);
    })
    .catch(() => undefined);
}

/**
 * Xóa cache thủ công — GỌI sau khi mutation thay đổi dữ liệu SharePoint.
 * TODO: gọi từ các route mutation khi mở write (read-only hiện tại chưa có):
 *   - POST /api/documents/upload          → invalidateDocumentsCache('upload')
 *   - PATCH /api/documents/:id (metadata)  → invalidateDocumentsCache('edit')
 *   - POST /api/documents/recycle (delete) → invalidateDocumentsCache('delete')
 *   - chuẩn hóa metadata hàng loạt         → invalidateDocumentsCache('normalize')
 */
export function invalidateDocumentsCache(reason?: string): void {
  _cache = undefined;
  _inflight = undefined;
  clog(`documents invalidated${reason ? ' (' + reason + ')' : ''}`);
}
