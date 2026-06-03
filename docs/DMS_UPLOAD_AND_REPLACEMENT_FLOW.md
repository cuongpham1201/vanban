# DMS UPLOAD & REPLACEMENT FLOW — Thiết kế nghiệp vụ

> **Phase:** 5 — Design. Thiết kế 3 nghiệp vụ ghi: Upload mới · Sửa metadata · Thay thế.
> **Trạng thái hiện tại:** preview READ-ONLY — `ApiDmsService` ném `Read-only Graph preview...` cho mọi write. Tài liệu này chuẩn bị cho phase implement (chưa code, chưa ghi SharePoint).
> **Nền tham chiếu:** logic SPFx `SharePointDmsService.uploadDocument/_mergeItem/_uploadFile` (đã audit) + V3 metadata (`ReplacesDocumentId`/`ReplacedByDocumentId`).

---

## 1. Ba nghiệp vụ — khác biệt cốt lõi

| Nghiệp vụ | Tạo document mới? | Đụng file? | Đụng document khác? |
|---|---|---|---|
| **Upload mới** | ✅ Có | ✅ Upload PDF (+ bản mềm) | Không |
| **Sửa metadata** | ❌ Không | ❌ Không | Không |
| **Thay thế** | ✅ Có (bản mới) | ✅ Upload PDF mới | ✅ Bản cũ → hết hiệu lực + link |

---

## 2. Flow 1 — Upload văn bản mới

```
[Validate] → [Upload PDF vào folder CapLuuTru] → [Lấy itemId] → [Set metadata]
          → (nếu có bản mềm) [Upload DOCX cùng folder, cùng base name] → [Copy metadata] → [Set Has/EditableSourceUrl/PrimaryPdfUrl 2 phía]
          → [Refresh cache] → [Trả document mới]
```
Graph (phase implement):
- Upload nhỏ: `PUT /sites/{site}/drive/root:/{folder}/{name}:/content`; lớn (>4MB): `createUploadSession`.
- Lấy listItem: `?$expand=listItem`; set metadata: `PATCH /sites/{site}/lists/{list}/items/{id}/fields`.

### Validation (Upload mới)
| Rule | Bắt buộc | Lỗi |
|---|---|---|
| File là PDF | ✅ | "File chính phải là PDF" |
| Kích thước ≤ 100MB | ✅ | "File vượt 100MB" |
| `SoVanBan` không rỗng | ✅ | "Thiếu Số văn bản" |
| `CapLuuTru` (folder) tồn tại | ✅ | "Cấp lưu trữ không tồn tại" |
| `NhomTaiLieu` + `LoaiTaiLieu` | ✅ | "Thiếu phân loại" |
| `NgayBanHanh` hợp lệ | ✅ | "Ngày ban hành không hợp lệ" |
| `CongTy` (V3) | ✅ | "Thiếu Công ty" |
| Trùng `SoVanBan` trong cùng `CongTy` | cảnh báo | "Đã tồn tại số VB … — tiếp tục?" |
| Bản mềm (nếu có) ∈ {doc,docx,xls,xlsx,ppt,pptx} | ✅ | "Bản mềm sai định dạng" |

## 3. Flow 2 — Sửa metadata (KHÔNG tạo document mới)
```
[Validate field] → PATCH /lists/{list}/items/{id}/fields → [Refresh] → [Trả document đã cập nhật]
```
- Không upload, không tạo item. Chỉ ghi cột.
- Validation: cùng rule field như trên (trừ file). Ngày: ISO; Number: `NamBanHanh`. Bỏ field rỗng (giữ giá trị cũ) — giống `_mergeItem` SPFx.
- Bulk edit (`updateMetadataMany`): ghi tuần tự từng item, lỗi 1 item không chặn item khác, trả `{ok, failed, errors}`.

## 4. Flow 3 — Thay thế văn bản
```
[Validate + kiểm tra chain hợp lệ]
 → [Upload bản MỚI] (như Flow 1)
 → [Set trên bản MỚI]:  ReplacesDocumentId = oldId
 → [Set trên bản CŨ]:   ReplacedByDocumentId = newId
                        TrangThai = 'Hết hiệu lực'
                        NhomTaiLieu = 'Hết hiệu lực'    (giữ tương thích isExpired V2)
                        NgayHetHieuLuc = today  (+ NgayHieuLucDen = today nếu V3)
                        VanBanThayThe = SoVanBan(mới); VanBanLienQuan = "Được thay thế bởi: …"
 → [Refresh] → [Trả {document mới, oldDocUpdated, warning?}]
```
> Giữ đúng hành vi SPFx (`uploadDocument` khi có `replacementOldId`) + **bổ sung** link id-based V3.

### Vòng lặp thay thế & Document chain
- **Chain** = danh sách liên kết đôi qua `ReplacesDocumentId` (lùi) / `ReplacedByDocumentId` (tiến): `A ← B ← C`.
- `getChain(id)`: đi lùi tới gốc + tiến tới đầu → toàn bộ lịch sử.
- `getLatest(id)`: theo `ReplacedByDocumentId` tới khi không còn → bản hiệu lực hiện hành.
- **Quy tắc chống lặp/ô nhiễm chain:**
  1. `oldId ≠ newId`.
  2. **Chỉ được thay thế bản "đầu chuỗi"** (bản chưa có `ReplacedByDocumentId`). Nếu chọn 1 bản đã bị thay thế → cảnh báo + gợi ý chuyển sang bản mới nhất (`getLatest`).
  3. **Cycle guard:** trước khi set, kiểm tra `newId` không nằm trong tổ tiên của `oldId` (đi lùi từ oldId không gặp newId) → tránh `A→B→A`.
  4. Một bản chỉ có **tối đa 1** `ReplacedByDocumentId` (không nhánh).

### Validation (Thay thế)
- Tất cả rule Upload mới, **cộng**: `oldId` tồn tại & đang hiệu lực & là đầu chuỗi; pass cycle guard.

## 5. Rollback / Compensation strategy
> SharePoint **không có transaction** → dùng *compensating actions* + đánh dấu cần sửa.

| Bước | Nếu lỗi | Hành động |
|---|---|---|
| Upload PDF | lỗi | Dừng, báo lỗi (chưa tạo gì) — không cần rollback |
| Set metadata (sau upload) | lỗi | **Compensation:** recycle file vừa upload (rollback sạch) **hoặc** giữ file + set `MetadataConfidence='NeedsReview'` + trả `warning`. *Đề xuất:* recycle nếu thiếu field khóa; giữ+flag nếu chỉ lỗi field phụ |
| Upload bản mềm | lỗi | Giữ PDF (đã publish) + `warning` "PDF OK, bản mềm lỗi — bổ sung sau" (giống SPFx) |
| (Thay thế) cập nhật bản CŨ | lỗi | **KHÔNG** xóa bản mới (đã là bản ban hành chính thức). Trả `warning` + đưa bản cũ vào hàng đợi "cần xử lý" (`NeedsReview`) để repair link sau |
| Set link 2 chiều | lỗi 1 phía | Dùng `_mergeItemSafe` (best-effort) + log; repair job đồng bộ lại chain sau |

**Idempotency:** mỗi bước ghi nên idempotent (set lại cùng giá trị không gây hại) → cho phép retry an toàn. Lưu **operation log** (uploadId, các bước done) để repair/rollback thủ công khi cần.

**Repair job (đề xuất):** quét document có chain lệch (vd new có `ReplacesDocumentId` nhưng old thiếu `ReplacedByDocumentId`) → hàn lại link.

## 6. Quyền (liên kết DMS_PERMISSION_MODEL.md)
- Upload mới: `Upload`. Sửa metadata: `Edit Metadata`. Thay thế: `Replace Document`. Theo scope `CongTy`.

## 7. Ranh giới phase này
- ❌ KHÔNG implement, KHÔNG ghi SharePoint, KHÔNG bật write trong `ApiDmsService`.
- ✅ Chỉ thiết kế flow + validation + rollback + chain.

## 8. Checklist khi implement
- [ ] API write routes (`POST /api/documents/upload`, `PATCH /api/documents/:id`, `POST /api/documents/replace`) + Graph upload session.
- [ ] Validation layer (zod) theo bảng §2–§4.
- [ ] Chain helpers `getChain/getLatest` + cycle guard.
- [ ] Compensation + operation log + repair job.
- [ ] Bật quyền theo permission matrix.
