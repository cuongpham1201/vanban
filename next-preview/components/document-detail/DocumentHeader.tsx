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
  return (
    <div className="dochead">
      <button
        type="button"
        className="dd-back"
        onClick={goBack}
        title={returnUrl ? 'Quay lại kết quả tìm kiếm (giữ bộ lọc)' : 'Về Trung tâm tìm kiếm'}
      >
        <span aria-hidden>←</span> Quay lại kết quả
      </button>
      <div className="crumb">
        <Link href={returnUrl ?? '/search'}>Tìm kiếm</Link> / <span>{doc.num}</span>
      </div>
      <div className="titlerow">
        <div className={`ficon ${doc.type === 'doc' ? 'doc' : ''}`}>{doc.type === 'doc' ? 'DOC' : 'PDF'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-2 wrap" style={{ marginBottom: 3 }}>
            <span className="num">{doc.num}</span>
            <span className={`badge ${doc.statusClass}`}>{doc.statusLabel}</span>
            <span className={`badge ${doc.baomatClass}`}>
              <span className="dot" />
              {doc.baomat}
            </span>
            {doc.softcopy ? (
              <span className="badge badge-ok"><span className="dot" />Có bản mềm</span>
            ) : (
              <span className="badge badge-danger">Thiếu bản mềm</span>
            )}
          </div>
          <h1>{doc.title}</h1>
        </div>
        <div className="actions">
          {canWrite && (
            <button className="btn btn-subtle" title="Sửa metadata văn bản" onClick={onEdit}>
              <Icon name="admin" /> Sửa metadata
            </button>
          )}
          <button className="btn btn-ghost btn-icon" title="Ghim"><Icon name="pin" /></button>
          <button className="btn btn-ghost btn-icon" title="Chia sẻ"><Icon name="share" /></button>
          <Link
            className="btn btn-ghost"
            href={`/replace?old=${encodeURIComponent(doc.id)}`}
            title="Thay thế văn bản này bằng phiên bản mới"
          >
            <Icon name="replace" /> Thay thế
          </Link>
          {doc.webUrl ? (
            <a className="btn btn-primary" href={doc.webUrl} target="_blank" rel="noreferrer">
              <Icon name="download" /> Tải xuống
            </a>
          ) : (
            <button className="btn btn-primary" disabled style={{ opacity: 0.55 }}>
              <Icon name="download" /> Tải xuống
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
