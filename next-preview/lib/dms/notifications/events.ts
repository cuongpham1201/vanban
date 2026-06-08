// DMS Notification events — Phase 1 hooks.
// Recipient strategy Phase 1: CHỈ người dùng hiện tại (uploader/actor). Chưa broadcast/subscription.
// Mọi hàm "an toàn": KHÔNG bao giờ throw — lỗi notification KHÔNG được làm hỏng upload/replace/edit.

import { createNotification } from './notificationService';
import { NotificationType } from './types';

function docUrl(documentId: string): string {
  return `/documents/${encodeURIComponent(documentId)}`;
}

interface DocCtx {
  actorEmail: string; // người thực hiện (recipient Phase 1)
  documentId: string;
  documentNumber?: string;
  documentTitle?: string;
}

/** Bọc tạo notification an toàn — log lỗi, không throw. */
async function safeCreate(args: Parameters<typeof createNotification>[0]): Promise<void> {
  try {
    await createNotification(args);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[dms-noti] create failed:', e instanceof Error ? e.message : String(e));
  }
}

export async function notifyNewDocument(ctx: DocCtx): Promise<void> {
  await safeCreate({
    userEmail: ctx.actorEmail,
    type: 'NEW_DOCUMENT' as NotificationType,
    title: 'Văn bản mới đã được tải lên',
    message: `${ctx.documentNumber ?? 'Văn bản'} — ${ctx.documentTitle ?? ''}`.trim(),
    documentId: ctx.documentId,
    documentNumber: ctx.documentNumber,
    documentTitle: ctx.documentTitle,
    url: docUrl(ctx.documentId),
    createdByEmail: ctx.actorEmail,
    eventKey: `NEW_DOCUMENT:${ctx.documentId}`,
  });
}

export async function notifyDocumentReplaced(
  ctx: DocCtx & { oldDocumentNumber?: string; newDocumentNumber?: string }
): Promise<void> {
  const oldNo = ctx.oldDocumentNumber ?? '';
  const newNo = ctx.newDocumentNumber ?? ctx.documentNumber ?? '';
  await safeCreate({
    userEmail: ctx.actorEmail,
    type: 'DOCUMENT_REPLACED' as NotificationType,
    title: 'Văn bản đã được thay thế',
    message: `${oldNo} → ${newNo}`.trim(),
    documentId: ctx.documentId,
    documentNumber: newNo || ctx.documentNumber,
    documentTitle: ctx.documentTitle,
    url: docUrl(ctx.documentId),
    createdByEmail: ctx.actorEmail,
    eventKey: `DOCUMENT_REPLACED:${ctx.documentId}:${oldNo}`,
  });
}

export async function notifyDocumentUpdated(ctx: DocCtx & { changedFields?: string[] }): Promise<void> {
  const fieldsTxt = ctx.changedFields && ctx.changedFields.length ? ` (${ctx.changedFields.join(', ')})` : '';
  await safeCreate({
    userEmail: ctx.actorEmail,
    type: 'DOCUMENT_UPDATED' as NotificationType,
    title: 'Metadata văn bản đã cập nhật',
    message: `${ctx.documentNumber ?? 'Văn bản'} đã được cập nhật${fieldsTxt}`,
    documentId: ctx.documentId,
    documentNumber: ctx.documentNumber,
    documentTitle: ctx.documentTitle,
    url: docUrl(ctx.documentId),
    createdByEmail: ctx.actorEmail,
    // Cập nhật có thể nhiều lần → eventKey kèm timestamp để KHÔNG bị dedup mất.
    eventKey: `DOCUMENT_UPDATED:${ctx.documentId}:${Date.now()}`,
  });
}
