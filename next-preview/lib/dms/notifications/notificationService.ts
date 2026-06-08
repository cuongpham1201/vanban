// DMS Notification service — Phase 1.
// Backend:
//   - Production (NODE_ENV=production): SharePoint list "DMSNotifications" (Graph).
//   - Dev/preview: in-memory store (module-level) → bell + acceptance tests chạy local,
//     KHÔNG ghi vào SharePoint thật. Nhất quán với pattern MockDmsService/dev-login.
// Token cho thao tác SharePoint dùng app-only (un-gated mint) — notifications KHÔNG phụ thuộc
// cờ DMS_WRITE_ENABLED (đó là cờ cho ghi tài liệu).
//
// Schema list "DMSNotifications" (xem README/report): Title, UserEmail, Type, Severity, DocumentId,
//   DocumentNumber, DocumentTitle, Message, Url, IsRead (yes/no), CreatedAt (datetime),
//   CreatedByEmail, SourceModule, EventKey, PayloadJson (multi-line).

import { graphFetch } from '@/lib/graph/client';
import { resolveSiteId } from '@/lib/sharepoint/resolve';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import {
  DmsNotification,
  CreateNotificationInput,
  defaultSeverity,
  NotificationType,
  NotificationSeverity,
} from './types';

const LIST_NAME = process.env.SHAREPOINT_NOTIFICATIONS_LIST_NAME ?? 'DMSNotifications';
const DEFAULT_TOP = 20;

function normEmail(e: string): string {
  return (e ?? '').toLowerCase().trim();
}
function useMemoryStore(): boolean {
  return process.env.NODE_ENV !== 'production';
}

// ── In-memory store (dev/preview) ──────────────────────────────────────────────
// LƯU Ý: Next.js cô lập module-state theo từng route bundle → KHÔNG chia sẻ `let MEM` giữa các
// route handler. Dùng globalThis (singleton trong 1 tiến trình Node) để mọi route thấy cùng store.
const _g = globalThis as unknown as { __dmsNotiMem?: DmsNotification[]; __dmsNotiSeq?: number };
_g.__dmsNotiMem ??= [];
_g.__dmsNotiSeq ??= 0;
const MEM: DmsNotification[] = _g.__dmsNotiMem;
function nextMemSeq(): number {
  _g.__dmsNotiSeq = (_g.__dmsNotiSeq ?? 0) + 1;
  return _g.__dmsNotiSeq;
}

const memStore = {
  async create(n: DmsNotification): Promise<DmsNotification> {
    if (n.eventKey && MEM.some((x) => x.userEmail === n.userEmail && x.eventKey === n.eventKey)) {
      return MEM.find((x) => x.userEmail === n.userEmail && x.eventKey === n.eventKey) as DmsNotification;
    }
    MEM.unshift(n);
    return n;
  },
  async list(userEmail: string, top: number): Promise<DmsNotification[]> {
    return MEM.filter((x) => x.userEmail === userEmail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, top);
  },
  async unreadCount(userEmail: string): Promise<number> {
    return MEM.filter((x) => x.userEmail === userEmail && !x.isRead).length;
  },
  async markRead(userEmail: string, id: string): Promise<boolean> {
    const hit = MEM.find((x) => x.id === id);
    if (!hit) return false;
    if (hit.userEmail !== userEmail) throw new NotificationForbiddenError();
    hit.isRead = true;
    return true;
  },
  async markAllRead(userEmail: string): Promise<number> {
    let n = 0;
    for (const x of MEM) if (x.userEmail === userEmail && !x.isRead) { x.isRead = true; n++; }
    return n;
  },
};

export class NotificationForbiddenError extends Error {
  status = 403;
  constructor() {
    super('Không có quyền với thông báo này.');
    this.name = 'NotificationForbiddenError';
  }
}

// ── SharePoint store (production) ──────────────────────────────────────────────
interface SpFields {
  Title?: string;
  UserEmail?: string;
  Type?: string;
  Severity?: string;
  DocumentId?: string;
  DocumentNumber?: string;
  DocumentTitle?: string;
  Message?: string;
  Url?: string;
  IsRead?: boolean;
  CreatedAt?: string;
  CreatedByEmail?: string;
  SourceModule?: string;
  EventKey?: string;
  PayloadJson?: string;
}
interface SpItem {
  id: string;
  fields?: SpFields;
}

const FIELD_SELECT =
  'Title,UserEmail,Type,Severity,DocumentId,DocumentNumber,DocumentTitle,Message,Url,IsRead,CreatedAt,CreatedByEmail,SourceModule,EventKey,PayloadJson';

let _spListId: string | null | undefined;

async function token(): Promise<string> {
  return getAppOnlyGraphTokenReadOnly();
}

async function resolveListId(accessToken: string): Promise<string | null> {
  if (_spListId !== undefined) return _spListId;
  const site = await resolveSiteId(accessToken);
  const resp = await graphFetch<{ value: { id: string; displayName: string; name?: string }[] }>(
    `/sites/${site.id}/lists?$select=id,displayName,name&$top=200`,
    { accessToken }
  );
  const want = LIST_NAME.trim().toLowerCase();
  const hit = (resp.value ?? []).find(
    (l) => l.displayName.trim().toLowerCase() === want || (l.name ?? '').trim().toLowerCase() === want
  );
  _spListId = hit ? hit.id : null;
  return _spListId;
}

function fromSp(item: SpItem): DmsNotification {
  const f = item.fields ?? {};
  return {
    id: item.id,
    userEmail: normEmail(f.UserEmail ?? ''),
    type: (f.Type as NotificationType) ?? 'SYSTEM',
    severity: (f.Severity as NotificationSeverity) ?? 'info',
    title: f.Title ?? '',
    message: f.Message ?? '',
    documentId: f.DocumentId || undefined,
    documentNumber: f.DocumentNumber || undefined,
    documentTitle: f.DocumentTitle || undefined,
    url: f.Url || undefined,
    isRead: f.IsRead === true,
    createdAt: f.CreatedAt ?? '',
    createdByEmail: f.CreatedByEmail || undefined,
    sourceModule: f.SourceModule || 'DMS',
    eventKey: f.EventKey || undefined,
  };
}

const spStore = {
  async create(n: DmsNotification, payloadJson?: string): Promise<DmsNotification> {
    const accessToken = await token();
    const listId = await resolveListId(accessToken);
    if (!listId) {
      throw new Error(`SharePoint list "${LIST_NAME}" chưa tồn tại — tạo list theo schema DMSNotifications.`);
    }
    const site = await resolveSiteId(accessToken);
    // Idempotency: nếu đã có item cùng (UserEmail, EventKey) thì bỏ qua tạo mới.
    if (n.eventKey) {
      const dup = await findByEventKey(accessToken, site.id, listId, n.userEmail, n.eventKey);
      if (dup) return fromSp(dup);
    }
    const created = await graphFetch<SpItem>(`/sites/${site.id}/lists/${listId}/items`, {
      accessToken,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          Title: n.title,
          UserEmail: n.userEmail,
          Type: n.type,
          Severity: n.severity,
          DocumentId: n.documentId ?? '',
          DocumentNumber: n.documentNumber ?? '',
          DocumentTitle: n.documentTitle ?? '',
          Message: n.message,
          Url: n.url ?? '',
          IsRead: false,
          CreatedAt: n.createdAt,
          CreatedByEmail: n.createdByEmail ?? '',
          SourceModule: n.sourceModule,
          EventKey: n.eventKey ?? '',
          PayloadJson: payloadJson ?? '',
        },
      }),
    });
    return { ...n, id: created.id };
  },
  async list(userEmail: string, top: number): Promise<DmsNotification[]> {
    const accessToken = await token();
    const listId = await resolveListId(accessToken);
    if (!listId) return [];
    const site = await resolveSiteId(accessToken);
    const resp = await graphFetch<{ value: SpItem[] }>(
      `/sites/${site.id}/lists/${listId}/items?$expand=fields($select=${FIELD_SELECT})&$top=200`,
      { accessToken }
    );
    return (resp.value ?? [])
      .map(fromSp)
      .filter((x) => x.userEmail === userEmail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, top);
  },
  async unreadCount(userEmail: string): Promise<number> {
    const all = await this.list(userEmail, 500);
    return all.filter((x) => !x.isRead).length;
  },
  async markRead(userEmail: string, id: string): Promise<boolean> {
    const accessToken = await token();
    const listId = await resolveListId(accessToken);
    if (!listId) return false;
    const site = await resolveSiteId(accessToken);
    // Lấy item để kiểm tra chủ sở hữu.
    const item = await graphFetch<SpItem>(
      `/sites/${site.id}/lists/${listId}/items/${id}?$expand=fields($select=UserEmail,IsRead)`,
      { accessToken }
    ).catch(() => null);
    if (!item) return false;
    if (normEmail(item.fields?.UserEmail ?? '') !== userEmail) throw new NotificationForbiddenError();
    await graphFetch(`/sites/${site.id}/lists/${listId}/items/${id}/fields`, {
      accessToken,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IsRead: true }),
    });
    return true;
  },
  async markAllRead(userEmail: string): Promise<number> {
    const accessToken = await token();
    const listId = await resolveListId(accessToken);
    if (!listId) return 0;
    const site = await resolveSiteId(accessToken);
    const resp = await graphFetch<{ value: SpItem[] }>(
      `/sites/${site.id}/lists/${listId}/items?$expand=fields($select=UserEmail,IsRead)&$top=500`,
      { accessToken }
    );
    const targets = (resp.value ?? []).filter(
      (it) => normEmail(it.fields?.UserEmail ?? '') === userEmail && it.fields?.IsRead !== true
    );
    for (const it of targets) {
      await graphFetch(`/sites/${site.id}/lists/${listId}/items/${it.id}/fields`, {
        accessToken,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IsRead: true }),
      }).catch(() => undefined);
    }
    return targets.length;
  },
};

async function findByEventKey(
  accessToken: string,
  siteId: string,
  listId: string,
  userEmail: string,
  eventKey: string
): Promise<SpItem | null> {
  const resp = await graphFetch<{ value: SpItem[] }>(
    `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=UserEmail,EventKey)&$top=200`,
    { accessToken }
  );
  return (
    (resp.value ?? []).find(
      (it) => normEmail(it.fields?.UserEmail ?? '') === userEmail && (it.fields?.EventKey ?? '') === eventKey
    ) ?? null
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Tạo thông báo (dedup theo userEmail+eventKey). Trả về bản ghi đã tạo/đã có. */
export async function createNotification(input: CreateNotificationInput): Promise<DmsNotification> {
  const userEmail = normEmail(input.userEmail);
  const n: DmsNotification = {
    id: useMemoryStore() ? `mem-${nextMemSeq()}-${Date.now()}` : '',
    userEmail,
    type: input.type,
    severity: input.severity ?? defaultSeverity(input.type),
    title: input.title,
    message: input.message,
    documentId: input.documentId,
    documentNumber: input.documentNumber,
    documentTitle: input.documentTitle,
    url: input.url,
    isRead: false,
    createdAt: new Date().toISOString(),
    createdByEmail: input.createdByEmail ? normEmail(input.createdByEmail) : undefined,
    sourceModule: 'DMS',
    eventKey: input.eventKey,
  };
  if (useMemoryStore()) {
    return memStore.create(n);
  }
  const payloadJson = input.payload !== undefined ? JSON.stringify(input.payload) : undefined;
  return spStore.create(n, payloadJson);
}

export async function listNotifications(userEmail: string, top = DEFAULT_TOP): Promise<DmsNotification[]> {
  const u = normEmail(userEmail);
  return useMemoryStore() ? memStore.list(u, top) : spStore.list(u, top);
}

export async function getUnreadCount(userEmail: string): Promise<number> {
  const u = normEmail(userEmail);
  return useMemoryStore() ? memStore.unreadCount(u) : spStore.unreadCount(u);
}

export async function markNotificationRead(userEmail: string, id: string): Promise<boolean> {
  const u = normEmail(userEmail);
  return useMemoryStore() ? memStore.markRead(u, id) : spStore.markRead(u, id);
}

export async function markAllNotificationsRead(userEmail: string): Promise<number> {
  const u = normEmail(userEmail);
  return useMemoryStore() ? memStore.markAllRead(u) : spStore.markAllRead(u);
}
