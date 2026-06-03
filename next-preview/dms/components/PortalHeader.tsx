'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { DocLibraryIcon } from './Icons';

// Top tab nav cũ (Trang chủ/Tra cứu/…) đã bỏ vì trùng hoàn toàn với Sidebar và không điều hướng.
// Giữ header gọn: chỉ logo + tên hệ thống → giải phóng chiều cao viewport.
export default function PortalHeader(): React.ReactElement {
  return (
    <header className={styles.header}>
      <div className={styles.headerTitle}>
        <span className={styles.headerIcon} aria-hidden={true}>
          <DocLibraryIcon size={18} />
        </span>
        <h1>Văn bản điều hành</h1>
      </div>
    </header>
  );
}
