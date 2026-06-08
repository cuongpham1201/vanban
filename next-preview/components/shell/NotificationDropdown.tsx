'use client';

import * as React from 'react';
import Icon, { IconName } from './Icon';
import { DmsNotification, NotificationType, NotificationSeverity } from '@/lib/dms/notifications/types';
import styles from './notifications.module.css';

function iconFor(type: NotificationType): IconName {
  switch (type) {
    case 'NEW_DOCUMENT': return 'docs';
    case 'DOCUMENT_REPLACED': return 'replace';
    case 'DOCUMENT_UPDATED': return 'edit';
    case 'DOCUMENT_EXPIRING_SOON':
    case 'DOCUMENT_EXPIRED': return 'clock';
    case 'SYSTEM':
    default: return 'bell';
  }
}

function severityClass(s: NotificationSeverity): string {
  return styles[s] ?? styles.info;
}

// Relative time tiếng Việt (gọn).
function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(t).toLocaleDateString('vi-VN');
}

export default function NotificationDropdown({
  items,
  loading,
  hasUnread,
  onItemClick,
  onMarkAll,
  onClose,
}: {
  items: DmsNotification[];
  loading: boolean;
  hasUnread: boolean;
  onItemClick: (n: DmsNotification) => void;
  onMarkAll: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <div className={styles.panel} role="dialog" aria-label="Thông báo">
        <div className={styles.head}>
          <span className="ttl" style={{ fontSize: 16, fontWeight: 700 }}>Thông báo</span>
          <button type="button" className={styles.markall} onClick={onMarkAll} disabled={!hasUnread}>
            Đánh dấu tất cả đã đọc
          </button>
        </div>

        <div className={styles.list}>
          {loading ? (
            <div className={styles.empty}>Đang tải…</div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>Chưa có thông báo nào.</div>
          ) : (
            items.map((n) => (
              <button type="button" key={n.id} className={`${styles.item} ${!n.isRead ? styles.itemUnread : ''}`} onClick={() => onItemClick(n)}>
                <span className={`${styles.icon} ${severityClass(n.severity)}`}>
                  <Icon name={iconFor(n.type)} size={16} />
                </span>
                <span className={styles.body}>
                  <span className={styles.itemTitle}>{n.title}</span>
                  <span className={styles.itemMsg}>{n.message}</span>
                  <span className={styles.time}>{relTime(n.createdAt)}</span>
                </span>
                {!n.isRead && <span className={styles.dot} aria-label="Chưa đọc" />}
              </button>
            ))
          )}
        </div>

        <div className={styles.foot}>
          <a href="/search" onClick={onClose}>Xem tất cả văn bản</a>
        </div>
      </div>
    </>
  );
}
