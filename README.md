# DMS Portal – Bia Hạ Long

SPFx (SharePoint Framework) **client-side web part** dạng React + TypeScript cho **Hệ thống quản lý văn bản điều hành** của Công ty Bia và NGK Hạ Long.

> **Giai đoạn 1 (hiện tại): chỉ UI mock.** Toàn bộ dữ liệu là mảng mock trong code, **không** gọi Microsoft Graph / SharePoint REST. Xem [`NOTES.md`](./NOTES.md) để biết kế hoạch nối dữ liệu thật.

| Thông tin | Giá trị |
|---|---|
| Solution / package | `dms-portal` → `dms-portal.sppkg` |
| Web part | `DmsPortal` (alias `DmsPortalWebPart`) |
| Framework | React 17 + TypeScript 5.3 |
| SPFx | 1.21.1 |
| Supported hosts | SharePoint page, SharePoint full page, Teams Tab, Teams Personal App |

---

## Giao diện

Dashboard gồm:

- **Sidebar trái** – logo công ty + điều hướng (Trang chủ, Tra cứu, Văn bản mới, Sắp hết hiệu lực, Theo đơn vị, Loại văn bản, Thống kê, Yêu cầu ban hành, Hướng dẫn, Thùng rác) + nút "Quay lại Microsoft Teams".
- **Header** "Văn bản điều hành" + tab điều hướng + Theo dõi / Chia sẻ.
- **Hero banner** xanh đậm với tiêu đề "HỆ THỐNG QUẢN LÝ VĂN BẢN ĐIỀU HÀNH", ô tìm kiếm lớn, nút "Tìm kiếm nâng cao", và các nút lọc nhanh (Quyết định, Quy trình, Thông báo, Hướng dẫn, Công văn, Khác).
- **3 thẻ chính**: Văn bản mới ban hành · Văn bản sắp hết hiệu lực · Văn bản theo đơn vị.
- **5 thẻ KPI**: Tổng số văn bản · Còn hiệu lực · Sắp hết hiệu lực · Hết hiệu lực · Chờ ban hành.
- **Tìm kiếm nâng cao**: Số văn bản, Loại văn bản, Đơn vị, Người ký, Từ ngày, Đến ngày + nút Tìm kiếm / Xóa bộ lọc.

Phong cách: corporate Microsoft, màu chủ đạo `#0038A8`, card bo góc 12px, đổ bóng nhẹ, font Segoe UI, icon SVG nội tuyến (không phụ thuộc icon-font CDN), responsive cho cả SharePoint page và Teams tab.

---

## Yêu cầu môi trường

| Công cụ | Phiên bản |
|---|---|
| Node.js | **>= 22.14.0 và < 23** (yêu cầu cứng của SPFx 1.21) |
| npm | 10.x |
| Công cụ build | `gulp-cli`, `yo`, `@microsoft/generator-sharepoint` (chỉ cần `gulp-cli` để build) |

> ⚠️ **Lưu ý Node:** SPFx 1.21 **bắt buộc** Node `>= 22.14.0`. Nếu máy đang chạy Node thấp hơn (ví dụ 22.12.0), lệnh `gulp` sẽ **báo lỗi và dừng**. Hãy nâng Node lên bản 22.14+ (khuyến nghị dùng [nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 22.14.0 && nvm use 22.14.0`).

Cài `gulp-cli` toàn cục (một lần):

```bash
npm install -g gulp-cli
```

---

## Các bước sử dụng

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Chạy thử (dev)

```bash
gulp serve
```

SPFx 1.21 **không còn local workbench độc lập** (`/temp/workbench.html` đã bị gỡ từ các bản SPFx mới). `gulp serve` sẽ phục vụ asset từ localhost và mở **hosted workbench** của tenant:

```
https://<tenant>.sharepoint.com/sites/vanbandieuhanh/_layouts/15/workbench.aspx
```

Cần đăng nhập vào một site SharePoint thật để xem. (Web part dùng dữ liệu mock nên không cần cấp quyền API.)

### 3. Build production

```bash
gulp bundle --ship
```

### 4. Đóng gói

```bash
gulp package-solution --ship
```

File kết quả:

```
sharepoint/solution/dms-portal.sppkg
```

---

## Triển khai lên SharePoint / Teams

1. **Upload lên App Catalog**
   - Vào App Catalog của tenant: `https://<tenant>.sharepoint.com/sites/appcatalog` → **Apps for SharePoint**.
   - Kéo thả / Upload `sharepoint/solution/dms-portal.sppkg`.
   - Khi hộp thoại hiện ra, chọn **Deploy** (tích "Make this solution available to all sites" nếu muốn dùng toàn tenant).

2. **Thêm app vào site**
   - Vào site `…/sites/vanbandieuhanh` → **Settings → Add an app** → chọn **DMS Portal** (hoặc bỏ qua bước này nếu đã bật "available to all sites").

3. **Thêm web part vào trang**
   - Mở/sửa một SharePoint page → **+** (Add web part) → tìm **"DMS Portal"** → chèn vào trang.
   - Khuyến nghị đặt web part trong section **full-width** để hiển thị đẹp nhất.
   - **Publish** trang.

4. **Pin vào Microsoft Teams (tuỳ chọn)**
   - Manifest đã khai báo `TeamsTab` / `TeamsPersonalApp`. Sau khi deploy ở App Catalog, đồng bộ sang Teams (App Catalog → chọn app → **Sync to Teams**), rồi trong Teams channel: **+ (Add a tab) → DMS Portal**.

---

## Cấu trúc dự án

```
src/webparts/dmsPortal/
├── DmsPortalWebPart.ts          # Entry point; khởi tạo service và truyền vào React
├── DmsPortalWebPart.manifest.json
├── components/
│   ├── DmsPortal.tsx            # Orchestrator: state tìm kiếm/lọc + ghép layout
│   ├── Sidebar.tsx
│   ├── PortalHeader.tsx
│   ├── Hero.tsx                 # Banner + ô tìm kiếm + lọc nhanh
│   ├── RecentDocsCard.tsx
│   ├── ExpiringDocsCard.tsx
│   ├── ByUnitCard.tsx
│   ├── KpiCards.tsx
│   ├── AdvancedSearch.tsx
│   ├── Icons.tsx                # Bộ icon SVG nội tuyến
│   ├── DmsPortal.module.scss    # Toàn bộ style (CSS module)
│   └── IDmsPortalProps.ts
├── models/IDocument.ts          # Model khớp 1-1 với metadata "vbdh-draft"
├── services/
│   ├── IDmsService.ts           # Hợp đồng truy xuất dữ liệu  ← điểm thay thế
│   └── MockDmsService.ts        # Phase 1: dữ liệu in-memory
├── mock/mockData.ts             # NƠI DUY NHẤT chứa dữ liệu giả
└── utils/format.ts              # Định dạng ngày / số / "còn N ngày"
```

**Điểm thay dữ liệu thật (Phase 2):** chỉ cần viết `SharePointDmsService implements IDmsService` đọc thư viện `vbdh-draft`, rồi đổi 1 dòng trong `DmsPortalWebPart.ts`:

```ts
// private _dmsService: IDmsService = new MockDmsService();
private _dmsService: IDmsService = new SharePointDmsService(this.context);
```

Không component nào cần sửa. Chi tiết trong [`NOTES.md`](./NOTES.md).

---

## Lệnh hữu ích

| Lệnh | Mục đích |
|---|---|
| `gulp build` | Compile TS + lint + sass (kiểm tra nhanh, không bundle) |
| `gulp bundle --ship` | Build production |
| `gulp package-solution --ship` | Tạo `.sppkg` |
| `gulp clean` | Dọn thư mục build |
