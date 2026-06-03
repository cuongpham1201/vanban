# DMS V3 METADATA — Thiết kế bổ sung

> **Phase:** 4 — Design. **CHỈ thiết kế**, KHÔNG tạo/đổi cột trên SharePoint trong phase này.
> **Nguyên tắc:** V3 là **bổ sung (additive)** trên nền V2 — không xóa/đổi cột V2 hiện có.

---

## 1. Mục tiêu
Bổ sung 6 cột để: (a) phân biệt **pháp nhân** (Hạ Long / Đông Mai / chung) phục vụ permission scope; (b) mô hình hóa **hiệu lực** rõ ràng (theo thời hạn vs đến khi bị thay thế); (c) chuẩn hóa **chuỗi thay thế** bằng id (thay cho text V2).

## 2. Cột mới

### 2.1 `CongTy` — Choice (single)
| Thuộc tính | Giá trị |
|---|---|
| Internal name | `CongTy` |
| Kiểu | Choice (single, dropdown) |
| Choices | `Công ty CP Bia và NGK Hạ Long` · `Công ty CP Bia và NGK Đông Mai` · `Áp dụng chung` |
| Default | (đề xuất) `Áp dụng chung` |
| Bắt buộc | Khuyến nghị bắt buộc khi upload V3 |
| Dùng cho | Permission scope (`HaLong`/`DongMai`/`All` — xem DMS_PERMISSION_MODEL.md), filter, badge |

### 2.2 `KieuHieuLuc` — Choice (single)
| Thuộc tính | Giá trị |
|---|---|
| Internal name | `KieuHieuLuc` |
| Kiểu | Choice (single) |
| Choices | `Theo thời hạn` · `Đến khi có văn bản thay thế` |
| Default | `Đến khi có văn bản thay thế` |
| Logic | `Theo thời hạn` → dùng `NgayHieuLucDen`. `Đến khi có VB thay thế` → hiệu lực đến khi `ReplacedByDocumentId` được set |

### 2.3 `NgayHieuLucTu` — DateTime (Date only)
| | |
|---|---|
| Internal name | `NgayHieuLucTu` |
| Kiểu | Date |
| Ý nghĩa | Ngày BẮT ĐẦU hiệu lực (tách khỏi `NgayBanHanh`) |
| Default | = `NgayBanHanh` nếu để trống |

### 2.4 `NgayHieuLucDen` — DateTime (Date only)
| | |
|---|---|
| Internal name | `NgayHieuLucDen` |
| Kiểu | Date |
| Ý nghĩa | Ngày KẾT THÚC hiệu lực — chỉ dùng khi `KieuHieuLuc = Theo thời hạn` |
| Quan hệ V2 | **Thay** vai trò của `NgayHetHieuLuc` (V2). Xem §4 backward-compat |

### 2.5 `ReplacesDocumentId` — Text (item id)
| | |
|---|---|
| Internal name | `ReplacesDocumentId` |
| Kiểu | Single line text (lưu SharePoint item id dạng string) |
| Ý nghĩa | Văn bản này THAY THẾ văn bản nào (trỏ về bản cũ) |

### 2.6 `ReplacedByDocumentId` — Text (item id)
| | |
|---|---|
| Internal name | `ReplacedByDocumentId` |
| Kiểu | Single line text (item id) |
| Ý nghĩa | Văn bản này BỊ THAY THẾ bởi văn bản nào (trỏ tới bản mới) |

> **Text vs Lookup cho 2 cột id:** đề xuất **Text (item id)** — đơn giản, tránh giới hạn/throttling của Lookup khi library lớn, dễ build chain ở app. Nếu cần ràng buộc toàn vẹn referential, có thể nâng lên Lookup sau. Lưu **id** (không lưu SoVanBan) để bền vững khi đổi số.

## 3. Map sang `IDocument` (đề xuất — additive, optional)
```ts
// types/dms.ts (đề xuất bổ sung — KHÔNG xóa field cũ)
congTy?: string;                 // CongTy
kieuHieuLuc?: string;            // KieuHieuLuc
ngayHieuLucTu?: string;          // NgayHieuLucTu (ISO yyyy-mm-dd)
ngayHieuLucDen?: string;         // NgayHieuLucDen
replacesDocumentId?: string;     // ReplacesDocumentId
replacedByDocumentId?: string;   // ReplacedByDocumentId
```
- Tất cả **optional** → mapper cũ vẫn chạy nếu cột chưa tồn tại (fallback `undefined`, giống cơ chế V2 hiện tại).

## 4. Quan hệ với V2 (backward-compat)

| Khía cạnh | V2 hiện tại | V3 | Chiến lược |
|---|---|---|---|
| Hết hiệu lực | `NgayHetHieuLuc` + `TrangThai='Hết hiệu lực'` / `NhomTaiLieu='Hết hiệu lực'` | `KieuHieuLuc` + `NgayHieuLucDen` + `ReplacedByDocumentId` | Giữ `isExpired` V2; **bổ sung** đánh giá V3 nhưng KHÔNG đổi định nghĩa cũ trong phase này |
| Thay thế | `VanBanThayThe` / `VanBanLienQuan` (text) | `ReplacesDocumentId` / `ReplacedByDocumentId` (id) | Khi backfill: parse text → id nếu có thể; giữ song song |
| Ngày ban hành | `NgayBanHanh` | giữ nguyên + thêm `NgayHieuLucTu` | `NgayHieuLucTu` default = `NgayBanHanh` |

> **Định nghĩa hiệu lực V3 (đề xuất, áp dụng ở phase sau, KHÔNG đổi bây giờ):**
> `isExpiredV3(d)` = `TrangThai='Hết hiệu lực'` **OR** (`KieuHieuLuc='Theo thời hạn'` AND `NgayHieuLucDen < today`) **OR** (`KieuHieuLuc='Đến khi có VB thay thế'` AND `replacedByDocumentId` set).

## 5. Migration (additive, KHÔNG phá V2 — thực thi ở phase sau)
1. Script PnP/PowerShell **thêm** 6 site columns + add vào content type của `DMS Library` (không sửa cột cũ).
2. Backfill (tùy chọn): `NgayHieuLucDen ← NgayHetHieuLuc`; `KieuHieuLuc ← 'Theo thời hạn' nếu có NgayHetHieuLuc, ngược lại 'Đến khi có VB thay thế'`; `CongTy ← 'Áp dụng chung'`; map `VanBanThayThe`(text)→`ReplacesDocumentId` khi resolve được id.
3. App đọc V3 nếu có, fallback V2 — không bắt buộc backfill trước.

## 6. Ranh giới phase này
- ❌ KHÔNG chạy script tạo cột. ❌ KHÔNG ghi SharePoint. ❌ KHÔNG đổi `IDocument` thật.
- ✅ Chỉ tài liệu thiết kế + internal name + choices + chiến lược tương thích.

## 7. Checklist khi implement (phase sau)
- [ ] Script thêm 6 cột (idempotent, không đụng V2).
- [ ] Bổ sung field optional vào `types/dms.ts` + mapper (đọc fallback undefined).
- [ ] Cập nhật `isExpired`/KPI để xét V3 (sau khi thống nhất nghiệp vụ).
- [ ] Backfill data (tùy chọn).
