// Default notification templates (trong code) — fallback khi DMSConfig chưa có cấu hình.
// THUẦN — dùng được client (Restore default preview) lẫn server.

import { NotificationType } from '../types';
import {
  NotificationChannel,
  NotificationTemplate,
  TEMPLATE_EVENTS,
  TEMPLATE_CHANNELS,
} from './templateConstants';
import { extractTemplateFields } from './templateRenderer';

// Phần content "trần" theo event — sau đó gắn actionLabel/url + enabled theo kênh.
interface RawTpl {
  enabled?: boolean; // mặc định true; chỉ DOCUMENT_UPDATED email = false
  title: string;
  body: string;
  detail: string;
}

const ACTION_LABEL = 'Mở văn bản';
const ACTION_URL = '/documents/{{id}}';
const EMAIL_DETAIL_DEFAULT =
  'Số văn bản: {{soVanBan}}\nTrích yếu: {{trichYeu}}\nCấp lưu trữ: {{donViSoHuu}}\nLoại tài liệu: {{loaiTaiLieu}}\nNgày ban hành: {{ngayBanHanh}}\nTrạng thái: {{trangThai}}';
const TEAMS_PREVIEW_DEFAULT = '{{donViSoHuu}} · {{loaiTaiLieu}} · {{ngayBanHanh}}';
const DOC_INFO = '{{soVanBan}} - {{trichYeu}}';

// ── WEB ──────────────────────────────────────────────────────────────────────
const WEB: Record<NotificationType, RawTpl> = {
  NEW_DOCUMENT: { title: '📄 Văn bản mới', body: DOC_INFO, detail: '{{donViSoHuu}} · {{loaiTaiLieu}} · {{ngayBanHanh}}' },
  DOCUMENT_REPLACED: { title: '🔄 Văn bản thay thế', body: DOC_INFO, detail: 'Văn bản mới đã thay thế văn bản cũ' },
  DOCUMENT_UPDATED: { title: '📝 Văn bản được cập nhật', body: DOC_INFO, detail: 'Cập nhật thông tin văn bản' },
  DOCUMENT_EXPIRING_SOON: { title: '⏰ Văn bản sắp hết hiệu lực', body: DOC_INFO, detail: 'Ngày hết hiệu lực: {{ngayHetHieuLuc}}' },
  DOCUMENT_EXPIRED: { title: '⛔ Văn bản đã hết hiệu lực', body: DOC_INFO, detail: 'Văn bản đã hết hiệu lực từ {{ngayHetHieuLuc}}' },
  SYSTEM: { title: 'Thông báo hệ thống', body: '{{trichYeu}}', detail: '' },
};

// ── EMAIL (title=subject · body=heading · detail=nội dung) ─────────────────────
const EMAIL: Record<NotificationType, RawTpl> = {
  NEW_DOCUMENT: { title: '[BHL DMS] Văn bản mới: {{soVanBan}} - {{trichYeu}}', body: 'Văn bản mới được cập nhật trên hệ thống', detail: EMAIL_DETAIL_DEFAULT },
  DOCUMENT_REPLACED: { title: '[BHL DMS] Văn bản thay thế: {{soVanBan}}', body: 'Văn bản đã được thay thế', detail: EMAIL_DETAIL_DEFAULT },
  // DOCUMENT_UPDATED: mặc định TẮT email (giữ hành vi cũ — tránh spam khi sửa metadata).
  DOCUMENT_UPDATED: { enabled: false, title: '[BHL DMS] Văn bản cập nhật: {{soVanBan}}', body: 'Văn bản đã được cập nhật', detail: EMAIL_DETAIL_DEFAULT },
  DOCUMENT_EXPIRING_SOON: { title: '[BHL DMS] Sắp hết hiệu lực: {{soVanBan}}', body: 'Văn bản sắp hết hiệu lực', detail: EMAIL_DETAIL_DEFAULT },
  DOCUMENT_EXPIRED: { title: '[BHL DMS] Đã hết hiệu lực: {{soVanBan}}', body: 'Văn bản đã hết hiệu lực', detail: EMAIL_DETAIL_DEFAULT },
  SYSTEM: { enabled: false, title: '[BHL DMS] Thông báo', body: 'Thông báo hệ thống', detail: '{{trichYeu}}' },
};

// ── TEAMS ACTIVITY (title=topic · body=documentInfo · detail=previewText) ──────
const TEAMS: Record<NotificationType, RawTpl> = {
  NEW_DOCUMENT: { title: '{{soVanBan}}', body: DOC_INFO, detail: TEAMS_PREVIEW_DEFAULT },
  DOCUMENT_REPLACED: { title: '{{soVanBan}}', body: DOC_INFO, detail: TEAMS_PREVIEW_DEFAULT },
  DOCUMENT_UPDATED: { title: '{{soVanBan}}', body: DOC_INFO, detail: TEAMS_PREVIEW_DEFAULT },
  DOCUMENT_EXPIRING_SOON: { title: '{{soVanBan}}', body: DOC_INFO, detail: 'Ngày hết hiệu lực: {{ngayHetHieuLuc}}' },
  DOCUMENT_EXPIRED: { title: '{{soVanBan}}', body: DOC_INFO, detail: 'Đã hết hiệu lực từ {{ngayHetHieuLuc}}' },
  SYSTEM: { enabled: false, title: '{{soVanBan}}', body: DOC_INFO, detail: '' },
};

function build(eventType: NotificationType, channel: NotificationChannel, raw: RawTpl): NotificationTemplate {
  return {
    eventType,
    channel,
    enabled: raw.enabled !== false,
    titleTemplate: raw.title,
    bodyTemplate: raw.body,
    detailTemplate: raw.detail,
    actionLabel: channel === 'email' ? 'MỞ VĂN BẢN' : ACTION_LABEL,
    actionUrlTemplate: ACTION_URL,
    fields: extractTemplateFields(raw.title, raw.body, raw.detail, ACTION_URL),
  };
}

const SOURCE: Record<NotificationChannel, Record<NotificationType, RawTpl>> = {
  web: WEB,
  email: EMAIL,
  teamsActivity: TEAMS,
};

/** Template mặc định (trong code) cho 1 event × channel. Trả bản copy mới mỗi lần. */
export function getDefaultTemplate(eventType: NotificationType, channel: NotificationChannel): NotificationTemplate {
  const raw = SOURCE[channel][eventType] ?? SOURCE[channel].NEW_DOCUMENT;
  return build(eventType, channel, raw);
}

/** Toàn bộ template mặc định cho 5 event × 3 channel (admin "tất cả"). */
export function getAllDefaultTemplates(): NotificationTemplate[] {
  const out: NotificationTemplate[] = [];
  for (const ev of TEMPLATE_EVENTS) {
    for (const ch of TEMPLATE_CHANNELS) {
      out.push(getDefaultTemplate(ev, ch));
    }
  }
  return out;
}
