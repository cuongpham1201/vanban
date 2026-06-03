# DMS Mock Data — cho UI/UX development

## Mục đích

Cung cấp dữ liệu thật (đã chuẩn hóa metadata) để đội dev xây UI/UX cho DMS Portal mà không cần phụ thuộc vào SharePoint Library production.

## Files

| File | Mô tả | Size |
|---|---|---|
| `dms_documents.json` | **934 documents** — full dataset cho dev test | ~1 MB |
| `dms_documents.sample.json` | 5 documents — sample preview để xem nhanh schema | — |
| `dms_documents.types.ts` | TypeScript types — import vào SPFx React | — |

## Cách dùng trong SPFx/React

```typescript
import { DmsDocumentsData, DmsDocument } from './mock-data/dms_documents.types';
import dmsData from './mock-data/dms_documents.json';

const data = dmsData as DmsDocumentsData;
console.log(`Total: ${data.metadata.totalRecords}`);

// Filter "Đang lưu hành"
const active = data.documents.filter(d => d.trangThai === 'Đang lưu hành');

// Group by loại VB
const byType = data.documents.reduce((acc, d) => {
  acc[d.loaiVanBan] = (acc[d.loaiVanBan] || 0) + 1;
  return acc;
}, {} as Record<string, number>);
```

## Schema (13 metadata columns)

Tham khảo `dms_documents.types.ts` cho TypeScript types đầy đủ.

Tóm tắt:
- `soVanBan` (string) — số văn bản
- `namBanHanh` (number) — năm 4 chữ số
- `loaiVanBan` (string, choice) — full name, dropdown 9 giá trị
- `donViSoanThao` (string, choice) — full name, dropdown 25 giá trị
- `nguoiKy` (string, hiện đang null) — cần bổ sung Phase 4
- `ngayBanHanh` (string ISO YYYY-MM-DD)
- `trangThai` — 1 trong 4: Bản nháp, Đang lưu hành, Hết hiệu lực, Thu hồi
- `mucDoBaoMat` — 1 trong 4: Công khai, Nội bộ, Bảo mật, Tuyệt mật
- `trichYeu` (string) — tóm tắt nội dung
- (3 cột lookup/managed metadata còn lại cho Phase 4)

## Statistics

- Tổng: **934 documents**
- Trạng thái: 100% "Đang lưu hành" (default vì chưa có data thật)
- Đủ cặp .docx + .pdf: 555
- Chỉ PDF: 360
- Chỉ DOCX: 18

### Top 5 loại VB

1. Quyết định: 838
2. Chức năng nhiệm vụ: 42
3. Thông báo: 34
4. Giấy ủy quyền: 7
5. Chính sách: 6

### Top 5 đơn vị soạn thảo

1. Phòng Cơ điện: 182
2. Phòng Kiểm soát Chất lượng – KCS: 167
3. Phòng Hành chính – Nhân sự: 111
4. Văn bản điều hành chung (cấp Công ty): 98
5. Phòng Vận hành Kinh doanh: 44


## UI components nên build trước

| Component | Mô tả |
|---|---|
| `DocumentList` | DataGrid hiển thị tất cả docs, có filter theo cột |
| `DocumentCard` | Card view cho 1 doc (số VB, loại, đơn vị, ngày, badge trạng thái) |
| `DocumentDetail` | Drawer/Page chi tiết 1 doc với đủ 13 cột metadata |
| `StatusBadge` | Badge màu cho `trangThai` (xanh = Đang lưu hành, đỏ = Hết hiệu lực...) |
| `SecurityBadge` | Badge cho `mucDoBaoMat` (xám = Công khai, vàng = Nội bộ, cam = Bảo mật, đỏ = Tuyệt mật) |
| `FileTypeIcon` | Icon theo `file.ext` (📄 docx, 📕 pdf, 📊 xlsx) |
| `PairIndicator` | Hiển thị tình trạng cặp .docx + .pdf |
| `FilterPanel` | Side panel filter theo `trangThai`/`loaiVanBan`/`donViSoanThao`/năm |
| `SearchBox` | Full-text search trên `trichYeu` + `fileName` |
| `DashboardStats` | Widget tổng quan dùng `statistics` |
| `RecentDocuments` | Top 10 doc mới nhất theo `ngayBanHanh` |
| `ExpiringDocuments` | Filter `ngayHetHieuLuc` ≤ 30 ngày tới |
| `MyDocuments` | Filter theo `nguoiKy` = currentUser |

## Lưu ý

- Dữ liệu này là **mock**: `nguoiKy`, `vanBanThayThe`, `tags` đều null/empty — UI nên handle gracefully
- File path là **path tương đối**: khi gắn vào SharePoint thật, prepend `https://biahalong.sharepoint.com/sites/vanbandieuhanh/Shared Documents/Chung/`
- 462 file non-compliant chưa có trong dataset này — sẽ bổ sung sau khi HCNS rà soát

## Refresh data

Khi có dữ liệu mới (ví dụ sau khi HCNS bổ sung `nguoiKy`), chạy lại:

```bash
python script/parse_filename_metadata.py  # script sẽ regenerate dms_documents.json
```
