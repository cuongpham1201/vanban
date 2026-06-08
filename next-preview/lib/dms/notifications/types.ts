// DMS Notifications — Phase 1 (web bell). Shared types cho service/events/UI/API.
// KHÔNG đụng document schema; notifications lưu ở list riêng "DMSNotifications".

export type NotificationType =
  | 'NEW_DOCUMENT'
  | 'DOCUMENT_UPDATED'
  | 'DOCUMENT_REPLACED'
  | 'DOCUMENT_EXPIRED'
  | 'DOCUMENT_EXPIRING_SOON'
  | 'SYSTEM';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger';

/** Một thông báo (đã chuẩn hóa, dùng chung server + client). */
export interface DmsNotification {
  id: string;
  userEmail: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  documentId?: string;
  documentNumber?: string;
  documentTitle?: string;
  url?: string;
  isRead: boolean;
  createdAt: string; // ISO
  createdByEmail?: string;
  sourceModule: string; // mặc định 'DMS'
  eventKey?: string; // idempotency
}

/** Input tạo thông báo (service tự điền mặc định severity/sourceModule/isRead/createdAt). */
export interface CreateNotificationInput {
  userEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  documentId?: string;
  documentNumber?: string;
  documentTitle?: string;
  url?: string;
  createdByEmail?: string;
  eventKey?: string;
  payload?: unknown;
}

/** Severity mặc định theo loại sự kiện. */
export function defaultSeverity(type: NotificationType): NotificationSeverity {
  switch (type) {
    case 'NEW_DOCUMENT':
    case 'DOCUMENT_REPLACED':
      return 'success';
    case 'DOCUMENT_EXPIRING_SOON':
      return 'warning';
    case 'DOCUMENT_EXPIRED':
      return 'danger';
    case 'DOCUMENT_UPDATED':
    case 'SYSTEM':
    default:
      return 'info';
  }
}
