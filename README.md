# Văn bản điều hành — DMS Portal (Next.js)

Web application quản lý & tra cứu văn bản điều hành cho Công ty Bia và NGK Hạ Long,
đọc dữ liệu từ SharePoint **DMS Library** qua **Microsoft Graph** (đăng nhập Microsoft 365 / Entra ID).

> Phần SPFx WebPart cũ đã được gỡ khỏi repo (xem lịch sử git nếu cần). Production hiện chạy app Next.js trong `next-preview/`.

## Cấu trúc repo
```
next-preview/      # ⭐ Ứng dụng Next.js (production) — App Router, NextAuth Azure AD, Graph read-only
docs/              # Tài liệu: audit, migration, performance, auth fix, permission model, V3 metadata…
scripts/           # Tiện ích dev
```

## Chạy local
```bash
cd next-preview
cp .env.example .env.local      # điền secret (KHÔNG commit)
npm install
npm run dev                     # http://localhost:3000
```

## Production (Ubuntu + pm2 + Cloudflare Tunnel)
Domain: https://vanban.biahalong.com
```bash
cd /data/homelab/apps/vanban/next-preview
git pull
npm install
npm run build
export $(grep -v '^#' .env.production | xargs)
pm2 restart vanban --update-env
pm2 logs vanban --lines 100
```
Cấu hình env + Entra redirect URI: xem [docs/AUTH_PRODUCTION_FIX.md](docs/AUTH_PRODUCTION_FIX.md)
và [docs/CLEANUP_AND_LIBRARY_FIX.md](docs/CLEANUP_AND_LIBRARY_FIX.md).

## Tài liệu (docs/)
Audit & migration: `SPFX_TO_WEBAPP_AUDIT.md`, `NEXT_LOCAL_PREVIEW.md` ·
Performance: `PERFORMANCE_AUDIT.md`, `PERFORMANCE_FIX_REPORT.md`, `DASHBOARD_API_DESIGN.md` ·
Dữ liệu: `DMS_MAPPING_AUDIT.md`, `DMS_V3_METADATA.md` ·
Nghiệp vụ: `DMS_UPLOAD_AND_REPLACEMENT_FLOW.md`, `DMS_PERMISSION_MODEL.md`, `UI_UX_REBUILD_PLAN.md` ·
Vận hành: `AUTH_PRODUCTION_FIX.md`, `CLEANUP_AND_LIBRARY_FIX.md`.

**Trạng thái:** read-only (chưa bật upload/edit/delete).
