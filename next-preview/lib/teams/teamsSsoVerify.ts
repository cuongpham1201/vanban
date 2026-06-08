// #31 — Verify Microsoft Teams SSO token (JWT do Entra phát hành cho user chạy app trong Teams).
// Lấy ở client qua @microsoft/teams-js authentication.getAuthToken(). Verify server-side bằng jose+JWKS.
// Trả { ok, user } | { ok:false, error } — KHÔNG throw, KHÔNG log token.
// (Port pattern từ Approval BHL, đổi sang env DMS: AZURE_AD_* + resource vanban.biahalong.com.)
import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader, type JWTPayload } from 'jose';

export interface TeamsSsoUser {
  oid: string;
  email: string;
  name: string;
  tid: string;
}
// Flat shape (tránh phụ thuộc discriminated-union narrowing dưới tsconfig hiện tại).
export interface TeamsSsoVerifyResult {
  ok: boolean;
  user?: TeamsSsoUser;
  error?: string;
}

const ALLOWED_DOMAIN = '@' + ((process.env.ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'biahalong.com');

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwks(tenantId: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(tenantId);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`), {
    cacheMaxAge: 5 * 60 * 1000,
    cooldownDuration: 30 * 1000,
  });
  jwksCache.set(tenantId, jwks);
  return jwks;
}

function pickEmail(p: JWTPayload): string | undefined {
  for (const c of [p.upn, p.preferred_username, p.email]) {
    if (typeof c === 'string' && c.includes('@')) return c.toLowerCase().trim();
  }
  return undefined;
}

/** Application ID URI mặc định cho DMS. Override qua TEAMS_SSO_AUDIENCE nếu admin custom. */
function expectedAudiences(clientId: string): string[] {
  const def = `api://vanban.biahalong.com/${clientId}`;
  const override = process.env.TEAMS_SSO_AUDIENCE?.trim();
  return Array.from(new Set([clientId, override || def]));
}

export async function verifyTeamsSsoToken(token: string): Promise<TeamsSsoVerifyResult> {
  const clientId = (process.env.AZURE_AD_CLIENT_ID ?? '').trim();
  const tenantId = (process.env.AZURE_AD_TENANT_ID ?? '').trim();
  if (!clientId || !tenantId) return { ok: false, error: 'AZURE_AD_CLIENT_ID / AZURE_AD_TENANT_ID chưa cấu hình' };
  if (!token || typeof token !== 'string') return { ok: false, error: 'Token rỗng' };
  try {
    decodeProtectedHeader(token);
  } catch {
    return { ok: false, error: 'Token không phải JWT hợp lệ' };
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, getJwks(tenantId), {
      audience: expectedAudiences(clientId),
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
      clockTolerance: 60,
    });
    payload = verified.payload;
  } catch (err) {
    return { ok: false, error: `JWT verify thất bại: ${err instanceof Error ? err.message : String(err)}` };
  }

  const tid = typeof payload.tid === 'string' ? payload.tid : '';
  if (tid.toLowerCase() !== tenantId.toLowerCase()) return { ok: false, error: `tenant mismatch (tid=${tid})` };
  const oid = typeof payload.oid === 'string' ? payload.oid : '';
  if (!oid) return { ok: false, error: "Token thiếu claim 'oid'" };
  const email = pickEmail(payload);
  if (!email) return { ok: false, error: 'Token không có upn/preferred_username/email' };
  if (!email.endsWith(ALLOWED_DOMAIN)) return { ok: false, error: `Domain không cho phép: ${email}` };
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0];
  return { ok: true, user: { oid, email, name, tid } };
}
