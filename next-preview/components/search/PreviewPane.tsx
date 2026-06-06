'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon from '@/components/shell/Icon';
import { SearchDoc } from './searchTypes';

// Khung xem nhanh bên phải. Bỏ thumbnail PDF (BUG#12) → chỉ action + metadata.
// Xem nhanh PDF mở MODAL (onQuickPdf). Sửa metadata ngay tại đây nếu canWrite (BUG#12A).
export default function PreviewPane({
  doc,
  openHref,
  canWrite,
  onEdit,
  onQuickPdf,
}: {
  doc: SearchDoc | null;
  openHref?: string;
  canWrite?: boolean;
  onEdit?: () => void;
  onQuickPdf?: () => void;
}): React.ReactElement {
  if (!doc) {
    return (
      <aside className="preview scrollbar">
        <div className="sc-empty">Chọn một văn bản để xem nhanh.</div>
      </aside>
    );
  }
  const numStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--navy-600)',
  };
  const meta: [string, string][] = [
    ['Trích yếu', doc.title],
    ['Người ký', doc.nguoiKy],
    ['Ngày ban hành', doc.ngayBH],
    ['Ngày hết hiệu lực', doc.hetHL],
    ['Nhóm tài liệu', doc.nhom],
    ['Loại tài liệu', doc.loaiTL],
    ['Chủ đề nghiệp vụ', doc.chude],
    ['Đơn vị sở hữu', doc.donViSH],
  ];
  return (
    <aside className="preview scrollbar">
      <div className="pv-head">
        <div className="row between" style={{ marginBottom: 10 }}>
          <span className="num" style={numStyle}>{doc.num}</span>
          <div className="row gap-1">
            <button className="btn btn-ghost btn-icon" title="Ghim"><Icon name="pin" /></button>
            <button className="btn btn-ghost btn-icon" title="Tải xuống"><Icon name="download" /></button>
            <button className="btn btn-ghost btn-icon" title="Chia sẻ"><Icon name="share" /></button>
          </div>
        </div>
        <div className="t-h3" style={{ marginBottom: 10 }}>{doc.title}</div>
        <div className="row gap-2 wrap">
          <span className={`badge ${doc.statusClass}`}>{doc.statusLabel}</span>
          <span className={`badge ${doc.baomatClass}`}><span className="dot" />{doc.baomat}</span>
          {doc.softcopy ? (
            <span className="badge badge-ok"><span className="dot" />Có bản mềm</span>
          ) : (
            <span className="badge badge-danger">Thiếu bản mềm</span>
          )}
        </div>
        <div className="row gap-2" style={{ marginTop: 14 }}>
          <Link
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center', gap: 6, fontWeight: 600 }}
            href={openHref ?? `/documents/${encodeURIComponent(doc.id)}`}
          >
            <Icon name="docs" size={16} /> Mở chi tiết
          </Link>
          {onQuickPdf && doc.type === 'pdf' && /^\d+$/.test(doc.id) && (
            <button className="btn btn-gold btn-icon" title="Xem nhanh PDF" aria-label="Xem nhanh PDF" onClick={onQuickPdf}>
              <Icon name="eye" />
            </button>
          )}
          {doc.webUrl && (
            <a className="btn btn-ghost btn-icon" href={doc.webUrl} target="_blank" rel="noreferrer" title="Mở file trên SharePoint">
              <Icon name="download" />
            </a>
          )}
        </div>
        {canWrite && onEdit && (
          <button className="btn btn-subtle" style={{ marginTop: 10, width: '100%', justifyContent: 'center', gap: 6 }} onClick={onEdit}>
            <Icon name="edit" size={16} /> Sửa metadata
          </button>
        )}
      </div>

      <div className="pvtabs">
        <div className="pvtab on">Thông tin</div>
        <div className="pvtab">Liên quan</div>
        <div className="pvtab">Lịch sử</div>
      </div>

      <div className="pv-meta">
        {meta.map(([k, v2]) => (
          <div className="mrow" key={k}>
            <span className="k">{k}</span>
            <span className="v">{v2}</span>
          </div>
        ))}
        <div className="mrow">
          <span className="k">Độ tin cậy metadata</span>
          <span className="v">
            {doc.conf ? (
              <span className="conf">
                <span className="conf-bar">
                  <i style={{ width: `${doc.conf.pct}%`, background: doc.conf.color }} />
                </span>
                {doc.conf.label}
              </span>
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="mrow"><span className="k">Nguồn metadata</span><span className="v">{doc.nguon}</span></div>
        <div className="mrow"><span className="k">File nguồn</span><span className="v">{doc.editable ? '✎ Có (.docx)' : '— Không có'}</span></div>
        {doc.thaythe && (
          <div className="mrow"><span className="k">Thay thế</span><span className="v">{doc.thaythe}</span></div>
        )}
        <div className="mrow" style={{ border: 0 }}>
          <span className="k">Tags</span>
          <span className="v row gap-1 wrap">
            {doc.tags.length ? doc.tags.map((t) => <span className="tag" key={t}>#{t}</span>) : '—'}
          </span>
        </div>
      </div>
    </aside>
  );
}
