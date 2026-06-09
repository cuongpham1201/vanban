// DMS Teams Activity Feed templates — map DMS event → activityType + nội dung.
// activityType PHẢI khớp teams/manifest.json activities.activityTypes[].type.

import { NotificationType } from '@/lib/dms/notifications/types';

export type DmsTeamsActivityType =
  | 'dmsNewDocument'
  | 'dmsDocumentReplaced'
  | 'dmsDocumentUpdated'
  | 'dmsDocumentExpiringSoon'
  | 'dmsDocumentExpired';

/** Danh sách activityType hợp lệ — PHẢI khớp manifest. */
export const DMS_TEAMS_ACTIVITY_TYPES: readonly DmsTeamsActivityType[] = [
  'dmsNewDocument',
  'dmsDocumentReplaced',
  'dmsDocumentUpdated',
  'dmsDocumentExpiringSoon',
  'dmsDocumentExpired',
] as const;

// Map NotificationType (DMS) → activityType (Teams). SYSTEM → không gửi activity.
const EVENT_TO_ACTIVITY: Partial<Record<NotificationType, DmsTeamsActivityType>> = {
  NEW_DOCUMENT: 'dmsNewDocument',
  DOCUMENT_REPLACED: 'dmsDocumentReplaced',
  DOCUMENT_UPDATED: 'dmsDocumentUpdated',
  DOCUMENT_EXPIRING_SOON: 'dmsDocumentExpiringSoon',
  DOCUMENT_EXPIRED: 'dmsDocumentExpired',
};

/** activityType tương ứng event, hoặc null nếu event không gửi Teams activity. */
export function activityTypeForEvent(type: NotificationType): DmsTeamsActivityType | null {
  return EVENT_TO_ACTIVITY[type] ?? null;
}

// Alias cho admin test (tên rút gọn / snake_case → type chuẩn).
const ACTIVITY_ALIASES: Record<string, DmsTeamsActivityType> = {
  new: 'dmsNewDocument',
  new_document: 'dmsNewDocument',
  newdocument: 'dmsNewDocument',
  replaced: 'dmsDocumentReplaced',
  document_replaced: 'dmsDocumentReplaced',
  updated: 'dmsDocumentUpdated',
  document_updated: 'dmsDocumentUpdated',
  expiring: 'dmsDocumentExpiringSoon',
  expiring_soon: 'dmsDocumentExpiringSoon',
  expiringsoon: 'dmsDocumentExpiringSoon',
  expired: 'dmsDocumentExpired',
  document_expired: 'dmsDocumentExpired',
};

/** Chuẩn hoá activityType từ input tự do (admin test). null nếu không hợp lệ. */
export function normalizeDmsActivityType(input: string | undefined | null): DmsTeamsActivityType | null {
  if (!input) return null;
  const raw = input.trim();
  if ((DMS_TEAMS_ACTIVITY_TYPES as readonly string[]).includes(raw)) return raw as DmsTeamsActivityType;
  const key = raw.toLowerCase().replace(/[\s-]/g, '_');
  return ACTIVITY_ALIASES[key] ?? ACTIVITY_ALIASES[key.replace(/_/g, '')] ?? null;
}

function truncate(text: string, max = 150): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** topic.value — label ngắn hiện trên activity (≤ ~50 ký tự). */
export function buildTopicValue(documentNumber?: string): string {
  return truncate(documentNumber?.trim() || 'Văn bản', 50);
}

/** Giá trị cho placeholder {documentInfo} trong manifest templateText. */
export function buildDocumentInfo(documentNumber?: string, documentTitle?: string): string {
  const num = documentNumber?.trim();
  const title = documentTitle?.trim();
  const text = num && title ? `${num} — ${title}` : num || title || 'Văn bản';
  return truncate(text, 100);
}

/** previewText.content — dòng mô tả dưới activity (≤ ~150 ký tự). */
export function buildPreviewText(
  activityType: DmsTeamsActivityType,
  documentNumber?: string,
  documentTitle?: string
): string {
  const info = buildDocumentInfo(documentNumber, documentTitle);
  switch (activityType) {
    case 'dmsNewDocument':
      return truncate(`Văn bản mới: ${info}`);
    case 'dmsDocumentReplaced':
      return truncate(`Văn bản đã được thay thế: ${info}`);
    case 'dmsDocumentUpdated':
      return truncate(`Văn bản đã được cập nhật: ${info}`);
    case 'dmsDocumentExpiringSoon':
      return truncate(`Văn bản sắp hết hiệu lực: ${info}`);
    case 'dmsDocumentExpired':
      return truncate(`Văn bản đã hết hiệu lực: ${info}`);
    default:
      return truncate(info);
  }
}
