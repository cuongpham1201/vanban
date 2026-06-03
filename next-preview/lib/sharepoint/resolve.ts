import { graphFetch } from '@/lib/graph/client';

const SP_SITE_HOSTNAME = process.env.SP_SITE_HOSTNAME ?? 'biahalong.sharepoint.com';
const SP_SITE_PATH = process.env.SP_SITE_PATH ?? '/sites/vanbandieuhanh';
const SP_DMS_LIBRARY_NAME = process.env.SP_DMS_LIBRARY_NAME ?? 'DMS Library';

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

// Cache runtime (module scope) — tránh resolve lại mỗi request.
let _siteCache: SiteInfo | undefined;
let _listCache: ListInfo | undefined;

/** GET /sites/{hostname}:{path} → site id + displayName. */
export async function resolveSiteId(accessToken: string): Promise<SiteInfo> {
  if (_siteCache) {
    return _siteCache;
  }
  const path = `/sites/${SP_SITE_HOSTNAME}:${SP_SITE_PATH}`;
  const site = await graphFetch<{ id: string; displayName?: string; name?: string; webUrl?: string }>(
    path,
    { accessToken }
  );
  if (!site || !site.id) {
    throw new Error(`Cannot resolve SharePoint site: ${SP_SITE_HOSTNAME}${SP_SITE_PATH}`);
  }
  _siteCache = {
    id: site.id,
    displayName: site.displayName ?? site.name ?? SP_SITE_PATH,
    webUrl: site.webUrl,
  };
  return _siteCache;
}

/** GET /sites/{siteId}/lists?$filter=displayName eq 'DMS Library' → list id. */
export async function resolveListId(accessToken: string): Promise<ListInfo> {
  if (_listCache) {
    return _listCache;
  }
  const site = await resolveSiteId(accessToken);
  const filter = encodeURIComponent(`displayName eq '${SP_DMS_LIBRARY_NAME}'`);
  const resp = await graphFetch<{ value: Array<{ id: string; displayName: string; webUrl?: string }> }>(
    `/sites/${site.id}/lists?$filter=${filter}&$select=id,displayName,webUrl`,
    { accessToken }
  );
  const list = resp.value && resp.value[0];
  if (!list) {
    throw new Error(`Cannot find SharePoint library: ${SP_DMS_LIBRARY_NAME}`);
  }
  _listCache = { id: list.id, displayName: list.displayName, webUrl: list.webUrl };
  return _listCache;
}

/** Cho health/test: clear cache. */
export function clearSharePointCache(): void {
  _siteCache = undefined;
  _listCache = undefined;
}

export const sharePointConfig = {
  hostname: SP_SITE_HOSTNAME,
  sitePath: SP_SITE_PATH,
  libraryName: SP_DMS_LIBRARY_NAME,
};
