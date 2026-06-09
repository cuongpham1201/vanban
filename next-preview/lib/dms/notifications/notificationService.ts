// DMS Notification service — broadcast + per-user read state.
// Backend:
//   - Production (NODE_ENV=production): SharePoint list "DMSNotifications" + "DMSNotificationReads" (Graph).
//   - Dev/preview: in-memory store (globalThis) → bell + tests chạy local, KHÔNG ghi SharePoint thật.
// Token SharePoint dùng app-only (un-gated) — KHÔNG phụ thuộc DMS_WRITE_ENABLED.
//
// Mô hình:
//   - Notification cá nhân: UserEmail = email user → đọc/đánh dấu qua field IsRead (giữ tương thích cũ).
//   - Notification broadcast: UserEmail = "__ALL__" (1 item dùng chung cho mọi user). Read-state RIÊNG
//     theo user lưu ở DMSNotificationReads (NotificationId + UserEmail) → user A đọc KHÔNG ảnh hưởng user B.
// Bell của user X = (item UserEmail==X) ∪ (item UserEmail=="__ALL__"); unread tính cả broadcast.

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

export const NOTIFICATIONS_LIST_NAME = process.env.SHAREPOINT_NOTIFICATIONS_LIST_NAME ?? 'DMSNotifications';
export const NOTIFICATION_READS_LIST_NAME = process.env.SHAREPOINT_NOTIFICATION_READS_LIST_NAME ?? 'DMSNotificationReads';
/** Recipient đặc biệt: broadcast tới tất cả user. Lưu nguyên văn (KHÔNG lowercase). */
export const BROADCAST_EMAIL = '__ALL__';
const LIST_NAME = NOTIFICATIONS_LIST_NAME;
const DEFAULT_TOP = 20;

function normEmail(e: string): string {
  return (e ?? '').toLowerCase().trim();
}
function isBroadcastEmail(e: string | undefined | null): boolean {
  return (e ?? '').trim().toUpperCase() === BROADCAST_EMAIL;
}
/** Chuẩn hóa recipient: giữ "__ALL__" nguyên văn; còn lại lowercase. */
function normRecipient(e: string): string {
  return isBroadcastEmail(e) ? BROADCAST_EMAIL : normEmail(e);
}
function useMemoryStore(): boolean {
  return process.env.NODE_ENV !== 'production';
}

// ── In-memory store (dev/preview) ──────────────────────────────────────────────
// globalThis để chia sẻ giữa các route bundle của Next.
const _g = globalThis as unknown as {
  __dmsNotiMem?: DmsNotification[];
  __dmsNotiSeq?: number;
  __dmsNotiReads?: Set<string>; // key = `${notificationId}|${userEmail}`
};
_g.__dmsNotiMem ??= [];
_g.__dmsNotiSeq ??= 0;
_g.__dmsNotiReads ??= new Set<string>();
const MEM: DmsNotification[] = _g.__dmsNotiMem;
const MEM_READS: Set<string> = _g.__dmsNotiReads;
function nextMemSeq(): number {
  _g.__dmsNotiSeq = (_g.__dmsNotiSeq ?? 0) + 1;
  return _g.__dmsNotiSeq;
}
function readKey(id: string, userEmail: string): string {
  return `${id}|${userEmail}`;
}

// item hiển thị cho user (đã tính read-state riêng nếu broadcast).
function viewFor(item: DmsNotification, userEmail: string, hasRead: (id: string) => boolean): DmsNotification {
  if (item.userEmail === BROADCAST_EMAIL) {
    return { ...item, isRead: hasRead(item.id) };
  }
  return item; // cá nhân → dùng IsRead sẵn có
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
    return MEM.filter((x) => x.userEmail === userEmail || x.userEmail === BROADCAST_EMAIL)
      .map((x) => viewFor(x, userEmail, (id) => MEM_READS.has(readKey(id, userEmail))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, top);
  },
  async unreadCount(userEmail: string): Promise<number> {
    return (await this.list(userEmail, 1000)).filter((x) => !x.isRead).length;
  },
  async markRead(userEmail: string, id: string): Promise<boolean> {
    const hit = MEM.find((x) => x.id === id);
    if (!hit) return false;
    if (hit.userEmail === BROADCAST_EMAIL) {
      MEM_READS.add(readKey(id, userEmail)); // read-state riêng, KHÔNG đụng item chung
      return true;
    }
    if (hit.userEmail !== userEmail) throw new NotificationForbiddenError();
    hit.isRead = true;
    return true;
  },
  async markAllRead(userEmail: string): Promise<number> {
    let n = 0;
    for (const x of MEM) {
      if (x.userEmail === BROADCAST_EMAIL) {
        const k = readKey(x.id, userEmail);
        if (!MEM_READS.has(k)) { MEM_READS.add(k); n++; }
      } else if (x.userEmail === userEmail && !x.isRead) {
        x.isRead = true; n++;
      }
    }
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
  NotificationType?: string;
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
interface ReadFields {
  NotificationId?: string;
  UserEmail?: string;
  ReadAt?: string;
}
interface ReadItem {
  id: string;
  fields?: ReadFields;
}

const FIELD_SELECT =
  'Title,UserEmail,NotificationType,Severity,DocumentId,DocumentNumber,DocumentTitle,Message,Url,IsRead,CreatedAt,CreatedByEmail,SourceModule,EventKey,PayloadJson';

let _spListId: string | null | undefined;
let _readsListId: string | null | undefined;

async function token(): Promise<string> {
  return getAppOnlyGraphTokenReadOnly();
}

async function resolveListByName(accessToken: string, name: string): Promise<string | null> {
  const site = await resolveSiteId(accessToken);
  const resp = await graphFetch<{ value: { id: string; displayName: string; name?: string }[] }>(
    `/sites/${site.id}/lists?$select=id,displayName,name&$top=200`,
    { accessToken }
  );
  const want = name.trim().toLowerCase();
  const hit = (resp.value ?? []).find(
    (l) => l.displayName.trim().toLowerCase() === want || (l.name ?? '').trim().toLowerCase() === want
  );
  return hit ? hit.id : null;
}
async function resolveListId(accessToken: string): Promise<string | null> {
  if (_spListId === undefined) _spListId = await resolveListByName(accessToken, LIST_NAME);
  return _spListId;
}
async function resolveReadsListId(accessToken: string): Promise<string | null> {
  if (_readsListId === undefined) _readsListId = await resolveListByName(accessToken, NOTIFICATION_READS_LIST_NAME);
  return _readsListId;
}

function fromSp(item: SpItem): DmsNotification {
  const f = item.fields ?? {};
  return {
    id: item.id,
    userEmail: isBroadcastEmail(f.UserEmail) ? BROADCAST_EMAIL : normEmail(f.UserEmail ?? ''),
    type: (f.NotificationType as NotificationType) ?? 'SYSTEM',
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

/** Set NotificationId mà user đã đọc (từ DMSNotificationReads). */
async function getUserReadIds(accessToken: string, siteId: string, userEmail: string): Promise<Set<string>> {
  const readsListId = await resolveReadsListId(accessToken);
  if (!readsListId) return new Set();
  const resp = await graphFetch<{ value: ReadItem[] }>(
    `/sites/${siteId}/lists/${readsListId}/items?$expand=fields($select=NotificationId,UserEmail)&$top=1000`,
    { accessToken }
  );
  const set = new Set<string>();
  for (const it of resp.value ?? []) {
    if (normEmail(it.fields?.UserEmail ?? '') === userEmail) set.add(String(it.fields?.NotificationId ?? ''));
  }
  return set;
}

// Ghi 1 read-record (KHÔNG dedup — caller phải tự đảm bảo chưa tồn tại).
async function postReadRecord(
  accessToken: string,
  siteId: string,
  readsListId: string,
  notificationId: string,
  userEmail: string
): Promise<void> {
  await graphFetch(`/sites/${siteId}/lists/${readsListId}/items`, {
    accessToken,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: { Title: `${userEmail}:${notificationId}`, NotificationId: String(notificationId), UserEmail: userEmail, ReadAt: new Date().toISOString() },
    }),
  });
}

// markRead đơn lẻ: dedup an toàn (fetch read-set rồi mới ghi). Idempotent — gọi nhiều lần chỉ 1 record.
async function addReadRecord(accessToken: string, siteId: string, notificationId: string, userEmail: string): Promise<void> {
  const readsListId = await resolveReadsListId(accessToken);
  if (!readsListId) {
    throw new Error(`SharePoint list "${NOTIFICATION_READS_LIST_NAME}" chưa tồn tại — provision trước.`);
  }
  const existing = await getUserReadIds(accessToken, siteId, userEmail);
  if (existing.has(String(notificationId))) return; // idempotent
  await postReadRecord(accessToken, siteId, readsListId, notificationId, userEmail);
}

const spStore = {
  async create(n: DmsNotification, payloadJson?: string): Promise<DmsNotification> {
    const accessToken = await token();
    const listId = await resolveListId(accessToken);
    if (!listId) {
      throw new Error(`SharePoint list "${LIST_NAME}" chưa tồn tại — provision DMSNotifications trước.`);
    }
    const site = await resolveSiteId(accessToken);
    if (n.eventKey) {
      const dup = await findByEventKey(accessToken, site.id, listId, n.userEmail, n.eventKey);
      if (dup) return fromSp(dup);
    }
    const fields = {
      Title: n.title,
      UserEmail: n.userEmail, // có thể = "__ALL__" cho broadcast
      NotificationType: n.type,
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
    };
    let created: SpItem;
    try {
      created = await graphFetch<SpItem>(`/sites/${site.id}/lists/${listId}/items`, {
        accessToken,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        '[dms-noti][web] create failed',
        JSON.stringify({ fields: Object.keys(fields), userEmail: n.userEmail, type: n.type, eventKey: n.eventKey, error: e instanceof Error ? e.message : String(e) })
      );
      throw e;
    }
    // eslint-disable-next-line no-console
    console.log(
      '[dms-noti][web] create success',
      JSON.stringify({ itemId: created.id, userEmail: n.userEmail, type: n.type, eventKey: n.eventKey })
    );
    return { ...n, id: created.id };
  },
  async list(userEmail: string, top: number): Promise<DmsNotification[]> {
    const accessToken = await token();
    const listId = await resolveListId(accessToken);
    if (!listId) return [];
    const site = await resolveSiteId(accessToken);
    const resp = await graphFetch<{ value: SpItem[] }>(
      `/sites/${site.id}/lists/${listId}/items?$expand=fields($select=${FIELD_SELECT})&$top=500`,
      { accessToken }
    );
    const readIds = await getUserReadIds(accessToken, site.id, userEmail).catch(() => new Set<string>());
    return (resp.value ?? [])
      .map(fromSp)
      .filter((x) => x.userEmail === userEmail || x.userEmail === BROADCAST_EMAIL)
      .map((x) => viewFor(x, userEmail, (id) => readIds.has(id)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, top);
  },
  async unreadCount(userEmail: string): Promise<number> {
    return (await this.list(userEmail, 1000)).filter((x) => !x.isRead).length;
  },
  async markRead(userEmail: string, id: string): Promise<boolean> {
    const accessToken = await token();
    const listId = await resolveListId(accessToken);
    if (!listId) return false;
    const site = await resolveSiteId(accessToken);
    const item = await graphFetch<SpItem>(
      `/sites/${site.id}/lists/${listId}/items/${id}?$expand=fields($select=UserEmail,IsRead)`,
      { accessToken }
    ).catch(() => null);
    if (!item) return false;
    const owner = item.fields?.UserEmail ?? '';
    if (isBroadcastEmail(owner)) {
      // Broadcast: tạo read-record riêng cho user — KHÔNG đụng IsRead của item chung.
      await addReadRecord(accessToken, site.id, id, userEmail);
      return true;
    }
    if (normEmail(owner) !== userEmail) throw new NotificationForbiddenError();
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
    // Fetch read-set + resolve reads-list MỘT LẦN (tránh N+1: trước đây mỗi item gọi lại getUserReadIds).
    const readsListId = await resolveReadsListId(accessToken);
    const readIds = readsListId ? await getUserReadIds(accessToken, site.id, userEmail).catch(() => new Set<string>()) : new Set<string>();
    let n = 0;
    for (const it of resp.value ?? []) {
      const owner = it.fields?.UserEmail ?? '';
      if (isBroadcastEmail(owner)) {
        // Đã dedup tại chỗ bằng readIds → POST trực tiếp, KHÔNG fetch lại read-set từng item.
        if (readsListId && !readIds.has(it.id)) {
          await postReadRecord(accessToken, site.id, readsListId, it.id, userEmail).catch(() => undefined);
          readIds.add(it.id);
          n++;
        }
      } else if (normEmail(owner) === userEmail && it.fields?.IsRead !== true) {
        await graphFetch(`/sites/${site.id}/lists/${listId}/items/${it.id}/fields`, {
          accessToken,
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IsRead: true }),
        }).catch(() => undefined);
        n++;
      }
    }
    return n;
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
    `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=UserEmail,EventKey)&$top=500`,
    { accessToken }
  );
  return (
    (resp.value ?? []).find(
      (it) => (isBroadcastEmail(it.fields?.UserEmail) ? BROADCAST_EMAIL : normEmail(it.fields?.UserEmail ?? '')) === userEmail && (it.fields?.EventKey ?? '') === eventKey
    ) ?? null
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Tạo thông báo (dedup theo userEmail+eventKey). userEmail có thể = BROADCAST_EMAIL ("__ALL__"). */
export async function createNotification(input: CreateNotificationInput): Promise<DmsNotification> {
  const userEmail = normRecipient(input.userEmail);
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
