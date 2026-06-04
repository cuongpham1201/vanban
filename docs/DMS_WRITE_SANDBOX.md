# DMS Write Sandbox (Phase 10D.2)

> Dry-run chứng minh pipeline write hoạt động — **KHÔNG upload file, KHÔNG PATCH metadata, KHÔNG ghi dữ liệu.**

Cập nhật: Phase 10D.2.

## Mục đích
Xác minh end-to-end (trừ bước ghi thật) trước khi làm Upload Write (10D.3+):
mint app-only token → app đọc được site/library → resolve folder theo `DonViSoHuu`
→ duplicate-check theo `SoVanBan` → validate/normalize metadata.

## Route
`GET /api/admin/write-sandbox?soVanBan=...&donViSoHuu=...&trichYeu=...&nhomTaiLieu=...`
- **Gate:** `assertCanWriteDms(session)` → cần `DMS_WRITE_ENABLED=true` **và** email ∈ `DMS_WRITE_ALLOWED_EMAILS`.
- Read-only, fail-soft từng bước, luôn trả `wrote: false`.
- Không trả raw token.

### Các bước báo cáo
| Step | Hành động | Ghi? |
|---|---|---|
| `appOnlyToken` | mint client-credentials token | Không (auth) |
| `appAccess` | `resolveSiteId` + `resolveListId` bằng app token (chứng minh Application perms đọc được) | Không (GET) |
| `folder` | liệt kê folder cấp 1, so khớp `DonViSoHuu` | Không (GET) |
| `duplicate` | quét `SoVanBan` trong cache | Không (GET) |
| `metadata` | normalize + validate (pure) + gợi ý tên file | Không |

## App-only token flow
`lib/graph/appToken.ts` → `getAppOnlyGraphToken()`:
- Chặn cứng nếu `isDmsWriteEnabled()` false.
- POST `{tenant}/oauth2/v2.0/token`, `grant_type=client_credentials`, `scope=https://graph.microsoft.com/.default`, dùng `AZURE_AD_CLIENT_SECRET` (đã có cho NextAuth).
- Cache RAM theo `expires_in`. Không log/không trả token ra client.

## Vì sao KHÔNG ghi dữ liệu
- Route chỉ gọi **GET** Graph + duplicate-check (read) + validate (pure).
- `uploadPdf` / `uploadEditableSource` / `patchMetadata` **vẫn NotImplemented** và **không được route gọi**.
- Trả `wrote: false`.

## Bật sandbox (chỉ môi trường sandbox/dev)
```
DMS_WRITE_ENABLED=true
DMS_WRITE_ALLOWED_EMAILS=admin@biahalong.com
# (đã có) AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET
```
⚠️ KHÔNG bật trên production cho tới khi Upload Write hoàn tất + kiểm thử.

---

# Phase 10D.3B — Upload Write (sandbox/allowlist)

## Route ghi: `POST /api/documents/upload`
> Đặt ở `/documents/upload` (KHÔNG phải `POST /api/documents`) vì `app/api/documents/route.ts` mang thay đổi dev-login chưa commit — tránh lẫn scope.

**Gate (bắt buộc):** `assertCanWriteDms(session)` → cần `DMS_WRITE_ENABLED=true` + email ∈ `DMS_WRITE_ALLOWED_EMAILS`. Thực thi bằng **app-only token** (Application ReadWrite).

**Flow:** session → assertCanWriteDms → parse multipart → idempotency → validate (pdf + 3 field bắt buộc) → buildDocumentFileName → duplicate-check → app-only token → resolve folder → upload PDF → (optional) bản mềm → PATCH metadata (retry 2) → invalidate cache → read-back → 201.

**Mã trả:** `201` thành công · `401` chưa login · `403` write disabled/not allowed · `404` folder không khớp (kèm candidates) · `409` trùng SoVanBan (kèm matches) / đang xử lý · `413` file >60MB · `422` thiếu PDF/field/tên file · `502` lỗi Graph (kèm `rolledBack`).

## File naming
Theo `lib/dms/fileNaming.ts` (`buildDocumentFileName`) — source of truth. `<SoVanBan>-<TrichYeuKhôngDấu>[.dd-mm-yyyy].pdf`. Metadata giữ tiếng Việt; chỉ tên file vật lý bỏ dấu. Loại HĐ/GUQ/BM/Văn bản đến/đi thiếu cột → **422** (không fallback).

## Rollback
- PDF lỗi → fail luôn.
- Bản mềm lỗi → giữ PDF, `HasEditableSource=false`, trả `warning`.
- PATCH lỗi → retry 2 → vẫn fail → **xóa PDF + bản mềm** (`deleteUploadedFile`), trả `502 rolledBack=true`.

## Idempotency
`lib/dms/idempotency.ts` (in-memory, TTL 10 phút), key = `userEmail + idempotencyKey`. Double-click/F5/retry → replay kết quả cũ (200) hoặc 409 "đang xử lý". UI sinh key bằng `crypto.randomUUID()`.

## Upload Wizard
- `GET /api/dms/write-status` → `{ canWrite }`. UI fetch lúc mount.
- `canWrite=false` → giữ nguyên **mô phỏng** (không gọi write).
- `canWrite=true` → "Xuất bản" gọi POST thật (loading, lỗi duplicate/folder/validation, warning bản mềm, success kèm link mở chi tiết).

## Cache invalidation
Sau 201: `invalidateDocumentsCache('upload')` + `getCachedDocuments(force)` → Search thấy ngay.

## Tắt khẩn cấp
Đặt `DMS_WRITE_ENABLED=false` (hoặc bỏ env) → mọi write 403 ngay (app-only token cũng không mint). Hoặc xóa email khỏi `DMS_WRITE_ALLOWED_EMAILS`.

## Folder mapping (technical debt)
`DonViSoHuu` phải là **nhãn folder đầy đủ** (vd `[16] Phòng Hành Chính - Nhân Sự`), không dùng mã viết tắt. Hiện UI nhập tay → cần dropdown nạp folder động ở phase sau.

## Chưa làm (cố ý)
- Chưa Replace Write (quan hệ VanBanThayThe/VanBanLienQuan hai chiều).
- Chưa resumable upload session (>60MB → 413).
- Chưa upload bản mềm từ UI (Wizard hiện 1 file → gửi làm PDF); editable optional đã hỗ trợ ở API.
- Chưa schema change (PrimaryPdfUrl vẫn dùng webUrl).
- Chưa mở production user (chỉ allowlist).
