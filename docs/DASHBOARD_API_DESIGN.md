# DASHBOARD API DESIGN — `GET /api/dashboard`

> **Phase:** 2 — Design. Mục tiêu: trang chủ **không** fetch toàn bộ documents nữa; chỉ gọi 1 endpoint aggregate.
> **Trạng thái:** THIẾT KẾ (chưa implement trong phase này). Không đổi nghiệp vụ/Metadata V2.

---

## 1. Vấn đề (từ PERFORMANCE_AUDIT.md)
- Trang chủ kéo **toàn bộ 696 documents** về client (qua 6× `/api/documents`) rồi tự tính KPI.
- Lãng phí băng thông + Graph quota + thời gian.

## 2. Mục tiêu thiết kế
- Trang chủ **chỉ** gọi `GET /api/dashboard`.
- **Không** gọi `/api/documents` để dựng dashboard.
- **Không** ship danh sách đầy đủ về client cho dashboard.
- Giữ nguyên định nghĩa nghiệp vụ (KPI/recent/expiring/storage) — tái dùng `lib/dms/derive.ts`.

## 3. Contract

```
GET /api/dashboard
Auth: required (session). 401 nếu chưa đăng nhập.
```

### Response
```jsonc
{
  "ok": true,
  "totalDocuments": 696,
  "activeDocuments": 0,
  "expiredDocuments": 0,
  "needsReview": 0,
  "missingSource": 0,
  "recentDocuments": [ /* IDocument[], tối đa 10 */ ],
  "expiringDocuments": [ /* IDocument[], tối đa 10 */ ],
  "storageStats": [ { "code": "18", "name": "[18] CĐ - Phòng Cơ điện", "count": 12, "color": "#4F46E5" } ],
  "kpis": [ /* IKpiStat[] — tùy chọn, giữ tương thích KpiCards hiện tại */ ],
  "generatedAt": "2026-06-03T12:00:00Z",
  "cacheTtlSeconds": 60
}
```

> Chỉ trả `recentDocuments`/`expiringDocuments` (≤10 mỗi loại) + số đếm + storageStats — KHÔNG trả 696 docs.

### Lỗi
```jsonc
{ "ok": false, "error": "Chưa đăng nhập..." }   // 401
{ "ok": false, "error": "...", "graph": { "status": 429, "body": "..." } } // Graph lỗi
```

## 4. Triển khai dự kiến (server-side)

```
app/api/dashboard/route.ts
  token = getGraphAccessToken()
  docs  = getCachedDocuments(token)         // dùng chung cache với /api/documents
  return {
    totalDocuments:    docs.filter(isNotExpired).length,
    activeDocuments:   ... (DocStatus.Active),
    expiredDocuments:  docs.filter(isExpired).length,
    needsReview:       docs.filter(needsStandardization).length,
    missingSource:     ...,
    recentDocuments:   computeRecent(docs),
    expiringDocuments: computeExpiring(docs),
    storageStats:      computeUnitStats(docs),
    kpis:              computeKpis(docs),     // tái dùng derive.ts (đã có)
  }
```

- **Tái dùng** `lib/dms/derive.ts` (đã port logic SharePointDmsService) — không viết lại nghiệp vụ.
- Tính **server-side**, chỉ trả aggregate → payload nhỏ.

### Lớp cache dùng chung (then chốt để nhanh)
```
lib/dms/documentsCache.ts  (server, module-scope)
  getCachedDocuments(token): Promise<IDocument[]>
    - in-flight promise dedupe (1 fetch dù nhiều request song song)
    - TTL ngắn (vd 60s) → /api/dashboard và /api/documents dùng chung 1 lần fetch Graph
```
→ Diệt luôn P1 (concurrent duplicate) và P4/P5 (no cache) từ audit.

## 5. Tích hợp client (khi implement)
- `ApiDmsService.getDashboard()` (mới) hoặc `DashboardApiService` gọi `/api/dashboard`.
- `DmsPortal` initial load (graph mode): thay `Promise.all([...5 calls])` bằng **1** `getDashboard()`.
  - **Lưu ý:** để KHÔNG đổi UI/nghiệp vụ, có thể giữ `DmsPortal` nguyên và cho `ApiDmsService` map kết quả `/api/dashboard` vào các method hiện có (getKpis/getRecent/...) + **in-flight dedupe**, sao cho 5 method chỉ dẫn tới 1 request. Lựa chọn cuối chốt ở phase implementation.
- List view / search vẫn dùng `/api/documents` (cần full docs) — tách rõ "dashboard" vs "browse".

## 6. Ranh giới
- KHÔNG đổi shape `IDocument`, KHÔNG đổi định nghĩa KPI.
- KHÔNG tạo cột SharePoint, KHÔNG ghi.
- Endpoint read-only.

## 7. Tiêu chí hoàn thành (cho phase implementation sau)
- [ ] `/api/dashboard` trả đúng aggregate, ≤10 recent/expiring.
- [ ] Trang chủ chỉ phát **1** request dữ liệu (xác nhận bằng `[PERF] api-documents fetch #N` = 1, hoặc `[PERF] api-dashboard`).
- [ ] Không còn ship 696 docs cho dashboard.
- [ ] KPI/recent/expiring/storage khớp số liệu cũ.
