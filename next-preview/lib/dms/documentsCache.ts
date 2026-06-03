// Server-side cache cho documents (P2) — dùng CHUNG bởi /api/documents và /api/dashboard.
// - TTL 60s: trong 60s KHÔNG gọi Graph lại.
// - In-flight dedupe: nhiều request song song chỉ kích hoạt 1 lần fetch+build.
// [PERF] labels (P1): api-documents-request | -hit-cache | -hit-inflight | -fetch | -finish.
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
const TTL_MS = 60_000; // 60s

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

interface ItemsResponse {
  value: GraphListItem[];
  '@odata.nextLink'?: string;
}

// Module-scope state (sống theo tiến trình server).
let _cache: CachedDocs | undefined;
let _inflight: Promise<CachedDocs> | undefined;

// Thống kê cache để báo cáo (P5).
const _metrics = { requests: 0, cacheHits: 0, inflightHits: 0, graphFetches: 0 };

export function getCacheMetrics(): typeof _metrics & { hitRate: number } {
  const served = _metrics.requests;
  const hits = _metrics.cacheHits + _metrics.inflightHits;
  return { ..._metrics, hitRate: served ? +(hits / served).toFixed(3) : 0 };
}

function perf(label: string, ms?: number): void {
  // eslint-disable-next-line no-console
  console.log(`[PERF] ${label}${ms !== undefined ? ' ' + ms.toFixed(1) + 'ms' : ''}`);
}

async function fetchAndBuild(accessToken: string): Promise<CachedDocs> {
  const t0 = performance.now();
  _metrics.graphFetches++;
  const site = await resolveSiteId(accessToken);
  const list = await resolveListId(accessToken);

  const first = `/sites/${site.id}/lists/${list.id}/items?$expand=fields,driveItem&$top=${PAGE_SIZE}`;
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

  return {
    documents,
    rawItemCount: rawItems.length,
    fileItemCount: fileItems.length,
    pages,
    truncated,
    stats,
    builtAt: Date.now(),
    buildMs,
  };
}

/**
 * Lấy documents (mapped + paired) qua cache dùng chung.
 * @param force bỏ qua cache (nút "Tải lại dữ liệu").
 */
export async function getCachedDocuments(accessToken: string, force = false): Promise<CachedDocs> {
  _metrics.requests++;
  perf('api-documents-request');

  // 1) Cache còn hạn?
  if (!force && _cache && Date.now() - _cache.builtAt < TTL_MS) {
    _metrics.cacheHits++;
    perf('api-documents-hit-cache', Date.now() - _cache.builtAt);
    return _cache;
  }

  // 2) Đang có fetch chạy? → await chung (in-flight dedupe).
  if (!force && _inflight) {
    _metrics.inflightHits++;
    perf('api-documents-hit-inflight');
    return _inflight;
  }

  // 3) Fetch mới.
  perf('api-documents-fetch');
  const tStart = performance.now();
  _inflight = fetchAndBuild(accessToken)
    .then((built) => {
      _cache = built;
      return built;
    })
    .finally(() => {
      _inflight = undefined;
      perf('api-documents-finish', performance.now() - tStart);
    });
  return _inflight;
}

export function invalidateDocumentsCache(): void {
  _cache = undefined;
}
