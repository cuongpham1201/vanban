// DMS Notification events — hooks gọi từ route upload/replace/metadata.
// Recipient web Phase 1: CHÍNH actor. Email Phase 2: broadcast/test (do emailChannel quyết định).
// Mọi hàm an toàn (best-effort) — KHÔNG throw (dispatcher tự nuốt lỗi từng channel).

import { dispatchNotification } from './dispatcher';

interface DocCtx {
  actorEmail: string;
  documentId: string;
  documentNumber?: string;
  documentTitle?: string;
  // bổ sung cho email body:
  donViSoanThao?: string;
  ngayBanHanh?: string;
  trangThai?: string;
}

export async function notifyNewDocument(ctx: DocCtx): Promise<void> {
  await dispatchNotification({
    type: 'NEW_DOCUMENT',
    actorEmail: ctx.actorEmail,
    documentId: ctx.documentId,
    documentNumber: ctx.documentNumber,
    documentTitle: ctx.documentTitle,
    donViSoanThao: ctx.donViSoanThao,
    ngayBanHanh: ctx.ngayBanHanh,
    trangThai: ctx.trangThai,
    title: 'Văn bản mới đã được tải lên',
    message: `${ctx.documentNumber ?? 'Văn bản'} — ${ctx.documentTitle ?? ''}`.trim(),
    eventKey: `NEW_DOCUMENT:${ctx.documentId}`,
  });
}

export async function notifyDocumentReplaced(
  ctx: DocCtx & { oldDocumentNumber?: string; newDocumentNumber?: string }
): Promise<void> {
  const oldNo = ctx.oldDocumentNumber ?? '';
  const newNo = ctx.newDocumentNumber ?? ctx.documentNumber ?? '';
  await dispatchNotification({
    type: 'DOCUMENT_REPLACED',
    actorEmail: ctx.actorEmail,
    documentId: ctx.documentId,
    documentNumber: newNo || ctx.documentNumber,
    documentTitle: ctx.documentTitle,
    donViSoanThao: ctx.donViSoanThao,
    ngayBanHanh: ctx.ngayBanHanh,
    trangThai: ctx.trangThai,
    oldDocumentNumber: oldNo,
    newDocumentNumber: newNo,
    title: 'Văn bản đã được thay thế',
    message: `${oldNo} → ${newNo}`.trim(),
    eventKey: `DOCUMENT_REPLACED:${ctx.documentId}:${oldNo}`,
  });
}

export async function notifyDocumentUpdated(ctx: DocCtx & { changedFields?: string[] }): Promise<void> {
  const fieldsTxt = ctx.changedFields && ctx.changedFields.length ? ` (${ctx.changedFields.join(', ')})` : '';
  // DOCUMENT_UPDATED: CHỈ web — emailChannel tự loại type này (tránh spam).
  await dispatchNotification({
    type: 'DOCUMENT_UPDATED',
    actorEmail: ctx.actorEmail,
    documentId: ctx.documentId,
    documentNumber: ctx.documentNumber,
    documentTitle: ctx.documentTitle,
    title: 'Metadata văn bản đã cập nhật',
    message: `${ctx.documentNumber ?? 'Văn bản'} đã được cập nhật${fieldsTxt}`,
    // Cập nhật nhiều lần → eventKey kèm timestamp (không bị dedup mất ở web).
    eventKey: `DOCUMENT_UPDATED:${ctx.documentId}:${Date.now()}`,
  });
}
