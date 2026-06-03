# CLEANUP SPFx + FIX SharePoint Library Lookup

> Dọn legacy SPFx + sửa lỗi `Cannot find SharePoint library: DMS` (GET /api/documents → 500).
> Không đổi auth (login OK), không đổi business UI, không hardcode secret.

---

## 1. Audit cấu trúc repo (trước cleanup)
- **Production = `next-preview/`** (Next.js App Router). Đã xác minh **tự chứa**: không import từ `../src`/`config`/`sharepoint`; **không** có dependency `@microsoft/sp-*`.
- **Legacy SPFx** (tracked, KHÔNG được prod dùng): `src/`, `config/`, `sharepoint/`, `teams/`, `preview/`, `dev-mock-data/`, `img/`, `gulpfile.js`, `build-sppkg.cmd`, `vite.config.ts`, `index.html`, root `package.json`/`package-lock.json`/`tsconfig.json`, `.yo-rc.json`, `.eslintrc.js`, `.npmignore`, `DEPLOY.md` (sppkg), `NOTES.md` (phase-1 SPFx).

## 2. Đã xóa khỏi repo (git rm — còn trong lịch sử git)
`src config sharepoint teams preview dev-mock-data img gulpfile.js build-sppkg.cmd vite.config.ts index.html package.json package-lock.json tsconfig.json .yo-rc.json .eslintrc.js .npmignore DEPLOY.md NOTES.md`

**Còn lại:** `next-preview/`, `docs/`, `scripts/`, `README.md`, `.gitignore`, `.vscode/`, `.claude/`.
→ Toàn bộ dependency SPFx biến mất cùng root `package.json`; `next-preview/package.json` vốn **không** có `@microsoft/sp-*` (chỉ next, react, @fluentui/react, next-auth, msal-node, microsoft-graph-client).

> Thư mục build artifact root (`lib/ dist/ temp/ release/ node_modules/`) đã gitignored từ trước → không nằm trong repo.

## 3. Nguyên nhân lỗi "Cannot find SharePoint library: DMS"
- `lib/sharepoint/resolve.ts` cũ: `GET /sites/{id}/lists?$filter=displayName eq '<SP_DMS_LIBRARY_NAME>'`, throw lỗi mù khi rỗng.
- Production đặt `SP_DMS_LIBRARY_NAME=DMS` nhưng library thật tên khác (vd `DMS Library`/`Documents`) → `displayName eq 'DMS'` không khớp → throw → `/api/documents` 500.

## 4. Đã sửa (resolve.ts — robust, env-driven, không hardcode)
- **Env chuẩn hóa** (ưu tiên mới, fallback cũ để không vỡ):
  - `SHAREPOINT_HOSTNAME` (← `SP_SITE_HOSTNAME`)
  - `SHAREPOINT_SITE_PATH` (← `SP_SITE_PATH`) · hoặc `SHAREPOINT_SITE_ID` (dùng trực tiếp nếu set)
  - `SHAREPOINT_LIBRARY_NAME` (← `SP_DMS_LIBRARY_NAME`)
- **Fallback library theo thứ tự:** `SHAREPOINT_LIBRARY_NAME` → `DMS` → `DMS Library` → `Documents` → `Shared Documents` → `Documents partagés` (so khớp **case-insensitive** theo `displayName` và `name`, chỉ list `template === 'documentLibrary'`).
- **Không throw lỗi mù.** Khi không khớp → `LibraryResolveError` mang chi tiết, route trả JSON (HTTP 404):
  ```json
  {
    "ok": false,
    "error": "Không tìm thấy SharePoint document library...",
    "configuredLibrary": "DMS",
    "attemptedLibraries": ["DMS","DMS Library","Documents","Shared Documents","Documents partagés"],
    "siteId": "...", "siteUrl": "https://biahalong.sharepoint.com/sites/vanbandieuhanh",
    "drivesFound": [{ "id": "...", "name": "Documents", "webUrl": "..." }],
    "librariesFound": [{ "id": "...", "displayName": "DMS Library" }],
    "message": "Đã thử [...]. Library hiện có [...]. Đặt SHAREPOINT_LIBRARY_NAME đúng 1 trong các tên này."
  }
  ```
- **Server log an toàn:** `console.error('[sharepoint] LibraryResolveError', <detail>)` — KHÔNG log token/secret.
- Áp dụng cho cả `/api/documents`, `/api/dashboard`, `/api/health/sharepoint`.

> Các string "DMS Library" còn lại trong `next-preview/dms/**` chỉ là **comment / UI text**. 1 hardcode runtime duy nhất là `UploadDocumentView.tsx` (`marker = '/DMS Library/'`) thuộc luồng **upload (đang disabled)** — không ảnh hưởng read; sẽ xử lý khi mở write.

## 5. Env / docs
- `.env.example` cập nhật tên `SHAREPOINT_*` + ghi chú fallback + redirect URI + prod.
- `.gitignore` bổ sung: `.env.production`, `.env.development`, `**/.env*`, giữ `!**/.env.example`; chặn `*.pem/*.key/*.pfx/*.p12`, `certs/`, `tokens/`.
- **Production cần đặt:** `SHAREPOINT_LIBRARY_NAME=DMS Library` (hoặc tên thật xác nhận qua `/api/documents` debug).

## 6. Cách tìm tên library thật (sau deploy)
Đăng nhập rồi mở `GET https://vanban.biahalong.com/api/documents` — nếu vẫn lỗi, JSON trả `librariesFound`/`drivesFound` liệt kê **đúng tên thật** → đặt `SHAREPOINT_LIBRARY_NAME` cho khớp rồi `pm2 restart vanban --update-env`.

## 7. Files thay đổi
- `next-preview/lib/sharepoint/resolve.ts` (robust lookup + LibraryResolveError + drives)
- `next-preview/app/api/{documents,dashboard,health/sharepoint}/route.ts` (trả JSON chẩn đoán)
- `next-preview/.env.example`, root `.gitignore`, `README.md`
- Xóa: toàn bộ SPFx legacy (mục 2)
