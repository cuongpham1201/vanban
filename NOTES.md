# NOTES – DMS Portal

## 1. Phạm vi giai đoạn này (Phase 1)

- **Chỉ là UI mock.** Mục tiêu là dựng giao diện dashboard giống concept, build pass và đóng gói được `.sppkg`.
- **Toàn bộ dữ liệu là mock** nằm trong `src/webparts/dmsPortal/mock/mockData.ts`.
- **KHÔNG** gọi Microsoft Graph, SharePoint REST/CSOM, PnPjs hay bất kỳ API nào.
- **KHÔNG** tạo site / list / library; **KHÔNG** đụng vào dữ liệu SharePoint thật.
- **KHÔNG** chỉnh sửa metadata / schema / dữ liệu ở giai đoạn này.

Các giá trị KPI và danh sách văn bản chỉ mang tính minh hoạ giao diện.

## 2. Giai đoạn sau (Phase 2) – nối dữ liệu thật

Backend thật là **SharePoint Document Library `vbdh-draft`** (site `/sites/vanbandieuhanh`).

Cách triển khai dự kiến, **không thay đổi UI**:

1. Tạo `src/webparts/dmsPortal/services/SharePointDmsService.ts` implements `IDmsService`.
   - Dùng `SPHttpClient` (có sẵn từ `this.context`) hoặc PnPjs để query `vbdh-draft`.
   - Map field SharePoint → model `IDocument` (xem bảng dưới).
   - Tính các KPI / nhóm theo đơn vị bằng REST `$filter` / `$apply=groupby(...)` hoặc Microsoft Search.
2. Đổi đúng **một dòng** trong `DmsPortalWebPart.ts`:
   ```ts
   private _dmsService: IDmsService = new SharePointDmsService(this.context);
   ```
3. Cấp quyền API nếu dùng Graph (qua `package-solution.json` → `webApiPermissionRequests`) — chưa cần ở Phase 1.
4. Xoá `mock/mockData.ts` và `MockDmsService.ts` khi không còn cần.

Vì mọi component chỉ phụ thuộc vào interface `IDmsService` (truyền vào qua props), việc thay thế là **drop-in**, không phải sửa JSX/SCSS.

## 3. Mapping model ↔ cột metadata `vbdh-draft`

| `IDocument` (UI) | Internal name (SharePoint) | Kiểu |
|---|---|---|
| `soVanBan` | `SoVanBan` | Text |
| `namBanHanh` | `NamBanHanh` | Number |
| `loaiVanBan` | `LoaiVanBan` | Choice |
| `donViSoanThao` | `DonViSoanThao` | Choice |
| `nguoiKy` | `NguoiKy` | Person |
| `ngayBanHanh` | `NgayBanHanh` | Date |
| `ngayHetHieuLuc` | `NgayHetHieuLuc` | Date |
| `trangThai` | `TrangThai` | Choice |
| `mucDoBaoMat` | `MucDoBaoMat` | Choice |
| `trichYeu`, `fileKind`, `loaiVanBanKey`, `donViCode` | suy ra từ tên file / content type | (derived) |

Giá trị Choice tham chiếu (đã định nghĩa trong enum tại `models/IDocument.ts`):

- **TrangThai**: Bản nháp · Đang lưu hành · Hết hiệu lực · Thu hồi
- **MucDoBaoMat**: Công khai · Nội bộ · Bảo mật · Tuyệt mật

## 4. Quyết định kỹ thuật đáng lưu ý

- **Icon**: dùng SVG nội tuyến (`components/Icons.tsx`) thay vì Fluent icon-font để bundle tự chứa, không lệ thuộc CDN trong Teams/SharePoint.
- **Style**: một CSS module duy nhất (`DmsPortal.module.scss`); responsive bằng CSS grid `auto-fit` + vài media query (ẩn sidebar < 1024px).
- **"Còn N ngày"** ở thẻ sắp hết hiệu lực được tính động theo ngày hiện tại (`utils/format.ts`), nên số ngày sẽ thay đổi theo thời điểm xem.
- **Node**: SPFx 1.21 bắt buộc Node `>= 22.14.0 < 23`. Bản build được tạo bằng Node 22.14.0. Nếu máy dev đang ở 22.12.0, cần nâng Node trước khi chạy `gulp`.

## 5. Việc chưa làm (cố ý)

- Chưa có phân trang / sắp xếp / view chi tiết văn bản.
- Các link "Xem tất cả", tab header, mục sidebar hiện chỉ là tĩnh (chưa điều hướng).
- Chưa kiểm thử giao diện trực tiếp trên trình duyệt trong môi trường này (cần deploy lên site SharePoint thật hoặc hosted workbench để xem render). Mã đã build + lint + package sạch.
