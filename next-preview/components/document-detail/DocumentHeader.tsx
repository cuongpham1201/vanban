'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/shell/Icon';
import { DetailDoc } from './documentDetailTypes';

// DocHead — port từ DocumentDetail.html .dochead.
export default function DocumentHeader({
  doc,
  returnUrl,
  canWrite,
  onEdit,
}: {
  doc: DetailDoc;
  returnUrl?: string;
  canWrite?: boolean;
  onEdit?: () => void;
}): React.ReactElement {
  const router = useRouter();
  // "Quay lại kết quả": có returnUrl → về đúng URL tìm kiếm (giữ filter); không → /search.
  const goBack = (): void => router.push(returnUrl ?? '/search');
  // BUG#17: header SLIM 1 hàng → PDF viewer cao hơn. Badge phụ + thông tin đầy đủ ở panel phải.
  return (
    <div className="dochead dochead-slim">
      <button
        type="button"
        className="dd-back"
        onClick={goBack}
        title={returnUrl ? 'Quay lại kết quả tìm kiếm (giữ bộ lọc)' : 'Về Trung tâm tìm kiếm'}
      >
        <span aria-hidden>←</span> Quay lại
      </button>
      <span className="num" title={doc.num}>{doc.num}</span>
      <span className="dh-title" title={doc.title}>{doc.title}</span>
      <span className={`badge ${doc.statusClass}`} style={{ flexShrink: 0 }}>{doc.statusLabel}</span>
      <div className="actions">
        {canWrite && (
          <button className="btn btn-subtle" title="Sửa metadata văn bản" onClick={onEdit}>
            <Icon name="admin" size={16} /> Sửa metadata
          </button>
        )}
        <Link className="btn btn-ghost" href={`/replace?old=${encodeURIComponent(doc.id)}`} title="Thay thế văn bản này">
          <Icon name="replace" size={16} /> Thay thế
        </Link>
        {doc.webUrl ? (
          <a className="btn btn-primary" href={doc.webUrl} target="_blank" rel="noreferrer">
            <Icon name="download" size={16} /> Tải xuống
          </a>
        ) : (
          <button className="btn btn-primary" disabled style={{ opacity: 0.55 }}>
            <Icon name="download" size={16} /> Tải xuống
          </button>
        )}
      </div>
    </div>
  );
}
