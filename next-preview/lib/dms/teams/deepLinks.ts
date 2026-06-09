// DMS Teams deep links — mở văn bản TRONG Teams app tab (fallback browser).
//
// Format (Teams entity link):
//   https://teams.microsoft.com/l/entity/<TEAMS_APP_ID>/<entityId>
//     ?webUrl=<encoded web url>&context=<encoded {"subEntityId": "<path>"}>
//
//   - <TEAMS_APP_ID> = Teams App ID (manifest `id`) — env TEAMS_APP_ID, fallback manifest id.
//   - <entityId>     = entityId của static tab (manifest staticTabs[].entityId).
//   - webUrl         = full https URL — fallback khi app CHƯA cài (Teams mở browser).
//   - subEntityId    = path (vd /documents/123?inTeams=1) — tab route tới detail.
//
// Không có App ID → trả webUrl nguyên bản (graceful fallback).

// Fallback Teams App ID production (teams/manifest.json `id`).
const FALLBACK_TEAMS_APP_ID = 'b7c24a20-3b43-4fb7-86bc-1a0e4e4e96de';
// entityId của static tab (teams/manifest.json staticTabs[0].entityId).
const STATIC_TAB_ENTITY_ID = 'b7c24a20-3b43-4fb7-86bc-1a0e4e4e96de';

/** Base URL công khai của DMS (khớp emailChannel). */
export function getDmsBaseUrl(): string {
  return (process.env.DMS_PUBLIC_BASE_URL ?? 'https://vanban.biahalong.com').trim().replace(/\/+$/, '');
}

/** Teams App ID theo priority: TEAMS_APP_ID > fallback manifest id. */
function getTeamsAppId(): string | undefined {
  return process.env.TEAMS_APP_ID?.trim() || FALLBACK_TEAMS_APP_ID || undefined;
}

/** Web URL mở chi tiết văn bản (thêm ?inTeams=1 cho context Teams). */
export function buildDocumentWebUrl(documentId: string): string {
  return `${getDmsBaseUrl()}/documents/${encodeURIComponent(documentId)}?inTeams=1`;
}

/** Bọc 1 web URL thành Teams deep link (mở trong app tab). Fallback: trả nguyên webUrl. */
export function buildTeamsAppDeepLink(webUrl: string): string {
  if (!webUrl) return webUrl;
  const appId = getTeamsAppId();
  if (!appId) return webUrl;

  let subEntityId = '';
  try {
    const u = new URL(webUrl);
    subEntityId = `${u.pathname}${u.search}`;
  } catch {
    subEntityId = webUrl;
  }

  const params = new URLSearchParams({ webUrl, context: JSON.stringify({ subEntityId }) });
  return `https://teams.microsoft.com/l/entity/${appId}/${STATIC_TAB_ENTITY_ID}?${params.toString()}`;
}

/** Deep link mở chi tiết 1 văn bản trong Teams (web URL + bọc deep link). */
export function buildDocumentDeepLink(documentId: string): string {
  return buildTeamsAppDeepLink(buildDocumentWebUrl(documentId));
}

export const TEAMS_DEEPLINK_ENTITY_ID = STATIC_TAB_ENTITY_ID;
