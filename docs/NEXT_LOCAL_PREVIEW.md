# DMS Portal — Next.js Local Preview

> **Mục tiêu:** Bản Next.js App Router chạy **local** để kiểm UI/UX sau khi chuyển SPFx → webapp.
> **2 chế độ dữ liệu:** `mock` (MockDmsService) hoặc `graph` (SharePoint DMS Library thật qua Microsoft Graph — **READ-ONLY**).
> **Phạm vi:** Chưa deploy Ubuntu · chưa upload/edit/delete · chưa đổi nghiệp vụ/metadata/DMS Library.
> **Vị trí:** [`/web/vanban/next-preview/`](../next-preview/) — **biệt lập** với project SPFx ở root (không đè, không phá source cũ).

---

## 0. Hai chế độ dữ liệu (mock ↔ graph)

Chọn bằng biến `NEXT_PUBLIC_DMS_DATA_SOURCE` trong `next-preview/.env.local`:

| Giá trị | Hành vi |
|---|---|
| `mock` | Dùng `MockDmsService` (dữ liệu in-memory). Không cần đăng nhập. UI/UX giống SPFx 100%. |
| `graph` | Dùng `ApiDmsService` → gọi `/api/documents` → Microsoft Graph → **DMS Library thật**. **Yêu cầu đăng nhập Microsoft.** Chỉ đọc. |

> ⚠️ **Phase này là READ-ONLY.** Mọi thao tác ghi (upload/update/delete/link bản mềm) trong chế độ `graph` sẽ ném lỗi: `Read-only Graph preview: write operation is not implemented yet.`

### Env cần có (`next-preview/.env.local` — KHÔNG commit)
Xem mẫu đầy đủ ở [`next-preview/.env.example`](../next-preview/.env.example):
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
AZURE_AD_TENANT_ID=...
SP_SITE_HOSTNAME=biahalong.sharepoint.com
SP_SITE_PATH=/sites/vanbandieuhanh
SP_DMS_LIBRARY_NAME=DMS Library
NEXT_PUBLIC_DMS_DATA_SOURCE=graph
```

### Azure (Entra App `Vanbandieuhanh-API`) cần có
- **Redirect URI (Web):** `http://localhost:3000/api/auth/callback/azure-ad`
- **API permissions (delegated, đã grant):** `User.Read`, `Sites.Read.All`, `Files.Read.All`
- Client secret còn hiệu lực (điền vào `AZURE_AD_CLIENT_SECRET`).

### Cách test (graph mode)
```
1. mở http://localhost:3000        → màn "Đăng nhập với Microsoft"
2. đăng nhập tài khoản Bia Hạ Long → quay lại app, render dữ liệu thật
3. http://localhost:3000/api/health/sharepoint   → { ok:true, site, list } (sau khi đã đăng nhập)
4. http://localhost:3000/api/documents           → { ok:true, count, documents:[...] }
```
> Khi **chưa đăng nhập**, `/api/health/sharepoint` và `/api/documents` trả `401 {ok:false,error:"Chưa đăng nhập..."}` (đúng thiết kế — auth gate).

---

## 1. Cách chạy local

```bash
cd next-preview
npm install        # lần đầu (Node 22.x; đã test trên Node 22.18, npm 10.9)
npm run dev        # dev server
# → mở http://localhost:3000
```

Lệnh khác:
```bash
npm run build      # production build (đã verify: compile thành công, 4/4 page)
npm start          # chạy bản build production (sau khi npm run build)
```

> **Lưu ý:** Đây là một npm project **riêng** (`dms-portal-next-preview`). KHÔNG chạy `npm install` ở root `/web/vanban` cho mục đích này — root vẫn là project SPFx (`dms-portal`, build bằng gulp). Hai project độc lập, không chia sẻ `node_modules`.

---

## 2. Kiến trúc & luồng render

```
app/page.tsx  (Server Component, tối giản)
   └─ app/PreviewClient.tsx  ('use client')
        │  const dms = useMemo(() => new MockDmsService(), [])
        │  DmsPortal = dynamic(() => import('@dms/components/DmsPortal'), { ssr: false })
        ▼
   <DmsPortal dmsService={dms} userDisplayName="Local User" hasTeamsContext={false} />
        ▼
   dms/  ← bản COPY của src/webparts/dmsPortal (components/models/services/utils/mock)
```

- **`ssr: false`** (qua `next/dynamic`): toàn bộ cây UI render phía client. Lý do: nhiều component dùng `window`/`document`/`Blob`/`URL` và `@fluentui` `initializeIcons()` chạy khi load module → tránh mọi lỗi SSR. Phù hợp vì đây chỉ là preview UI/UX.
- Tương đương `preview/main.tsx` của Vite hiện có: cùng cách mount `<DmsPortal dmsService={new MockDmsService()} />`.
- `@dms/*` là path alias trỏ tới `next-preview/dms/*` (khai báo trong `tsconfig.json`).

---

## 3. Những file đã port

### 3.1 Mới tạo (khung Next.js) — trong `next-preview/`
| File | Vai trò |
|---|---|
| `package.json` | next 14.2.15, react/react-dom 18.3.1, @fluentui/react ^8.106.4, sass, typescript. |
| `next.config.mjs` | `reactStrictMode`; `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds` (code SPFx viết cho React 17/tsconfig SPFx — không chặn dev/build); `transpilePackages: ['@fluentui/react','@fluentui/font-icons-mdl2']`. |
| `tsconfig.json` | App Router config + alias `@dms/* → ./dms/*`. |
| `app/layout.tsx` | Root layout + `<html lang="vi">` + globals.css. |
| `app/globals.css` | Reset tối thiểu, nền `#f5f5f5`, font Segoe UI (giống Vite preview). |
| `app/page.tsx` | Route `/` → render `<PreviewClient/>`. |
| `app/PreviewClient.tsx` | Client boundary: tạo `MockDmsService`, dynamic-import `DmsPortal` (ssr:false). |
| `.gitignore` | bỏ qua node_modules/.next/next-env.d.ts. |
| `dms/version.ts` | copy hằng `APP_VERSION` (Hero.tsx cần) — đổi nhãn `-next-preview`. |

### 3.2 Copy nguyên trạng từ `src/webparts/dmsPortal/` → `next-preview/dms/`
Giữ nguyên cấu trúc thư mục để **mọi import tương đối còn nguyên** (không phải sửa path).

- **models/**: `IDocument.ts`
- **services/**: `IDmsService.ts`, `MockDmsService.ts`  *(KHÔNG copy `SharePointDmsService.ts` — vì import `@microsoft/sp-http`)*
- **utils/**: `standardization.ts`, `documentPair.ts`, `documentTypeGroups.ts`, `metadataChoices.ts`, `format.ts`, `exportCsv.ts`
- **mock/**: `mockData.ts`
- **assets/**: `logoBiaHaLong.ts` (logo base64 — Sidebar dùng)
- **components/** (21 file): `DmsPortal.tsx`, `Sidebar`, `PortalHeader`, `Hero`, `KpiCards`, `ByUnitCard`, `RecentDocsCard`, `ExpiringDocsCard`, `AdvancedSearch`, `DocumentListView`, `DocumentDetailDrawer`, `UploadDocumentView`, `ReviewView`, `BulkEditModal`, `ReplacementDocumentPicker`, `ConfirmDialog`, `SkeletonLoader`, `DisclaimerBanner`, `Icons`, `IDmsPortalProps`, + `DmsPortal.module.scss`.

> **KHÔNG copy** (SPFx-only): `DmsPortalWebPart.ts`, `*.manifest.json`, `loc/*`, `DmsPortal.module.scss.ts` (file typing do SPFx sinh — Next đọc thẳng `.module.scss` làm CSS Module).

> ⚠️ Đây là **bản copy** — source SPFx ở `src/` **giữ nguyên, không đụng tới**. Khi sửa UI trong giai đoạn migration thật, cần quyết định nguồn chân lý (xem §6).

---

## 4. Những chỗ đang mock / chưa làm thật

| Hạng mục | Trạng thái hiện tại |
|---|---|
| Dữ liệu | 100% từ `MockDmsService` + `mock/mockData.ts` (in-memory). |
| Microsoft Graph / SharePoint | **Không gọi**. Không có `/api/*`. |
| Auth.js / Entra login | **Không có**. `userDisplayName="Local User"` hard-code. |
| Upload PDF/DOCX | UI đầy đủ; submit chạy qua `MockDmsService.uploadDocument` (in-memory, không lên SharePoint). |
| Update / Delete / Bulk edit / Link bản mềm | Chạy qua method tương ứng của `MockDmsService` (mock response). |
| Export CSV | Chạy thật phía client (`Blob`/download) — file CSV tải về từ dữ liệu mock. |
| `hasTeamsContext` | `false`. Mục "Quay lại Microsoft Teams" ở sidebar chỉ hiển thị, không thực thi. |

---

## 5. Những lỗi đã xử lý khi dựng

| Vấn đề | Cách xử lý |
|---|---|
| **Class instance qua ranh giới Server→Client** (Next cấm truyền instance không-serialize) | Tạo `MockDmsService` **trong** client component (`PreviewClient.tsx`, `useMemo`), không tạo ở Server Component. |
| **SSR đụng `window`/`document`/`Blob` + `initializeIcons()` của Fluent** | Render cây UI bằng `dynamic(..., { ssr:false })` → chỉ chạy client. |
| **Hooks trong Server Component** | Prepend `'use client'` cho cả 19 file `.tsx` trong `dms/components/` (script tự động). |
| **`Module not found: '../version'`** (Hero.tsx import `APP_VERSION`) | Copy `version.ts` vào `dms/version.ts` (file thuần, không SPFx). |
| **`@fluentui/react` v8 ESM/CJS** | `transpilePackages` trong `next.config.mjs`. Build + render OK; icon hiển thị đúng. |
| **SCSS module SPFx** | `.module.scss` của SPFx là CSS thuần (biến `--dms-*`, selector thường) → Next đọc native CSS Module sau khi cài `sass`. Không cần sửa. |
| **Type lỗi do code viết cho React 17 + tsconfig SPFx** | `typescript.ignoreBuildErrors:true` (dev dùng SWC, không chặn). Runtime OK. |

**Kết quả kiểm thử (đã verify trên trình duyệt thật):**
- `npm run build` → ✓ Compiled successfully, sinh 4/4 page.
- `npm run dev` → `http://localhost:3000` trả HTTP 200, Ready ~2.5s.
- **Console: 0 lỗi/exception** trên mọi màn đã mở.
- Đã render đúng & khớp UI/UX SPFx: **Dashboard**, **Tra cứu/List**, **Detail Drawer**, **Upload** (đủ 3 mục: chọn file · metadata với dropdown động · văn bản thay thế), **Cần chuẩn hóa** (KPI nội bộ + filter + Xuất CSV + multi-select).

---

## 6. Những điểm UI/UX cần review tiếp

1. **Icon Fluent vs nhẹ hơn:** `Icons.tsx` dùng `@fluentui/react` icon-font (Fabric MDL2). Render OK nhưng kéo theo bundle lớn. Cân nhắc thay `lucide-react`/SVG inline cho webapp production (đã ghi trong `docs/SPFX_TO_WEBAPP_AUDIT.md`).
2. **Chưa có routing thật:** Hiện vẫn là SPA 1-trang (`viewMode` state nội bộ `DmsPortal.tsx`) — URL luôn `/`. Migration thật sẽ tách App Router pages (`/search`, `/upload`, `/review`, `/documents/[id]`…). Khi đó kiểm lại deep-link, back/forward, refresh giữ state.
3. **Link mở file / sửa metadata:** Các URL `?web=1`, `EditForm.aspx`, `folderUrl` phụ thuộc ngữ cảnh SharePoint — ở preview là mock/none. Cần thiết kế lại cho webapp (xem mapping Graph trong audit).
4. **Responsive:** SCSS ẩn sidebar < 1024px. Nên review trên màn nhỏ / tablet trong Next (đã test ở viewport ~1568px desktop).
5. **Nguồn chân lý code:** Hiện `dms/` là **bản copy** của `src/`. Nếu chỉnh UI để review, cần chốt: sửa ở `next-preview/dms/` (preview) hay đồng bộ ngược về `src/`? Đề xuất giai đoạn sau dùng `transpilePackages`/alias trỏ thẳng vào source dùng chung thay vì copy, để tránh phân kỳ.
6. **Lưu ý quirk khi chụp màn hình tự động:** Công cụ chụp CDP đôi lúc timeout trên màn Upload (do vùng kéo-thả/animation) — **không phải lỗi app** (page-text + console xác nhận render đầy đủ, không lỗi). Người dùng xem trực tiếp trên trình duyệt bình thường.

---

## 7. Bảo mật (ghi chú)
`next@14.2.15` có cảnh báo security advisory (2025-12-11). Vì đây là preview **chạy local, không expose internet**, rủi ro thấp. Nếu cần, bump lên bản patched `14.2.x` mới nhất: `npm i next@14.2 --save-exact` rồi `npm run build` lại.

---

## 9. Graph read-only integration — files & flow

```
Browser (graph mode)
  └─ PreviewClient.tsx → useSession()
        ├─ chưa login → "Đăng nhập với Microsoft" (signIn('azure-ad'))
        └─ đã login   → <DmsPortal dmsService={new ApiDmsService()} />
                              │  ApiDmsService.getAllDocuments() → fetch('/api/documents')
                              ▼
        app/api/documents/route.ts (server)
            getGraphAccessToken() ← session JWT (NextAuth Azure AD)
            resolveSiteId() / resolveListId()  (cache runtime)
            graphFetch /sites/{site}/lists/{list}/items?$expand=fields,driveItem&$top=200  (+nextLink, ≤2000)
            lọc file (driveItem.file) → mapSharePointItemToDocument() → pairDocuments()
            → { ok, count, documents }
                              ▼
        Client tính KPI/recent/expiring/unit-stats/search bằng lib/dms/derive (logic port từ SharePointDmsService)
```

**File mới (Graph/Auth) — đều trong `next-preview/`:**
| File | Vai trò |
|---|---|
| `lib/auth/options.ts` | NextAuth Azure AD provider + scope (User.Read, Sites.Read.All, Files.Read.All, offline_access) + refresh token. |
| `lib/auth/token.ts` | `getGraphAccessToken()` lấy token từ session (server), ném `AuthError(401)` nếu chưa login. |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth route handler. |
| `types/next-auth.d.ts` | Augment Session/JWT: `accessToken`, `error`. |
| `lib/graph/client.ts` | `graphFetch(pathOrUrl, {accessToken})` — prefix v1.0 hoặc full nextLink; `GraphError` (status/statusText/body). |
| `lib/sharepoint/resolve.ts` | `resolveSiteId()` / `resolveListId('DMS Library')` + cache runtime. |
| `app/api/health/sharepoint/route.ts` | Health check → `{ ok, site, list }`. |
| `lib/dms/mapSharePointItemToDocument.ts` | Map Graph item (`fields`+`driveItem`) → `IDocument` (port `_mapItem`, ưu tiên Metadata V2). |
| `lib/dms/pairDocuments.ts` | PDF-first pairing (port `_pairDocuments`). |
| `lib/dms/derive.ts` | KPI/recent/expiring/unit-stats/search/folders từ docs (port từ SharePointDmsService). |
| `app/api/documents/route.ts` | Fetch+paginate+map+pair → `{ ok, count, documents }`. |
| `services/ApiDmsService.ts` | `IDmsService` read-only (write → throw). |
| `app/Providers.tsx` | `SessionProvider`. |
| `app/PreviewClient.tsx` | Chọn data source + auth gate + nút đăng nhập/đăng xuất. |

**Đã verify (không cần đăng nhập):** `npm run build` ✓ · dev server ✓ · `/api/health/sharepoint` & `/api/documents` trả 401 sạch khi chưa login ✓ · `/api/auth/providers` có `azure-ad` (callback `/api/auth/callback/azure-ad`) ✓ · màn "Đăng nhập với Microsoft" render ✓.
**Cần người dùng đăng nhập Microsoft** (Claude không nhập credential) để test: số lượng documents thật + UI render data thật.

**Read-only — các hàm bị disable trong `ApiDmsService`:** `updateMetadata`, `updateMetadataMany`, `uploadDocument`, `deleteDocument`, `deleteDocuments`, `uploadEditableSource`, `linkEditableSource`.

**Lưu ý preview:** `getMetadataChoices()` ở chế độ graph tạm trả `FALLBACK_METADATA_CHOICES` (chưa gọi `/lists/{id}/columns`); `getStorageFolders()`/`getUnitStats()` derive từ `DonViSoHuu` của documents (folder rỗng chưa hiện) — đủ cho preview read-only.

---

## 8. Quy tắc đã tuân thủ
✅ Không xóa source SPFx · ✅ Không refactor lớn · ✅ Không đổi business logic · ✅ Không đổi metadata V2 · ✅ Không đổi DMS Library · ✅ Chỉ dựng local Next.js preview để kiểm UI/UX. Chưa commit (chờ yêu cầu).
