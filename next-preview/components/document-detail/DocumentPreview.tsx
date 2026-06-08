'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { DetailDoc } from './documentDetailTypes';

// Khu vực xem PDF thật — stream qua proxy same-origin /api/documents/[id]/file.
//  - PDF → iframe (same-origin nên không bị chặn cross-origin).
//  - Không phải PDF (DOCX/...) → fallback tải xuống/mở file gốc.
export default function DocumentPreview({ doc }: { doc: DetailDoc }): React.ReactElement {
  const isPdf = doc.type === 'pdf';
  // BUG#28: #view=FitH → PDF viewer fit chiều ngang (mobile thấy trọn bề ngang, không kéo ngang).
  const fileUrl = `/api/documents/${encodeURIComponent(doc.id)}/file`;
  const pdfViewUrl = `${fileUrl}#view=FitH`;

  return (
    <section className="viewer" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="vtoolbar">
        <span>{isPdf ? 'Bản PDF' : 'Xem trước'}</span>
        <div style={{ flex: 1 }} />
        {isPdf && (
          <a className="iconbtn" href={fileUrl} target="_blank" rel="noreferrer" title="Mở PDF ở tab mới">
            <Icon name="search" />
          </a>
        )}
        {doc.webUrl && (
          <a className="iconbtn" href={doc.webUrl} target="_blank" rel="noreferrer" title="Tải xuống / mở file gốc trên SharePoint">
            <Icon name="download" />
          </a>
        )}
      </div>

      {isPdf ? (
        <iframe
          className="pdfframe"
          src={pdfViewUrl}
          title={`PDF ${doc.num}`}
          style={{ flex: 1, width: '100%', border: 0, minHeight: 520, background: 'var(--gray-100)' }}
        />
      ) : (
        <div className="vscroll scrollbar">
          <div className="vnote" style={{ textAlign: 'center', padding: 40 }}>
            <div className="t-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
              Định dạng {doc.fileName ? `“${doc.fileName}”` : 'này'} không xem trước trực tiếp được.
            </div>
            <div className="t-xs mut" style={{ marginBottom: 16 }}>Chỉ hỗ trợ xem nhanh file PDF. Tải xuống để mở file gốc.</div>
            {doc.webUrl && (
              <a className="btn btn-primary" href={doc.webUrl} target="_blank" rel="noreferrer">
                <Icon name="download" /> Tải xuống / mở file gốc
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
