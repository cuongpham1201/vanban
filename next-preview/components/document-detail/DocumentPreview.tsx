'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { DetailDoc } from './documentDetailTypes';
import { isTeamsContext } from '@/lib/client/isTeamsContext';
import PdfCanvasViewer from '@/components/pdf/PdfCanvasViewer';

// Khu vực xem PDF thật — stream qua proxy same-origin /api/documents/[id]/file.
//  - Web → iframe (same-origin, dùng PDF viewer của trình duyệt).
//  - Trong Microsoft Teams: iframe nhúng PDF bị sandbox chặn → render inline bằng PDF.js (canvas).
//  - Không phải PDF (DOCX/...) → fallback tải xuống/mở file gốc.
export default function DocumentPreview({ doc }: { doc: DetailDoc }): React.ReactElement {
  const isPdf = doc.type === 'pdf';
  // BUG#28: #view=FitH → PDF viewer fit chiều ngang (mobile thấy trọn bề ngang, không kéo ngang).
  const fileUrl = `/api/documents/${encodeURIComponent(doc.id)}/file`;
  const pdfViewUrl = `${fileUrl}#view=FitH`;

  // Teams detection (client-only, tránh hydration mismatch).
  const [inTeams, setInTeams] = React.useState(false);
  React.useEffect(() => setInTeams(isTeamsContext()), []);

  // Mobile/PWA: iframe PDF native (#view=FitH) bị iOS Safari/WebView bỏ qua → PDF render theo bề
  // rộng trang gốc, tràn ngang/cắt mép. Trên màn hẹp HOẶC thiết bị cảm ứng → dùng PdfCanvasViewer
  // (PDF.js fit-width) thay iframe. Desktop rộng (chuột) GIỮ iframe native như cũ.
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px), (pointer: coarse)');
    const update = (): void => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Canvas (PDF.js, fit-width) cho Teams + mọi mobile/PWA; iframe native chỉ cho desktop non-Teams.
  const useCanvas = inTeams || isMobile;

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

      {isPdf && useCanvas ? (
        // Teams (sandbox chặn iframe) + mobile/PWA (iOS bỏ qua #view=FitH) → PDF.js canvas fit-width.
        <PdfCanvasViewer fileUrl={fileUrl} downloadUrl={doc.webUrl} fileName={doc.fileName} />
      ) : isPdf ? (
        <iframe
          className="pdfframe"
          src={pdfViewUrl}
          title={`PDF ${doc.num}`}
          style={{ flex: 1, width: '100%', border: 0, minHeight: 'clamp(320px, 60vh, 520px)', background: 'var(--gray-100)' }}
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
