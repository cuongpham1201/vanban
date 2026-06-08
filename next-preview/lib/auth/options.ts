import type { NextAuthOptions, User } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyTeamsSsoToken } from '@/lib/teams/teamsSsoVerify';
import { exchangeTeamsTokenForGraph } from '@/lib/teams/oboExchange';

// #31 — user trả từ authorize của teams-sso (mang theo Graph token đã OBO sang jwt callback).
interface TeamsAuthUser { id: string; email: string; name: string; gToken?: string; gRefresh?: string; gExp?: number; }

// Delegated scopes — KHỚP với API permissions đã grant cho Entra app "Vanbandieuhanh-API":
//   User.Read · Sites.Read.All · Files.Read.All  (+ offline_access để có refresh token).
const GRAPH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Sites.Read.All',
  'Files.Read.All',
].join(' ');

const TENANT_ID = process.env.AZURE_AD_TENANT_ID;
const TOKEN_ENDPOINT = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

// ── Env validation (chạy 1 lần khi load module) ───────────────────────────────
// In ra log AN TOÀN (không lộ secret) để chẩn đoán OAuthSignin trên production.
// Nguyên nhân OAuthSignin phổ biến nhất: NEXTAUTH_URL sai (vd còn http://localhost:3000
// trên prod) hoặc thiếu AZURE_AD_* / NEXTAUTH_SECRET → NextAuth không dựng được auth URL.
let _envChecked = false;
function checkAuthEnv(): void {
  if (_envChecked) {
    return;
  }
  _envChecked = true;
  const problems: string[] = [];
  const url = process.env.NEXTAUTH_URL;
  const isProd = process.env.NODE_ENV === 'production';

  if (!url) {
    problems.push('NEXTAUTH_URL missing');
  } else if (isProd && !url.startsWith('https://')) {
    problems.push(`NEXTAUTH_URL nên là https trên production (đang = "${url}")`);
  } else if (isProd && /localhost|127\.0\.0\.1/.test(url)) {
    problems.push(`NEXTAUTH_URL vẫn trỏ localhost trên production (= "${url}") — sửa thành https://vanban.biahalong.com`);
  }
  if (!process.env.NEXTAUTH_SECRET) {
    problems.push('NEXTAUTH_SECRET missing');
  }
  if (!process.env.AZURE_AD_CLIENT_ID) {
    problems.push('AZURE_AD_CLIENT_ID missing');
  }
  if (!process.env.AZURE_AD_CLIENT_SECRET) {
    problems.push('AZURE_AD_CLIENT_SECRET missing');
  }
  if (!process.env.AZURE_AD_TENANT_ID) {
    problems.push('AZURE_AD_TENANT_ID missing');
  }

  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('[auth][env] ❌ CẤU HÌNH AUTH THIẾU/ SAI:\n  - ' + problems.join('\n  - '));
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `[auth][env] ✅ OK · NEXTAUTH_URL=${url} · callback=${url}/api/auth/callback/azure-ad · ` +
        `tenant set · clientId set · secret set`
    );
  }
}
checkAuthEnv();

/** Refresh access token bằng refresh_token (offline_access). */
async function refreshAccessToken(token: {
  refreshToken?: string;
  [k: string]: unknown;
}): Promise<Record<string, unknown>> {
  try {
    if (!token.refreshToken) {
      throw new Error('No refresh token');
    }
    const body = new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID ?? '',
      client_secret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      scope: GRAPH_SCOPES,
    });
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const refreshed = await res.json();
    if (!res.ok) {
      throw refreshed;
    }
    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + Number(refreshed.expires_in ?? 3600),
      // Azure có thể trả refresh_token mới; nếu không, giữ cái cũ.
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth] refreshAccessToken failed:', err);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

// Domain công ty duy nhất được phép đăng nhập (reuse pattern Approval BHL).
// Đọc từ ALLOWED_EMAIL_DOMAIN; fallback "biahalong.com".
const ALLOWED_DOMAIN = '@' + ((process.env.ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'biahalong.com');
function isInternalEmail(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase().trim().endsWith(ALLOWED_DOMAIN);
}

// #31 — Teams Tab SSO. authorize(): verify Teams JWT → OBO sang Graph token (DMS đọc cần token này).
// Thất bại verify/OBO → null → client fallback (web login / mở trình duyệt). KHÔNG ảnh hưởng Azure AD/dev.
const teamsSsoProvider = CredentialsProvider({
  id: 'teams-sso',
  name: 'Teams SSO',
  credentials: { token: { label: 'Teams SSO Token', type: 'text' } },
  async authorize(credentials) {
    const token = credentials?.token?.trim();
    if (!token) return null;
    const verified = await verifyTeamsSsoToken(token);
    if (!verified.ok || !verified.user) {
      // eslint-disable-next-line no-console
      console.warn('[auth][teams-sso] verify failed:', verified.error);
      return null;
    }
    const obo = await exchangeTeamsTokenForGraph(token);
    if (!obo.ok) {
      // eslint-disable-next-line no-console
      console.warn('[auth][teams-sso] OBO failed:', obo.error);
      return null; // không có Graph token → DMS không đọc được → fallback
    }
    // eslint-disable-next-line no-console
    console.info(`[auth][teams-sso] ok email=${verified.user.email}`);
    const u: TeamsAuthUser = {
      id: verified.user.oid, email: verified.user.email, name: verified.user.name,
      gToken: obo.accessToken, gRefresh: obo.refreshToken, gExp: obo.expiresAt,
    };
    return u as unknown as User;
  },
});

export const authOptions: NextAuthOptions = {
  // NextAuth v4 đọc NEXTAUTH_SECRET tự động; khai báo tường minh cho rõ ràng + fail sớm.
  secret: process.env.NEXTAUTH_SECRET,
  // Bật debug khi cần chẩn đoán prod: đặt AUTH_DEBUG=1 (không bật mặc định ở prod).
  debug: process.env.AUTH_DEBUG === '1',
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId: process.env.AZURE_AD_TENANT_ID ?? '',
      // Tên hiển thị thân thiện (nút mặc định: "Sign in with {name}"). KHÔNG đổi provider id —
      // id vẫn là "azure-ad" → callback giữ nguyên /api/auth/callback/azure-ad.
      name: 'Microsoft 365',
      // Scope tối thiểu (openid profile email User.Read) + scope Graph DMS cần (đã grant):
      // Sites.Read.All, Files.Read.All; offline_access để refresh token.
      authorization: { params: { scope: GRAPH_SCOPES } },
      // Đảm bảo email luôn có (một số tenant không trả claim `email` → dùng UPN
      // preferred_username) để domain restriction hoạt động ổn định.
      profile(profile: Record<string, unknown>) {
        const email =
          (profile.email as string | undefined) ??
          (profile.preferred_username as string | undefined) ??
          (profile.upn as string | undefined) ??
          null;
        return {
          id: (profile.oid as string | undefined) ?? (profile.sub as string | undefined) ?? '',
          name: (profile.name as string | undefined) ?? email ?? '',
          email,
        };
      },
    }),
    // Teams Tab SSO — verify Entra JWT từ Teams client (production OK). Giữ nguyên Azure AD ở trên.
    teamsSsoProvider,
  ],
  session: { strategy: 'jwt' },
  // Trang đăng nhập + lỗi tùy biến (thay trang mặc định /api/auth/signin tiếng Anh).
  pages: { signIn: '/signin', error: '/signin' },
  // Log lỗi OAuth AN TOÀN (không log secret/token) — hiện rõ nguyên nhân OAuthSignin trong pm2 logs.
  logger: {
    error(code: string, metadata: unknown): void {
      let detail = '';
      if (metadata instanceof Error) {
        detail = `${metadata.name}: ${metadata.message}`;
      } else if (metadata && typeof metadata === 'object') {
        const m = metadata as { providerId?: string; message?: string; error?: { message?: string } };
        detail = `provider=${m.providerId ?? '?'} message=${m.message ?? m.error?.message ?? ''}`;
      }
      // eslint-disable-next-line no-console
      console.error(`[next-auth][error] code=${code} ${detail}`);
    },
    warn(code: string): void {
      // eslint-disable-next-line no-console
      console.warn(`[next-auth][warn] ${code}`);
    },
  },
  callbacks: {
    // Domain restriction — CHỈ tài khoản công ty (@biahalong.com) được đăng nhập.
    // Người ngoài → redirect /unauthorized (không tạo session). KHÔNG log email/secret.
    async signIn({ user, account }) {
      // Teams SSO — domain đã verify trong verifyTeamsSsoToken(); tin kết quả.
      if (account?.provider === 'teams-sso') {
        return true;
      }
      if (!isInternalEmail(user?.email)) {
        // eslint-disable-next-line no-console
        console.warn('[auth] denied non-company user');
        return '/unauthorized';
      }
      return true;
    },
    async jwt({ token, account, user }) {
      // Đăng nhập lần đầu — lưu token từ account.
      if (account) {
        // Teams SSO: Graph token lấy từ OBO (đính kèm trong user). Refresh dùng refresh_token như Azure AD.
        if (account.provider === 'teams-sso') {
          const tu = user as unknown as TeamsAuthUser | undefined;
          token.teams = true;
          token.accessToken = tu?.gToken;
          token.refreshToken = tu?.gRefresh;
          token.expiresAt = tu?.gExp ?? Math.floor(Date.now() / 1000) + 3600;
          return token;
        }
        token.accessToken = account.access_token as string | undefined;
        token.refreshToken = account.refresh_token as string | undefined;
        token.expiresAt = (account.expires_at as number | undefined) ?? Math.floor(Date.now() / 1000) + 3600;
        return token;
      }
      // Còn hạn (chừa 60s) → dùng tiếp.
      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) {
        return token;
      }
      // Hết hạn → refresh.
      return (await refreshAccessToken(token)) as typeof token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      // Chuẩn hóa email về lowercase (so khớp domain nhất quán).
      if (session.user?.email) {
        session.user.email = session.user.email.toLowerCase().trim();
      }
      return session;
    },
  },
};
