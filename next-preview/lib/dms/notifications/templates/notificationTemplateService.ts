// Notification Template Service (SERVER) — nguồn template hiệu lực + lưu/đọc DMSConfig + render.
//
// Loading order (getEffectiveTemplate):
//   1) DMSConfig (ConfigKey = notification-template:{event}:{channel})
//   2) default template trong code (defaultTemplates.ts)
// Đọc DMSConfig lỗi → fallback default + log warning (KHÔNG làm vỡ luồng gửi notification).
//
// Cache 60s (in-memory, globalThis) để không đọc SharePoint mỗi lần dispatch (3 kênh/event).

import { getConfigRecord, upsertConfigRecord, deleteConfigRecord } from '@/lib/dms/configList';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { NotificationType } from '../types';
import {
  NotificationChannel,
  NotificationTemplate,
  NotificationTemplateContext,
  TEMPLATE_EVENTS,
  TEMPLATE_CHANNELS,
  isTemplateChannel,
  isTemplateEvent,
  templateConfigKey,
} from './templateConstants';
import { getDefaultTemplate } from './defaultTemplates';
import { renderNotificationTemplate, extractTemplateFields } from './templateRenderer';

const MAX_LEN = 2000;

// ── Cache (60s) ─────────────────────────────────────────────────────────────
const _g = globalThis as unknown as { __dmsNotiTplCache?: Map<string, { tpl: NotificationTemplate; ts: number }> };
_g.__dmsNotiTplCache ??= new Map();
const CACHE = _g.__dmsNotiTplCache;
const CACHE_TTL_MS = 60_000;
// Thời gian "now" không dùng Date.now() ở scope module-init; chỉ gọi trong hàm (an toàn).
function now(): number {
  return Date.now();
}
function clearCacheKey(key: string): void {
  CACHE.delete(key);
}

// ── Merge config (override) lên default ───────────────────────────────────────
function mergeTemplate(def: NotificationTemplate, saved: Partial<NotificationTemplate>): NotificationTemplate {
  const pick = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
  const titleTemplate = pick(saved.titleTemplate, def.titleTemplate);
  const bodyTemplate = pick(saved.bodyTemplate, def.bodyTemplate);
  const detailTemplate = pick(saved.detailTemplate, def.detailTemplate);
  const actionUrlTemplate = pick(saved.actionUrlTemplate, def.actionUrlTemplate);
  return {
    eventType: def.eventType,
    channel: def.channel,
    enabled: typeof saved.enabled === 'boolean' ? saved.enabled : def.enabled,
    titleTemplate,
    bodyTemplate,
    detailTemplate,
    actionLabel: pick(saved.actionLabel, def.actionLabel),
    actionUrlTemplate,
    fields: extractTemplateFields(titleTemplate, bodyTemplate, detailTemplate, actionUrlTemplate),
  };
}

// ── Effective template (config → default), có cache + fallback ────────────────
async function readEffective(
  accessToken: string,
  eventType: NotificationType,
  channel: NotificationChannel
): Promise<NotificationTemplate> {
  const def = getDefaultTemplate(eventType, channel);
  const key = templateConfigKey(eventType, channel);
  try {
    const rec = await getConfigRecord(accessToken, key);
    if (!rec) return def;
    const saved = JSON.parse(rec.json) as Partial<NotificationTemplate>;
    return mergeTemplate(def, saved);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dms-noti][template] read failed → fallback default', JSON.stringify({ key, error: e instanceof Error ? e.message : String(e) }));
    return def;
  }
}

/**
 * Effective template (có cache 60s). Tự mint read token nếu không truyền.
 * KHÔNG bao giờ throw — token/đọc lỗi → trả default (đảm bảo luồng gửi notification không vỡ).
 */
export async function getEffectiveTemplate(
  eventType: NotificationType,
  channel: NotificationChannel,
  accessToken?: string
): Promise<NotificationTemplate> {
  const key = templateConfigKey(eventType, channel);
  const cached = CACHE.get(key);
  if (cached && now() - cached.ts < CACHE_TTL_MS) return cached.tpl;
  try {
    const token = accessToken ?? (await getAppOnlyGraphTokenReadOnly());
    const tpl = await readEffective(token, eventType, channel);
    CACHE.set(key, { tpl, ts: now() });
    return tpl;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dms-noti][template] effective resolve failed → default', JSON.stringify({ key, error: e instanceof Error ? e.message : String(e) }));
    return getDefaultTemplate(eventType, channel);
  }
}

/** Admin GET 1 template: saved (raw JSON) + default + effective. */
export async function getNotificationTemplate(
  accessToken: string,
  eventType: NotificationType,
  channel: NotificationChannel
): Promise<{ saved: Partial<NotificationTemplate> | null; default: NotificationTemplate; effective: NotificationTemplate }> {
  const def = getDefaultTemplate(eventType, channel);
  const key = templateConfigKey(eventType, channel);
  let saved: Partial<NotificationTemplate> | null = null;
  try {
    const rec = await getConfigRecord(accessToken, key);
    if (rec) saved = JSON.parse(rec.json) as Partial<NotificationTemplate>;
  } catch {
    saved = null;
  }
  const effective = saved ? mergeTemplate(def, saved) : def;
  return { saved, default: def, effective };
}

/** Admin GET tất cả: effective template cho 5 event × 3 channel. */
export async function getAllEffectiveTemplates(accessToken: string): Promise<NotificationTemplate[]> {
  const out: NotificationTemplate[] = [];
  for (const ev of TEMPLATE_EVENTS) {
    for (const ch of TEMPLATE_CHANNELS) {
      out.push(await readEffective(accessToken, ev, ch));
    }
  }
  return out;
}

// ── Validation ────────────────────────────────────────────────────────────────
const PUBLIC_BASE = (process.env.DMS_PUBLIC_BASE_URL ?? 'https://vanban.biahalong.com').replace(/\/+$/, '');

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

function hasAngle(s: string): boolean {
  return /[<>]/.test(s);
}

/** Validate input template từ admin (chống injection + giới hạn kích thước + URL hợp lệ). */
export function validateTemplateInput(
  eventType: string,
  channel: string,
  input: Partial<NotificationTemplate>
): ValidateResult {
  if (!isTemplateEvent(eventType)) return { ok: false, error: `eventType '${eventType}' không hợp lệ` };
  if (!isTemplateChannel(channel)) return { ok: false, error: `channel '${channel}' không hợp lệ` };

  const textFields: [string, unknown][] = [
    ['titleTemplate', input.titleTemplate],
    ['bodyTemplate', input.bodyTemplate],
    ['detailTemplate', input.detailTemplate],
    ['actionLabel', input.actionLabel],
    ['actionUrlTemplate', input.actionUrlTemplate],
  ];
  for (const [name, v] of textFields) {
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { ok: false, error: `${name} phải là chuỗi` };
    if (v.length > MAX_LEN) return { ok: false, error: `${name} quá dài (> ${MAX_LEN} ký tự)` };
    // Chặn HTML/script injection ở field text thuần.
    if (hasAngle(v)) return { ok: false, error: `${name} không được chứa ký tự < hoặc > (chống injection)` };
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    return { ok: false, error: 'enabled phải là boolean' };
  }
  const url = (input.actionUrlTemplate ?? '').trim();
  if (url && !(url.startsWith('/') || url.startsWith(PUBLIC_BASE) || url.startsWith('https://vanban.biahalong.com'))) {
    return { ok: false, error: `actionUrlTemplate phải bắt đầu bằng "/" hoặc "${PUBLIC_BASE}"` };
  }
  return { ok: true };
}

/** Lưu template (đã validate ở caller). Trả effective sau lưu. updatedBy = email admin. */
export async function saveNotificationTemplate(
  accessToken: string,
  eventType: NotificationType,
  channel: NotificationChannel,
  input: Partial<NotificationTemplate>,
  updatedBy: string
): Promise<NotificationTemplate> {
  const def = getDefaultTemplate(eventType, channel);
  const merged = mergeTemplate(def, input);
  const key = templateConfigKey(eventType, channel);
  await upsertConfigRecord(accessToken, key, JSON.stringify(merged), updatedBy);
  clearCacheKey(key);
  return merged;
}

/** Reset template về mặc định (xóa bản ghi DMSConfig). Trả default template. */
export async function resetNotificationTemplate(
  accessToken: string,
  eventType: NotificationType,
  channel: NotificationChannel
): Promise<NotificationTemplate> {
  const key = templateConfigKey(eventType, channel);
  await deleteConfigRecord(accessToken, key).catch(() => false);
  clearCacheKey(key);
  return getDefaultTemplate(eventType, channel);
}

// ── Render content cho channel ────────────────────────────────────────────────
export interface RenderedNotification {
  enabled: boolean;
  channel: NotificationChannel;
  title: string;
  body: string;
  detail: string;
  actionLabel: string;
  actionUrl: string;
}

/** Build context render từ input rời rạc (channel/dispatcher gom field có sẵn). */
export function buildTemplateContext(partial: NotificationTemplateContext): NotificationTemplateContext {
  return { sourceModule: 'DMS', ...partial };
}

/**
 * Render nội dung notification cho 1 channel. KHÔNG đọc lỗi → fallback default.
 * opts.html=true để escape giá trị khi nhúng HTML (email).
 */
export async function renderNotificationContent(
  eventType: NotificationType,
  channel: NotificationChannel,
  ctx: NotificationTemplateContext,
  opts: { html?: boolean } = {}
): Promise<RenderedNotification> {
  const tpl = await getEffectiveTemplate(eventType, channel);
  const r = (t: string): string => renderNotificationTemplate(t, ctx, { html: opts.html });
  return {
    enabled: tpl.enabled,
    channel,
    title: r(tpl.titleTemplate),
    body: r(tpl.bodyTemplate),
    detail: r(tpl.detailTemplate),
    actionLabel: r(tpl.actionLabel),
    actionUrl: r(tpl.actionUrlTemplate) || `/documents/${ctx.id ?? ''}`,
  };
}

/** Render trực tiếp từ 1 template tùy ý (admin preview) — KHÔNG đọc SharePoint. */
export function renderTemplatePreview(
  tpl: Partial<NotificationTemplate>,
  channel: NotificationChannel,
  eventType: NotificationType,
  ctx: NotificationTemplateContext,
  opts: { html?: boolean } = {}
): RenderedNotification {
  const def = getDefaultTemplate(eventType, channel);
  const merged = mergeTemplate(def, tpl);
  const r = (t: string): string => renderNotificationTemplate(t, ctx, { html: opts.html });
  return {
    enabled: merged.enabled,
    channel,
    title: r(merged.titleTemplate),
    body: r(merged.bodyTemplate),
    detail: r(merged.detailTemplate),
    actionLabel: r(merged.actionLabel),
    actionUrl: r(merged.actionUrlTemplate) || `/documents/${ctx.id ?? ''}`,
  };
}

export { TEMPLATE_EVENTS, TEMPLATE_CHANNELS };
