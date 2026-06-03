# PERFORMANCE AUDIT — DMS Portal (Next.js + Graph)

> **Phase:** 1 — Performance Audit. Chỉ đo & phân tích; **không** đổi nghiệp vụ. Đã thêm `[PERF]`/`[MAP]` instrumentation (read-only logging).
> **Bối cảnh:** DMS Library ~ rawItemCount 1342 · fileItemCount 1312 · documents 696. Dashboard load chậm.

---

## 1. Luồng load trang chủ `/` hiện tại (đọc từ code)

```
GET /                                   (Next server component → PreviewClient)
  └─ GET /api/auth/session              (NextAuth — useSession, mỗi lần mount)
  └─ <DmsPortal dmsService={ApiDmsService}/>  (dynamic, ssr:false)
        └─ React.useEffect (initial load) — dms/components/DmsPortal.tsx:102
             Promise.all([
               getAllDocuments(),        ─┐
               getRecentDocuments(),      │  TẤT CẢ đều gọi getAllDocuments()
               getExpiringDocuments(),    │  bên trong (ApiDmsService)
               getUnitStats(),            │
               getKpis(),                ─┘
             ])
             + getMetadataChoices()       (KHÔNG fetch — trả FALLBACK_METADATA_CHOICES)
             + getStorageFolders()        (gọi getAllDocuments())
```

### 1.1 API nào được gọi
| API | Gọi Graph? | Khi nào |
|---|---|---|
| `GET /api/auth/session` | Không | useSession mỗi lần mount |
| `GET /api/documents` | **Có** | Mỗi `getAllDocuments()` chưa có cache |
| (không có `/api/dashboard`) | — | Dashboard tính từ `/api/documents` |

### 1.2 API gọi Graph
Chỉ `GET /api/documents`:
`getGraphAccessToken()` (session) → `resolveSiteId()` → `resolveListId()` → phân trang `GET /sites/{site}/lists/{list}/items?$expand=fields,driveItem&$top=200` (≤2000, ~7 trang cho 1342 item) → filter folder → `mapSharePointItemToDocument` → `pairDocuments`.

### 1.3 Có gọi getAllDocuments()/`/api/documents` để dựng dashboard không?
**CÓ.** Dashboard (KPI, recent, expiring, unit-stats, storage) đều suy ra từ **toàn bộ** documents:
`ApiDmsService.getKpis/getRecentDocuments/getExpiringDocuments/getUnitStats/getStorageFolders` → `getAllDocuments()` → `/api/documents`.

### 1.4 Fetch toàn bộ documents rồi tính KPI client-side?
**CÓ.** `/api/documents` trả nguyên 696 documents về client; `lib/dms/derive.computeKpis()` tính KPI **client-side** (`ApiDmsService.getKpis`). Toàn bộ payload 696 docs (~vài trăm KB JSON) được ship về browser chỉ để hiển thị vài con số tổng.

### 1.5 🔴 Gọi Graph nhiều lần cho cùng dữ liệu? — CÓ (bug chính)
`ApiDmsService.getAllDocuments()` chỉ set cache **sau** `await _fetchAll()`:
```ts
if (this._cache) return this._cache;
this._cache = await this._fetchAll();   // <- 6 caller chạy song song đều thấy _cache=undefined
```
`Promise.all` bắn 5 method + `getStorageFolders` **đồng thời** → cả **6** cùng thấy `_cache` rỗng → **6 lần `/api/documents` song song** → mỗi lần phân trang đầy đủ Graph (~7 trang) ⇒ **~6×7 ≈ 42 lượt gọi Graph cho 1 lần load dashboard**, tất cả trả về **cùng dữ liệu**.

Instrumentation `[PERF] api-documents fetch #N start/end` sẽ in ra **#1..#6** trong 1 lần load → bằng chứng trực tiếp.

---

## 2. Instrumentation đã thêm (`[PERF]` / `[MAP]`)

| Label | Vị trí | Đo gì |
|---|---|---|
| `dashboard-start` | `app/api/documents/route.ts` đầu request | mốc 0 |
| `resolve-site` | sau `resolveSiteId()` | ms resolve site (cache → ~0 lần 2) |
| `resolve-list` | sau `resolveListId()` | ms resolve list |
| `graph-fetch (N pages, M items)` | sau vòng phân trang | tổng ms tải items + số trang |
| `map-documents` | sau map + pair | ms map + pairing |
| `dashboard-end (api total)` | cuối request | tổng ms server |
| `[MAP] raw=.. file=.. documents=.. ...` | sau pairing | breakdown mapping (Phase 3) |
| `api-documents fetch #N start/end` | `services/ApiDmsService._fetchAll` | số lần fetch + round-trip client |
| `calculate-kpis` | `services/ApiDmsService.getKpis` | ms tính KPI client-side |

> `dashboard-start`/`dashboard-end` tổng thể (browser) đo chính xác nhất bằng **DevTools → Network/Performance** (từ lúc mở `/` đến lúc dashboard render). Các label server-side ở trên là phần Graph (thường là phần lớn thời gian).

### Cách lấy số liệu thật
```
cd next-preview && npm run dev
# Đăng nhập Microsoft, mở "/" và xem terminal (server [PERF]/[MAP]) + Console trình duyệt ([PERF] client)
# Hoặc gọi trực tiếp (sau khi login) để xem timing + breakdown:
#   http://localhost:3000/api/documents?debug=1   → { debug: { pages, stats, timingMs } }
```

### Bảng đo (điền sau khi chạy)
| Mốc | Lần 1 (cold) | Lần 2 (warm) | Ghi chú |
|---|---|---|---|
| resolve-site | | | cache module-scope sau lần đầu |
| resolve-list | | | |
| graph-fetch | | | ~7 trang × latency |
| map-documents | | | 1312 → 696 |
| calculate-kpis (client) | | | trên 696 docs, dự kiến < 5ms |
| số lần `api-documents fetch #N` | | | **kỳ vọng hiện tại = 6** |
| dashboard tổng (DevTools) | | | |

---

## 3. Nguyên nhân chậm (xếp theo tác động)

| # | Nguyên nhân | Tác động | Hướng xử lý (thiết kế ở Phase 2) |
|---|---|---|---|
| P1 | **6× fetch `/api/documents` song song** (cache race) | 🔴 Rất cao — ×6 tải Graph | In-flight promise dedupe trong `getAllDocuments()` (1 promise dùng chung). |
| P2 | **Dashboard fetch toàn bộ 696 docs + tính KPI client** | 🔴 Cao — payload lớn, không cần | `GET /api/dashboard` chỉ trả aggregate (Phase 2). |
| P3 | `$expand=fields,driveItem` nặng (expand driveItem mỗi item) | 🟠 TB | Dashboard chỉ cần count → `$select` tối thiểu hoặc đếm server-side; list view mới cần driveItem. |
| P4 | **Phân trang tuần tự** 7 trang × latency (nextLink) | 🟠 TB | Cache server (TTL ngắn) dùng chung; Phase 4: PostgreSQL cache + delta. |
| P5 | Không có lớp cache server | 🟠 TB | Mỗi request lặp lại toàn bộ; cần cache TTL hoặc dedupe in-flight server-side. |
| P6 | `getMetadataChoices` OK (trả fallback, không fetch) | 🟢 Thấp | — |

> **Ước tính:** Sửa P1 (6×→1×) + P2 (không ship 696 docs cho dashboard) là 2 đòn bẩy lớn nhất, dự kiến giảm phần lớn thời gian load trang chủ. Đo lại bằng instrumentation để xác nhận.

---

## 4. Khuyến nghị (thực thi ở các phase sau — KHÔNG làm trong phase audit)
1. **In-flight dedupe** `ApiDmsService.getAllDocuments()` (1–3 dòng) → diệt P1.
2. **`GET /api/dashboard`** trả aggregate → trang chủ không fetch full docs (P2). Xem `DASHBOARD_API_DESIGN.md`.
3. **Cache server** site/list (đã có) + items (TTL) hoặc PostgreSQL (Phase 4) (P4/P5).
4. Tách `$select` cho dashboard vs list (P3).

> Phase này chỉ instrument + audit. Việc sửa P1/P2 nằm ở Phase 2 (design) và phase implementation sau.
