// Teams Activity Feed channel — gửi DMS notification vào tab Activity của Teams.
// Pattern theo Approval BHL: Microsoft Graph user-scoped sendActivityNotification.
//
//   POST /users/{aadObjectId}/teamwork/sendActivityNotification
//
//   - APP token (client credentials /.default) — mint qua getAppOnlyGraphTokenReadOnly.
//   - Graph application permission: TeamsActivity.Send (admin consent).
//   - App PHẢI được cài cho user (personal scope) — nếu chưa → Graph 404 → skip (KHÔNG crash).
//   - AZURE_AD_CLIENT_ID PHẢI khớp teams/manifest.json webApplicationInfo.id
//     (đã verify: cùng adb5ff0c-97cd-4eae-ad02-c9865b58bccb) — nếu lệch → 403.
//   - activityType phải khớp manifest activities.activityTypes[].type.
//
// BEST-EFFORT: mọi hàm public KHÔNG throw — lỗi Teams KHÔNG được làm hỏng upload/replace/edit.
//
// ENV:
//   DMS_TEAMS_ACTIVITY_ENABLED=true|false           (mặc định false)
//   DMS_TEAMS_ACTIVITY_TEST_RECIPIENT=<email>        (Phase 1: gửi tới user test thay vì actor)
//   TEAMS_APP_ID=<teams app id>                       (deep link; fallback manifest id)
//   DMS_PUBLIC_BASE_URL=https://vanban.biahalong.com
// Graph credentials reuse: AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET.

import { graphFetch, GraphError } from '@/lib/graph/client';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { NotificationType } from '../types';
import { buildDocumentDeepLink } from '@/lib/dms/teams/deepLinks';
import {
  activityTypeForEvent,
  buildTopicValue,
  buildDocumentInfo,
  buildPreviewText,
  DmsTeamsActivityType,
} from '@/lib/dms/teams/activityTemplates';
import { renderNotificationContent } from '@/lib/dms/notifications/templates/notificationTemplateService';
import { NotificationTemplateContext } from '@/lib/dms/notifications/templates/templateConstants';

export interface TeamsActivityEvent {
  type: NotificationType;
  actorEmail?: string;
  documentId: string;
  documentNumber?: string;
  documentTitle?: string;
  eventKey: string;
  // Context render template (channel 'teamsActivity').
  ctx?: NotificationTemplateContext;
}

export interface TeamsActivityResult {
  status: 'sent' | 'skipped' | 'disabled' | 'mocked' | 'error';
  recipient?: string;
  activityType?: DmsTeamsActivityType;
  aadObjectId?: string | null;
  statusCode?: number | null;
  reason?: string;
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const ALLOWED_DOMAIN = '@' + ((process.env.ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'biahalong.com');

function bool(v: string | undefined, dflt = false): boolean {
  if (v === undefined) return dflt;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

export interface TeamsActivityConfig {
  enabled: boolean;
  testRecipient: string;
  isDevelopment: boolean;
}

export function getTeamsActivityConfig(): TeamsActivityConfig {
  return {
    enabled: bool(process.env.DMS_TEAMS_ACTIVITY_ENABLED, false),
    testRecipient: (process.env.DMS_TEAMS_ACTIVITY_TEST_RECIPIENT ?? '').trim().toLowerCase(),
    isDevelopment: process.env.NODE_ENV !== 'production',
  };
}

/** Đủ điều kiện env để mint Graph token? */
export function isGraphReady(): boolean {
  return Boolean(process.env.AZURE_AD_TENANT_ID && process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET);
}

function maskEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const [local, domain] = email.toLowerCase().split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function isAllowedEmail(email: string | undefined): boolean {
  return (email ?? '').toLowerCase().trim().endsWith(ALLOWED_DOMAIN);
}

// Idempotency: EventKey + recipient + channel — chống gửi trùng khi upload retry.
const _g = globalThis as unknown as { __dmsTeamsActivitySent?: Set<string> };
_g.__dmsTeamsActivitySent ??= new Set<string>();
const SENT: Set<string> = _g.__dmsTeamsActivitySent;
function sentKey(eventKey: string, recipient: string): string {
  return `teamsActivity|${eventKey}|${recipient}`;
}

/** Resolve AAD object id từ email (cần User.Read.All app permission — app đã có). */
async function resolveAadObjectId(accessToken: string, email: string): Promise<string | null> {
  try {
    const user = await graphFetch<{ id?: string }>(`/users/${encodeURIComponent(email)}?$select=id`, { accessToken });
    return user?.id?.trim() || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[dms-teams-activity] resolve AAD object id failed',
      JSON.stringify({ targetEmail: maskEmail(email), error: err instanceof Error ? err.message.slice(0, 300) : String(err) })
    );
    return null;
  }
}

function skipReasonForStatus(statusCode: number | null): string {
  switch (statusCode) {
    case 404:
      return 'app chưa cài cho user (personal scope) hoặc user không tồn tại';
    case 403:
      return 'thiếu admin consent TeamsActivity.Send hoặc manifest webApplicationInfo.id chưa khớp AZURE_AD_CLIENT_ID';
    case 400:
      return 'payload sai (activityType không khớp manifest? templateParameters thiếu?)';
    default:
      return 'Graph send thất bại';
  }
}

interface SendOneInput {
  accessToken: string;
  recipient: string;
  activityType: DmsTeamsActivityType;
  documentId: string;
  documentNumber?: string;
  documentTitle?: string;
  // Override nội dung từ template (nếu có) — fallback builder mặc định khi không truyền.
  topicValue?: string;
  documentInfo?: string;
  previewText?: string;
  logCtx: Record<string, unknown>;
}

/** Gửi 1 activity notification tới 1 recipient. KHÔNG throw — trả result. */
async function sendOne(input: SendOneInput): Promise<TeamsActivityResult> {
  const { accessToken, recipient, activityType, documentId, documentNumber, documentTitle, logCtx } = input;

  const aadObjectId = await resolveAadObjectId(accessToken, recipient);
  if (!aadObjectId) {
    const reason = 'mapping-missing: không resolve được AAD object id (user không có trong tenant?)';
    // eslint-disable-next-line no-console
    console.warn('[dms-teams-activity] skipped', JSON.stringify({ ...logCtx, recipient: maskEmail(recipient), reason }));
    return { status: 'skipped', recipient, activityType, aadObjectId: null, reason };
  }

  const path = `/users/${encodeURIComponent(aadObjectId)}/teamwork/sendActivityNotification`;
  const webUrl = buildDocumentDeepLink(documentId);
  // Ưu tiên nội dung render từ template; nếu trống → builder mặc định.
  const topicValue = (input.topicValue && input.topicValue.trim()) || buildTopicValue(documentNumber);
  const documentInfo = (input.documentInfo && input.documentInfo.trim()) || buildDocumentInfo(documentNumber, documentTitle);
  const previewText = (input.previewText && input.previewText.trim()) || buildPreviewText(activityType, documentNumber, documentTitle);
  const payload = {
    topic: { source: 'text' as const, value: topicValue, webUrl },
    activityType,
    previewText: { content: previewText },
    // {documentInfo} là placeholder duy nhất trong manifest templateText.
    templateParameters: [{ name: 'documentInfo', value: documentInfo }],
  };

  try {
    await graphFetch(path, { accessToken, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    // sendActivityNotification → 204 No Content khi thành công.
    // eslint-disable-next-line no-console
    console.log(
      '[dms-teams-activity] send success',
      JSON.stringify({ ...logCtx, recipient: maskEmail(recipient), aadObjectId, activityType, endpoint: `POST ${GRAPH_BASE}${path}`, statusCode: 204 })
    );
    return { status: 'sent', recipient, activityType, aadObjectId, statusCode: 204 };
  } catch (err) {
    const statusCode = err instanceof GraphError ? err.status : null;
    const reason = skipReasonForStatus(statusCode);
    // eslint-disable-next-line no-console
    console.warn(
      '[dms-teams-activity] send failed',
      JSON.stringify({ ...logCtx, recipient: maskEmail(recipient), aadObjectId, activityType, statusCode, reason, error: err instanceof Error ? err.message.slice(0, 400) : String(err) })
    );
    return { status: 'error', recipient, activityType, aadObjectId, statusCode, reason };
  }
}

/**
 * Gửi Teams Activity Feed notification cho 1 DMS event. BEST-EFFORT (KHÔNG throw).
 * Phase 1 recipient: DMS_TEAMS_ACTIVITY_TEST_RECIPIENT (nếu set) → ngược lại actorEmail.
 */
export async function sendTeamsActivityForEvent(ev: TeamsActivityEvent): Promise<TeamsActivityResult> {
  try {
    const cfg = getTeamsActivityConfig();
    if (!cfg.enabled) return { status: 'disabled', reason: 'DMS_TEAMS_ACTIVITY_ENABLED is false' };

    const activityType = activityTypeForEvent(ev.type);
    if (!activityType) return { status: 'skipped', reason: `type ${ev.type} không có Teams activity` };

    // Phase 1: test recipient override → actor. KHÔNG broadcast.
    const recipient = cfg.testRecipient || (ev.actorEmail ?? '').toLowerCase().trim();
    if (!recipient || !recipient.includes('@')) return { status: 'skipped', recipient, activityType, reason: 'no-recipient' };
    if (!isAllowedEmail(recipient)) return { status: 'skipped', recipient, activityType, reason: `email ngoài domain ${ALLOWED_DOMAIN}` };

    const key = sentKey(ev.eventKey, recipient);
    if (SENT.has(key)) return { status: 'skipped', recipient, activityType, reason: 'duplicate (eventKey+recipient đã gửi)' };

    const logCtx = { eventType: ev.type, documentId: ev.documentId, eventKey: ev.eventKey };

    if (cfg.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log('[dms-teams-activity] skipped', JSON.stringify({ ...logCtx, recipient: maskEmail(recipient), activityType, reason: 'dev-mock (NODE_ENV != production → không gọi Graph thật)' }));
      SENT.add(key);
      return { status: 'mocked', recipient, activityType };
    }
    if (!isGraphReady()) return { status: 'skipped', recipient, activityType, reason: 'graph-not-ready (thiếu AZURE_AD_* env)' };

    // Nội dung từ Notification Template Manager (channel 'teamsActivity'). enabled=false → bỏ qua.
    const ctx: NotificationTemplateContext = ev.ctx ?? {
      id: ev.documentId,
      soVanBan: ev.documentNumber,
      trichYeu: ev.documentTitle,
    };
    const content = await renderNotificationContent(ev.type, 'teamsActivity', ctx).catch(() => null);
    if (content && !content.enabled) {
      return { status: 'skipped', recipient, activityType, reason: 'disabled-by-template' };
    }

    const accessToken = await getAppOnlyGraphTokenReadOnly();
    const result = await sendOne({
      accessToken,
      recipient,
      activityType,
      documentId: ev.documentId,
      documentNumber: ev.documentNumber,
      documentTitle: ev.documentTitle,
      topicValue: content?.title,
      documentInfo: content?.body,
      previewText: content?.detail,
      logCtx,
    });
    if (result.status === 'sent') SENT.add(key);
    return result;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dms-teams-activity] send failed (teamsActivityChannel.sendTeamsActivityForEvent)', JSON.stringify({ eventKey: ev.eventKey, error: e instanceof Error ? e.message : String(e) }));
    return { status: 'error', reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Admin test: gửi 1 activity tới 1 email tùy ý. BỎ QUA flag enabled (để chẩn đoán
 * trước khi bật). Vẫn tôn trọng dev-mock. Trả diagnostic.
 */
export async function sendTeamsActivityTest(input: {
  email: string;
  activityType: DmsTeamsActivityType;
  documentId?: string;
  documentNumber?: string;
  documentTitle?: string;
}): Promise<TeamsActivityResult & { webUrl?: string }> {
  const recipient = input.email.toLowerCase().trim();
  const documentId = input.documentId?.trim() || 'dashboard';
  const webUrl = buildDocumentDeepLink(documentId);

  if (!isAllowedEmail(recipient)) {
    return { status: 'skipped', recipient, activityType: input.activityType, reason: `email ngoài domain ${ALLOWED_DOMAIN}`, webUrl };
  }
  const cfg = getTeamsActivityConfig();
  if (cfg.isDevelopment) {
    // eslint-disable-next-line no-console
    console.log('[dms-teams-activity] skipped', JSON.stringify({ mode: 'admin-test', recipient: maskEmail(recipient), activityType: input.activityType, reason: 'dev-mock' }));
    return { status: 'mocked', recipient, activityType: input.activityType, reason: 'isDevelopment → mock (deploy production để test thật)', webUrl };
  }
  if (!isGraphReady()) return { status: 'skipped', recipient, activityType: input.activityType, reason: 'graph-not-ready', webUrl };

  const accessToken = await getAppOnlyGraphTokenReadOnly();
  const result = await sendOne({
    accessToken,
    recipient,
    activityType: input.activityType,
    documentId,
    documentNumber: input.documentNumber ?? 'TEST-0000',
    documentTitle: input.documentTitle ?? 'Teams Activity test',
    logCtx: { mode: 'admin-test' },
  });
  return { ...result, webUrl };
}

/** Diagnostic cho admin status endpoint. */
export function getTeamsActivityStatus(): {
  enabled: boolean;
  graphReady: boolean;
  teamsAppId: string | undefined;
  botAppId: string | undefined;
  tenantId: string | undefined;
  testRecipient: string | undefined;
  mappingAvailable: boolean;
  requiredPermissions: string[];
} {
  const cfg = getTeamsActivityConfig();
  const botAppId = process.env.TEAMS_BOT_APP_ID?.trim() || process.env.AZURE_AD_CLIENT_ID?.trim() || undefined;
  const tenantId = process.env.TEAMS_BOT_TENANT_ID?.trim() || process.env.AZURE_AD_TENANT_ID?.trim() || undefined;
  return {
    enabled: cfg.enabled,
    graphReady: isGraphReady(),
    teamsAppId: process.env.TEAMS_APP_ID?.trim() || 'b7c24a20-3b43-4fb7-86bc-1a0e4e4e96de (manifest fallback)',
    botAppId,
    tenantId,
    testRecipient: cfg.testRecipient || undefined,
    // mappingAvailable: có thể resolve AAD object id từ email (cần Graph User.Read.All + email domain).
    mappingAvailable: isGraphReady(),
    requiredPermissions: ['TeamsActivity.Send (application, admin consent)', 'User.Read.All (application)'],
  };
}
