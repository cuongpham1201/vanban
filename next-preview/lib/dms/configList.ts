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
  let listId = await resolveConfigListId(accessToken);
  if (!listId) {
    // Tự seed list DMSConfig khi chưa có (admin save → list được tạo + lưu luôn).
    const prov = await provisionConfigList(accessToken);
    if (!prov.ok) {
      throw new ConfigListError(prov.error ?? `Không tạo được list "${CONFIG_LIST_NAME}".`, 409);
    }
    clearConfigListCache();
    listId = await resolveConfigListId(accessToken);
    if (!listId) {
      throw new ConfigListError(`List "${CONFIG_LIST_NAME}" chưa sẵn sàng sau khi tạo.`, 502);
    }
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

/**
 * Xóa bản ghi config theo ConfigKey (dùng cho "reset về mặc định").
 * Trả true nếu có item bị xóa, false nếu không tồn tại (idempotent — KHÔNG ném khi đã trống).
 */
export async function deleteConfigRecord(accessToken: string, configKey: string): Promise<boolean> {
  const listId = await resolveConfigListId(accessToken);
  if (!listId) return false;
  const existing = await getConfigRecord(accessToken, configKey).catch(() => null);
  if (!existing) return false;
  const site = await resolveSiteId(accessToken);
  await graphFetch(`/sites/${site.id}/lists/${listId}/items/${existing.itemId}`, {
    accessToken,
    method: 'DELETE',
  });
  return true;
}

// ── Provisioning (seed list DMSConfig) ─────────────────────────────────────────
type ColKind = 'text' | 'note' | 'boolean';
// KHÔNG gồm Title (cột hệ thống tự có khi tạo list).
const CONFIG_COLUMNS: { name: string; kind: ColKind; indexed?: boolean }[] = [
  { name: 'ConfigKey', kind: 'text', indexed: true },
  { name: 'ConfigJson', kind: 'note' },
  { name: 'UpdatedAt', kind: 'text' },
  { name: 'UpdatedBy', kind: 'text' },
  { name: 'IsActive', kind: 'boolean' },
];
function toGraphColumn(c: { name: string; kind: ColKind; indexed?: boolean }): Record<string, unknown> {
  const col: Record<string, unknown> = { name: c.name };
  if (c.indexed) col.indexed = true;
  if (c.kind === 'note') col.text = { allowMultipleLines: true };
  else if (c.kind === 'boolean') col.boolean = {};
  else col.text = {};
  return col;
}

export interface ProvisionResult {
  ok: boolean;
  created: boolean;
  validated: boolean;
  listName: string;
  addedColumns?: string[];
  missingColumns?: string[];
  error?: string;
}

/**
 * Tạo list DMSConfig (genericList) với cột chuẩn nếu chưa có; nếu có thì validate + thêm cột thiếu.
 * Cần app permission Sites.Manage.All/FullControl để tạo list (403 → trả lỗi rõ ràng, không throw).
 */
export async function provisionConfigList(accessToken: string): Promise<ProvisionResult> {
  const listName = CONFIG_LIST_NAME;
  try {
    const site = await resolveSiteId(accessToken);
    const resp = await graphFetch<{ value: { id: string; displayName: string; name?: string }[] }>(
      `/sites/${site.id}/lists?$select=id,displayName,name&$top=200`,
      { accessToken }
    );
    const norm = (s: string): string => s.trim().toLowerCase();
    const want = norm(listName);
    const existing = (resp.value ?? []).find((l) => norm(l.displayName) === want || norm(l.name ?? '') === want);

    if (!existing) {
      await graphFetch(`/sites/${site.id}/lists`, {
        accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: listName,
          list: { template: 'genericList' },
          columns: CONFIG_COLUMNS.map(toGraphColumn),
        }),
      });
      _configListId = undefined; // reset cache để resolve lại
      return { ok: true, created: true, validated: true, listName, addedColumns: CONFIG_COLUMNS.map((c) => c.name) };
    }

    const cols = await graphFetch<{ value: { name: string }[] }>(
      `/sites/${site.id}/lists/${existing.id}/columns?$select=name&$top=200`,
      { accessToken }
    );
    const have = new Set((cols.value ?? []).map((c) => c.name.toLowerCase()));
    const missing = CONFIG_COLUMNS.filter((c) => !have.has(c.name.toLowerCase()));
    const added: string[] = [];
    for (const c of missing) {
      await graphFetch(`/sites/${site.id}/lists/${existing.id}/columns`, {
        accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toGraphColumn(c)),
      })
        .then(() => added.push(c.name))
        .catch(() => undefined);
    }
    _configListId = existing.id;
    const stillMissing = missing.filter((c) => !added.includes(c.name)).map((c) => c.name);
    return {
      ok: stillMissing.length === 0,
      created: false,
      validated: stillMissing.length === 0,
      listName,
      missingColumns: missing.map((c) => c.name),
      addedColumns: added,
      ...(stillMissing.length ? { error: `Còn thiếu cột: ${stillMissing.join(', ')}` } : {}),
    };
  } catch (e) {
    const msg =
      e instanceof GraphError
        ? `Graph ${e.status} ${e.statusText}.${e.status === 403 ? ' Cần app permission Sites.Manage.All/FullControl để tạo list.' : ''}`
        : e instanceof Error
          ? e.message
          : String(e);
    return { ok: false, created: false, validated: false, listName, error: msg };
  }
}

export { GraphError };
