// SharePoint List "DMSConfig" — lưu cấu hình dùng chung toàn hệ thống (source of truth).
// KHÔNG đụng document library / metadata schema. List riêng cho config.
//
// Schema list "DMSConfig" (SharePoint custom list — genericList):
//   - Title        (Single line of text)  — tên hiển thị cấu hình
//   - ConfigKey    (Single line of text)  — khóa duy nhất, vd "search-filters"
//   - ConfigJson   (Multiple lines of text, plain) — JSON cấu hình (có thể dài > 255)
//   - UpdatedAt    (Single line of text / DateTime) — ISO timestamp cập nhật gần nhất
//   - UpdatedBy    (Single line of text)  — email người cập nhật
//   - IsActive     (Yes/No)               — bật/tắt cấu hình (mặc định true)
//
// Đọc dùng app-only read token; ghi dùng app-only write token (write-gated).

import { graphFetch, GraphError } from '@/lib/graph/client';
import { resolveSiteId } from '@/lib/sharepoint/resolve';

const CONFIG_LIST_NAME = process.env.SHAREPOINT_CONFIG_LIST_NAME ?? 'DMSConfig';

export interface ConfigRecord {
  itemId: string;
  configKey: string;
  /** Chuỗi JSON thô lưu trong ConfigJson. */
  json: string;
  updatedAt?: string;
  updatedBy?: string;
  isActive: boolean;
}

export class ConfigListError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ConfigListError';
    this.status = status;
  }
}

interface ListItemFields {
  Title?: string;
  ConfigKey?: string;
  ConfigJson?: string;
  UpdatedAt?: string;
  UpdatedBy?: string;
  IsActive?: boolean;
}
interface ListItem {
  id: string;
  fields?: ListItemFields;
}

let _configListId: string | null | undefined; // undefined=chưa resolve, null=không tồn tại

/** Resolve list id của DMSConfig theo displayName/name. null nếu list chưa tồn tại. */
async function resolveConfigListId(accessToken: string): Promise<string | null> {
  if (_configListId !== undefined) {
    return _configListId;
  }
  const site = await resolveSiteId(accessToken);
  const resp = await graphFetch<{ value: { id: string; displayName: string; name?: string }[] }>(
    `/sites/${site.id}/lists?$select=id,displayName,name&$top=200`,
    { accessToken }
  );
  const norm = (s: string): string => s.trim().toLowerCase();
  const want = norm(CONFIG_LIST_NAME);
  const hit = (resp.value ?? []).find((l) => norm(l.displayName) === want || norm(l.name ?? '') === want);
  _configListId = hit ? hit.id : null;
  return _configListId;
}

/** Xóa cache list id (test/diagnostics). */
export function clearConfigListCache(): void {
  _configListId = undefined;
}

const FIELD_SELECT = 'Title,ConfigKey,ConfigJson,UpdatedAt,UpdatedBy,IsActive';

/**
 * Đọc bản ghi config theo ConfigKey. Trả null nếu list chưa tồn tại hoặc không có item khớp.
 * Lọc client-side (list config nhỏ) để không phụ thuộc field index của SharePoint.
 */
export async function getConfigRecord(accessToken: string, configKey: string): Promise<ConfigRecord | null> {
  const listId = await resolveConfigListId(accessToken);
  if (!listId) {
    return null;
  }
  const site = await resolveSiteId(accessToken);
  const resp = await graphFetch<{ value: ListItem[] }>(
    `/sites/${site.id}/lists/${listId}/items?$expand=fields($select=${FIELD_SELECT})&$top=200`,
    { accessToken }
  );
  const items = resp.value ?? [];
  const hit = items.find((it) => (it.fields?.ConfigKey ?? '').trim() === configKey && it.fields?.IsActive !== false);
  if (!hit || !hit.fields) {
    return null;
  }
  return {
    itemId: hit.id,
    configKey,
    json: hit.fields.ConfigJson ?? '',
    updatedAt: hit.fields.UpdatedAt,
    updatedBy: hit.fields.UpdatedBy,
    isActive: hit.fields.IsActive !== false,
  };
}

/**
 * Upsert config theo ConfigKey (tạo mới nếu chưa có, PATCH nếu đã có).
 * List BẮT BUỘC tồn tại — nếu chưa, ném ConfigListError(409) kèm hướng dẫn tạo list.
 */
export async function upsertConfigRecord(
  accessToken: string,
  configKey: string,
  json: string,
  updatedBy: string
): Promise<ConfigRecord> {
  const listId = await resolveConfigListId(accessToken);
  if (!listId) {
    throw new ConfigListError(
      `SharePoint list "${CONFIG_LIST_NAME}" chưa tồn tại. Tạo list (genericList) với các cột: ` +
        `Title, ConfigKey (text), ConfigJson (multi-line text), UpdatedAt (text), UpdatedBy (text), IsActive (yes/no).`,
      409
    );
  }
  const site = await resolveSiteId(accessToken);
  const updatedAt = new Date().toISOString();

  const existing = await getConfigRecord(accessToken, configKey).catch(() => null);

  if (existing) {
    // PATCH fields của item đã có.
    await graphFetch(`/sites/${site.id}/lists/${listId}/items/${existing.itemId}/fields`, {
      accessToken,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ConfigJson: json, UpdatedAt: updatedAt, UpdatedBy: updatedBy, IsActive: true }),
    });
    return { itemId: existing.itemId, configKey, json, updatedAt, updatedBy, isActive: true };
  }

  // Tạo item mới.
  const created = await graphFetch<ListItem>(`/sites/${site.id}/lists/${listId}/items`, {
    accessToken,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        Title: configKey,
        ConfigKey: configKey,
        ConfigJson: json,
        UpdatedAt: updatedAt,
        UpdatedBy: updatedBy,
        IsActive: true,
      },
    }),
  });
  return { itemId: created.id, configKey, json, updatedAt, updatedBy, isActive: true };
}

export { GraphError };
