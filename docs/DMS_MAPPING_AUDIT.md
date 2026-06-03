# DMS MAPPING AUDIT — vì sao 1312 file → 696 documents

> **Phase:** 3 — Mapping Audit. Phân tích chuỗi `rawItemCount → fileItemCount → documents` và mapper.
> **Số liệu hiện tại:** raw ~1342 · file ~1312 · documents ~696.
> Đã thêm diagnostic: `[MAP]` log + `GET /api/documents?debug=1` → `debug.stats` (xem §6).

---

## 1. Chuỗi giảm số lượng (đọc từ code)

```
rawItemCount (~1342)   = mọi list item Graph trả về (gồm cả FOLDER)
   │  − folder / item không phải file:  filter (it.driveItem && it.driveItem.file && !it.driveItem.folder)
   ▼
fileItemCount (~1312)  = chỉ các FILE   (≈ 30 folder bị loại)
   │  − map: mapSharePointItemToDocument (1:1, không loại)
   ▼
mapped (~1312)         = IDocument cho TỪNG file (PDF + DOCX + ...)
   │  − pairDocuments: PDF-first (gom theo folder::basename)
   ▼
documents (~696)       = chỉ nhóm CÓ PDF (PDF=primary, DOCX cùng tên = editableSource)
```

## 2. Số lượng bị loại & rule loại

| Bước | Rule | Bị loại / gộp |
|---|---|---|
| Folder filter | `!driveItem || !driveItem.file || driveItem.folder` → loại | ~30 folder (1342→1312) |
| Pairing (gộp) | Nhóm `(folderPath :: normalizeBaseFileName)`; **có PDF** → 1 document, DOCX/XLSX cùng tên gắn làm `editableSource` | mỗi cặp PDF+DOCX (2 file) → **1** document |
| Pairing (ẩn) | Nhóm **không có PDF** (chỉ DOCX/XLSX/PPTX standalone) → **ẩn khỏi list** | toàn bộ file trong nhóm đó bị bỏ khỏi `documents` |

→ **1312 → 696 là CÓ CHỦ ĐÍCH theo PDF-first** (giống SPFx gốc), KHÔNG phải lỗi mất dữ liệu. Cấu thành:
`documents = số nhóm có PDF`. Phần "biến mất" = (a) file DOCX/XLSX **gộp** vào PDF (vẫn còn dưới dạng `editableSource`), + (b) DOCX/XLSX **standalone bị ẩn** (không có PDF).

### Folder bị loại
Folder cấp lưu trữ (`[NN] ...`) là *container*, không phải document → loại đúng. (SPFx cũng chỉ tính file, `FSObjType eq 0`.)

### Extension
- `.pdf` → **primary document**.
- `.doc/.docx/.xls/.xlsx/.ppt/.pptx` → **editableSource** nếu cùng tên PDF; **ẩn** nếu standalone.
- Khác (vd `.png`, `.zip`) → rơi vào nhóm không-PDF → ẩn (trừ khi vô tình cùng tên 1 PDF).

## 3. Kiểm tra mapper (field-by-field)

| Field IDocument | Nguồn Graph (`fields.*` / `driveItem`) | Fallback | Ghi chú/Rủi ro |
|---|---|---|---|
| `id` | `item.id` | `fields.id` | OK |
| `soVanBan` | `SoVanBan` | `''` | rỗng nếu thiếu |
| `trichYeu` | `TrichYeu` | **derive từ tên file** (`extractTrichYeuFromName`) | fallback có thể lệch |
| `loaiVanBan` | `LoaiVanBanPhapLy` ?? `LoaiVanBan` | `'Khác'` | V2 ưu tiên |
| `loaiVanBanKey` | map từ `loaiVanBan` (`LOAI_TO_KEY`) | `'KHAC'` | derived |
| `loaiTaiLieu` | `LoaiTaiLieu` | `undefined` | passthrough |
| `nhomTaiLieu` | `NhomTaiLieu` | `undefined` | dùng cho nhóm + isExpired |
| `chuDeNghiepVu` | `ChuDeNghiepVu` | `undefined` | passthrough |
| `donViPhatHanh` | `DonViPhatHanh` | `undefined` | passthrough |
| `donViSoHuu` | `DonViSoHuu` | `undefined` | = nhãn cấp lưu trữ |
| `donViCode` | `[NN]` trong `DonViSoHuu` ?? `DON_VI_TO_CODE[donViSoanThao]` | `'KHAC'` | derived |
| `donViSoanThao` | `DonViSoHuu` ?? `DonViSoanThao` | `'Khác'` | V2 ưu tiên |
| `nguoiKy` | `NguoiKy` (readPerson) | `''` | ⚠️ **Person field** — xem §5 |
| `namBanHanh` | `NamBanHanh` | `yearFromDate(NgayBanHanh)` | derived nếu thiếu |
| `ngayBanHanh` | `NgayBanHanh` (cắt 10 ký tự) | `''` | OK |
| `ngayHetHieuLuc` | `NgayHetHieuLuc` | `undefined` | OK |
| `trangThai` | `TrangThai` (mapStatus) | `DocStatus.Active` | **default Active** nếu thiếu |
| `mucDoBaoMat` | `MucDoBaoMat` (mapSecurity) | `SecurityLevel.Internal` | **default Nội bộ** |
| `fileKind` | từ ext | `'docx'` | derived |
| `webUrl` | `driveItem.webUrl` | `undefined` | thay `EncodedAbsUrl?web=1` của SPFx |
| `serverRelativeUrl` | `fields.FileRef` | derive `folderPath/fileName` | ⚠️ xem §5 (pairing phụ thuộc) |
| `fileName` | `driveItem.name` ?? `FileLeafRef` | — | OK |
| `fileExt` | từ `fileName` | `''` | derived |
| `fileSizeKB` | `driveItem.size/1024` | `undefined` | mới (SPFx để trống) |
| `editableSource` | `HasEditableSource`+`EditableSourceUrl` (cột) **hoặc** file DOCX cùng tên (pairing) | `undefined` | OK |
| `vanBanThayThe` | `VanBanThayThe` | `undefined` | passthrough |
| `vanBanLienQuan` | `VanBanLienQuan` | `undefined` | passthrough |
| `tags` | `Tags` | `undefined` | passthrough |
| `folderUrl` | `FileDirRef` ?? `driveItem.parentReference.path` | `undefined` | derived |
| (+`created/modified/author/editor`) | `driveItem.*` | `undefined` | gắn kèm, ngoài IDocument core |

## 4. Field đang FALLBACK (default/derived khi thiếu)
- `trichYeu` ← tên file · `loaiVanBan` ← `'Khác'` · `namBanHanh` ← năm của `NgayBanHanh` · `donViCode` ← `'KHAC'` · `trangThai` ← `Đang lưu hành` · `mucDoBaoMat` ← `Nội bộ`.
- → Các default này ảnh hưởng KPI (vd default `Đang lưu hành` làm `activeDocuments` cao hơn thực tế nếu nhiều item thiếu `TrangThai`).

## 5. Field CHƯA map chắc / rủi ro (cần xác nhận bằng dữ liệu thật)
1. ⚠️ **`NguoiKy` (Person/Group field):** Graph `$expand=fields` thường trả `NguoiKyLookupId` (id), KHÔNG trả tên hiển thị → `readPerson` có thể ra `''`. SPFx cũ cũng để trống. **Cần:** xác nhận internal name + cách lấy display (vd expand riêng, hoặc cột text phụ).
2. ⚠️ **`PrimaryPdfUrl`:** mapper đọc `HasEditableSource`/`EditableSourceUrl` nhưng **không** lưu `PrimaryPdfUrl` vào `IDocument` (model không có field này). Read OK cho editableSource; nếu cần hiển thị link PDF gốc của bản mềm thì chưa có.
3. ⚠️ **`FileRef`/`FileDirRef`:** Graph `fields` có thể **không** trả các cột hệ thống này mặc định → `serverRelativeUrl`/`folderPath` rơi về `driveItem.parentReference.path`. Nếu **cả hai** thiếu → `folderPath=''` → **pairing gom nhầm** các file trùng basename ở khác folder. **Cần:** xác nhận `driveItem.parentReference.path` luôn có (thường có khi `$expand=driveItem`).
4. ⚠️ **Item không có `driveItem`:** nếu Graph không expand được driveItem cho 1 item → bị loại khỏi `fileItemCount` (coi như không phải file) → có thể bỏ sót. **Cần:** so `fileItemCount` với số file kỳ vọng.
5. **Date timezone:** `isoDate` cắt 10 ký tự đầu — đúng nếu Graph trả ISO UTC; cần xác nhận không bị lệch ngày do timezone.

## 6. Cách lấy số liệu thật (diagnostic đã thêm)
```
# Sau khi đăng nhập:
GET http://localhost:3000/api/documents?debug=1
→ { ok, rawItemCount, fileItemCount, count, debug: { pages, stats } }

stats = {
  mappedFiles, byExt:{".pdf":n,".docx":n,...},
  groups, groupsWithPdf (=documents), groupsWithoutPdf (ẩn), filesInDroppedGroups,
  pdfFiles, editableFiles, otherFiles,
  missingKeyField:{ soVanBan, nhomTaiLieu, donViSoHuu, ngayBanHanh }
}
```
Server log `[MAP] raw=.. file=.. documents=.. byExt=.. missingKeyField=..` in cùng nội dung.

### Bảng điền sau khi chạy
| Chỉ số | Giá trị |
|---|---|
| rawItemCount | |
| fileItemCount | |
| documents (groupsWithPdf) | |
| groupsWithoutPdf (ẩn) | |
| filesInDroppedGroups | |
| byExt | |
| missingKeyField | |

→ Dùng để xác nhận 1312→696 đúng theo PDF-first, và phát hiện file bị ẩn ngoài ý muốn (vd PDF đặt sai tên không match DOCX).

## 7. Kết luận
- Reduction 1312→696 **đúng thiết kế PDF-first**, không phải mất dữ liệu — nhưng cần `?debug=1` để xác nhận `groupsWithoutPdf` (DOCX standalone bị ẩn) có hợp lý không.
- Rủi ro mapper cần xử lý ở phase sau: `NguoiKy`, `FileRef/FileDirRef` (pairing), default `TrangThai/MucDoBaoMat` ảnh hưởng KPI. **Không sửa trong phase audit.**
