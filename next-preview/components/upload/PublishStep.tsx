'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon from '@/components/shell/Icon';
import { UploadForm } from './uploadTypes';

// Bước 4 — success state (GIẢ LẬP, không ghi SharePoint).
export default function PublishStep({ form, onReset }: { form: UploadForm; onReset: () => void }): React.ReactElement {
  return (
    <div className="success">
      <div className="check">
        <Icon name="check" size={36} />
      </div>
      <h2 className="t-h1" style={{ margin: '0 0 6px' }}>Hoàn tất (bản xem trước)</h2>
      <p className="t-body mut" style={{ margin: '0 0 8px' }}>
        Văn bản{' '}
        <b style={{ color: 'var(--navy-600)', fontFamily: 'var(--font-mono)' }}>{form.soVanBan || '(chưa nhập số VB)'}</b>{' '}
        đã sẵn sàng.
      </p>
      <p className="t-sm" style={{ color: 'var(--warning-700)', margin: '0 0 8px' }}>
        Chưa ghi SharePoint. Publish thật sẽ triển khai ở Phase 5 sau khi được duyệt.
      </p>
      <div className="row gap-2" style={{ marginTop: 22, justifyContent: 'center' }}>
        <button className="btn btn-ghost" onClick={onReset}>Tạo mới</button>
        <Link className="btn btn-primary" href="/search">Xem danh sách</Link>
      </div>
    </div>
  );
}
