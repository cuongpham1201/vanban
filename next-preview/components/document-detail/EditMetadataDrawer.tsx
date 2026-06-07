'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { IDocument } from '@dms/models/IDocument';
import EditMetadataForm from './EditMetadataForm';

// BUG#20A: drawer dock bên phải, KHÔNG có backdrop che/khóa → PDF bên trái vẫn cuộn được.
// Drawer có scroll riêng. Esc để đóng.
export default function EditMetadataDrawer({
  doc,
  onClose,
  onSaved,
}: {
  doc: IDocument;
  onClose: () => void;
  onSaved: (warning?: string) => void;
}): React.ReactElement {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      className="edit-drawer"
      role="dialog"
      aria-label="Sửa metadata"
      style={{
        position: 'fixed', top: 52, right: 0, bottom: 0, width: 'min(520px, 96vw)', zIndex: 45,
        background: 'var(--white)', borderLeft: '1px solid var(--gray-200)',
        boxShadow: 'var(--sh-2, -10px 0 36px -10px rgba(0,0,0,.28))', display: 'flex', flexDirection: 'column',
      }}
    >
      <div className="row between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--gray-200)' }}>
        <h2 className="t-h3" style={{ margin: 0 }}>Sửa metadata</h2>
        <button className="btn btn-ghost btn-icon" onClick={onClose} title="Đóng (Esc)" aria-label="Đóng"><Icon name="x" size={18} /></button>
      </div>
      <EditMetadataForm doc={doc} onClose={onClose} onSaved={onSaved} />
    </aside>
  );
}
