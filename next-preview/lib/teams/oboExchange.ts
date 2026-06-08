// #31 — On-Behalf-Of (OBO): đổi Teams SSO token → DELEGATED Graph access token cho DMS.
// DMS read layer (getDocsForRequest) cần session.accessToken là Graph token → buộc phải OBO
// (Approval BHL không cần vì dùng app-only/DB). offline_access → có refresh token (refresh như OAuth).
//
// YÊU CẦU ENTRA (admin cấu hình thủ công — nếu thiếu, OBO trả lỗi → client fallback login):
//   - Expose an API + Application ID URI api://vanban.biahalong.com/<clientId> + scope access_as_user.
//   - App có delegated Graph perms (User.Read, Sites.Read.All, Files.Read.All) đã admin-consent.
//   - Pre-authorize Teams client IDs cho scope access_as_user.

export interface OboResult {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch seconds
  error?: string;
}

// Scope Graph delegated DMS cần + offline_access để lấy refresh token.
const GRAPH_OBO_SCOPE = ['User.Read', 'Sites.Read.All', 'Files.Read.All', 'offline_access'].join(' ');

export async function exchangeTeamsTokenForGraph(teamsToken: string): Promise<OboResult> {
  const tenantId = (process.env.AZURE_AD_TENANT_ID ?? '').trim();
  const clientId = (process.env.AZURE_AD_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.AZURE_AD_CLIENT_SECRET ?? '').trim();
  if (!tenantId || !clientId || !clientSecret) {
    return { ok: false, error: 'Thiếu AZURE_AD_TENANT_ID/CLIENT_ID/CLIENT_SECRET cho OBO.' };
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    client_id: clientId,
    client_secret: clientSecret,
    assertion: teamsToken,
    scope: GRAPH_OBO_SCOPE,
    requested_token_use: 'on_behalf_of',
  });

  try {
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    const j = (await res.json().catch(() => ({}))) as {
      access_token?: string; refresh_token?: string; expires_in?: number;
      error?: string; error_description?: string;
    };
    if (!res.ok || !j.access_token) {
      // KHÔNG log token; chỉ mã lỗi Entra (vd invalid_grant / interaction_required / consent).
      return { ok: false, error: `OBO thất bại (${j.error ?? res.status}): ${(j.error_description ?? '').slice(0, 140)}` };
    }
    return {
      ok: true,
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + Number(j.expires_in ?? 3600),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
