// Notification dispatcher — Phase 2. Một sự kiện DMS → fan-out qua các channel:
//   1) Web (Phase 1): tạo bản ghi notification (header bell).
//   2) Email (Phase 2): gửi email broadcast/test.
// Mọi channel BEST-EFFORT: lỗi 1 channel KHÔNG ảnh hưởng channel khác hay luồng upload/replace/edit.
// (Phase 3 Teams / Phase 4 Activity Feed sẽ thêm channel tại đây.)

import { createNotification, BROADCAST_EMAIL } from './notificationService';
import { sendEmailForEvent } from './channels/emailChannel';
import { sendTeamsActivityForEvent } from './channels/teamsActivityChannel';
import { NotificationType } from './types';

export interface DmsEvent {
  type: NotificationType;
  actorEmail: string;
  // Recipient của WEB notification. Mặc định = actorEmail (cá nhân).
  // Sự kiện văn bản (tạo/upload/cập nhật) set = BROADCAST_EMAIL ("__ALL__") → mọi user thấy chuông.
  recipientEmail?: string;
  documentId: string;
  documentNumber?: string;
  documentTitle?: string;
  // Field bổ sung cho email body:
  donViSoanThao?: string;
  ngayBanHanh?: string;
  trangThai?: string;
  oldDocumentNumber?: string;
  newDocumentNumber?: string;
  // Nội dung web notification:
  title: string;
  message: string;
  eventKey: string;
}

function docUrl(documentId: string): string {
  return `/documents/${encodeURIComponent(documentId)}`;
}

export async function dispatchNotification(ev: DmsEvent): Promise<void> {
  // 1) Web notification. recipientEmail = BROADCAST_EMAIL ("__ALL__") → 1 item dùng chung cho mọi user;
  //    nếu không set → cá nhân (actor). createdByEmail luôn là actor (người gây ra sự kiện).
  try {
    await createNotification({
      userEmail: ev.recipientEmail ?? ev.actorEmail,
      type: ev.type,
      title: ev.title,
      message: ev.message,
      documentId: ev.documentId,
      documentNumber: ev.documentNumber,
      documentTitle: ev.documentTitle,
      url: docUrl(ev.documentId),
      createdByEmail: ev.actorEmail,
      eventKey: ev.eventKey,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[dms-noti][web] create failed:', e instanceof Error ? e.message : String(e));
  }

  // 2) Email channel (best-effort, tự quyết định enabled/recipient/type).
  await sendEmailForEvent({
    type: ev.type,
    documentId: ev.documentId,
    documentNumber: ev.documentNumber,
    documentTitle: ev.documentTitle,
    donViSoanThao: ev.donViSoanThao,
    ngayBanHanh: ev.ngayBanHanh,
    trangThai: ev.trangThai,
    oldDocumentNumber: ev.oldDocumentNumber,
    newDocumentNumber: ev.newDocumentNumber,
    eventKey: ev.eventKey,
  });

  // 3) Teams Activity Feed channel (best-effort — KHÔNG throw, không làm hỏng upload/replace/edit).
  //    Phase 1: gửi tới actor (hoặc DMS_TEAMS_ACTIVITY_TEST_RECIPIENT), KHÔNG broadcast.
  try {
    await sendTeamsActivityForEvent({
      type: ev.type,
      actorEmail: ev.actorEmail,
      documentId: ev.documentId,
      documentNumber: ev.documentNumber,
      documentTitle: ev.documentTitle,
      eventKey: ev.eventKey,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dms-teams-activity] dispatch failed:', e instanceof Error ? e.message : String(e));
  }
}
