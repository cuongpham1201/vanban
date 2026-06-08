'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

// Modal xác nhận dùng chung (mặc định cho hành động nguy hiểm: xóa). Esc để hủy.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div className="cfm-overlay" role="dialog" aria-modal="true" onClick={() => !busy && onCancel()}>
      <div className="cfm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cfm-head">
          <span className={`cfm-icon ${danger ? 'danger' : ''}`}><Icon name={danger ? 'trash' : 'help'} size={20} /></span>
          <h2 className="cfm-title">{title}</h2>
        </div>
        <div className="cfm-body">{message}</div>
        <div className="cfm-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
