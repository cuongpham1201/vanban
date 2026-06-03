# Microsoft 365 SSO — Văn bản điều hành (DMS)

> Hoàn thiện SSO theo pattern Approval BHL (NextAuth v4 Azure AD). Chỉ tài khoản công ty đăng nhập được.

## Kiến trúc auth
- **NextAuth v4** (`next-auth@4.24`) + **Azure AD provider** (id `azure-ad`), giống Approval BHL (cũng v4) → không phát minh mới, không downgrade.
- Session JWT; token Graph lưu server-side (jwt callback) — **không expose ra browser**.
- Đăng nhập/đăng xuất qua `signIn('azure-ad')` / `signOut()`.

## Reuse từ Approval BHL
- `signIn` callback **domain restriction** (`ALLOWED_EMAIL_DOMAIN`, default `biahalong.com`) → ngoài domain trả `/unauthorized`, log `[auth] denied non-company user` (không log email/secret).
- **`middleware.ts`** dùng `withAuth` từ `next-auth/middleware`: `authorized: ({token}) => !!token`, defense-in-depth domain + xóa cookie session lạ, `pages.signIn`.
- Trang `/unauthorized` cho người ngoài công ty.

## File tạo mới
- `next-preview/middleware.ts` — bảo vệ route trang.
- `next-preview/app/unauthorized/page.tsx` — trang chặn tài khoản ngoài.
- `docs/SSO_M365.md`.

## File chỉnh sửa
- `next-preview/lib/auth/options.ts` — `signIn` domain restriction; `profile()` đảm bảo email = email ?? preferred_username ?? upn; session normalize email.
- `next-preview/app/PreviewClient.tsx` — header hiển thị **tên + email** Microsoft thật (bỏ "Admin · Graph read-only") + nút Đăng xuất.
- `next-preview/.env.example` — thêm `ALLOWED_EMAIL_DOMAIN`.

## Env vars (production `.env.production`)
```
NEXTAUTH_URL=https://vanban.biahalong.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
AZURE_AD_TENANT_ID=...
ALLOWED_EMAIL_DOMAIN=biahalong.com
NEXT_PUBLIC_DMS_DATA_SOURCE=graph
NODE_ENV=production
```

## Callback URL cần đăng ký trong Entra (Web)
```
https://vanban.biahalong.com/api/auth/callback/azure-ad
http://localhost:3000/api/auth/callback/azure-ad   (dev)
```

## API đã được bảo vệ (401 JSON nếu chưa login)
- `/api/documents`, `/api/dashboard`, `/api/files/pdf-preview`, `/api/health/sharepoint`
  → đều gọi `getGraphAccessToken()` (getServerSession) → 401 khi chưa có session.
- Route trang (`/`, `/tra-cuu`, `/upload`, `/chuan-hoa`, `/yeu-thich`) → middleware redirect `/signin`.
- `/api/*` KHÔNG bị middleware redirect (tự trả 401 JSON, đúng cho client fetch).

## Việc admin Entra cần làm
1. Thêm Redirect URI production `https://vanban.biahalong.com/api/auth/callback/azure-ad`.
2. Đảm bảo grant admin consent: `User.Read`, `Sites.Read.All`, `Files.Read.All`.
3. (Khuyến nghị) Single-tenant → chỉ tài khoản tổ chức đăng nhập (domain restriction là lớp thứ 2).
4. Đặt `ALLOWED_EMAIL_DOMAIN=biahalong.com` + `NEXTAUTH_URL=https://vanban.biahalong.com` trong env prod, `pm2 restart vanban --update-env`.

## Không phá Graph hiện có
SSO chỉ thêm lớp xác thực + domain restriction; **không** đụng search/dashboard/PDF preview/cache documents/metadata mapping. APIs vốn đã yêu cầu session — nay bổ sung middleware cho route trang + domain gate.

## Đã kiểm thử (local)
- `GET /` chưa login → **307 → /signin?callbackUrl=/**.
- `GET /api/documents`, `/api/files/pdf-preview` chưa login → **401 JSON** (không redirect).
- `/signin`, `/unauthorized` → 200. Provider name = **Microsoft 365**.
- Mock mode (`NEXT_PUBLIC_DMS_DATA_SOURCE!=graph`) → middleware bỏ qua (dev local không cần login).
