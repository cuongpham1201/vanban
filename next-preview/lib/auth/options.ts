import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

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

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId: process.env.AZURE_AD_TENANT_ID ?? '',
      authorization: { params: { scope: GRAPH_SCOPES } },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      // Đăng nhập lần đầu — lưu token từ account.
      if (account) {
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
      return session;
    },
  },
};
