import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isDmsWriteEnabled } from '@/lib/dms/writeConfig';
import { canWriteDms, isWriteAllowlisted, getWriteAllowlist } from '@/lib/dms/writeGuard';

export const dynamic = 'force-dynamic';

// GET /api/admin/graph-token-check — chẩn đoán sẵn sàng Graph Write (READ-ONLY).
//  - Yêu cầu đăng nhập + email thuộc DMS_WRITE_ALLOWED_EMAILS (KHÔNG phụ thuộc write flag
//    → admin xem được trước khi bật).
//  - KHÔNG trả raw token, KHÔNG gọi Graph, KHÔNG ghi gì.
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'not authenticated' }, { status: 401 });
  }
  if (!isWriteAllowlisted(session)) {
    return NextResponse.json(
      { ok: false, error: 'forbidden: chỉ email trong DMS_WRITE_ALLOWED_EMAILS được xem' },
      { status: 403 }
    );
  }

  const hasAccessToken = !!session.accessToken;
  // Token phiên hiện tại (dùng cho READ) là delegated từ NextAuth. Không có app-only ở runtime này.
  const authMode: 'delegated' | 'app-only' | 'mixed' | 'unknown' = hasAccessToken ? 'delegated' : 'unknown';

  const body = {
    ok: true,
    authenticated: true,
    userEmail: session.user?.email ?? null,
    writeFlagEnabled: isDmsWriteEnabled(),
    allowedToWrite: canWriteDms(session), // cần flag bật + allowlist
    authMode, // token phiên hiện tại (đọc)
    // Theo quyết định kiến trúc: WRITE dùng app-only (Application ReadWrite đã admin-consent),
    // KHÔNG dùng token delegated của user → không đổi NextAuth scope, không cần re-login cho write.
    writeTokenMode: 'app-only',
    hasAccessToken,
    tokenExpiresAt: null, // session không expose expiresAt (không sửa options.ts) — null là cố ý
    requiredScopesConfigured: {
      delegatedReadScopes: ['User.Read', 'Sites.Read.All', 'Files.Read.All'],
      delegatedScopeChangedForWrite: false,
      writeMode: 'app-only',
      appPermissionsRequired: ['Sites.ReadWrite.All (Application)', 'Files.ReadWrite.All (Application)'],
    },
    allowlistConfigured: getWriteAllowlist().length > 0,
    note: hasAccessToken
      ? 'Write sẽ dùng app-only token (server mint ở Phase 10D). KHÔNG cần user re-login cho write.'
      : 'Phiên không có Graph token (dev-login hoặc cần đăng nhập lại Microsoft).',
  };
  return NextResponse.json(body);
}
