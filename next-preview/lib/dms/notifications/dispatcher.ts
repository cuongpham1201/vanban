// Notification dispatcher — một sự kiện DMS → fan-out qua các channel:
//   1) Web (chuông)              2) Email              3) Teams Activity Feed
// Nội dung MỖI kênh lấy từ Notification Template Manager (config DMSConfig → default code).
// Mọi channel BEST-EFFORT: lỗi 1 channel KHÔNG ảnh hưởng channel khác hay luồng upload/replace/edit.

import { createNotification, BROADCAST_EMAIL } from './notificationService';
import { sendEmailForEvent } from './channels/emailChannel';
import { sendTeamsActivityForEvent } from './channels/teamsActivityChannel';
import { NotificationType } from './types';
import { renderNotificationContent, buildTemplateContext } from './templates/notificationTemplateService';
import { NotificationTemplateContext } from './templates/templateConstants';

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
  // Metadata mở rộng (optional) cho template placeholder ({{donViSoHuu}}, {{loaiTaiLieu}}…).
  fields?: NotificationTemplateContext;
  // Nội dung web notification (fallback nếu render template lỗi):
  title: string;
  message: string;
  eventKey: string;
}

/** Gom field rời rạc của event → context render template. */
function contextFor(ev: DmsEvent): NotificationTemplateContext {
  return buildTemplateContext({
    id: ev.documentId,
    soVanBan: ev.documentNumber,
    trichYeu: ev.documentTitle,
    ngayBanHanh: ev.ngayBanHanh,
    trangThai: ev.trangThai,
    // donViSoanThao là đơn vị org duy nhất có sẵn từ upload → dùng cho cả 2 placeholder org.
    donViSoHuu: ev.fields?.donViSoHuu ?? ev.donViSoanThao,
    donViPhatHanh: ev.fields?.donViPhatHanh ?? ev.donViSoanThao,
    actorEmail: ev.actorEmail,
    oldDocumentNumber: ev.oldDocumentNumber,
    newDocumentNumber: ev.newDocumentNumber,
    ...ev.fields, // rich override nếu caller cung cấp
  });
}

export async function dispatchNotification(ev: DmsEvent): Promise<void> {
  const ctx = contextFor(ev);

  // 1) Web notification — nội dung từ template 'web'. enabled=false → bỏ qua bell.
  try {
    const web = await renderNotificationContent(ev.type, 'web', ctx);
    if (web.enabled) {
      const message =
        [web.body, web.detail]
          .map((s) => s.trim())
          .filter((s) => s && s !== '—')
          .join('\n') || ev.message;
      await createNotification({
        userEmail: ev.recipientEmail ?? ev.actorEmail,
        type: ev.type,
        title: web.title || ev.title,
        message,
        documentId: ev.documentId,
        documentNumber: ev.documentNumber,
        documentTitle: ev.documentTitle,
        url: web.actionUrl,
        createdByEmail: ev.actorEmail,
        eventKey: ev.eventKey,
      });
    } else {
      // eslint-disable-next-line no-console
      console.log('[dms-noti][web] skipped', JSON.stringify({ eventKey: ev.eventKey, reason: 'template disabled' }));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[dms-noti][web] create failed:', e instanceof Error ? e.message : String(e));
  }

  // 2) Email channel (best-effort; gating enabled/recipient/type + template enabled bên trong).
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
    ctx,
  });

  // 3) Teams Activity Feed channel (best-effort — KHÔNG throw).
  //    Phase 1: gửi tới actor (hoặc DMS_TEAMS_ACTIVITY_TEST_RECIPIENT), KHÔNG broadcast.
  try {
    await sendTeamsActivityForEvent({
      type: ev.type,
      actorEmail: ev.actorEmail,
      documentId: ev.documentId,
      documentNumber: ev.documentNumber,
      documentTitle: ev.documentTitle,
      eventKey: ev.eventKey,
      ctx,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[dms-teams-activity] dispatch failed:', e instanceof Error ? e.message : String(e));
  }
}
