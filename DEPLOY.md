# DEPLOY — DMS Portal (quy trình chuẩn)

> Quy ước: sau mỗi lần sửa code, **bump version** trong `config/package-solution.json`
> rồi chạy nguyên block PowerShell dưới đây (build → verify version → publish → update).
> Đây là cách deploy mặc định cho repo này — KHÔNG dùng hướng dẫn bấm tay App Catalog nữa.

## Tham số cố định

| Mục | Giá trị |
|---|---|
| App Catalog | `https://biahalong.sharepoint.com/sites/appcatalog` |
| Site đích | `https://biahalong.sharepoint.com/sites/vanbandieuhanh` |
| ClientId (PnP Entra app) | `4b9e993c-8922-4731-aa9e-effd351a81c2` |
| App Id (Update-PnPApp -Identity) | `f6566a17-e666-47cd-aff5-188c44776632` |
| Solution Id | `37541284-4fdf-4881-94f2-9584c5962bf3` |
| .sppkg | `sharepoint\solution\dms-portal.sppkg` |
| Node | `>= 22.14.0 < 23` |

## Block deploy (PowerShell)

> Sửa số ở dòng `Select-String 'Version='` cho khớp version vừa bump.
> **Version hiện tại: `1.0.40.0`**.

```powershell
cd D:\AI-code\vanbandieuhanh\dms-portal
gulp clean && gulp bundle --ship
gulp package-solution --ship

Copy-Item "sharepoint\solution\dms-portal.sppkg" "$env:TEMP\d.zip" -Force
Expand-Archive "$env:TEMP\d.zip" "$env:TEMP\d" -Force
Get-Content "$env:TEMP\d\AppManifest.xml" | Select-String 'Version='   # → phải là 1.0.40.0

Connect-PnPOnline -Url https://biahalong.sharepoint.com/sites/appcatalog -ClientId 4b9e993c-8922-4731-aa9e-effd351a81c2 -Interactive
Add-PnPApp -Path "sharepoint\solution\dms-portal.sppkg" -Scope Tenant -Publish -Overwrite -SkipFeatureDeployment

Connect-PnPOnline -Url https://biahalong.sharepoint.com/sites/vanbandieuhanh -ClientId 4b9e993c-8922-4731-aa9e-effd351a81c2 -Interactive
Update-PnPApp -Identity f6566a17-e666-47cd-aff5-188c44776632
```

## Sau deploy
- Mở portal trên site `vanbandieuhanh`, bấm **Tải lại dữ liệu** để bỏ cache 5 phút.
- Nếu dùng tính năng bản mềm: cần 3 cột `HasEditableSource` (Choice Yes/No), `EditableSourceUrl`, `PrimaryPdfUrl` (Hyperlink/Text) trong DMS Library.

## Quy ước bump version — PHẢI sửa CẢ HAI file
1. `config/package-solution.json` → `solution.version` (4 số, vd `1.0.40.0`) — quyết định version gói deploy.
2. `src/webparts/dmsPortal/version.ts` → `APP_VERSION` (KHỚP số trên) — số hiển thị trên banner Hero (góc phải). **Quên file này = banner vẫn hiện version cũ dù code đã mới.**

Mỗi lần publish tăng số cuối (build) lên 1.

Lịch sử:
- 1.0.37.0 → 1.0.38.0: UX/UI & Data Logic Refinement V1 (ẩn hết hiệu lực, đổi label, cấp lưu trữ đầy đủ, xóa file, upload/link bản mềm, dropdown sửa metadata).
- 1.0.38.0 → 1.0.39.0: fix crash `r.split is not a function` (đọc cột EditableSourceUrl kiểu Hyperlink an toàn).
- 1.0.39.0 → 1.0.40.0: thêm nút Xóa trên header màn hình chi tiết; sửa banner Hero hiển thị đúng version (bump APP_VERSION); HOTFIX cấp lưu trữ — load folder cấp 1 động từ DMS Library (getStorageFolders), folder chưa có văn bản vẫn hiện count=0, Upload + AdvancedSearch + card dùng folder thật (không hardcode/không suy từ metadata), sort theo mã [NN]/[NN.MM], chuẩn hóa layout 3 card dashboard cùng chiều cao + scroll gọn trong body.
