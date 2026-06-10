// Shared constants + types cho Notification Template Manager.
// AN TOÀN cho cả client (admin UI) lẫn server — KHÔNG import graph/configList ở đây.

import { NotificationType } from '../types';

/** Kênh gửi notification có thể cấu hình template. */
export type NotificationChannel = 'web' | 'email' | 'teamsActivity';

/** 5 sự kiện DMS hỗ trợ template (KHÔNG gồm SYSTEM). */
export const TEMPLATE_EVENTS: NotificationType[] = [
  'NEW_DOCUMENT',
  'DOCUMENT_REPLACED',
  'DOCUMENT_UPDATED',
  'DOCUMENT_EXPIRING_SOON',
  'DOCUMENT_EXPIRED',
];

export const TEMPLATE_CHANNELS: NotificationChannel[] = ['web', 'email', 'teamsActivity'];

export const EVENT_LABELS: Record<string, string> = {
  NEW_DOCUMENT: 'Văn bản mới',
  DOCUMENT_REPLACED: 'Văn bản thay thế',
  DOCUMENT_UPDATED: 'Văn bản cập nhật',
  DOCUMENT_EXPIRING_SOON: 'Văn bản sắp hết hiệu lực',
  DOCUMENT_EXPIRED: 'Văn bản đã hết hiệu lực',
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  web: 'Web / App (chuông)',
  email: 'Email',
  teamsActivity: 'Teams Activity Feed',
};

/**
 * Template cấu hình cho 1 (event × channel). Schema thống nhất cho mọi kênh;
 * mỗi kênh diễn giải các field theo cách riêng (xem renderNotificationContent):
 *   - web:           title→tiêu đề · body→nội dung · detail→dòng phụ
 *   - email:         title→subject · body→heading · detail→nội dung HTML
 *   - teamsActivity: title→topic · body→documentInfo · detail→previewText
 */
export interface NotificationTemplate {
  eventType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  detailTemplate: string;
  actionLabel: string;
  actionUrlTemplate: string;
  /** Field placeholder được dùng (tự suy ra khi lưu — phục vụ hiển thị). */
  fields: string[];
}

/** Ngữ cảnh render — giá trị metadata văn bản. Thiếu field → render thành "—". */
export interface NotificationTemplateContext {
  id?: string;
  soVanBan?: string;
  trichYeu?: string;
  donViSoHuu?: string;
  donViPhatHanh?: string;
  loaiTaiLieu?: string;
  loaiVanBanPhapLy?: string;
  nhomTaiLieu?: string;
  ngayBanHanh?: string;
  ngayHetHieuLuc?: string;
  trangThai?: string;
  mucDoBaoMat?: string;
  metadataConfidence?: string;
  sourceModule?: string;
  actorEmail?: string;
  // Extra (thay thế) — không advertise trong panel field nhưng vẫn render được.
  oldDocumentNumber?: string;
  newDocumentNumber?: string;
}

/** Danh sách placeholder hiển thị trong panel "Trường khả dụng" của admin UI. */
export const PLACEHOLDER_FIELDS: { key: keyof NotificationTemplateContext; label: string }[] = [
  { key: 'id', label: 'ID văn bản' },
  { key: 'soVanBan', label: 'Số văn bản' },
  { key: 'trichYeu', label: 'Trích yếu' },
  { key: 'donViSoHuu', label: 'Cấp lưu trữ / Đơn vị sở hữu' },
  { key: 'donViPhatHanh', label: 'Đơn vị phát hành' },
  { key: 'loaiTaiLieu', label: 'Loại tài liệu' },
  { key: 'loaiVanBanPhapLy', label: 'Loại văn bản pháp lý' },
  { key: 'nhomTaiLieu', label: 'Nhóm tài liệu' },
  { key: 'ngayBanHanh', label: 'Ngày ban hành' },
  { key: 'ngayHetHieuLuc', label: 'Ngày hết hiệu lực' },
  { key: 'trangThai', label: 'Trạng thái' },
  { key: 'mucDoBaoMat', label: 'Mức độ bảo mật' },
  { key: 'metadataConfidence', label: 'Độ tin cậy metadata' },
  { key: 'sourceModule', label: 'Nguồn (module)' },
  { key: 'actorEmail', label: 'Người thực hiện' },
];

/** Ngữ cảnh mẫu để admin xem preview. */
export const SAMPLE_CONTEXT: NotificationTemplateContext = {
  id: '123',
  soVanBan: '295.2026.QĐ-HCNS',
  trichYeu: 'Điều chỉnh chức danh cán bộ',
  donViSoHuu: 'Khối Hành chính Nhân sự',
  donViPhatHanh: 'Phòng Hành chính Nhân sự',
  loaiTaiLieu: 'Quyết định',
  loaiVanBanPhapLy: 'Quyết định',
  nhomTaiLieu: 'Quản trị nội bộ',
  ngayBanHanh: '2026-05-20',
  ngayHetHieuLuc: '2027-05-20',
  trangThai: 'Đang lưu hành',
  mucDoBaoMat: 'Nội bộ',
  metadataConfidence: 'High',
  sourceModule: 'DMS',
  actorEmail: 'cuongpx@biahalong.com',
};

export function isTemplateChannel(c: string): c is NotificationChannel {
  return (TEMPLATE_CHANNELS as string[]).includes(c);
}
export function isTemplateEvent(e: string): e is NotificationType {
  return (TEMPLATE_EVENTS as string[]).includes(e);
}

/** ConfigKey trong DMSConfig: notification-template:{eventType}:{channel}. */
export function templateConfigKey(eventType: string, channel: string): string {
  return `notification-template:${eventType}:${channel}`;
}
