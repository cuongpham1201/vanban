'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon from '@/components/shell/Icon';
import { SearchDoc } from './searchTypes';
import { isTeamsContext } from '@/lib/client/isTeamsContext';
import { openExternal } from '@/lib/teams/teamsClient';

// BUG#9 — Fast PDF Preview dạng MODAL (~90vw x 90vh). Mở từ icon 👁 ở kết quả search.
// iframe PDF thật qua proxy same-origin /api/documents/[id]/file. Không dùng panel phải nữa.
// Trong Microsoft Teams: iframe nhúng PDF bị sandbox chặn → fallback nút "Mở PDF" (mở ngoài).
export default function FastPdfModal({
  doc,
  detailHref,
  onClose,
}: {
  doc: SearchDoc;
  detailHref: string;
  onClose: () => void;
}): React.ReactElement {
  const isPdf = doc.type === 'pdf' && /^\d+$/.test(doc.id);
  // BUG#28: #view=FitH → fit chiều ngang (mobile không kéo ngang, vẫn zoom tay được).
  const fileUrl = `/api/documents/${encodeURIComponent(doc.id)}/file#view=FitH`;

  // Teams detection (client-only).
  const [inTeams, setInTeams] = React.useState(false);
  React.useEffect(() => setInTeams(isTeamsContext()), []);
  const openTarget = (): string =>
    doc.webUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/documents/${encodeURIComponent(doc.id)}/file`;

  // Đóng bằng phím Esc.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fpm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fpm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fpm-head">
          <div style={{ minWidth: 0 }}>
            <div className="fpm-num">{doc.num}</div>
            <div className="fpm-title" title={doc.title}>{doc.title}</div>
          </div>
          <div className="row gap-2 fpm-actions" style={{ flexShrink: 0 }}>
            <Link className="btn btn-primary" href={detailHref}><Icon name="docs" size={16} /> <span className="btn-label">Mở chi tiết</span></Link>
            {doc.webUrl && (
              <a className="btn btn-gold" href={doc.webUrl} target="_blank" rel="noreferrer"><Icon name="download" size={16} /> <span className="btn-label">Tải xuống</span></a>
            )}
            <button className="btn btn-ghost btn-icon" onClick={onClose} title="Đóng (Esc)" aria-label="Đóng"><Icon name="x" /></button>
          </div>
        </div>
        <div className="fpm-body">
          {isPdf && inTeams ? (
            <div className="fpm-nopdf">
              <div className="t-sm" style={{ fontWeight: 600, marginBottom: 6 }}>Xem PDF nhúng bị giới hạn trong Microsoft Teams.</div>
              <div className="t-xs mut" style={{ marginBottom: 16 }}>Mở PDF trong trình duyệt để xem đầy đủ.</div>
              <div className="row gap-2" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={() => void openExternal(openTarget())}>
                  <Icon name="eye" size={16} /> Mở PDF
                </button>
                {doc.webUrl && (
                  <a className="btn btn-ghost" href={doc.webUrl} target="_blank" rel="noreferrer">
                    <Icon name="download" size={16} /> Tải xuống
                  </a>
                )}
              </div>
            </div>
          ) : isPdf ? (
            <iframe className="fpm-frame" src={fileUrl} title={`PDF ${doc.num}`} />
          ) : (
            <div className="fpm-nopdf">
              <div className="t-sm" style={{ fontWeight: 600, marginBottom: 6 }}>Không có bản PDF để xem nhanh</div>
              <div className="t-xs mut">{doc.type === 'pdf' ? 'Mở chi tiết để xem.' : 'File không phải PDF — tải xuống để mở.'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
