# DMS PERMISSION MODEL — Thiết kế quyền

> **Phase:** 6 — Design. Thiết kế RBAC cho webapp + scope theo `CongTy`. KHÔNG đổi ACL SharePoint thật trong phase này.

---

## 1. Hai lớp quyền (quan trọng)

```
Lớp 1 — SharePoint ACL (backstop cuối cùng, KHÔNG bỏ qua được)
   - User thường        = Read trên DMS Library
   - DMS Admin          = Edit/Contribute
   - Vì app dùng DELEGATED token (thay mặt user) → mọi thao tác vẫn bị SP ACL kiểm soát.
     Read-only phase hiện tại chỉ có Sites.Read.All/Files.Read.All → KHÔNG ghi được dù UI cho phép.

Lớp 2 — WebApp RBAC (gating tính năng + scope nghiệp vụ)
   - Quyết định hiển thị/cho phép action ở UI + chặn ở API route (defense-in-depth).
   - KHÔNG thay thế Lớp 1; bổ sung scope theo CongTy mà SP ACL không mô tả.
```

> Hệ quả: để bật write thật cần (a) nâng Graph scope `Sites.ReadWrite.All` + (b) user có quyền Edit trên SP + (c) RBAC webapp cho phép. Cả 3 phải đúng.

## 2. Định danh & gán vai trò
- Đăng nhập: **Entra ID** (NextAuth Azure AD — đã có).
- Nguồn vai trò (đề xuất): **Entra App Roles** *hoặc* **security groups** ánh xạ sang role, đưa vào token claim (`roles`/`groups`) → `session.roles`, `session.scope`.
- Cache trong session JWT (đã có cơ chế jwt/session callback).

## 3. Vai trò (RBAC)
| Role | Mô tả |
|---|---|
| `DMS_READER` | Xem + tải tài liệu. Mặc định cho user thường. |
| `DMS_REVIEWER` | Như READER + **sửa metadata** phục vụ chuẩn hóa + đánh dấu "đã rà soát". Không upload/replace/xóa. |
| `DMS_EDITOR` | Như READER + Upload + Edit Metadata + Replace. Không xóa. |
| `DMS_ADMIN` | Toàn quyền + Delete + Admin Override (vượt scope, ép sửa chain). |

## 4. Scope theo `CongTy`
| Scope | Phạm vi tài liệu thao tác được |
|---|---|
| `HaLong` | `CongTy ∈ { 'Công ty CP Bia và NGK Hạ Long', 'Áp dụng chung' }` |
| `DongMai` | `CongTy ∈ { 'Công ty CP Bia và NGK Đông Mai', 'Áp dụng chung' }` |
| `All` | Tất cả (mặc định cho `DMS_ADMIN`) |

- Role (trừ ADMIN) gắn 1 scope: vd `DMS_EDITOR@HaLong`.
- Tài liệu `CongTy='Áp dụng chung'` → **xem được** bởi mọi scope; **sửa/replace** cần quyền tương ứng (đề xuất: chỉ `All`/ADMIN được sửa "Áp dụng chung"; HaLong/DongMai chỉ xem — chốt với nghiệp vụ).

## 5. Permission matrix (Role × Action)

| Action | READER | REVIEWER | EDITOR | ADMIN |
|---|:--:|:--:|:--:|:--:|
| View | ✅ | ✅ | ✅ | ✅ |
| Download | ✅ | ✅ | ✅ | ✅ |
| Upload | ❌ | ❌ | ✅ | ✅ |
| Edit Metadata | ❌ | ✅ | ✅ | ✅ |
| Replace Document | ❌ | ❌ | ✅ | ✅ |
| Delete | ❌ | ❌ | ❌ | ✅ |
| Admin Override | ❌ | ❌ | ❌ | ✅ |

> Mọi action (trừ ADMIN Override) còn bị giới hạn bởi **scope `CongTy`**: chỉ thao tác trên tài liệu trong scope của user. ADMIN Override = bỏ qua scope + sửa chain/khóa thủ công.

### Scope guard (kết hợp matrix)
`canActOn(user, action, doc)` =
`roleHasAction(user.role, action)` **AND** (`user.scope === 'All'` **OR** `doc.congTy ∈ scopeSet(user.scope)`).

## 6. Điểm thực thi (enforcement points)
| Lớp | Cách |
|---|---|
| UI | Ẩn/disable nút (Upload/Edit/Replace/Delete) theo `session.roles`+`scope` — chỉ là UX, không tin cậy |
| API route (server) | **Bắt buộc** kiểm `canActOn()` trước mọi write; trả 403 nếu fail |
| Graph/SharePoint | ACL thật + scope token = backstop cuối |

## 7. Mapping role → Graph scope cần có
| Nhóm action | Graph scope |
|---|---|
| View/Download (READER/REVIEWER read) | `Sites.Read.All`, `Files.Read.All` (đã có) |
| Edit/Upload/Replace/Delete | `Sites.ReadWrite.All`, `Files.ReadWrite.All` (**chưa cấp** — phase write) |

## 8. Ranh giới phase này
- ❌ KHÔNG đổi ACL SharePoint, KHÔNG tạo App Role/group, KHÔNG nâng scope, KHÔNG enforce trong code.
- ✅ Chỉ thiết kế role/scope/matrix/enforcement.

## 9. Checklist khi implement
- [ ] Tạo Entra App Roles (`DMS_READER/REVIEWER/EDITOR/ADMIN`) + claim mapping vào token.
- [ ] `session.roles` + `session.scope` (jwt/session callback).
- [ ] `lib/auth/rbac.ts`: `roleHasAction`, `scopeSet`, `canActOn`.
- [ ] Guard ở mọi API write route (403) + gating UI.
- [ ] Nâng Graph scope khi mở write.
