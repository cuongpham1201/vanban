import { graphFetch } from '@/lib/graph/client';

// Env chuẩn hóa (ưu tiên tên mới SHAREPOINT_*, fallback tên cũ SP_* để không vỡ khi chưa đổi env).
const HOSTNAME = process.env.SHAREPOINT_HOSTNAME ?? process.env.SP_SITE_HOSTNAME ?? 'biahalong.sharepoint.com';
const SITE_PATH = process.env.SHAREPOINT_SITE_PATH ?? process.env.SP_SITE_PATH ?? '/sites/vanbandieuhanh';
const SITE_ID_ENV = process.env.SHAREPOINT_SITE_ID; // tùy chọn — nếu set thì dùng trực tiếp
const LIBRARY_NAME = process.env.SHAREPOINT_LIBRARY_NAME ?? process.env.SP_DMS_LIBRARY_NAME ?? '';

// Thứ tự thử khi không khớp tên cấu hình (không hardcode 1 tên duy nhất trong code).
const FALLBACK_LIBRARIES = ['DMS', 'DMS Library', 'Documents', 'Shared Documents', 'Documents partagés'];

export interface SiteInfo {
  id: string;
  displayName: string;
  webUrl?: string;
}
export interface ListInfo {
  id: string;
  displayName: string;
  webUrl?: string;
}
export interface DriveInfo {
  id: string;
  name: string;
  webUrl?: string;
}

export interface LibraryResolveDetail {
  configuredLibrary: string;
  attemptedLibraries: string[];
  siteId: string;
  siteUrl?: string;
  drivesFound: DriveInfo[];
  librariesFound: { id: string; displayName: string }[];
  message: string;
}

/** Lỗi rõ ràng khi không tìm thấy library — mang theo chi tiết để route trả JSON. */
export class LibraryResolveError extends Error {
  status = 404;
  detail: LibraryResolveDetail;
  constructor(detail: LibraryResolveDetail) {
    super(detail.message);
    this.name = 'LibraryResolveError';
    this.detail = detail;
  }
}

let _siteCache: SiteInfo | undefined;
let _listCache: ListInfo | undefined;

/** Resolve site: ưu tiên SHAREPOINT_SITE_ID, fallback {hostname}:{path}. */
export async function resolveSiteId(accessToken: string): Promise<SiteInfo> {
  if (_siteCache) {
    return _siteCache;
  }
  const path = SITE_ID_ENV
    ? `/sites/${SITE_ID_ENV}?$select=id,displayName,webUrl`
    : `/sites/${HOSTNAME}:${SITE_PATH}?$select=id,displayName,webUrl`;
  const site = await graphFetch<{ id: string; displayName?: string; name?: string; webUrl?: string }>(path, {
    accessToken,
  });
  if (!site || !site.id) {
    throw new Error(`Không resolve được SharePoint site: ${SITE_ID_ENV ?? HOSTNAME + SITE_PATH}`);
  }
  _siteCache = { id: site.id, displayName: site.displayName ?? site.name ?? SITE_PATH, webUrl: site.webUrl };
  return _siteCache;
}

/** Liệt kê drives (document libraries) của site — phục vụ chẩn đoán. */
export async function getDrives(accessToken: string, siteId: string): Promise<DriveInfo[]> {
  const resp = await graphFetch<{ value: DriveInfo[] }>(
    `/sites/${siteId}/drives?$select=id,name,webUrl&$top=200`,
    { accessToken }
  );
  return (resp.value ?? []).map((d) => ({ id: d.id, name: d.name, webUrl: d.webUrl }));
}

/** Liệt kê các list dạng documentLibrary của site. */
async function getDocumentLibraries(
  accessToken: string,
  siteId: string
): Promise<{ id: string; displayName: string; name?: string; webUrl?: string }[]> {
  const resp = await graphFetch<{
    value: { id: string; displayName: string; name?: string; webUrl?: string; list?: { template?: string } }[];
  }>(`/sites/${siteId}/lists?$select=id,displayName,name,webUrl,list&$top=200`, { accessToken });
  return (resp.value ?? [])
    .filter((l) => l.list?.template === 'documentLibrary')
    .map((l) => ({ id: l.id, displayName: l.displayName, name: l.name, webUrl: l.webUrl }));
}

/**
 * Resolve list id của library DMS.
 * - Khớp theo SHAREPOINT_LIBRARY_NAME, sau đó các tên fallback (case-insensitive, theo displayName/name).
 * - Không tìm thấy → ném LibraryResolveError với chi tiết (drives/libraries tìm thấy) thay vì lỗi mù.
 */
export async function resolveListId(accessToken: string): Promise<ListInfo> {
  if (_listCache) {
    return _listCache;
  }
  const site = await resolveSiteId(accessToken);

  const attemptedLibraries = Array.from(
    new Set([LIBRARY_NAME, ...FALLBACK_LIBRARIES].map((s) => s.trim()).filter(Boolean))
  );

  const libraries = await getDocumentLibraries(accessToken, site.id);
  const norm = (s: string): string => s.trim().toLowerCase();

  for (const wanted of attemptedLibraries) {
    const hit = libraries.find((l) => norm(l.displayName) === norm(wanted) || norm(l.name ?? '') === norm(wanted));
    if (hit) {
      _listCache = { id: hit.id, displayName: hit.displayName, webUrl: hit.webUrl };
      return _listCache;
    }
  }

  // Không khớp → dựng chi tiết chẩn đoán.
  const drivesFound = await getDrives(accessToken, site.id).catch(() => []);
  const librariesFound = libraries.map((l) => ({ id: l.id, displayName: l.displayName }));
  const detail: LibraryResolveDetail = {
    configuredLibrary: LIBRARY_NAME || '(SHAREPOINT_LIBRARY_NAME chưa đặt)',
    attemptedLibraries,
    siteId: site.id,
    siteUrl: site.webUrl,
    drivesFound,
    librariesFound,
    message:
      `Không tìm thấy SharePoint document library. Đã thử: [${attemptedLibraries.join(', ')}]. ` +
      `Library hiện có: [${librariesFound.map((l) => l.displayName).join(', ') || 'none'}]. ` +
      `Đặt SHAREPOINT_LIBRARY_NAME đúng 1 trong các tên này.`,
  };
  // Log server an toàn (không có token/secret).
  // eslint-disable-next-line no-console
  console.error('[sharepoint] LibraryResolveError', JSON.stringify(detail));
  throw new LibraryResolveError(detail);
}

export function clearSharePointCache(): void {
  _siteCache = undefined;
  _listCache = undefined;
}

export const sharePointConfig = {
  hostname: HOSTNAME,
  sitePath: SITE_PATH,
  siteIdEnv: SITE_ID_ENV,
  libraryName: LIBRARY_NAME,
  fallbackLibraries: FALLBACK_LIBRARIES,
};
