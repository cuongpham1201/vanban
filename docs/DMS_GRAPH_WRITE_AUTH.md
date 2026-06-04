# DMS Graph Write — Auth & Scope (Phase 10D.1)

> Chuẩn bị auth/token cho Graph Write. **Chưa upload thật, chưa write route, chưa ghi SharePoint.**

Cập nhật: Phase 10D.1.

---

## 1. Graph auth mode hiện tại
- **Delegated** (NextAuth Azure AD, authorization-code, thay mặt user).
- `/api/documents`, `/api/documents/[id]`, `/api/dashboard`, `/api/files/pdf-preview`, `/api/health/sharepoint` → đều lấy `session.accessToken` (delegated) qua `getGraphAccessToken()`.
- **KHÔNG** có client-credentials/app-only nào ở runtime hiện tại (chỉ `refresh_token` để gia hạn token delegated).
- Session **có** `accessToken`; **có** refresh logic (`refreshAccessToken` qua `offline_access`).

## 2. Scope đang dùng (delegated, READ)
```
openid profile email offline_access User.Read Sites.Read.All Files.Read.All
```
→ Đủ cho toàn bộ READ hiện tại. **Không đổi ở phase này.**

## 3. Quyết định kiến trúc Write: APP-ONLY
Admin consent đã cấp:

| Permission | Loại |
|---|---|
| Files.ReadWrite.All | **Application** |
| Sites.ReadWrite.All | **Application** |
| Files.Read.All | Delegated |
| Sites.Read.All | Delegated |
| User.Read | Delegated |

→ Quyền **ReadWrite** là **Application**, không phải Delegated. Vì app chạy bằng token **delegated**, nếu đổi scope NextAuth sang `Sites.ReadWrite.All`/`Files.ReadWrite.All` (delegated) mà **chưa** có delegated admin-consent cho 2 quyền đó, lần đăng nhập kế tiếp sẽ dính **AADSTS65001 (admin consent required)** → hỏng đăng nhập.

**Vì vậy chọn hướng APP-ONLY cho Write:**
- READ giữ nguyên delegated (như cũ).
- WRITE (Phase 10D) dùng **client-credentials** mint token app-only server-side, tận dụng **Application ReadWrite đã consent**.
- **KHÔNG đổi NextAuth scope** → đăng nhập @biahalong.com an toàn, không cần re-login.

## 4. Scope cần cho write
- **App-only (đã chọn):** dùng Application `Sites.ReadWrite.All` + `Files.ReadWrite.All` (ĐÃ admin-consent). Mint qua client-credentials: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` với `grant_type=client_credentials`, `scope=https://graph.microsoft.com/.default`. Token app-only mint **server-side**, không bao giờ lộ client. (Triển khai ở 10D.)
- (Tham khảo) Nếu sau này muốn **delegated write**: phải thêm `Sites.ReadWrite.All`/`Files.ReadWrite.All` dạng **Delegated** + admin consent, rồi mới đổi scope NextAuth + **user re-login**. Hiện KHÔNG đi hướng này.

## 5. Có cần user re-login không?
- **KHÔNG.** Write dùng app-only token (không liên quan token đăng nhập của user). Scope NextAuth không đổi → không re-login.

## 6. Token diagnostics (read-only)
`GET /api/admin/graph-token-check`:
- Yêu cầu đăng nhập + email ∈ `DMS_WRITE_ALLOWED_EMAILS` (không phụ thuộc write flag → kiểm tra được trước khi bật).
- KHÔNG trả raw token, KHÔNG gọi Graph, KHÔNG ghi.
- Trả: `authenticated, userEmail, writeFlagEnabled, allowedToWrite, authMode (delegated), writeTokenMode (app-only), hasAccessToken, tokenExpiresAt (null — không expose), requiredScopesConfigured, allowlistConfigured, note`.

## 7. Cách bật sandbox (KHÔNG bật ở phase này)
```
DMS_WRITE_ENABLED=true
DMS_WRITE_ALLOWED_EMAILS=admin1@biahalong.com,admin2@biahalong.com
# (10D) thêm cho app-only client-credentials:
# AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET (đã có sẵn cho NextAuth)
```
Rollout: sandbox/dev trước → kiểm thử → production sau.

## 8. ⚠️ Cảnh báo
- **KHÔNG** bật `DMS_WRITE_ENABLED=true` rộng rãi trên production khi chưa kiểm thử sandbox.
- **KHÔNG** đưa email ngoài đội quản trị vào `DMS_WRITE_ALLOWED_EMAILS`.
- App-only token **có toàn quyền site** (Application ReadWrite) → mọi write phải qua `assertCanWriteDms(session)` (kiểm tra user delegated) **trước**, rồi mới dùng app-only token để thực thi. Tức: ủy quyền theo user, thực thi bằng app — phải kiểm tra quyền user ở tầng API.

## 9. Việc CHƯA làm (cố ý — phase này chỉ auth/scope/token)
- Chưa mint app-only token, chưa client-credentials code chạy.
- Chưa write route, chưa upload, chưa ghi SharePoint.
- Chưa đổi NextAuth scope, chưa schema change.
