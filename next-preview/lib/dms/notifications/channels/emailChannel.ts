// Email notification channel — Phase 2. Microsoft Graph sendMail (app-only). KHÔNG SMTP/nodemailer.
// BEST-EFFORT: mọi hàm public KHÔNG throw — lỗi mail không được làm hỏng upload/replace/edit.
//
// ENV:
//   DMS_EMAIL_NOTIFICATIONS_ENABLED=true|false   (mặc định false — tắt ở dev)
//   DMS_EMAIL_BROADCAST_RECIPIENT=everyone@biahalong.com
//   DMS_EMAIL_TEST_MODE=true|false
//   DMS_EMAIL_TEST_RECIPIENT=<email test>
//   DMS_EMAIL_FROM=<mailbox UPN gửi đi>           (bắt buộc cho app-only sendMail)
//   DMS_EMAIL_DRY_RUN=true|false                  (mặc định: true ở development → KHÔNG gửi thật)
//   DMS_PUBLIC_BASE_URL=https://vanban.biahalong.com

import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { NotificationType } from '../types';
import { buildEmailHtml } from '../templates/emailTemplates';
import { renderNotificationContent } from '../templates/notificationTemplateService';
import { NotificationTemplateContext } from '../templates/templateConstants';

export interface EmailEvent {
  type: NotificationType;
  documentId: string;
  documentNumber?: string;
  documentTitle?: string;
  donViSoanThao?: string;
  ngayBanHanh?: string;
  trangThai?: string;
  oldDocumentNumber?: string;
  newDocumentNumber?: string;
  eventKey: string;
  // Context render template (dispatcher gom field); thiếu → build tối thiểu từ field rời.
  ctx?: NotificationTemplateContext;
}

export interface EmailConfig {
  enabled: boolean;
  testMode: boolean;
  broadcastRecipient: string;
  testRecipient: string;
  from: string;
  dryRun: boolean;
  baseUrl: string;
}

export type EmailResult =
  | { ok: true; sent: boolean; dryRun?: boolean; recipient: string; subject: string }
  | { ok: false; skipped?: string; recipient?: string; error?: string };

// Việc loại sự kiện khỏi email (DOCUMENT_UPDATED/SYSTEM) nay do template.enabled quyết định
// (default email DOCUMENT_UPDATED/SYSTEM = false → giữ hành vi cũ, nhưng admin có thể bật).

function bool(v: string | undefined, dflt = false): boolean {
  if (v === undefined) return dflt;
  return v.trim().toLowerCase() === 'true' || v.trim() === '1';
}

export function getEmailConfig(): EmailConfig {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    enabled: bool(process.env.DMS_EMAIL_NOTIFICATIONS_ENABLED, false),
    testMode: bool(process.env.DMS_EMAIL_TEST_MODE, false),
    broadcastRecipient: (process.env.DMS_EMAIL_BROADCAST_RECIPIENT ?? 'everyone@biahalong.com').trim(),
    testRecipient: (process.env.DMS_EMAIL_TEST_RECIPIENT ?? '').trim(),
    from: (process.env.DMS_EMAIL_FROM ?? '').trim(),
    // Dev: mặc định dry-run (KHÔNG gửi thật) trừ khi tắt rõ ràng. Prod: gửi thật trừ khi bật dry-run.
    dryRun: bool(process.env.DMS_EMAIL_DRY_RUN, !isProd),
    baseUrl: (process.env.DMS_PUBLIC_BASE_URL ?? 'https://vanban.biahalong.com').trim(),
  };
}

/** Recipient hiệu lực theo test mode. */
export function resolveRecipient(cfg: EmailConfig): string {
  return cfg.testMode ? cfg.testRecipient : cfg.broadcastRecipient;
}

/** Graph gửi mail có đủ điều kiện env? (không mint token để tránh side-effect). */
export function isGraphReady(cfg: EmailConfig = getEmailConfig()): boolean {
  return Boolean(
    process.env.AZURE_AD_TENANT_ID &&
      process.env.AZURE_AD_CLIENT_ID &&
      process.env.AZURE_AD_CLIENT_SECRET &&
      cfg.from
  );
}

// Idempotency theo EventKey — tránh gửi trùng (process-level; web noti đã dedup ở store).
const _g = globalThis as unknown as { __dmsEmailSent?: Set<string> };
_g.__dmsEmailSent ??= new Set<string>();
const SENT: Set<string> = _g.__dmsEmailSent;

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Gửi mail qua Graph. LƯU Ý: sendMail trả 202 Accepted với BODY RỖNG → KHÔNG được res.json()
// (đó là gốc lỗi "[dms-noti][email][error] Unexpected end of JSON input" — graphFetch luôn res.json()
//  cho status != 204). Ở đây fetch trực tiếp, chỉ kiểm tra res.ok, KHÔNG parse body rỗng.
async function graphSendMail(from: string, to: string[], subject: string, html: string): Promise<void> {
  const accessToken = await getAppOnlyGraphTokenReadOnly(); // un-gated app-only mint
  const url = `${GRAPH_BASE}/users/${encodeURIComponent(from)}/sendMail`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Graph sendMail ${res.status} ${res.statusText} — ${detail.slice(0, 300)}`);
  }
  // 202 Accepted, body rỗng → thành công, KHÔNG parse JSON.
}

/**
 * Gửi email cho 1 sự kiện DMS. KHÔNG throw. Trả EmailResult mô tả kết quả/lý do skip.
 */
export async function sendEmailForEvent(ev: EmailEvent): Promise<EmailResult> {
  try {
    const cfg = getEmailConfig();
    if (!cfg.enabled) {
      return { ok: false, skipped: 'disabled' };
    }
    const recipient = resolveRecipient(cfg);
    if (!recipient) {
      // eslint-disable-next-line no-console
      console.warn('[dms-noti][email] no recipient (testMode without DMS_EMAIL_TEST_RECIPIENT?)');
      return { ok: false, skipped: 'no-recipient' };
    }
    if (ev.eventKey && SENT.has(ev.eventKey)) {
      return { ok: false, skipped: 'duplicate', recipient };
    }

    // Nội dung email từ Notification Template Manager (channel 'email'). enabled=false → bỏ qua.
    const ctx: NotificationTemplateContext = ev.ctx ?? {
      id: ev.documentId,
      soVanBan: ev.documentNumber,
      trichYeu: ev.documentTitle,
      ngayBanHanh: ev.ngayBanHanh,
      trangThai: ev.trangThai,
      donViSoHuu: ev.donViSoanThao,
      oldDocumentNumber: ev.oldDocumentNumber,
      newDocumentNumber: ev.newDocumentNumber,
    };
    const content = await renderNotificationContent(ev.type, 'email', ctx);
    if (!content.enabled) {
      return { ok: false, skipped: 'disabled-by-template', recipient };
    }
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const link = content.actionUrl.startsWith('http')
      ? content.actionUrl
      : `${base}${content.actionUrl.startsWith('/') ? '' : '/'}${content.actionUrl}`;
    const { subject, html } = buildEmailHtml({
      subject: content.title,
      heading: content.body,
      detailText: content.detail,
      actionLabel: content.actionLabel,
      link,
    });

    if (cfg.dryRun) {
      // eslint-disable-next-line no-console
      console.log('[dms-noti][email][dry-run]', JSON.stringify({ to: recipient, subject, eventKey: ev.eventKey }));
      if (ev.eventKey) SENT.add(ev.eventKey);
      return { ok: true, sent: false, dryRun: true, recipient, subject };
    }

    if (!cfg.from) {
      return { ok: false, skipped: 'no-sender', recipient };
    }
    await graphSendMail(cfg.from, [recipient], subject, html);
    if (ev.eventKey) SENT.add(ev.eventKey);
    // eslint-disable-next-line no-console
    console.log('[dms-noti][email] send success', JSON.stringify({ to: recipient, subject, eventKey: ev.eventKey }));
    return { ok: true, sent: true, recipient, subject };
  } catch (e) {
    // BEST-EFFORT: log rõ file/hàm/đầu vào, KHÔNG throw (không làm hỏng upload/replace).
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[dms-noti][email] send failed (emailChannel.graphSendMail)', JSON.stringify({ to: resolveRecipient(getEmailConfig()), type: ev.type, eventKey: ev.eventKey, error: msg }));
    return { ok: false, error: msg };
  }
}
