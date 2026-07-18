// Server-side cache cho documents — dùng CHUNG bởi /api/documents và /api/dashboard.
// - TTL 5 phút: trong 5 phút KHÔNG gọi Graph lại (warm load nhanh).
// - In-flight dedupe: nhiều request song song chỉ kích hoạt 1 lần fetch+build.
// - source = 'cache' | 'inflight' | 'graph' để route log benchmark.
// Logs: [CACHE] documents hit | miss | reuse-inflight | refresh done | invalidated.
//
// LƯU Ý: cache global (toàn org). Hợp lệ vì mọi user đã đăng nhập đều có quyền Read
// trên DMS Library (xem DMS_PERMISSION_MODEL.md). Không dùng cho dữ liệu per-user.
import { resolveSiteId, resolveListId } from '@/lib/sharepoint/resolve';
import { graphFetch, GraphError } from '@/lib/graph/client';
import { mapSharePointItemToDocument, GraphListItem } from '@/lib/dms/mapSharePointItemToDocument';
import { pairDocuments } from '@/lib/dms/pairDocuments';
import { analyzePairing, PairingStats } from '@/lib/dms/pairingStats';
import { IDocument } from '@dms/models/IDocument';

const PAGE_SIZE = 200;
// Trần an toàn số item thô nạp về. PHẢI lớn hơn tổng item của thư viện (văn bản + bản mềm
// + đính kèm + folder), nếu KHÔNG các item MỚI NHẤT (id lớn) bị rớt: Graph trả item theo id
// TĂNG DẦN (cũ trước) và pagination dừng ở trần → VB vừa upload không vào cache → 404 khi mở
// deep-link + không hiện ở Search/List/Dashboard. Nâng từ 2000 (đã chạm trần) lên 5000 + cảnh
// báo khi vẫn truncated để biết mà nâng tiếp / chuyển sang fetch tăng dần.
const SAFETY_MAX = 5000;
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

// True nếu driveItem nằm trong (hoặc dưới) một thư mục "Attachments" → là file đính kèm, KHÔNG phải
// văn bản chính. parentReference.path dạng ".../root:/[Cấp lưu trữ]/Attachments/[SoVanBan]".
function isAttachmentPath(path?: string): boolean {
  if (!path) return false;
  return /(^|\/)Attachments(\/|$)/i.test(path);
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

  // CẢNH BÁO: vẫn còn item CHƯA nạp (đụng trần SAFETY_MAX). Item mới nhất (id lớn) sẽ bị
  // rớt khỏi cache → VB mới không thấy ở Search/List. Cần nâng SAFETY_MAX hoặc đổi chiến lược fetch.
  if (truncated) {
    // eslint-disable-next-line no-console
    console.warn(
      `[CACHE][WARN] Đã chạm trần SAFETY_MAX=${SAFETY_MAX} — thư viện còn item CHƯA nạp; ` +
        `VB mới nhất có thể KHÔNG hiện ở Search/List. Cần nâng SAFETY_MAX.`
    );
  }

  // File đính kèm nằm trong thư mục con "Attachments/[SoVanBan]/" của thư mục văn bản cha.
  // Trong SharePoint document library MỖI file LÀ một list item → query /items trả CẢ attachment.
  // Attachment KHÔNG có metadata business (NgayBanHanh/NamBanHanh/TrangThai trống) nên nếu coi như
  // văn bản thì namBanHanh fallback = năm hiện tại + trạng thái mặc định Active → bị đẩy lên đầu
  // "Văn bản mới nhất" với ngày sai. Loại chúng khỏi collection văn bản chính (vẫn truy cập được
  // qua panel Đính kèm của văn bản cha — listAttachments gọi drive riêng).
  const isFileItem = (it: GraphListItem): boolean =>
    !!(it.driveItem && it.driveItem.file && !it.driveItem.folder);
  const fileItems = rawItems.filter((it) => isFileItem(it) && !isAttachmentPath(it.driveItem?.parentReference?.path));
  const attachmentItems = rawItems.filter((it) => isFileItem(it) && isAttachmentPath(it.driveItem?.parentReference?.path));
  const mapped = fileItems.map(mapSharePointItemToDocument);
  const documents = pairDocuments(mapped);
  const stats = analyzePairing(mapped);
  const buildMs = performance.now() - t0;

  // eslint-disable-next-line no-console
  console.log(
    `[MAP] raw=${rawItems.length} file=${fileItems.length} attachments-excluded=${attachmentItems.length} ` +
      `mapped=${mapped.length} documents=${documents.length} ` +
      `pages=${pages} byExt=${JSON.stringify(stats.byExt)} missingKeyField=${JSON.stringify(stats.missingKeyField)}`
  );
  clog(`documents refresh done ${buildMs.toFixed(0)}ms (docs=${documents.length}, pages=${pages})`);

  return { documents, rawItemCount: rawItems.length, fileItemCount: fileItems.length, pages, truncated, stats, builtAt: Date.now(), buildMs };
}

// Đọc TRỰC TIẾP 1 văn bản theo list-item id, KHÔNG qua cache dùng chung.
// Dùng làm FALLBACK cho /api/documents/[id] khi item chưa/không có trong cache — điển hình là
// VB vừa upload hoặc item nằm ngoài cửa sổ SAFETY_MAX. Chi phí: 1 Graph call cho đúng 1 item.
// Trả null nếu item không tồn tại (404) hoặc không phải file văn bản chính (folder/attachment).
// LƯU Ý: đây là 1 item đơn → KHÔNG ghép cặp bản mềm (editableSource từ sibling .docx). editableSource
// chỉ có nếu suy được từ cột (HasEditableSource/EditableSourceUrl). Bản đầy đủ (đã pair) sẽ được
// phục vụ ngay khi cache refresh (đã bao trùm nhờ SAFETY_MAX mới).
export async function fetchDocumentByIdDirect(accessToken: string, id: string): Promise<IDocument | null> {
  const site = await resolveSiteId(accessToken);
  const list = await resolveListId(accessToken);
  const driveSelect =
    'id,name,webUrl,size,file,folder,createdDateTime,createdBy,lastModifiedDateTime,lastModifiedBy,parentReference';
  const url = `/sites/${site.id}/lists/${list.id}/items/${encodeURIComponent(id)}?$expand=fields,driveItem($select=${driveSelect})`;
  let item: GraphListItem;
  try {
    item = await graphFetch<GraphListItem>(url, { accessToken });
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) {
      return null;
    }
    throw e;
  }
  // Chỉ nhận file văn bản CHÍNH (có driveItem.file, không phải folder, không nằm trong Attachments/).
  const isFile = !!(item.driveItem && item.driveItem.file && !item.driveItem.folder);
  if (!isFile || isAttachmentPath(item.driveItem?.parentReference?.path)) {
    return null;
  }
  clog(`documents direct-by-id hit (id=${id})`);
  return mapSharePointItemToDocument(item);
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
