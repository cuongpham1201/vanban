'use client';

// #31 — Client helpers cho Microsoft Teams SSO (client-only). Dynamic import @microsoft/teams-js v2
// (v2 KHÔNG gắn window.microsoftTeams). Không import từ server. Mọi hàm best-effort, không throw.

type TeamsSdk = typeof import('@microsoft/teams-js');

let sdkPromise: Promise<TeamsSdk | null> | null = null;
function loadSdk(): Promise<TeamsSdk | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!sdkPromise) {
    sdkPromise = import('@microsoft/teams-js').catch((err) => {
      console.warn('[Teams] dynamic import failed:', err);
      return null;
    });
  }
  return sdkPromise;
}

/** Heuristic synchronous: app có vẻ đang chạy trong Teams (iframe / param / UA). */
export function isInTeamsHostFast(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const inIframe = window.parent !== window;
    const url = new URL(window.location.href);
    const hasParam = url.searchParams.has('frameContext') || url.searchParams.has('inTeams') || url.searchParams.get('source') === 'teams';
    const ua = (navigator.userAgent || '').toLowerCase();
    return inIframe || hasParam || ua.includes('teams/') || ua.includes('microsoftteams');
  } catch {
    return false;
  }
}

let initPromise: Promise<boolean> | null = null;
const INIT_TIMEOUT_MS = 3000;

/** app.initialize() — true nếu trong Teams; false nếu host không phản hồi (timeout) hoặc lỗi. */
export function initTeams(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sdk = await loadSdk();
    if (!sdk) return false;
    try {
      return await Promise.race<boolean>([
        sdk.app.initialize().then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), INIT_TIMEOUT_MS)),
      ]);
    } catch (err) {
      console.warn('[Teams] initialize threw:', err instanceof Error ? err.message : String(err));
      return false;
    }
  })();
  return initPromise;
}

/** Silent SSO token (id token cho api://.../access_as_user). undefined nếu fail/chưa consent. */
export async function getTeamsSsoToken(): Promise<string | undefined> {
  if (!(await initTeams())) return undefined;
  const sdk = await loadSdk();
  if (!sdk) return undefined;
  try {
    const token = await sdk.authentication.getAuthToken();
    return token?.trim() || undefined;
  } catch (err) {
    console.warn('[Teams] getAuthToken failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/** Mở URL ra trình duyệt ngoài (thoát iframe Teams — tránh chặn cookie/redirect). */
export async function openExternal(url: string): Promise<void> {
  const sdk = await loadSdk();
  try {
    if (sdk && (await initTeams())) {
      await sdk.app.openLink(url);
      return;
    }
  } catch (err) {
    console.warn('[Teams] openLink failed, fallback window.open:', err);
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
