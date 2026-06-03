import * as React from 'react';
import styles from './DmsPortal.module.scss';

export interface IConfirmDialogProps {
  /** Tiêu đề hộp thoại. */
  title: string;
  /** Nội dung xác nhận (text hoặc node). */
  message: React.ReactNode;
  /** Nhãn nút xác nhận (mặc định "Xóa"). */
  confirmLabel?: string;
  /** Nhãn nút hủy (mặc định "Hủy"). */
  cancelLabel?: string;
  /** true = nút xác nhận kiểu nguy hiểm (đỏ). */
  danger?: boolean;
  /** Đang xử lý (disable nút). */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Hộp thoại xác nhận dùng chung (dùng cho Xóa tài liệu...). */
export default function ConfirmDialog(props: IConfirmDialogProps): React.ReactElement {
  const { title, message, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel } = props;

  React.useEffect((): (() => void) => {
    const onEsc = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !busy) { onCancel(); } };
    window.addEventListener('keydown', onEsc);
    return (): void => window.removeEventListener('keydown', onEsc);
  }, [onCancel, busy]);

  const confirmStyle: React.CSSProperties | undefined = danger
    ? { background: '#D13438', borderColor: '#D13438', color: '#fff' }
    : undefined;

  return (
    <div className={styles.modalOverlay} onClick={busy ? undefined : onCancel} role="presentation">
      <div className={styles.modalBox} onClick={(e: React.MouseEvent): void => e.stopPropagation()} role="dialog" aria-label={title} aria-modal={true}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>{title}</span>
          {!busy && <button type="button" className={styles.drawerCloseBtn} onClick={onCancel} aria-label="Đóng">×</button>}
        </div>
        <div className={styles.modalBody}>
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onCancel}>
            {cancelLabel ?? 'Hủy'}
          </button>
          <button type="button" className={styles.primaryButton} style={confirmStyle} disabled={busy} onClick={onConfirm}>
            {busy ? 'Đang xử lý…' : (confirmLabel ?? 'Xóa')}
          </button>
        </div>
      </div>
    </div>
  );
}
