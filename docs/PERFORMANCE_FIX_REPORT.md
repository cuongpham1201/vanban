# PERFORMANCE FIX REPORT — Homepage load

> **Mục tiêu:** sửa homepage load > 1 phút. Chỉ tối ưu hiệu năng — KHÔNG đổi nghiệp vụ/UI/schema/Metadata V2. Không commit.
> **Phạm vi sửa (P0–P3 đã implement, P4 xác minh):** in-flight dedupe + server cache 60s + `GET /api/dashboard` + đo `[PERF]`.

---

## 1. Nguyên nhân (Before) — theo PERFORMANCE_AUDIT.md
- `DmsPortal` initial load: `Promise.all([getAllDocuments, getRecentDocuments, getExpiringDocuments, getUnitStats, getKpis])` + `getStorageFolders` + `getMetadataChoices`.
- `ApiDmsService.getAllDocuments()` set cache **sau** `await` → 6 caller đồng thời đều miss cache → **6× `/api/documents` song song**.
- Mỗi `/api/documents` phân trang Graph đầy đủ (~7 trang × `$expand=fields,driveItem`) ⇒ **~6×7 ≈ 42 lượt gọi Graph** cho 1 lần load + nguy cơ throttling 429 → **> 60s**.
- KPI tính client-side sau khi kéo full 696 docs. Không có cache → mỗi lần load lặp lại toàn bộ.

## 2. Đã sửa (After)

| P | Thay đổi | File |
|---|---|---|
| **P0** | **In-flight promise dedupe** ở client cho cả `/api/documents` và `/api/dashboard`: caller đồng thời dùng CHUNG 1 promise → tối đa 1 fetch mỗi loại. | `services/ApiDmsService.ts` |
| **P1** | `[PERF]` logs: `api-documents-request / -hit-cache / -hit-inflight / -fetch / -finish` (+ client `getAllDocuments`/`getDashboard`, `api-dashboard`). | `lib/dms/documentsCache.ts`, `ApiDmsService.ts`, `api/dashboard/route.ts` |
| **P2** | **Cache documents server-side, TTL 60s + in-flight dedupe**, dùng CHUNG bởi `/api/documents` và `/api/dashboard`. Trong 60s KHÔNG gọi Graph lại. | `lib/dms/documentsCache.ts` |
| **P3** | **`GET /api/dashboard`** trả `{ totals, kpis, recentDocuments, expiringDocuments, storageStats, storageFolders }`. Dashboard methods (`getKpis/getRecent/getExpiring/getUnitStats/getStorageFolders`) gọi endpoint này — KHÔNG kéo full docs để dựng dashboard. | `app/api/dashboard/route.ts`, `ApiDmsService.ts` |
| **P4** | Shell/Sidebar/Header/Hero **đã render ngay** (ngoài cờ `loading`, `DmsPortal.tsx:663–689`); chỉ phần body dashboard chờ. Giữ nguyên (không rebuild UI). | (không đổi) |

### Kiến trúc sau khi sửa
```
Homepage initial load:
  getAllDocuments()  ─► /api/documents  ─┐ (client dedupe: 1 call dù gọi nhiều lần)
  getKpis/Recent/Expiring/UnitStats/StorageFolders ─► /api/dashboard ─┐ (client dedupe: 1 call cho cả 5)
                                                                       │
                          cả 2 endpoint → getCachedDocuments() (server) ┘
                              ├─ cache 60s còn hạn?  → trả ngay (0 Graph)
                              ├─ đang fetch?          → await chung (0 Graph)
                              └─ else                 → 1 lần fetch Graph (7 trang) → cache
```
→ **Mỗi đợt refresh: tối đa 1 Graph fetch documents** (cold). Warm (trong 60s): **0 Graph fetch**.

> Vì sao homepage vẫn gọi `/api/documents`: Hero quick-filter counts + `facetBaseDocs`/`groupCounts` cần **toàn bộ** docs. Đây là yêu cầu của UI hiện tại; dashboard aggregate (KPI/recent/expiring/storage) đã chuyển sang `/api/dashboard`. Cả 2 share cache nên vẫn chỉ 1 Graph fetch. Loại bỏ hẳn `/api/documents` khỏi homepage thuộc UI Rebuild (Phase 7).

## 3. Before vs After

| Chỉ số | Before | After (thiết kế) |
|---|---|---|
| Số `/api/documents` request / load | 6 (song song) | 1 (client dedupe) |
| Số `/api/dashboard` request / load | 0 (chưa có) | 1 (client dedupe cho 5 method) |
| **Graph fetch documents / load (cold)** | ~6 logic × 7 trang ≈ **42 lượt** | **1 logic × 7 trang = 7 lượt page (1 fetch)** |
| **Graph fetch / load (warm < 60s)** | ~42 (không cache) | **0 (cache hit)** |
| KPI | client, sau khi kéo full 6× | server `/api/dashboard` (1×, từ cache) |
| Cache | không | server 60s TTL + in-flight |

## 4. Số đo thực tế (điền sau khi đăng nhập & chạy)

> Claude không đăng nhập Microsoft được (không nhập credential). Chạy local + đăng nhập để lấy số thật:
> ```
> cd next-preview && npm run dev   # đăng nhập, mở "/" 2 lần (cold rồi warm trong 60s)
> # Server terminal: [PERF] api-documents-request/-hit-cache/-hit-inflight/-fetch/-finish, [PERF] api-dashboard, [MAP]
> # Browser Console: [PERF] client getAllDocuments/getDashboard (cache|reuse-inflight|fetch)
> # Hit rate + buildMs:  GET /api/documents?debug=1 → debug.cacheMetrics, debug.buildMs
> ```

| Mốc | Cold | Warm (<60s) |
|---|---|---|
| `[PERF] api-documents-fetch → -finish` (buildMs server, Graph) | | (không xuất hiện — hit-cache) |
| `[PERF] api-dashboard` | | |
| Số lần `api-documents-fetch` / load (kỳ vọng) | **1** | **0** (hit-cache) |
| `[PERF] client getAllDocuments` | fetch | cache/reuse-inflight |
| `[PERF] client getDashboard` | fetch | cache/reuse-inflight |
| **Homepage tổng (DevTools)** | mục tiêu **< 5s** | mục tiêu **< 1s** |
| cacheMetrics.hitRate (`?debug=1`) | | tăng dần (warm → ~1.0) |

## 5. Tiêu chí thành công — đối chiếu
| Tiêu chí | Trạng thái |
|---|---|
| Cold load homepage < 5s | ⏳ Cần đo (kỳ vọng đạt: 42→7 page-calls, hết 6× song song & throttling) |
| Warm load homepage < 1s | ⏳ Cần đo (kỳ vọng đạt: cache 60s → 0 Graph) |
| ≤ 1 Graph fetch documents / đợt refresh | ✅ Đảm bảo bằng thiết kế (client dedupe + server cache+in-flight dùng chung) |
| Không đổi nghiệp vụ | ✅ (tái dùng `lib/dms/derive`, định nghĩa KPI/recent/expiring không đổi) |
| Không đổi UI | ✅ (không sửa component UI; chỉ data layer + thêm API route) |
| Không commit | ✅ |

## 6. Files thay đổi (uncommitted)
- **Mới:** `lib/dms/documentsCache.ts`, `app/api/dashboard/route.ts`.
- **Sửa:** `services/ApiDmsService.ts` (dedupe + wire dashboard), `app/api/documents/route.ts` (dùng cache + debug metrics).
- **Build:** ✅ `npm run build` Compiled successfully; routes: `/api/dashboard`, `/api/documents`, `/api/health/sharepoint`, `/api/auth/[...nextauth]`.
- **Verify (chưa login):** cả 3 endpoint trả 401 sạch (auth gate OK).

## 7. Ghi chú & giới hạn
- **Cache global toàn org** (không per-user): hợp lệ vì mọi user đăng nhập đều có Read trên DMS Library. Không dùng cho dữ liệu per-user.
- `$expand=fields,driveItem` vẫn nặng cho 1 fetch — nếu cold vẫn > 5s, bước tiếp theo (ngoài phase này): tách `$select` tối thiểu cho dashboard, hoặc PostgreSQL cache + delta (Phase 4 roadmap).
- Loại bỏ hoàn toàn `/api/documents` khỏi homepage cần UI Rebuild (Phase 7) vì Hero facet counts đang cần full docs.
