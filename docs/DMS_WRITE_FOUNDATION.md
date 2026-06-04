# DMS Write Foundation (Phase 10C)

> Nền móng cho Upload Write. **Chưa mở write cho người dùng.** Không upload thật,
> không replace write, không schema change. Mọi write đều inert ở phase này.

Cập nhật: Phase 10C.

---

## 1. Feature flag

| Env | Mặc định | Ý nghĩa |
|---|---|---|
| `DMS_WRITE_ENABLED` | `false` (nếu không set) | `=true` mới bật write. Production không set → write tắt. |

Helper: `lib/dms/writeConfig.ts`
- `isDmsWriteEnabled(): boolean` — chỉ `true` khi env `='true'` (so khớp tường minh).
- `DMS_WRITE_DISABLED_MSG = 'DMS write is disabled'`.

Chỉ đọc ở **server** (`process.env`), KHÔNG `NEXT_PUBLIC_` → không lộ ra client.

## 2. Permission guard

File: `lib/dms/writeGuard.ts`
- `assertCanWriteDms(session)` — gọi đầu mỗi write API tương lai. Thứ tự fail:
  1. flag tắt → `403 "DMS write is disabled"`
  2. chưa đăng nhập → `401 "not authenticated"`
  3. email ngoài domain → `403 "write not allowed"`
  4. không thuộc allowlist → `403 "write not allowed"`
- `canWriteDms(session)` — boolean (cho UI ẩn/hiện nút sau này).
- `getWriteAllowlist()` — đọc env, lowercased.
- `DmsWriteError { status }`.

| Env | Mặc định | Ý nghĩa |
|---|---|---|
| `DMS_WRITE_ALLOWED_EMAILS` | rỗng → **không ai** được write | `a@biahalong.com,b@biahalong.com` |
| `ALLOWED_EMAIL_DOMAIN` | `biahalong.com` | Domain công ty (đã dùng cho auth) |

Giai đoạn đầu dùng allowlist env; về sau thay bằng SharePoint group.

## 3. Service foundation

File: `lib/dms/sharepointDmsService.ts` — `SharePointDmsService(accessToken)`.
- Khởi tạo **không side-effect**; KHÔNG gọi Graph lúc import.
- **READ-ONLY an toàn:** `checkDuplicateBySoVanBan(soVanBan)` (dùng cache chung, không ghi).
- **PURE:** `prepareMetadata(input, {hasEditableSource})` (validate + normalize), `buildFileName(soVanBan, ext)`.
- **WRITE (chưa mở):** `resolveUploadFolder / uploadPdf / uploadEditableSource / patchMetadata`
  → `assertWriteEnabled()` rồi `NotImplementedError`. ⇒ flag tắt: "DMS write is disabled"; flag bật: "NotImplemented" (**vẫn không ghi**).
- `graphWrite()` (protected, low-level) chặn cứng theo flag; **chưa có caller** ở 10C.

Pure helpers: `lib/dms/writeHelpers.ts` — `sanitizeFileName, buildFileName, deriveYear, validateUploadMetadata, normalizeMetadataPayload`, `REQUIRED_COLUMNS = [SoVanBan, TrichYeu, NhomTaiLieu]`.

## 4. Upload write flow dự kiến (Phase 10D)

1. `assertCanWriteDms(session)`.
2. `checkDuplicateBySoVanBan` → nếu trùng: **cảnh báo** (không ghi đè ngầm), gợi ý chuyển `/replace?old=<id>`.
3. `resolveUploadFolder(capLuuTru)` theo Cấp lưu trữ (`DonViSoHuu`).
4. `uploadPdf` (uploadSession nếu >4MB) — **PDF bắt buộc**.
5. (tùy chọn) `uploadEditableSource` (DOCX/XLSX/PPTX) cùng folder.
6. `prepareMetadata` → `patchMetadata` (set cột; `EditableSourceUrl/HasEditableSource` sinh từ bước 5; `PrimaryPdfUrl` tạm dùng `webUrl`).
7. Đọc lại document trả về UI.

## 5. Duplicate-check
- Read-only trên cache (`checkDuplicateBySoVanBan`).
- Quy tắc: **cảnh báo**, cho người dùng quyết định (tạo mới có chủ đích / sang Replace). Không ghi đè ngầm, không chặn cứng.

## 6. Metadata mapping (KHÔNG schema change)
- Dùng đúng cột đã tồn tại (mapper đang đọc): `SoVanBan, TrichYeu, NhomTaiLieu, LoaiVanBanPhapLy, LoaiTaiLieu, ChuDeNghiepVu, NguoiKy, NamBanHanh, NgayBanHanh, NgayHetHieuLuc, TrangThai, MucDoBaoMat, DonViPhatHanh, DonViSoHuu, Tags, VanBanThayThe, VanBanLienQuan, EditableSourceUrl, HasEditableSource, NguonMetadata, MetadataConfidence`.
- Bắt buộc: `SoVanBan, TrichYeu, NhomTaiLieu`. Sinh tự động: `NguonMetadata, MetadataConfidence, TrangThai (mặc định), NamBanHanh (suy), HasEditableSource`.
- **Điều chỉnh 10C:** CHƯA thêm cột `PrimaryPdfUrl` → PDF chính tạm dùng `webUrl`. `EditableSourceUrl/HasEditableSource` giữ nguyên.

## 7. Replace write — chỉ technical note (chưa làm)
- Phase 10C **không** triển khai Replace Write.
- Quyết định để Phase Replace Write: lưu quan hệ `VanBanThayThe/VanBanLienQuan` dạng **hybrid id|text** trong cột text hiện có, **hoặc** thêm cột riêng — chốt sau. Ghi hai chiều + chuyển bản cũ `TrangThai='Hết hiệu lực'`.

## 8. Rollback strategy
- Upload (10D) không nguyên tử: nếu PDF OK nhưng PATCH metadata fail → đánh dấu/để dọn (cân nhắc xóa file vừa tạo hoặc gắn cờ "cần rà soát").
- Tận dụng **SharePoint version history** (bật trên library) để rollback bytes.
- Mọi thao tác chạy bằng token **delegated** → SharePoint permission của user tự enforce.

## 9. Graph scope & rollout
- **Cần nâng delegated scope:** `Sites.ReadWrite.All` (+ `Files.ReadWrite.All` nếu thao tác trực tiếp drive item) trên Entra app "Vanbandieuhanh-API".
- Cần **admin consent**; **user phải đăng nhập lại** để token có scope mới.
- Rollout: bật ở **sandbox/dev** trước (`DMS_WRITE_ENABLED=true` + allowlist nội bộ) → kiểm thử → mới bật production.

## 10. Env cần thêm (khi rollout, KHÔNG set ở 10C)
```
DMS_WRITE_ENABLED=false
DMS_WRITE_ALLOWED_EMAILS=
# (đã có) ALLOWED_EMAIL_DOMAIN=biahalong.com
```

## 11. Những việc CHƯA làm (cố ý)
- Chưa nối Upload Wizard / Replace UI vào write.
- Chưa có write API route nào (`/api/documents` vẫn chỉ GET).
- Chưa implement `uploadPdf/patchMetadata/resolveUploadFolder` (NotImplemented).
- Chưa thêm cột `PrimaryPdfUrl`, chưa đổi schema.
- Chưa nâng Graph scope / chưa set env write.
