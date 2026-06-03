# PDF Preview proxy + Dashboard/Documents performance

> Sửa 2 vấn đề production: (1) PDF preview bị Chrome chặn cross-origin; (2) Home/Dashboard load 16–18s.
> Không expose Graph token ra client · không đổi metadata mapping · không phá search/filter.

---

## PHASE 1 — PDF Preview qua proxy nội bộ

**Trước:** `DocumentDetailDrawer.tsx` nhúng `<iframe src={document.webUrl}>` (URL SharePoint) → Chrome chặn:
`Unsafe attempt to load URL https://biahalong.sharepoint.com/... from frame`.

**Sau:** thêm proxy same-origin, stream PDF qua Next.js (token không rời server).

### API mới: `app/api/files/pdf-preview/route.ts`
```
GET /api/files/pdf-preview?id=<listItemId>
  → getGraphAccessToken() (delegated, session — không expose ra client)
  → resolveSiteId + resolveListId
  → GET /sites/{site}/lists/{list}/items/{id}/driveItem   (name + @microsoft.graph.downloadUrl)
  → validate .pdf (else 415)
  → fetch downloadUrl (pre-authenticated, KHÔNG kèm token) → stream body
  → Response application/pdf
```
Dùng `id` (= list item id, đã có sẵn trong `IDocument.id`) → không cần thêm driveId/itemId vào model.
Headers: `Content-Type: application/pdf`, `Content-Disposition: inline; filename*=UTF-8''…`,
`Cache-Control: private, max-age=300`, `X-Content-Type-Options: nosniff`.
Lỗi rõ ràng: 400 (thiếu/sai id) · 401 (chưa login) · 415 (không phải PDF) · 404/502 (Graph) · 500.

### UI: `DocumentDetailDrawer.tsx`
- iframe `src` đổi từ `document.webUrl` → `/api/files/pdf-preview?id=${document.id}` (same-origin).
- Fallback box khi lỗi: “Không thể xem nhanh PDF. Vui lòng bấm Mở file.” + nút mở tab mới.
- Nút **Mở file** vẫn mở `document.webUrl` (SharePoint) ở tab mới; **Copy link** giữ link gốc.

✅ Hết lỗi `Unsafe attempt to load URL`. ✅ Token không xuống browser.

---

## PHASE 2 — Performance Dashboard/Documents

### Cache server-side: `lib/dms/documentsCache.ts`
- **TTL 60s → 5 phút.** In-flight dedupe (nhiều request song song → 1 Graph fetch).
- `source: 'cache' | 'inflight' | 'graph'` trả về cho route log benchmark.
- Logs: `[CACHE] documents hit|miss|reuse-inflight|refresh done …ms|invalidated`.
- `invalidateDocumentsCache(reason?)` — **TODO** gọi từ route mutation khi mở write
  (upload/edit/delete/normalize — hiện read-only chưa có).

### `/api/documents`
- Dùng `getCachedDocuments()` (không fetch Graph nếu cache còn hạn).
- Query (in-memory, không gọi lại Graph): `?q=` (keyword đa field), `?nhomTaiLieu=`,
  `?page=&pageSize=` (mặc định 50, max 500), `?forceRefresh=1`.
- **Backward-compatible:** KHÔNG có `page/pageSize` → trả full docs như cũ → **không phá** facets/search client hiện tại.
- Log: `[PERF] api-documents-finish <ms> source=cache|graph docs=<total>`.

### `/api/dashboard`
- Dùng chung `getCachedDocuments()`. Trả **summary** (không trả 689 docs):
  `totals{total,active,expired,needsReview,missingSource,hasSource}`, `kpis`,
  `recentDocuments`(≤10), `expiringDocuments`(≤10), `storageStats`, `storageFolders`.
- Log: `[PERF] api-dashboard <ms> source=cache|graph docs=<n>`.

### Client (giữ nguyên UI)
- `ApiDmsService` đã có dedupe + cache client-side; home gọi 1× `/api/documents` + 1× `/api/dashboard`,
  **cả hai share cache server** → cold = **1 Graph fetch**, warm = **0 Graph fetch**.
- Home vẫn cần full docs cho **đếm facet ở Hero** (quick-filter counts) → giữ `/api/documents`.
  Bỏ hẳn `/api/documents` khỏi home cần UI Rebuild (Phase 7) — ngoài phạm vi “không đổi UI”.

---

## Benchmark (đo trên production sau deploy + đăng nhập)
| | Trước | Sau (kỳ vọng) |
|---|---|---|
| api-documents (cold) | ~17.8s | ~10–18s `source=graph` (1 lần / 5 phút) |
| api-documents (warm) | ~17.8s mỗi lần | **<1s `source=cache`** |
| api-dashboard (warm) | ~17.8s | **<1s `source=cache`** |
| Graph fetch / đợt | nhiều | **≤1** (dedupe + cache dùng chung) |

Cách xác nhận warm: reload lần 2 trong 5 phút → `pm2 logs vanban` thấy `[CACHE] documents hit`
và `[PERF] api-dashboard <ms> source=cache`.

## Files thay đổi
- **Mới:** `app/api/files/pdf-preview/route.ts`, `docs/PDF_PREVIEW_AND_PERF_FIX.md`
- **Sửa:** `dms/components/DocumentDetailDrawer.tsx`, `lib/dms/documentsCache.ts`,
  `app/api/documents/route.ts`, `app/api/dashboard/route.ts`

## TODO còn lại
- Gọi `invalidateDocumentsCache(...)` trong các route mutation khi mở write (đã ghi TODO trong cache).
- Áp dụng pagination thật vào UI list (689 items) — thuộc UI Rebuild.
- PostgreSQL cache/delta để giảm cold start (Phase 4 roadmap) nếu 16–18s cold vẫn phiền.
- Cân nhắc PM2 **fork mode** (không cluster) để in-memory cache dùng chung 1 process; nếu chạy cluster nhiều instance, cache không chia sẻ → cần cache ngoài (Redis) sau này.
