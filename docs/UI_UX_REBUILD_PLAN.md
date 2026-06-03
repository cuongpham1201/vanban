# UI/UX REBUILD PLAN — từ "SharePoint Portal" → "Enterprise DMS Web App"

> **Phase:** 7 — Design only. **KHÔNG code UI mới** trong phase này. Tài liệu định hướng cho phase rebuild.
> **Nguyên tắc:** giữ nguyên nghiệp vụ + model (đã nằm trong `lib/dms`, `types`); chỉ thay lớp trình bày & trải nghiệm.

---

## 1. Audit UI hiện tại

### 1.1 Điều gì mang "cảm giác SPFx" (nên thay)
- **Hero banner** gradient xanh + tiêu đề in hoa "HỆ THỐNG QUẢN LÝ VĂN BẢN ĐIỀU HÀNH" — đậm chất SharePoint communication site.
- **Fluent MDL2 icon-font** (`Icons.tsx` + `initializeIcons`) — phụ thuộc Fabric, bundle nặng.
- **SPA 1-component** (`DmsPortal.tsx` 774 dòng, `viewMode` state) — **không có URL/route**, không deep-link, không back/forward.
- **Sidebar SharePoint-ism:** "Quay lại Microsoft Teams", "Văn bản đang theo dõi", "Thùng rác", "Yêu thích".
- **Deep-link `EditForm.aspx`/SharePoint** cho sửa metadata.
- **Prop-drilling** `dmsService` xuyên toàn cây.
- Layout **desktop-first 1440px**, sidebar ẩn cứng `<1024px` (mobile yếu).
- Palette/đổ bóng neutral kiểu Fluent.

### 1.2 Nên BỎ
- SPA `viewMode` → thay bằng **App Router routing**.
- Hero gradient + tiêu đề in hoa SharePoint.
- Fluent icon-font → **lucide-react / SVG**.
- Nav "Teams/Thùng rác/Theo dõi/Yêu thích" kiểu SharePoint (giữ lại nếu có nghiệp vụ thật, làm đúng cách).
- Prop-drilling service → **data hooks** (`useDashboard`, `useDocuments`, …) + API routes.

### 1.3 Nên GIỮ (giá trị lõi)
- **Toàn bộ business logic** (KPI, PDF-first pairing, isExpired, needsStandardization, search) — đã ở `lib/dms`.
- **Information architecture** domain: Dashboard · Tra cứu · Upload · Cần chuẩn hóa · Theo cấp lưu trữ · Hết hiệu lực.
- **Nội dung** metadata grid ở Detail, cột bảng List, nhãn tiếng Việt, model V2/V3.
- KPI 9 tile (định nghĩa), nhóm quick-filter (7 nhóm).

---

## 2. Design system đề xuất
- **Style:** Tailwind CSS + design tokens (màu thương hiệu Bia Hạ Long, type ramp, spacing, radius). Bỏ dần SCSS module SPFx.
- **Component primitives:** headless (Radix UI / shadcn-style) cho dialog, dropdown, tabs, drawer, table → accessible, không khóa Fluent.
- **Icons:** `lucide-react`.
- **Data:** React Query (TanStack) cho fetch/cache/invalidate quanh `/api/dashboard`, `/api/documents`.
- **Forms:** `react-hook-form` + `zod` (Upload Wizard, Edit metadata).

---

## 3. Kiến trúc mới (8 khối)

### 3.1 App Shell
- Top bar: logo, **CongTy switcher** (Hạ Long / Đông Mai / Tất cả), global search trigger, user menu (avatar, role badge, đăng xuất).
- Sidebar **collapsible** (icon-rail ↔ full), responsive → drawer trên mobile.
- Slot nội dung theo route; breadcrumb.

### 3.2 Navigation
- **Route-based (App Router):** `/` `/search` `/upload` `/review` `/storage` `/expired` `/documents/[id]`.
- **Command palette** (Ctrl/⌘+K): nhảy nhanh + tìm văn bản.
- State filter encode trong **URL query** (shareable, back/forward đúng).

### 3.3 Dashboard
- Nguồn: **`/api/dashboard`** (aggregate — xem DASHBOARD_API_DESIGN.md), KHÔNG kéo full docs.
- KPI cards hiện đại + **charts**: cột theo cấp lưu trữ, donut theo trạng thái, timeline "sắp hết hiệu lực".
- Khối "Mới ban hành" / "Sắp hết hiệu lực" + quick actions (Upload, Review) gated theo RBAC.

### 3.4 Search Experience
- **Instant search** + **facets** (NhomTaiLieu, LoaiTaiLieu, Đơn vị, CongTy, Trạng thái, khoảng ngày).
- Toggle **bảng ↔ thẻ**; cột tùy chỉnh; sort.
- Lưu bộ lọc; phân trang/virtual scroll cho tập lớn.
- Tôn trọng scope `CongTy` của user.

### 3.5 Document Detail (`/documents/[id]`)
- **PDF viewer inline** (không nhảy SharePoint), tải về.
- Metadata grid (V2 + V3) + badge trạng thái/bảo mật/CongTy.
- **Replacement chain timeline** (ReplacesDocumentId/ReplacedByDocumentId) — xem lịch sử & bản hiện hành.
- Audit: created/modified/author/editor.
- Actions (Sửa, Thay thế, Tải bản mềm…) **gated theo RBAC + scope**.

### 3.6 Upload Wizard
- Multi-step: **(1) File** (drag-drop PDF + bản mềm) → **(2) Metadata** (dynamic choices, zod validate) → **(3) Thay thế** (chọn bản cũ, hiển thị chain, cycle guard) → **(4) Xác nhận**.
- Progress + upload session cho file lớn; rollback/compensation theo DMS_UPLOAD_AND_REPLACEMENT_FLOW.md.

### 3.7 Review Center
- Hàng đợi **Cần chuẩn hóa** (needsStandardization) với facet: thiếu bản mềm / thiếu đơn vị / NeedsReview / Low.
- **Bulk edit** + đánh dấu "đã rà soát" + **Xuất CSV** (đã có).
- (Tùy chọn) gán việc cho REVIEWER.

### 3.8 Mobile UX
- Layout responsive thật: sidebar → drawer/bottom-nav; list **card-first**; touch targets ≥44px.
- Detail rút gọn (metadata accordion + nút mở PDF).
- Dashboard 1 cột, KPI cuộn ngang.

---

## 4. Chiến lược chuyển đổi (incremental, không big-bang)
1. **Shell + routing** mới bọc UI cũ (đưa `viewMode` → routes), tái dùng component cũ tạm thời.
2. Thay **dashboard** sang `/api/dashboard` + React Query (đắt nhất về perf — làm sớm).
3. Rebuild từng khối theo thứ tự: Dashboard → Search → Detail → Upload Wizard → Review → Mobile.
4. Thay icon + design tokens dần; gỡ Fluent/SCSS khi khối cuối chuyển xong.
5. Giữ `lib/dms` (logic) ổn định xuyên suốt — chỉ đổi lớp UI.

## 5. Mục tiêu trải nghiệm
| Từ (SharePoint Portal) | Sang (Enterprise DMS Web App) |
|---|---|
| 1 trang SPA, không URL | App đa route, deep-link, back/forward |
| Hero gradient in hoa | App shell gọn, thương hiệu tinh tế |
| Fluent icon-font nặng | SVG/lucide nhẹ |
| Kéo full docs để dựng dashboard | Dashboard aggregate nhanh |
| Mobile yếu | Responsive thật |
| Link nhảy SharePoint | PDF viewer + thao tác in-app |

## 6. Ranh giới phase này
- ❌ KHÔNG code UI, KHÔNG cài thư viện UI mới, KHÔNG đổi component hiện có.
- ✅ Chỉ audit + kế hoạch kiến trúc cho phase rebuild.
