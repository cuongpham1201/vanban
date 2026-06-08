'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { IDocument } from '@dms/models/IDocument';
import EditMetadataForm from './EditMetadataForm';

// BUG#20B: sửa metadata từ Search — modal SPLIT (~90vw×90vh): trái PDF (65%), phải form (35%).
// Reuse EditMetadataForm (không duplicate). PDF qua proxy /api/documents/[id]/file.
export default function EditMetadataModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: IDocument;
  onClose: () => void;
  onSaved: (warning?: string) => void;
}): React.ReactElement {
  const isPdf = doc.fileKind === 'pdf' && /^\d+$/.test(doc.id);
  const fileUrl = `/api/documents/${encodeURIComponent(doc.id)}/file#view=FitH`;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="emm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="emm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="emm-pdf">
          {isPdf ? (
            <iframe className="emm-frame" src={fileUrl} title={`PDF ${doc.soVanBan}`} />
          ) : (
            <div className="emm-nopdf">
              <div className="t-sm" style={{ fontWeight: 600 }}>Không có PDF để xem trước</div>
              <div className="t-xs mut" style={{ marginTop: 4 }}>Vẫn có thể sửa metadata ở bên phải.</div>
            </div>
          )}
        </div>
        <div className="emm-form">
          <div className="row between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--gray-200)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--navy-600)' }}>{doc.soVanBan}</div>
              <h2 className="t-h3" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sửa metadata</h2>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} title="Đóng (Esc)" aria-label="Đóng"><Icon name="x" size={18} /></button>
          </div>
          <EditMetadataForm doc={doc} onClose={onClose} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
