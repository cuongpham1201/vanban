# DMS V2 — Data Wiring / Read API Hardening (Phase 4.5)

> Read-only. Không upload thật, không Graph write API, không đổi schema/auth.
> Mục tiêu: chuyển trang chi tiết từ "fetch-all + find client-side" sang một
> **detail endpoint** đúng nghĩa, và lập bản đồ field thực tế (báo field thiếu,
> không fake).

Cập nhật: Phase 4.5 (2026-06).

---

## 1. Endpoint mới: `GET /api/documents/[id]`

File: `next-preview/app/api/documents/[id]/route.ts`

| Thuộc tính | Giá trị |
|---|---|
| Method | `GET` duy nhất (read-only) |
| Auth | `getServerSession(authOptions)` → 401 nếu chưa đăng nhập |
| Nguồn dữ liệu (prod) | `getCachedDocuments(session.accessToken)` — **cache dùng chung** với `/api/documents` + `/api/dashboard` (≤1 Graph fetch / đợt refresh 5 phút) |
| Nguồn dữ liệu (dev preview) | Nhánh `NODE_ENV==='development' && !accessToken` → `MockDmsService().getAllDocuments()`. Inert ở production (session thật luôn có accessToken). Không import/đụng `docsForRequest.ts` hay 6 file dev-login. |
| Tìm theo id | `documents.find(d => d.id === id)` (backend hiện chỉ có list-all → tìm trong cache; contract trả về vẫn là detail) |
| Response | `{ ok: true, source, document }` |

### Mã trạng thái

| Tình huống | HTTP | Body |
|---|---|---|
| OK | 200 | `{ ok:true, source, document }` |
| Chưa đăng nhập | 401 | `{ ok:false, error }` |
| Không có Graph token (prod) | 401 | `{ ok:false, error }` |
| Không tìm thấy id | 404 | `{ ok:false, error }` |
| Lỗi resolve thư viện | `LibraryResolveError.status` | `{ ok:false, error, ...detail }` |
| Lỗi Graph | Graph status (4xx/5xx) hoặc 502 | `{ ok:false, error, graph }` |
| Lỗi khác | 500 | `{ ok:false, error }` |

### Đã kiểm thử (dev preview, mock)

```
list  /api/documents        http=200  count=10 total=10 source=mock-dev  ~323 B/doc  ~3.5 KB  23ms
detail /api/documents/r1     http=200  source=mock-dev  doc r1 (soVanBan=295.2026.QĐ-HCNS)  392 B  29ms
detail /api/documents/__nope__   http=404
detail (no cookie)               http=401
```

Middleware **không** chặn `/api/*` (API tự bảo vệ bằng `getServerSession`) — xác nhận route trả 401 đúng khi thiếu session.

---

## 2. Client: `DocumentDetailPage.tsx`

File: `next-preview/components/document-detail/DocumentDetailPage.tsx`

**Trước:** `fetch('/api/documents')` → nhận **toàn bộ** danh sách → `.find(d => d.id === id)` ở client.
**Sau:** `fetch('/api/documents/${encodeURIComponent(id)}')` → nhận **đúng 1 document**.

- State `status: 'loading' | 'ok' | 'notfound' | 'error'`.
- `404` → màn "Không tìm thấy văn bản"; lỗi khác → màn lỗi; loading → "Đang tải…".
- UI Phase 3 giữ nguyên (`DocumentHeader` / `DocumentPreview` / `MetadataPanel`, `toDetailDoc`).
- `useEffect` phụ thuộc `[id]` → đổi id tự refetch.

**Lợi ích:** trang chi tiết không còn tải toàn bộ danh sách (prod ~689 docs) chỉ để hiển thị 1 văn bản.

---

## 3. Payload `/search` (`/api/documents`) — đo & đề xuất (CHƯA implement)

`/search` vẫn dùng `/api/documents` (không đổi ở Phase 4.5).

| Môi trường | Records | Payload | Bytes/doc | Fetch |
|---|---|---|---|---|
| Dev (mock) | 10 | ~3.5 KB | ~323 B | ~23 ms |
| Prod (Graph) — ước tính | ~689 | **~450–650 KB** | ~700–900 B (nhiều field hơn: webUrl, serverRelativeUrl, editableSource, V2 metadata, created/modified/author) | phụ thuộc cache (lần đầu vài trăm ms, sau đó từ cache) |

**Đề xuất (không ép áp dụng):** thêm `?view=summary` cho `/api/documents` chỉ trả các field mà list/search cần
(`id, soVanBan, trichYeu, loaiVanBan, donViSoanThao, ngayBanHanh, trangThai, nhomTaiLieu, fileKind, tags`),
bỏ field nặng (`serverRelativeUrl`, `editableSource`, URL dài). Ước tính giảm payload **~50–60%**.
Backend đã có sẵn pagination (`?page/?pageSize`) — có thể kết hợp. Quyết định để pha sau khi user duyệt.

---

## 4. Bản đồ field chi tiết — field nào có / thiếu (KHÔNG fake)

Nguồn: `IDocument` (`dms/models/IDocument.ts`) + mapper `lib/dms/mapSharePointItemToDocument.ts` + view-model `documentDetailTypes.ts`.

| Field UI mong đợi | Trạng thái | Nguồn thực tế / ghi chú |
|---|---|---|
| `PrimaryPdfUrl` | ⚠️ **KHÔNG có field riêng** | `IDocument` không có `primaryPdfUrl`. View-model dùng `webUrl` (URL của chính file PDF) làm primary. **Báo thiếu** — nếu cần phân biệt PDF-chính vs file mở, phải thêm cột schema. |
| `EditableSourceUrl` | ✅ Có (gián tiếp) | `editableSource.webUrl` → `toDetailDoc.editableSourceUrl`. Rỗng nếu không ghép được bản mềm. |
| `webUrl` | ✅ Có | `IDocument.webUrl` (optional). |
| Tên file / `fileName` | ✅ Có | `IDocument.fileName` (optional). |
| Kích thước file | ✅ Có | `IDocument.fileSizeKB` (KB). `editableSource.sizeKB` cho bản mềm. |
| Ngày sửa / `modified` | ⚠️ **Runtime-only, không khai báo** | Mapper gắn `(doc as ... ).modified` (cast) — JSON có giá trị nhưng **không nằm trong interface `IDocument`** → view-model không đọc type-safe. **Báo thiếu khai báo.** |
| Ngày tạo / `created` | ⚠️ **Runtime-only, không khai báo** | Như trên (`created`). |
| `author` / `editor` | ⚠️ **Runtime-only, không khai báo** | Mapper gắn `author`/`editor` qua cast (`createdBy`/`lastModifiedBy.displayName`). Không trong interface. |
| `VanBanLienQuan` | ✅ Có (optional) | `IDocument.vanBanLienQuan` (text). View-model tách `relatedList` theo `; , \n`. Rỗng ở hầu hết doc hiện tại. |
| `VanBanThayThe` | ✅ Có (optional) | `IDocument.vanBanThayThe`. **Chưa hiển thị** trong view-model `toDetailDoc` — cần bổ sung nếu UI cần. |
| `Tags` | ✅ Có (optional) | `IDocument.tags` (CSV). `splitTags` đã có ở searchTypes. |
| `MetadataConfidence` | ✅ Có (optional) | `IDocument.metadataConfidence` (High/Medium/Low/NeedsReview). |
| `NguonMetadata` | ✅ Có (optional) | `IDocument.nguonMetadata` (ParsedFromFolder/Filename/ManualReviewed). |
| `namBanHanh` | ✅ Có | `IDocument.namBanHanh` (number). |
| `folderUrl` | ✅ Có (optional) | `IDocument.folderUrl`. |
| `editPropertiesUrl` | ✅ Có (optional) | `IDocument.editPropertiesUrl` — **chưa dùng** ở view-model. |
| Metadata V2 nhóm | ✅ Có (optional) | `nhomTaiLieu, loaiVanBanPhapLy, loaiTaiLieu, chuDeNghiepVu, donViPhatHanh, donViSoHuu`. |

### Tóm tắt field thiếu (đề xuất pha sau, không tự fake)
1. **`PrimaryPdfUrl`**: không có cột riêng → đang mượn `webUrl`. Cần cột schema nếu muốn phân biệt rõ.
2. **`created` / `modified` / `author` / `editor`**: có ở runtime (cast trong mapper) nhưng **chưa khai báo trong `IDocument`** → nên thêm field optional vào interface để view-model đọc type-safe (không cần đổi schema SharePoint, chỉ khai báo TS).
3. **`VanBanThayThe`, `editPropertiesUrl`**: có trong model nhưng `toDetailDoc` chưa map → bổ sung khi UI chi tiết cần.

---

---

## 5. Technical debt — File / PDF URL contract

> Ghi nhận nợ kỹ thuật để pha sau chuẩn hóa. **Chưa giải quyết ở Phase 4.5** (read-only).

- **`PrimaryPdfUrl` chưa có field riêng trong `IDocument`.** Không có cột schema dành riêng cho "URL PDF chính".
- **Tạm dùng `webUrl`** (`toDetailDoc.primaryPdfUrl = d.webUrl`) để mở file trên SharePoint. `webUrl` là URL mở file gốc (Office Web Apps / PDF viewer của SharePoint), không phải link download trực tiếp hay stream PDF.
- **`EditableSourceUrl` dùng `editableSource.webUrl` nếu có** (`toDetailDoc.editableSourceUrl`). Rỗng khi không ghép được bản mềm (DOCX/XLSX) đi kèm.
- **ID contract (tham chiếu mục 2):** Search → Detail dùng chung `IDocument.id`; `[id]` route find bằng `d.id === id`, không fallback field khác.
- **Phase sau cần chuẩn hóa file URL:** tách rõ `PrimaryPdfUrl` (cột riêng / mapper), cơ chế **download** trực tiếp, **proxy** (nếu cần bypass auth SharePoint cho viewer), và **PDF preview** nhúng thật (hiện `DocumentPreview` là mock). Khi đó cập nhật `IDocument` + mapper + view-model thay vì mượn `webUrl`.

---

## 6. Ràng buộc an toàn đã giữ (Phase 4.5)

- ✅ Chỉ thêm route **GET** read-only — không POST/PATCH/PUT/DELETE, không `uploadSession`, không Graph write.
- ✅ Không tạo write route, không bật write API.
- ✅ Không đổi metadata schema, không đổi auth/scope, không đổi env production.
- ✅ Không sửa/commit 6 file dev-login; route mới không import `docsForRequest.ts`.
- ✅ `tsc --noEmit` 0 lỗi; `next build` Compiled successfully (route `/api/documents/[id]` đăng ký dạng dynamic `ƒ`).
