# AUTH PRODUCTION FIX — OAuthSignin trên https://vanban.biahalong.com

> **Triệu chứng:** bấm "Đăng nhập với Microsoft" → redirect về `/api/auth/signin?error=OAuthSignin`.
> **Bản chất:** `OAuthSignin` xảy ra **TRƯỚC** callback — NextAuth không dựng được authorization URL hợp lệ → gần như luôn là **cấu hình env / redirect URI ở production**, không phải lỗi business.
> **Stack:** NextAuth **v4** (4.24.14), provider id **`azure-ad`** (AzureADProvider).

---

## 1. Kết quả audit (code)
| Mục | Trạng thái |
|---|---|
| `lib/auth/options.ts` | OK — `clientId/clientSecret/tenantId` đọc từ env; scope `openid profile email User.Read Sites.Read.All Files.Read.All offline_access`. |
| `app/api/auth/[...nextauth]/route.ts` | OK — handler chuẩn v4. |
| Middleware | **Không có** → `/api/auth/*` không bị chặn (không phải nguyên nhân). |
| signIn callback chặn domain | **Không có** → không làm fail OAuthSignin trước callback (không phải nguyên nhân). |
| Provider id | `azure-ad` → callback `/.../callback/azure-ad`. |
| Phiên bản | v4 → dùng `NEXTAUTH_URL`/`NEXTAUTH_SECRET`. **KHÔNG** dùng `AUTH_URL`/`AUTH_SECRET`/`trustHost` (v5). |

→ **Code đúng. Nguyên nhân nằm ở ENV production + Redirect URI ở Entra.**

## 2. Nguyên nhân nhiều khả năng nhất (xếp theo xác suất)
1. 🔴 **`NEXTAUTH_URL` sai trên prod** — còn `http://localhost:3000` (do tái dùng `.env.local` dev). NextAuth dựng `redirect_uri=http://localhost:3000/...` không khớp domain → `OAuthSignin`. **Sửa:** `NEXTAUTH_URL=https://vanban.biahalong.com`.
2. 🔴 **Entra App thiếu Redirect URI production** — chỉ đăng ký `http://localhost:3000/api/auth/callback/azure-ad`. **Sửa:** thêm `https://vanban.biahalong.com/api/auth/callback/azure-ad`.
3. 🟠 **Thiếu env trên prod** — `AZURE_AD_CLIENT_ID/SECRET/TENANT_ID` hoặc `NEXTAUTH_SECRET` không nạp vào process (pm2 không `--update-env`, hoặc `.env.local` không có ở thư mục app prod).
4. 🟡 **NEXTAUTH_SECRET** rỗng/yếu trên prod → sign-in lỗi.

## 3. Đã sửa trong code (hardening + chẩn đoán) — KHÔNG đổi business
- `lib/auth/options.ts`:
  - **Env validation** chạy khi load: in `[auth][env] ❌ ...` liệt kê biến thiếu/sai (vd "NEXTAUTH_URL vẫn trỏ localhost trên production"), hoặc `[auth][env] ✅ OK · NEXTAUTH_URL=... · callback=...`. **An toàn — không log secret.**
  - **`logger.error`** ghi `[next-auth][error] code=OAuthSignin provider=azure-ad message=...` (không log token/secret) → thấy nguyên nhân thật trong pm2 logs.
  - `secret: process.env.NEXTAUTH_SECRET` tường minh; `debug` bật khi `AUTH_DEBUG=1`.
- `.env.example`: ghi rõ v4, NEXTAUTH_URL prod, và **2** redirect URI cần khai báo.

> Sau khi deploy, mở `pm2 logs <app>` → dòng `[auth][env]` sẽ chỉ ngay biến nào sai.

## 4. Việc PHẢI làm trên hạ tầng (không sửa được bằng code)

### 4.1 Entra App Registration (Vanbandieuhanh-API)
Authentication → Platform **Web** → Redirect URIs, đảm bảo có **cả hai**:
```
http://localhost:3000/api/auth/callback/azure-ad
https://vanban.biahalong.com/api/auth/callback/azure-ad
```
- Provider id = `azure-ad` ⇒ path callback chính xác là `/api/auth/callback/azure-ad`.
- API permissions (delegated) + **Grant admin consent**: `User.Read`, `Sites.Read.All`, `Files.Read.All`.
- Client secret còn hạn → giá trị điền vào `AZURE_AD_CLIENT_SECRET`.

### 4.2 Env production (trên Ubuntu)
File `.env.local` (hoặc `.env.production`) trong **thư mục app đang chạy** (nơi có `package.json` của Next — hiện là `next-preview/`):
```
NEXTAUTH_URL=https://vanban.biahalong.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
AZURE_AD_CLIENT_ID=<...>
AZURE_AD_CLIENT_SECRET=<...>
AZURE_AD_TENANT_ID=<...>
SP_SITE_HOSTNAME=biahalong.sharepoint.com
SP_SITE_PATH=/sites/vanbandieuhanh
SP_DMS_LIBRARY_NAME=DMS Library
NEXT_PUBLIC_DMS_DATA_SOURCE=graph
NODE_ENV=production
```
> Cloudflare Tunnel kết thúc TLS; vì `NEXTAUTH_URL` là `https://...`, NextAuth v4 tự dùng secure cookies + dựng URL đúng. **Không cần** `trustHost` (v5).

## 5. Deploy lên Ubuntu (pm2)
```bash
cd /path/to/app/next-preview        # thư mục chứa package.json của Next
git pull
npm install                          # nếu package.json đổi
npm run build
# Nạp lại ENV mới cho process (quan trọng — nếu không, NEXTAUTH_URL cũ vẫn còn):
pm2 restart <app-name> --update-env
pm2 logs <app-name>                  # xem dòng [auth][env] ✅/❌ để xác nhận
```
> `--update-env` bắt buộc khi đổi biến môi trường; thiếu nó pm2 giữ env cũ (localhost) → vẫn OAuthSignin.

## 6. Kiểm tra sau deploy
1. `pm2 logs` → `[auth][env] ✅ OK · NEXTAUTH_URL=https://vanban.biahalong.com · callback=https://vanban.biahalong.com/api/auth/callback/azure-ad`.
2. Mở `https://vanban.biahalong.com` → "Đăng nhập với Microsoft" → tới `login.microsoftonline.com` (không còn `?error=OAuthSignin`).
3. Đăng nhập → quay về app, vào được DMS.
4. Nếu vẫn lỗi: đọc `[next-auth][error] code=...` để biết bước/nguyên nhân (vd `redirect_uri_mismatch` → thiếu URI ở Entra; `invalid_client` → sai client secret).

## 7. Ranh giới
- ❌ Không hardcode secret. ❌ Không đổi logic business DMS. ❌ Không đổi scope cần thiết (giữ Sites.Read.All/Files.Read.All vì DMS read cần).
- ✅ Chỉ hardening config + logging chẩn đoán + tài liệu env/redirect/deploy.

## 8. Files đã sửa
- `next-preview/lib/auth/options.ts` — env validation + safe logger + `secret`/`debug`.
- `next-preview/.env.example` — hướng dẫn v4, NEXTAUTH_URL prod, 2 redirect URI.
- `docs/AUTH_PRODUCTION_FIX.md` — tài liệu này.
