# SPFx → Ubuntu WebApp Migration Audit — DMS Portal (Văn bản điều hành)

> **Phase:** Audit only. Không refactor, không xóa code, không tạo feature, không đổi schema/metadata/DMS Library.
> **Nguồn:** `/web/vanban` (copy đầy đủ từ SPFx project `dms-portal`, **đã có `src/`**).
> **Ngày audit:** 2026-06-03 (cập nhật sau khi copy đủ source).
> **Site dữ liệu (giữ nguyên):** https://biahalong.sharepoint.com/sites/vanbandieuhanh — Library `DMS Library`.

---

## 1. Executive Summary

DMS Portal hiện là **1 SPFx client-side WebPart** (`dms-portal-client-side-solution` v1.0.40.0, package `dms-portal` v0.0.1) chạy trong trang SharePoint của site `vanbandieuhanh`. Mục tiêu: chuyển sang **Next.js webapp** trên **Ubuntu**, truy cập cùng dữ liệu qua **Microsoft Graph API** thay cho `SPHttpClient`, **không đổi** DMS Library / Metadata V2 / cấu trúc folder cấp lưu trữ / file PDF-DOCX.

**Kết luận chính — migration RẤT THUẬN LỢI, rủi ro thấp:**

1. **Đảo phụ thuộc sẵn (dependency inversion).** Toàn bộ UI chỉ phụ thuộc interface [`IDmsService`](../src/webparts/dmsPortal/services/IDmsService.ts) (16 method), nhận qua props — không component nào gọi SharePoint trực tiếp. `NOTES.md §2` mô tả rõ đây là thiết kế "drop-in": đổi service là xong, không sửa JSX/SCSS.
2. **UI đã chạy được ngoài SharePoint.** Project có sẵn **Vite local preview** ([`preview/main.tsx`](../preview/main.tsx) + [`vite.config.ts`](../vite.config.ts)) render đúng các component thật với `MockDmsService` trong trình duyệt thường, không cần tenant. ⇒ Lớp React UI đã được chứng minh là **portable**; Next.js chỉ cần thay shell + transport.
3. **Coupling SPFx cực kỳ cô lập — đúng 3 file** (xác nhận bằng `scripts/scan-spfx-coupling.mjs --root src`):
   - `DmsPortalWebPart.ts` — entry + PropertyPane → **REMOVE**.
   - `services/SharePointDmsService.ts` — transport `SPHttpClient` (10×) → **REFACTOR** (giữ business logic, đổi transport sang Graph ở backend).
   - `loc/en-us.js` — string SPFx kiểu AMD `define()` → **REMOVE/REFACTOR**.
   - (`Icons.tsx` dùng `@fluentui/react` — **portable**, không phải SPFx; chỉ là quyết định giữ/thay.)
4. **Business logic 100% thuần TS** (utils + service methods) → **KEEP**: PDF-first pairing, isExpired/isNotExpired, needsStandardization, KPI, search, replacement flow, metadata V2 mapping.

> Blocker "thiếu `src/`" ở bản audit trước **ĐÃ GIẢI QUYẾT** — `src/` (TS/TSX/SCSS), `package.json`, `tsconfig.json`, `gulpfile.js` đều đã có mặt.

---

## 2. Current Codebase Overview

### 2.1 `package.json` (đã có — dependency thật)

```jsonc
"engines": { "node": ">=22.14.0 < 23.0.0" },         // SPFx 1.21 ràng buộc Node 22.14.x
"scripts": { "build": "gulp bundle", "clean": "gulp clean", "test": "gulp test" },
"dependencies": {
  "@fluentui/react": "^8.106.4",                      // chỉ Icons.tsx dùng (portable)
  "@microsoft/sp-component-base": "1.21.1",
  "@microsoft/sp-core-library": "1.21.1",
  "@microsoft/sp-lodash-subset": "1.21.1",
  "@microsoft/sp-office-ui-fabric-core": "1.21.1",
  "@microsoft/sp-property-pane": "1.21.1",
  "@microsoft/sp-webpart-base": "1.21.1",
  "react": "17.0.1", "react-dom": "17.0.1",           // ⚠️ React 17 — Next cần 18/19
  "tslib": "2.3.1"
},
"devDependencies": {
  "@microsoft/sp-build-web": "1.21.1", "gulp": "4.0.2",          // build SPFx → bỏ
  "@microsoft/rush-stack-compiler-5.3", "@microsoft/eslint-config-spfx", ...
  "typescript": "~5.3.3", "sass": "^1.100.0",
  "vite": "^5.4.21", "@vitejs/plugin-react": "^4.7.0"           // local preview (không thuộc bundle SPFx)
}
```

### 2.2 Cây thư mục (đầy đủ)

```
/web/vanban
  src/                              # ✅ SOURCE GỐC (TS/TSX/SCSS)
    index.ts
    webparts/dmsPortal/
      DmsPortalWebPart.ts           # SPFx entry + PropertyPane             → REMOVE
      DmsPortalWebPart.manifest.json
      version.ts                                                            → REMOVE
      loc/{en-us.js, mystrings.d.ts}# AMD define() strings                  → REMOVE/REFACTOR
      assets/                       # logo + welcome png                    → KEEP (→ public/)
      models/IDocument.ts           # domain model + enums V2                → KEEP
      services/
        IDmsService.ts              # contract (16 method)                  → KEEP
        MockDmsService.ts           # in-memory impl (dev/preview)          → KEEP
        SharePointDmsService.ts     # SPHttpClient transport                → REFACTOR
      utils/                        # standardization, documentPair, documentTypeGroups,
                                    # metadataChoices, format, exportCsv    → KEEP
      mock/mockData.ts              # dữ liệu mock dashboard                → KEEP (dev)
      components/                   # 21 .tsx + DmsPortal.module.scss(.ts)  → KEEP / REFACTOR
  preview/main.tsx                  # ✅ Vite entry render UI với MockDmsService → KEEP (reference)
  vite.config.ts, index.html        # ✅ Vite local preview harness         → KEEP (reference) / sau bỏ
  dev-mock-data/                    # 934 documents thật (đã chuẩn hóa)     → KEEP (dev/seed)
  sharepoint/                       # solution .sppkg + Bulk_Upload CSV     → REFERENCE (CSV) / REMOVE (solution)
    Bulk_Upload_Ready.csv  Bulk_Upload_Ready_V2.csv  Retry_Failed.csv      → KEEP (reference schema V2)
    solution/...                    # SPFx package debug                    → REMOVE
  teams/                            # Teams app manifest + zip              → REMOVE
  release/                          # build artifacts + component-dep-audit → REMOVE (giữ dep-audit tham khảo)
  config/                           # SPFx build config                     → REMOVE
  dist/, lib/, temp/                # build output / temp                   → REMOVE (artifact)
  img/                              # ảnh thương hiệu                       → KEEP (→ public/)
  docs/                             # tài liệu (audit này)
  scripts/                          # scan-spfx-coupling.mjs
  gulpfile.js, build-sppkg.cmd      # SPFx/gulp build                       → REMOVE
  *.log, diag.js (rỗng)             # log/scratch                           → REMOVE
  README.md, NOTES.md, DEPLOY.md    # tài liệu dự án                        → KEEP (reference)
  .eslintrc.js .yo-rc.json .npmignore .gitignore                           → REMOVE/REPLACE (cấu hình SPFx/yeoman)
```

### 2.3 Mô hình runtime hiện tại

```
SharePoint Page → DmsPortalWebPart (BaseClientSideWebPart)
                     │ this.context (auth + SPHttpClient), PropertyPane: dmsSiteUrl, useMockData
                     ▼
                 <DmsPortal dmsService hasTeamsContext userDisplayName/>   (DmsPortal.tsx, 774 dòng, SPA 1-component)
                     ▼
              IDmsService ←─ MockDmsService (dev/preview)
                          ←─ SharePointDmsService (SPHttpClient → /_api/web/lists...)

Song song (ngoài SP):  Vite → preview/main.tsx → <DmsPortal dmsService={new MockDmsService()}/>
```

`DmsPortal.tsx` là **SPA 1-component**: `viewMode` state (`home | search | upload | review | list`) + `activeNav` + `contextFilter` + filter client-side. **Không có routing** → đây là điểm REFACTOR lớn nhất khi lên App Router.

---

## 3. File Classification (KEEP / REFACTOR / REMOVE / UNKNOWN)

### 3.1 Models & Services

| File | Status | Lý do |
|---|---|---|
| `models/IDocument.ts` | **KEEP** | Domain model V2 + enums `DocStatus`/`SecurityLevel` + `IMetadataChoices`, `IStorageFolder`, `IUnitStat`, `IKpiStat`, `IDocSearchFilter`. Thuần TS. → `types/dms.ts`. |
| `services/IDmsService.ts` | **KEEP** | Contract 16 method — trục xoay migration. (Chỉ nhắc `SPHttpClient` trong comment, không import.) |
| `services/MockDmsService.ts` | **KEEP** | Impl in-memory, đang dùng cho Vite preview → dùng tiếp cho dev FE Phase 2. |
| `services/SharePointDmsService.ts` | **REFACTOR** | Business method (map/pair/kpi/search/rule) GIỮ; transport `this.context.spHttpClient` (SP REST) → fetch backend → Graph. Tách `lib/dms/` (rule) + `lib/graph/` + `app/api/` (mạng). |

### 3.2 Utils — business logic (toàn bộ KEEP)

| File | Status | Lý do |
|---|---|---|
| `utils/standardization.ts` | **KEEP** | `isExpired/isNotExpired/isLowConfidence/isMissingSource/isMissingKeyField/needsStandardization/isRecentlyIssued`. Single source of truth. |
| `utils/documentPair.ts` | **KEEP** | PDF-first pairing. Thuần. |
| `utils/documentTypeGroups.ts` | **KEEP** | 7 nhóm quick-filter + `matchesGroup`. Thuần. |
| `utils/metadataChoices.ts` | **KEEP** | `FALLBACK_METADATA_CHOICES` + `choiceOr`. Thuần. |
| `utils/format.ts` | **KEEP** | `formatDate/formatNumber/daysUntil/remainingLabel`. Thuần. |
| `utils/exportCsv.ts` | **KEEP** ⚠️ | Logic thuần nhưng `downloadCsv` dùng DOM (`Blob`/`createElement`/`URL`) → chỉ chạy client (`'use client'`). Không phải SPFx coupling. |

### 3.3 Components

| File | Dòng (.js) | Status | Lý do |
|---|---|---|---|
| `DmsPortal.tsx` | 774 | **REFACTOR** | SPA root: view-state + filter client + `Promise.all` load. Tách thành App Router pages + shared state + API client. Nặng nhất. |
| `DocumentDetailDrawer.tsx` | 530 | **REFACTOR** | UI + gọi `dmsService` (update/upload/link/delete). Giữ UI; call → API client. |
| `UploadDocumentView.tsx` | 428 | **REFACTOR** | File→ArrayBuffer→`uploadDocument`. Web: `<input file>`+`FormData`→`/api/documents/upload`. Validate giữ. |
| `ReviewView.tsx` | 414 | **REFACTOR** | "Cần chuẩn hóa" + bulk edit + export CSV. `needsStandardization` giữ; call → API. |
| `DocumentListView.tsx` | 258 | **REFACTOR** | Bảng + sort/select. Chủ yếu presentational; đổi nguồn data. |
| `AdvancedSearch.tsx` | 211 | **REFACTOR** | Panel filter. Gần KEEP; đổi nhận choices + submit filter. |
| `BulkEditModal.tsx` | 119 | **REFACTOR** | Modal → `updateMetadataMany`. UI giữ. |
| `ReplacementDocumentPicker.tsx` | 68 | **REFACTOR** | Picker replacement. UI giữ; search → API. |
| `Icons.tsx` | 73 | **REFACTOR** | Dùng `@fluentui/react/lib/Icon` (Fabric MDL2 font) + `initializeIcons` cho ~35 icon. **Portable, không SPFx.** Cân nhắc thay `lucide-react`/SVG để bundle nhẹ (NOTES.md §4 nói "inline SVG" — đã lỗi thời, code hiện dùng Fluent). |
| `ExpiringDocsCard / Sidebar / Hero / RecentDocsCard / DisclaimerBanner / SkeletonLoader / KpiCards / ByUnitCard / ConfirmDialog / PortalHeader` | 12–58 | **KEEP** | Presentational thuần (Sidebar chỉ đổi nav→router). |
| `IDmsPortalProps.ts` | — | **REFACTOR** | Bỏ `dmsService` (→ hooks/API client), bỏ `hasTeamsContext`, `userDisplayName` ← session Auth.js. |
| `DmsPortal.module.scss` (+`.ts`) | 274 | **REFACTOR** | SCSS module. Next hỗ trợ CSS Module (giữ tạm) → port Tailwind dần. |

### 3.4 REMOVE (SPFx / artifact)

| File / Thư mục | Lý do |
|---|---|
| `DmsPortalWebPart.ts` + `.manifest.json` | Entry SPFx (`BaseClientSideWebPart`, `getPropertyPaneConfiguration`, `ReactDom.render`). Logic cần bê đi: chọn service theo `useMockData`, default `dmsSiteUrl`, `userDisplayName`. |
| `loc/en-us.js`, `loc/mystrings.d.ts`, `version.ts` | Resource AMD + `Version.parse` của SPFx. |
| `config/**`, `gulpfile.js`, `build-sppkg.cmd`, `.yo-rc.json`, `.eslintrc.js`, `.npmignore` | Build pipeline + cấu hình SPFx/yeoman. |
| `dist/**`, `lib/**`, `temp/**`, `release/**`, `*.log`, `diag.js` (rỗng) | Build output / artifact / scratch. |
| `sharepoint/solution/**`, `teams/**` | Gói .sppkg + Teams app (artifact đóng gói SPFx). |

### 3.5 Reference (giữ để tham khảo, không phải code chạy)

| Mục | Giá trị tham khảo |
|---|---|
| `preview/main.tsx`, `vite.config.ts`, `index.html` | **Khuôn mẫu render UI standalone** — Next.js bootstrap có thể bê y nguyên cách mount `<DmsPortal dmsService={...}/>`. |
| `sharepoint/Bulk_Upload_Ready_V2.csv` | **Xác nhận schema Metadata V2 + cột link thực dùng**: `SoVanBan, NamBanHanh, NgayBanHanh, NgayHetHieuLuc, NguoiKy, TrangThai, MucDoBaoMat, TrichYeu, VanBanThayThe, VanBanLienQuan, Tags, NhomTaiLieu, LoaiVanBanPhapLy, LoaiTaiLieu, ChuDeNghiepVu, DonViPhatHanh, DonViSoHuu, NguonMetadata, MetadataConfidence, HasEditableSource, EditableSourceUrl, PrimaryPdfUrl, NeedReview, DuplicateRole, ResolveNote`. |
| `dev-mock-data/` (934 docs + types) | Seed PostgreSQL (Phase 4) / dev UI. |
| `NOTES.md` | Mô tả kiến trúc drop-in + mapping model↔cột (lưu ý: nhắc library `vbdh-draft` — **code thật dùng `DMS Library`**, NOTES là Phase 1 cũ). |
| `DEPLOY.md` | Quy trình deploy SPFx + tham số: App Catalog, ClientId PnP Entra app `4b9e993c-…`, Solution Id `37541284-…`. Dùng cho Phase 5 (retire). |
| `release/component-dependency-audit/dms-portal.json` | Liệt kê đủ dependency transitive SPFx (sp-loader, sp-http, fluentui bundles…) — minh chứng cho §4. |

### 3.6 UNKNOWN — cần xác nhận owner

| Mục | Câu hỏi |
|---|---|
| `nguoiKy` (Person field) | `_mapItem` set `nguoiKy: ''` (chưa fill). Graph có map `NguoiKy` không? |
| Cột V2/link trên production | CSV V2 cho thấy cột tồn tại; code vẫn fallback 3 tầng. Xác nhận library đã có đủ cột để chọn $select Graph cố định. |
| Đa-site / đa-library | WebPart cho cấu hình `dmsSiteUrl` khác. Webapp cố định `vanbandieuhanh`/`DMS Library` hay đa-site? |
| Library title | Code: `'DMS Library'`. NOTES: `vbdh-draft`. Chốt tên chính thức. |

---

## 4. SPFx Dependency Inventory

### 4.1 SPFx — CẦN LOẠI BỎ (trực tiếp, từ `package.json`)

| Package | Version | Dùng ở | Thay bằng |
|---|---|---|---|
| `@microsoft/sp-core-library` | 1.21.1 | `DmsPortalWebPart` (`Version`) | Bỏ. |
| `@microsoft/sp-webpart-base` | 1.21.1 | `DmsPortalWebPart` (`BaseClientSideWebPart`) | Next.js page/layout. |
| `@microsoft/sp-property-pane` | 1.21.1 | `DmsPortalWebPart` (PropertyPane*) | Env var / trang Settings. |
| `@microsoft/sp-component-base` | 1.21.1 | nền SPFx | Bỏ. |
| `@microsoft/sp-lodash-subset` | 1.21.1 | nền SPFx | `lodash-es` nếu thực cần. |
| `@microsoft/sp-office-ui-fabric-core` | 1.21.1 | style fabric | Bỏ (Tailwind). |
| (transport) `@microsoft/sp-http` | (transitive) | `SharePointDmsService` (`SPHttpClient`) | `fetch` → Graph SDK. |
| Build: `@microsoft/sp-build-web`, `@microsoft/rush-stack-compiler-5.3`, `@microsoft/sp-module-interfaces`, `@microsoft/eslint-config-spfx`, `@microsoft/eslint-plugin-spfx`, `@rushstack/eslint-config`, `gulp` | 1.21.1 / … | gulpfile/config | `next build`, `tsc`, `eslint-config-next`. |

> `release/component-dependency-audit/dms-portal.json` liệt kê thêm hàng loạt bundle transitive (`@microsoft/sp-loader`, `sp-http-base`, `sp-page-context`, `@ms/office-ui-fabric-react-bundle`, …) — tất cả biến mất khi rời SPFx.

### 4.2 Dependency CÓ THỂ GIỮ

| Package | Version | Ghi chú |
|---|---|---|
| `react`, `react-dom` | 17.0.1 | **Nâng 18/19** cho Next (SPFx khóa 17). |
| `typescript` | ~5.3.3 | Giữ/nâng theo Next. |
| `tslib` | 2.3.1 | Next/tsc tự xử lý. |
| `@fluentui/react` | ^8.106.4 | Chỉ `Icons.tsx`. Chạy được trên Next nhưng nặng → khuyến nghị `lucide-react`. |
| `sass` | ^1.100.0 | Nếu giữ CSS Module SCSS tạm thời. |
| (`vite`, `@vitejs/plugin-react`) | 5 / 4 | Preview harness — Next thay bằng dev server riêng; có thể bỏ sau. |

### 4.3 Dependency ĐỀ XUẤT cho webapp mới

```
next  react@18/19  react-dom  typescript  tailwindcss
next-auth (Auth.js) + @azure/msal-node      # đăng nhập Entra ID + token Graph
@microsoft/microsoft-graph-client           # Graph SDK (hoặc fetch wrapper)
zod  react-hook-form                        # validate form upload/metadata
lucide-react                                # thay @fluentui/react icons (tùy chọn)
(Phase 4) pg / prisma | drizzle             # PostgreSQL cache/index
```

### 4.4 Coupling markers (output `scan-spfx-coupling.mjs --root src`, 37 file, đã bỏ comment)

```
  5  import @microsoft/sp-*        12  this.context
 10  SPHttpClient                   9  spHttpClient
  2  WebPartContext                 1  pageContext
  2  BaseClientSideWebPart          1  microsoftTeams sdk
  7  PropertyPane*                  1  AMD define()
  2  @fluentui/react

File có coupling (4):
  components/Icons.tsx              @fluentui/react×2                 (portable, không SPFx)
  DmsPortalWebPart.ts              sp-*×3, BaseClientSideWebPart×2, PropertyPane×6, this.context×3, pageContext×1, teams×1
  loc/en-us.js                     PropertyPane×1, AMD define()×1
  services/SharePointDmsService.ts sp-*×2, SPHttpClient×10, WebPartContext×2, this.context×9, spHttpClient×9
```

→ **100% coupling SharePoint nằm trong đúng 2 file** (`DmsPortalWebPart` entry + `SharePointDmsService` transport) + 1 file loc. Không component UI nào gọi SharePoint trực tiếp.

---

## 5. Reusable Business Logic (KEEP — chi tiết)

### 5.1 "Hết hiệu lực" (single source of truth — `standardization.ts`)
`isExpired(d)` = `trangThai === Hết hiệu lực` **HOẶC** `nhomTaiLieu === 'Hết hiệu lực'`. `isNotExpired = !isExpired` — nền MỌI list/thống kê mặc định.

### 5.2 "Cần chuẩn hóa"
`needsStandardization` = `isLowConfidence` (`metadataConfidence ∈ {Low, NeedsReview}`) **HOẶC** `isMissingSource` (không `editableSource`) **HOẶC** `isMissingKeyField` (thiếu `soVanBan`/`nhomTaiLieu`/`donViSoHuu`/`ngayBanHanh`).

### 5.3 "Mới ban hành"
`isRecentlyIssued(d, monthsBack=2)` — `ngayBanHanh` trong N tháng gần đây.

### 5.4 PDF-first pairing (`documentPair.ts` + `SharePointDmsService._pairDocuments`)
Group theo `folderPath :: normalizeBaseFileName`; PDF = primary, DOCX/XLSX cùng tên = `editableSource`; **DOCX standalone ẩn khỏi list**. Fallback: cột `HasEditableSource`/`EditableSourceUrl`.

### 5.5 KPI (`getKpis`) — 9 tile
total, byUnit, active, recent (2 tháng), expiringSoon (30 ngày), expired, needsReview, missingSource, hasSource — tính trên `visible = all.filter(isNotExpired)` (riêng `expired` trên all).

### 5.6 Search + filter client (`searchDocuments` + `DmsPortal.tsx`)
Loại expired mặc định; filter typeKey/soVanBan/loaiVanBan/donViCode/nhomTaiLieu/loaiTaiLieu/donViPhatHanh/nguoiKy/khoảng ngày + keyword full-text đa field.

### 5.7 Quick-filter 7 nhóm (`documentTypeGroups.ts`)
`matchesGroup` ưu tiên `NhomTaiLieu` (V2), fallback `LoaiVanBan` (V1).

### 5.8 Mapping SP item → IDocument (`_mapItem`) — giữ rule
`loaiVanBan = LoaiVanBanPhapLy ?? LoaiVanBan ?? 'Khác'`; `donViSoanThao = DonViSoHuu ?? DonViSoanThao`; `donViCode` = mã `[NN]` trong `DonViSoHuu`, fallback `DON_VI_TO_CODE`; `loaiVanBanKey` từ `LOAI_TO_KEY`; viewUrl = `EncodedAbsUrl + ?web=1`. `editPropertiesUrl`/`folderUrl` — **đổi** khi rời ngữ cảnh SP.

### 5.9 Replacement flow (`uploadDocument` khi có `replacementOldId`)
Upload mới → set metadata → đánh dấu VB cũ `Hết hiệu lực` + `NgayHetHieuLuc=today` → ghi liên kết 2 chiều. Lỗi VB cũ không chặn (trả `warning`).

### 5.10 Upload bản mềm + copy metadata (`uploadEditableSource`, `_copyMetadata`)
Lưu DOCX cùng folder + cùng base name PDF; copy `COPYABLE_METADATA_FIELDS`; set `HasEditableSource/EditableSourceUrl/PrimaryPdfUrl` cả 2 phía.

> 5.1–5.10 là rule thuần — tách khỏi transport là dùng lại 100%.

---

## 6. Reusable UI Components

- **KEEP (presentational):** KpiCards, ByUnitCard, RecentDocsCard, ExpiringDocsCard, Hero, PortalHeader, ConfirmDialog, SkeletonLoader, DisclaimerBanner, Sidebar (đổi nav→router).
- **REFACTOR (UI giữ, đổi data/call):** DmsPortal (tách routing), DocumentDetailDrawer, UploadDocumentView, ReviewView, DocumentListView, AdvancedSearch, BulkEditModal, ReplacementDocumentPicker, Icons (cân nhắc thay Fluent), DmsPortal.module.scss (→ Tailwind).
- **Pattern refactor:** bỏ prop `dmsService: IDmsService`; thay bằng hooks gọi API route (`useDocuments`, `useKpis`, `useUploadDocument`…). Markup + state cục bộ giữ. Mọi component có state → `'use client'`; page wrapper là Server Component fetch dữ liệu đầu.
- **Tận dụng ngay:** `preview/main.tsx` cho thấy cây component render đủ chỉ với `MockDmsService` → bê làm bộ smoke-test UI trong Next.

---

## 7. Service Migration Plan

`IDmsService` vẫn là contract. Tạo 2 lớp:

1. **Backend (server)** — `lib/graph/` + `app/api/**`: Graph thật (auth delegated/OBO). Port `_mapItem`, `_pairDocuments`, `getKpis`, `searchDocuments`… (KEEP) sang `lib/dms/`; chỉ thay phần gọi mạng.
2. **Client** — `lib/dms/client.ts`: implement `IDmsService` qua `fetch('/api/...')`. Component giữ tư duy async + có thể vẫn dùng `MockDmsService` khi dev.

```
Component (use client) → hooks fetch('/api/documents')      (client IDmsService)
        ▼
app/api/documents/route.ts (Node runtime, Ubuntu)
        │ lib/dms/{mapItem,pairDocuments}  (KEEP — port từ SharePointDmsService)
        ▼
lib/graph/client.ts (Graph SDK + token từ lib/auth)
        ▼
Microsoft Graph → /sites/{vanbandieuhanh}/lists/{DMS Library}
```

**Thứ tự port:** read trước (getAllDocuments → map/pair, getKpis, searchDocuments, getRecent/Expiring, getUnitStats, getStorageFolders, getMetadataChoices) → write sau (updateMetadata(+Many), uploadDocument, uploadEditableSource, linkEditableSource, deleteDocument(s)).

**Auth đổi mô hình:** SPFx dùng token ngầm user (`this.context.spHttpClient`). Webapp dùng **Entra app registration**:
- Khuyến nghị **delegated (OBO)** qua Auth.js/NextAuth + MSAL để giữ phân quyền per-user (recycle/upload phụ thuộc quyền user).
- Scope: `Sites.Selected` (giới hạn đúng site `vanbandieuhanh` — an toàn nhất) hoặc `Sites.ReadWrite.All` + `Files.ReadWrite.All` cho upload.

---

## 8. Next.js Target Architecture

```
/web/vanban
  app/
    layout.tsx                      # shell: Sidebar + PortalHeader + Auth guard
    page.tsx (dashboard)            # ⇐ viewMode 'home'
    search/page.tsx                 # ⇐ 'search' + AdvancedSearch
    upload/page.tsx                 # ⇐ UploadDocumentView
    review/page.tsx                 # ⇐ ReviewView
    expired/page.tsx                # ⇐ nhóm Hết hiệu lực
    storage/page.tsx                # ⇐ getStorageFolders / getUnitStats
    documents/[id]/page.tsx         # ⇐ DocumentDetailDrawer
    api/
      documents/route.ts            # GET list/search · POST recycle
      documents/[id]/route.ts       # GET 1 · PATCH metadata · DELETE recycle
      documents/upload/route.ts     # POST upload PDF(+DOCX) [multipart]
      documents/[id]/editable-source/route.ts
      documents/replacement-search/route.ts
      dashboard/{kpis,recent,expiring}/route.ts
      metadata/choices/route.ts
      storage/{folders,stats}/route.ts
      health/route.ts               # Phase 1
  components/{dashboard,dms,ui}/     # phân loại lại từ components/ hiện tại
  lib/{auth,graph,dms,sharepoint}/   # auth · transport mới · rule (PORT) · field constants
  types/dms.ts                       # ⇐ models/IDocument (KEEP)
  scripts/                           # scan-spfx-coupling.mjs (đã có) + seed/sync sau
  public/                            # img/ + assets/logo (KEEP)
```

---

## 9. Graph API Mapping

`{site}` = site-id `vanbandieuhanh`; `{list}` = list-id `DMS Library`; `{drive}` = drive-id tương ứng.

| Method (`IDmsService`) | SP REST hiện tại | Webapp route | Microsoft Graph |
|---|---|---|---|
| `getAllDocuments`/`refreshDocuments` | `lists/getbytitle('DMS Library')/items?$select=...&$filter=FSObjType eq 0` (paged `$top=2000`) | `GET /api/documents` | `GET /sites/{site}/lists/{list}/items?$expand=fields($select=...)&$top=...` (`@odata.nextLink`); lọc file. |
| `searchDocuments` | filter client trên `_getAll()` | `GET /api/documents?query=&typeKey=&...` | Items + filter `lib/dms` (KEEP) hoặc Graph Search. |
| `getKpis` | tính từ `_getAll()` | `GET /api/dashboard/kpis` | Items + `lib/dms/kpis.ts` (KEEP). |
| `getRecentDocuments` | sort desc top10 | `GET /api/dashboard/recent` | Items + sort/slice. |
| `getExpiringDocuments` | `ngayHetHieuLuc ∈ [today,+60d]` | `GET /api/dashboard/expiring` | Items + filter. |
| `getUnitStats` | folder cấp1 + đếm `donViCode` | `GET /api/storage/stats` | `GET /sites/{site}/drive/root/children` + đếm. |
| `getStorageFolders` | `lists(...)/rootFolder/folders` | `GET /api/storage/folders` | `GET /sites/{site}/drive/root/children?$filter=folder ne null` (lọc `Forms`, prefix `_`). |
| `getMetadataChoices` | `lists(...)/fields?$select=InternalName,TypeAsString,Choices` | `GET /api/metadata/choices` | `GET /sites/{site}/lists/{list}/columns` → `column.choice.choices`; fallback `FALLBACK_METADATA_CHOICES`. |
| `updateMetadata`/`updateMetadataMany` | POST `items(id)` `X-HTTP-Method: MERGE` | `PATCH /api/documents/:id` | `PATCH /sites/{site}/lists/{list}/items/{id}/fields`; giữ rule date/number. |
| `uploadDocument` | `GetFolderByServerRelativeUrl(@f)/Files/Add` + MERGE + replacement | `POST /api/documents/upload` (multipart) | nhỏ: `PUT /sites/{site}/drive/root:/{folder}/{name}:/content`; lớn (>4MB): `createUploadSession`; lấy `listItem` (`?$expand=listItem`) để PATCH fields. |
| `uploadEditableSource`/`linkEditableSource` | upload DOCX cùng folder + copy meta + set link | `POST /api/documents/:id/editable-source` | `PUT .../content` hoặc chỉ PATCH cột link; `_copyMetadata` giữ. |
| `deleteDocument`/`deleteDocuments` | `items(id)/recycle()` + recycle bản mềm | `POST /api/documents/recycle` | `DELETE /sites/{site}/drive/items/{driveItemId}` (→ Recycle Bin); recycle bản mềm kèm. |
| replacement search | filter client | `GET /api/documents/replacement-search?query=` | Như `searchDocuments`, scope còn-hiệu-lực. |

**Khác biệt transport khi port:**
- `EncodedAbsUrl+?web=1`, `FileRef`, `editPropertiesUrl` (EditForm.aspx) → Graph trả `webUrl`/`@microsoft.graph.downloadUrl`; dựng lại link xem/sửa (hoặc deep-link SP).
- SP fallback `$select` 3 tầng (cột V2/link có thể thiếu) → đọc `columns` trước hoặc try/catch như hiện tại.
- Field internal name (SoVanBan, NhomTaiLieu, DonViSoHuu, HasEditableSource…) **giữ nguyên** — Graph `fields` dùng cùng internal name. Tập trung hằng số ở `lib/sharepoint/fields.ts`.

---

## 10. Migration Roadmap

**Phase 0 — Chuẩn bị** ✅ source đã đủ
- [x] Copy `src/` + `package.json` + `tsconfig.json`.
- [ ] Đăng ký Entra app (redirect URI, scope `Sites.Selected`/`Sites.ReadWrite.All` + `Files.ReadWrite.All`); resolve site-id/list-id/drive-id `vanbandieuhanh`/`DMS Library`.

**Phase 1 — Bootstrap:** Next.js App Router + Tailwind + TS; Auth.js (Entra) đăng nhập; `lib/graph` connectivity; `GET /api/health`; deploy thử Ubuntu (Node 20 LTS + Nginx/PM2).

**Phase 2 — Read-only DMS:** port `types/dms.ts` + utils KEEP + `lib/dms/{mapItem,pairDocuments,kpis,search}`; API read routes; Dashboard + Search + Detail. Dev FE bằng `MockDmsService` (như Vite preview hiện tại).

**Phase 3 — Upload & Metadata:** upload PDF+DOCX (multipart + Graph upload session); edit metadata (PATCH); dynamic choices từ `columns`; storage folders; replacement flow; delete (recycle).

**Phase 4 — Performance:** PostgreSQL cache/index (seed từ `dev-mock-data`, sync job từ Graph); tối ưu search; job đồng bộ định kỳ.

**Phase 5 — Retire SPFx:** chuyển link người dùng sang webapp; SPFx read-only hoặc gỡ (dùng `DEPLOY.md`); tài liệu vận hành Ubuntu.

---

## 11. Risks & Blockers

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| ~~R1~~ | ~~Thiếu `src/`~~ | ✅ Giải quyết | `src/` đã có đầy đủ. |
| R2 | **Auth đổi mô hình** (token user ngầm → Entra app); phân quyền per-user recycle/upload | 🔴 Cao | Delegated/OBO; test với user thật; cân nhắc `Sites.Selected`. |
| R3 | **Link phụ thuộc ngữ cảnh SP** (`?web=1`, EditForm.aspx, folderUrl) | 🟠 TB | Dùng `webUrl`/`downloadUrl` Graph; trang detail/edit webapp; deep-link SP khi cần. |
| R4 | Cột V2/link có thể chưa đủ trên library | 🟠 TB | Đọc `columns`; giữ fallback `$select` + `FALLBACK_METADATA_CHOICES`. KHÔNG đổi schema. |
| R5 | Upload >4MB khác cơ chế (Graph upload session) | 🟠 TB | `createUploadSession` cho file lớn, PUT content cho nhỏ. |
| R6 | Paging/throttling Graph (~934+ docs) | 🟠 TB | Xử lý `@odata.nextLink`, retry 429 (`Retry-After`); Phase 4 cache Postgres. |
| R7 | **React 17 → 18/19** (SPFx khóa 17) + `@fluentui/react` 8 nặng | 🟡 Thấp | Nâng React; cân nhắc `lucide-react` thay Fluent Icons. |
| R8 | SCSS module → Tailwind lệch UI | 🟡 Thấp | Giữ CSS Module tạm (Next hỗ trợ), chuyển Tailwind dần. |
| R9 | `nguoiKy` chưa có dữ liệu (Person field) | 🟡 Thấp | Giữ hành vi hiện tại (rỗng); xác nhận owner. |

---

## 12. First Implementation Checklist

**Phase 0 (làm ngay):**
- [x] `src/` + `package.json` + `tsconfig.json` đã có.
- [ ] `node scripts/scan-spfx-coupling.mjs --root src` (đã chạy: 4 file coupling — đúng kỳ vọng).
- [ ] Đăng ký Entra app; ghi `TENANT_ID/CLIENT_ID/CLIENT_SECRET` + scope; resolve `site-id/list-id/drive-id`.

**Phase 1 (bootstrap):**
- [ ] `npx create-next-app@latest` (App Router, TS, Tailwind, ESLint) trong `/web/vanban` (chú ý không đè `src/` SPFx — dựng song song rồi gỡ SPFx sau).
- [ ] Auth.js/NextAuth Entra ID + lấy access token Graph (OBO).
- [ ] `lib/graph/client.ts` + `GET /api/health` gọi thử `/sites/{site}`.
- [ ] `types/dms.ts` = copy `models/IDocument`; copy utils KEEP → `lib/dms`.
- [ ] Deploy thử Ubuntu (Node 20 LTS + Nginx/PM2 hoặc systemd), HTTPS.

**Phase 2 (lát đầu tiên xuyên suốt — read-only):**
- [ ] Port `_mapItem` + `_pairDocuments` → `lib/dms/`; `GET /api/documents` (Graph items + map + pair).
- [ ] `GET /api/dashboard/{kpis,recent,expiring}`, `/api/storage/{folders,stats}`, `/api/metadata/choices`.
- [ ] `lib/dms/client.ts` implement `IDmsService` qua `fetch`.
- [ ] `app/page.tsx` render `KpiCards/ByUnitCard/RecentDocsCard/ExpiringDocsCard/Hero` (KEEP) với data thật.
- [ ] `app/search/page.tsx` + `AdvancedSearch` + `DocumentListView`.

> Quy tắc tuân thủ: KHÔNG xóa code, KHÔNG refactor lớn, KHÔNG đổi metadata/DMS Library/nghiệp vụ. Output phase này = tài liệu này + `scripts/scan-spfx-coupling.mjs`.

---

### Phụ lục A — Lệnh scan
```bash
node scripts/scan-spfx-coupling.mjs --root src   # bảng text (đã bỏ comment để tránh false-positive)
node scripts/scan-spfx-coupling.mjs --root src --json
```

### Phụ lục B — `IDmsService` (16 method, contract giữ nguyên)
`getRecentDocuments` · `getExpiringDocuments` · `getUnitStats` · `getStorageFolders` · `getKpis` · `searchDocuments` · `getAllDocuments` · `refreshDocuments` · `updateMetadata` · `updateMetadataMany` · `uploadDocument` · `getMetadataChoices` · `deleteDocument` · `deleteDocuments` · `uploadEditableSource` · `linkEditableSource`.
