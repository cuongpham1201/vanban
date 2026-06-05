// Phase 10D.2 — App-only Graph token (client-credentials), server-side.
//
// AN TOÀN:
//  - CHỈ mint khi isDmsWriteEnabled() === true (flag tắt → ném WriteDisabledError).
//  - Dùng AZURE_AD_CLIENT_SECRET (đã có cho NextAuth) — KHÔNG bao giờ log/trả ra client.
//  - Token cache trong RAM theo expires_in (trừ 60s) để không mint mỗi request.
//  - Đây là token AUTH (không phải data write). Bản thân việc mint không ghi dữ liệu nào.
import { isDmsWriteEnabled } from '@/lib/dms/writeConfig';
import { DmsWriteError } from '@/lib/dms/writeGuard';

interface CachedToken {
  token: string;
  expEpochMs: number;
}
let _cache: CachedToken | undefined;

export class AppTokenError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AppTokenError';
    this.status = status;
  }
}

/**
 * Lấy app-only access token (Application permissions: Sites.ReadWrite.All / Files.ReadWrite.All
 * đã admin-consent). Chặn cứng nếu write flag tắt.
 */
export async function getAppOnlyGraphToken(): Promise<string> {
  if (!isDmsWriteEnabled()) {
    throw new DmsWriteError('DMS write is disabled', 403);
  }
  return mintAppToken();
}

/**
 * App-only token cho READ-ONLY (vd proxy stream PDF). KHÔNG gate write flag vì đây là ĐỌC;
 * mọi thao tác WRITE vẫn bị chặn riêng bởi assertWriteEnabled trong SharePointDmsService.
 */
export async function getAppOnlyGraphTokenReadOnly(): Promise<string> {
  return mintAppToken();
}

async function mintAppToken(): Promise<string> {
  if (_cache && Date.now() < _cache.expEpochMs) {
    return _cache.token;
  }

  const tenant = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new AppTokenError('Thiếu AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET.', 500);
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) {
    // KHÔNG log secret/token; chỉ thông báo lỗi an toàn.
    throw new AppTokenError(`Không lấy được app-only token (HTTP ${res.status}).`, 502);
  }

  _cache = {
    token: json.access_token,
    expEpochMs: Date.now() + Math.max(60, Number(json.expires_in ?? 3600) - 60) * 1000,
  };
  return _cache.token;
}

/** Xóa cache token (test/diagnostics). */
export function clearAppTokenCache(): void {
  _cache = undefined;
}
