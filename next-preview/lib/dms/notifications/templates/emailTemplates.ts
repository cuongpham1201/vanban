// Email templates (HTML) cho DMS notifications — Phase 2.
// Inline-style (tương thích email client). Header BHL DMS · body fields · button · footer.

import { NotificationType } from '../types';

export interface EmailContentInput {
  type: NotificationType;
  documentId: string;
  documentNumber?: string;
  documentTitle?: string;
  donViSoanThao?: string; // label hiển thị (đổi từ "Đơn vị phát hành" → "Đơn vị soạn thảo")
  ngayBanHanh?: string;
  trangThai?: string;
  oldDocumentNumber?: string;
  newDocumentNumber?: string;
  baseUrl: string; // vd https://vanban.biahalong.com
}

export interface EmailContent {
  subject: string;
  html: string;
}

const DASH = '—';
function esc(s?: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function val(s?: string): string {
  return s && s.trim() ? esc(s.trim()) : DASH;
}

function subjectFor(i: EmailContentInput): string {
  const num = i.documentNumber ?? '';
  switch (i.type) {
    case 'NEW_DOCUMENT':
      return `[BHL DMS] Văn bản mới: ${num} - ${i.documentTitle ?? ''}`.trim();
    case 'DOCUMENT_REPLACED':
      return `[BHL DMS] Văn bản thay thế: ${i.oldDocumentNumber ?? ''} → ${i.newDocumentNumber ?? num}`.trim();
    case 'DOCUMENT_EXPIRING_SOON':
      return `[BHL DMS] Văn bản sắp hết hiệu lực: ${num}`.trim();
    case 'DOCUMENT_EXPIRED':
      return `[BHL DMS] Văn bản đã hết hiệu lực: ${num}`.trim();
    default:
      return `[BHL DMS] Thông báo văn bản: ${num}`.trim();
  }
}

function headingFor(type: NotificationType): string {
  switch (type) {
    case 'NEW_DOCUMENT': return 'Văn bản mới đã được tải lên';
    case 'DOCUMENT_REPLACED': return 'Văn bản đã được thay thế';
    case 'DOCUMENT_EXPIRING_SOON': return 'Văn bản sắp hết hiệu lực';
    case 'DOCUMENT_EXPIRED': return 'Văn bản đã hết hiệu lực';
    default: return 'Thông báo văn bản';
  }
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:7px 0;color:#6f7e8e;font-size:13px;width:150px;vertical-align:top">${esc(label)}</td>
      <td style="padding:7px 0;color:#15202e;font-size:14px;font-weight:600">${value}</td>
    </tr>`;
}

export function buildEmailContent(i: EmailContentInput): EmailContent {
  const link = `${i.baseUrl.replace(/\/+$/, '')}/documents/${encodeURIComponent(i.documentId)}`;
  const replacedRow =
    i.type === 'DOCUMENT_REPLACED'
      ? row('Thay thế cho', `${val(i.oldDocumentNumber)} → ${val(i.newDocumentNumber ?? i.documentNumber)}`)
      : '';

  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f4f8;font-family:'Segoe UI',system-ui,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f8;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(13,24,48,.08)">
        <!-- header -->
        <tr><td style="background:#143f7e;padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.01em">
          BHL DMS
        </td></tr>
        <!-- title -->
        <tr><td style="padding:24px 28px 8px;color:#0a2444;font-size:18px;font-weight:700">
          ${esc(headingFor(i.type))}
        </td></tr>
        <!-- fields -->
        <tr><td style="padding:4px 28px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${row('Số văn bản', val(i.documentNumber))}
            ${row('Trích yếu', val(i.documentTitle))}
            ${row('Đơn vị soạn thảo', val(i.donViSoanThao))}
            ${row('Ngày ban hành', val(i.ngayBanHanh))}
            ${row('Trạng thái', val(i.trangThai))}
            ${replacedRow}
          </table>
        </td></tr>
        <!-- button -->
        <tr><td style="padding:18px 28px 28px">
          <a href="${esc(link)}" style="display:inline-block;background:#14498b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">
            MỞ VĂN BẢN
          </a>
          <div style="margin-top:12px;font-size:12px;color:#97a3b2;word-break:break-all">${esc(link)}</div>
        </td></tr>
        <!-- footer -->
        <tr><td style="background:#f7f9fc;padding:16px 28px;color:#6f7e8e;font-size:12px;border-top:1px solid #eaeef3">
          Hệ thống Quản lý Văn bản BHL DMS
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: subjectFor(i), html };
}
