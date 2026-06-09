// Provisioning + validation cho SharePoint list "DMSNotifications" (mô hình Approval BHL).
// Schema lấy CHÍNH XÁC từ notificationService (fields thực sự dùng). KHÔNG tạo lại field hệ thống
// (Title đã có sẵn cùng list). Tạo list nếu chưa có; nếu có → validate + thêm cột thiếu.
//
// Yêu cầu app permission: tạo list cần Sites.Manage.All / Sites.FullControl.All (app-only).
// Thiếu quyền → Graph trả 403 → trả lỗi rõ ràng (không throw ra ngoài route).

import { graphFetch, GraphError } from '@/lib/graph/client';
import { resolveSiteId } from '@/lib/sharepoint/resolve';
import { NOTIFICATIONS_LIST_NAME, NOTIFICATION_READS_LIST_NAME } from './notificationService';

export type ColumnKind = 'text' | 'note' | 'boolean' | 'dateTime';

export interface ColumnDef {
  name: string;
  kind: ColumnKind;
  indexed?: boolean; // tạo column index (tăng tốc filter/scale list lớn)
}

// CỘT cần có (KHỚP fields trong notificationService — KHÔNG gồm Title hệ thống).
export const NOTIFICATION_COLUMNS: ColumnDef[] = [
  { name: 'UserEmail', kind: 'text' },
  { name: 'NotificationType', kind: 'text' }, // đổi tên từ 'Type'
  { name: 'Severity', kind: 'text' },
  { name: 'DocumentId', kind: 'text' },
  { name: 'DocumentNumber', kind: 'text' },
  { name: 'DocumentTitle', kind: 'text' },
  { name: 'Message', kind: 'note' },
  { name: 'Url', kind: 'text' },
  { name: 'IsRead', kind: 'boolean' },
  { name: 'CreatedAt', kind: 'dateTime' },
  { name: 'CreatedByEmail', kind: 'text' },
  { name: 'SourceModule', kind: 'text' },
  { name: 'EventKey', kind: 'text' },
  { name: 'PayloadJson', kind: 'note' },
];

// Read-state broadcast: 1 record/user/notification (đọc riêng — user A đọc KHÔNG ảnh hưởng user B).
export const NOTIFICATION_READS_COLUMNS: ColumnDef[] = [
  { name: 'NotificationId', kind: 'text', indexed: true },
  { name: 'UserEmail', kind: 'text', indexed: true },
  { name: 'ReadAt', kind: 'text' },
];

interface GraphColumn {
  name: string;
  indexed?: boolean;
  text?: { allowMultipleLines?: boolean };
  boolean?: Record<string, never>;
  dateTime?: Record<string, never>;
}

function toGraphColumn(c: ColumnDef): GraphColumn {
  const idx = c.indexed ? { indexed: true } : {};
  switch (c.kind) {
    case 'note':
      return { name: c.name, ...idx, text: { allowMultipleLines: true } };
    case 'boolean':
      return { name: c.name, ...idx, boolean: {} };
    case 'dateTime':
      return { name: c.name, ...idx, dateTime: {} };
    case 'text':
    default:
      return { name: c.name, ...idx, text: {} };
  }
}

interface ListLite {
  id: string;
  displayName: string;
  name?: string;
}

async function findList(accessToken: string, siteId: string, listName = NOTIFICATIONS_LIST_NAME): Promise<ListLite | null> {
  const resp = await graphFetch<{ value: ListLite[] }>(
    `/sites/${siteId}/lists?$select=id,displayName,name&$top=200`,
    { accessToken }
  );
  const want = listName.trim().toLowerCase();
  return (
    (resp.value ?? []).find(
      (l) => l.displayName.trim().toLowerCase() === want || (l.name ?? '').trim().toLowerCase() === want
    ) ?? null
  );
}

async function listColumnNames(accessToken: string, siteId: string, listId: string): Promise<string[]> {
  const resp = await graphFetch<{ value: { name: string }[] }>(
    `/sites/${siteId}/lists/${listId}/columns?$select=name&$top=200`,
    { accessToken }
  );
  return (resp.value ?? []).map((c) => c.name);
}

export interface ProvisionResult {
  ok: boolean;
  created: boolean;
  validated: boolean;
  listName: string;
  existingColumns?: string[];
  missingColumns?: string[];
  addedColumns?: string[];
  indexedColumns?: string[]; // cột đã được bật index trong lần provision này
  error?: string;
}

// Bật index cho các cột cần index nhưng hiện chưa index (PATCH additive). Trả tên cột vừa bật.
async function ensureIndexes(
  accessToken: string,
  siteId: string,
  listId: string,
  columns: ColumnDef[]
): Promise<string[]> {
  const want = columns.filter((c) => c.indexed);
  if (!want.length) return [];
  const resp = await graphFetch<{ value: { id: string; name: string; indexed?: boolean }[] }>(
    `/sites/${siteId}/lists/${listId}/columns?$select=id,name,indexed&$top=200`,
    { accessToken }
  );
  const byName = new Map((resp.value ?? []).map((c) => [c.name.toLowerCase(), c]));
  const done: string[] = [];
  for (const c of want) {
    const col = byName.get(c.name.toLowerCase());
    if (col && col.indexed !== true) {
      await graphFetch(`/sites/${siteId}/lists/${listId}/columns/${col.id}`, {
        accessToken,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indexed: true }),
      }).then(() => done.push(c.name)).catch(() => undefined);
    }
  }
  return done;
}

/**
 * Generic: tạo list nếu chưa có; nếu có thì validate + thêm cột thiếu (additive — KHÔNG xóa dữ liệu).
 */
async function provisionList(accessToken: string, listName: string, columns: ColumnDef[]): Promise<ProvisionResult> {
  try {
    const site = await resolveSiteId(accessToken);
    const existing = await findList(accessToken, site.id, listName);

    if (!existing) {
      // Tạo list mới kèm toàn bộ cột (Title tự có).
      await graphFetch(`/sites/${site.id}/lists`, {
        accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: listName,
          list: { template: 'genericList' },
          columns: columns.map(toGraphColumn),
        }),
      });
      return { ok: true, created: true, validated: true, listName, addedColumns: columns.map((c) => c.name), indexedColumns: columns.filter((c) => c.indexed).map((c) => c.name) };
    }

    // Đã có → validate cột, thêm cột thiếu (additive).
    const have = new Set((await listColumnNames(accessToken, site.id, existing.id)).map((n) => n.toLowerCase()));
    const missing = columns.filter((c) => !have.has(c.name.toLowerCase()));
    const added: string[] = [];
    for (const c of missing) {
      await graphFetch(`/sites/${site.id}/lists/${existing.id}/columns`, {
        accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toGraphColumn(c)),
      }).then(() => added.push(c.name)).catch(() => undefined);
    }
    // Bật index cho cột cần index (kể cả cột đã tồn tại từ trước nhưng chưa index).
    const indexedColumns = await ensureIndexes(accessToken, site.id, existing.id, columns).catch(() => []);
    const stillMissing = missing.filter((c) => !added.includes(c.name)).map((c) => c.name);
    return {
      ok: stillMissing.length === 0,
      created: false,
      validated: stillMissing.length === 0,
      listName,
      missingColumns: missing.map((c) => c.name),
      addedColumns: added,
      indexedColumns,
      ...(stillMissing.length ? { error: `Còn thiếu cột: ${stillMissing.join(', ')}` } : {}),
    };
  } catch (e) {
    const msg =
      e instanceof GraphError
        ? `Graph ${e.status} — ${e.statusText}. ${e.status === 403 ? 'Cần app permission Sites.Manage.All/FullControl để tạo list.' : ''}`
        : e instanceof Error
          ? e.message
          : String(e);
    return { ok: false, created: false, validated: false, listName, error: msg };
  }
}

/** Tạo/validate list "DMSNotifications". */
export async function provisionNotificationsList(accessToken: string): Promise<ProvisionResult> {
  return provisionList(accessToken, NOTIFICATIONS_LIST_NAME, NOTIFICATION_COLUMNS);
}

/** Tạo/validate list "DMSNotificationReads" (read-state broadcast per-user). */
export async function provisionNotificationReadsList(accessToken: string): Promise<ProvisionResult> {
  return provisionList(accessToken, NOTIFICATION_READS_LIST_NAME, NOTIFICATION_READS_COLUMNS);
}

/** Provision CẢ HAI list (notifications + reads). Dùng cho admin route. */
export async function provisionAllNotificationLists(
  accessToken: string
): Promise<{ notifications: ProvisionResult; reads: ProvisionResult }> {
  const notifications = await provisionNotificationsList(accessToken);
  const reads = await provisionNotificationReadsList(accessToken);
  return { notifications, reads };
}

export interface NotificationsHealth {
  listExists: boolean;
  schemaValid: boolean;
  itemCount: number;
  missingColumns: string[];
}

/** Kiểm tra list tồn tại + schema + đếm item (read-only). */
export async function inspectNotificationsList(accessToken: string): Promise<NotificationsHealth> {
  const site = await resolveSiteId(accessToken);
  const existing = await findList(accessToken, site.id);
  if (!existing) {
    return { listExists: false, schemaValid: false, itemCount: 0, missingColumns: NOTIFICATION_COLUMNS.map((c) => c.name) };
  }
  const have = new Set((await listColumnNames(accessToken, site.id, existing.id)).map((n) => n.toLowerCase()));
  const missing = NOTIFICATION_COLUMNS.filter((c) => !have.has(c.name.toLowerCase())).map((c) => c.name);
  let itemCount = 0;
  try {
    const resp = await graphFetch<{ value: unknown[] }>(
      `/sites/${site.id}/lists/${existing.id}/items?$select=id&$top=500`,
      { accessToken }
    );
    itemCount = (resp.value ?? []).length;
  } catch {
    itemCount = 0;
  }
  return { listExists: true, schemaValid: missing.length === 0, itemCount, missingColumns: missing };
}
