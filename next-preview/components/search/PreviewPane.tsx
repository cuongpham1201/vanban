'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon from '@/components/shell/Icon';
import { SearchDoc } from './searchTypes';

// Khung xem nhanh bên phải — port từ sc-app.js renderPreview.
// Chưa có PDF viewer thật (mock trang văn bản). "Mở chi tiết" để Phase 3 (route /documents/[id]).
export default function PreviewPane({ doc, openHref }: { doc: SearchDoc | null; openHref?: string }): React.ReactElement {
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
          {doc.webUrl && (
            <a className="btn btn-gold" href={doc.webUrl} target="_blank" rel="noreferrer" title="Mở file trên SharePoint">
              <Icon name="download" />
            </a>
          )}
        </div>
      </div>

      <div className="pv-doc">
        <div className="docpage">
          <div className="gov">
            <b>CÔNG TY CỔ PHẦN BIA HẠ LONG</b>
            <br />
            {doc.donViPH}
            <br />
            —————
            <br />
            Số: {doc.num}
          </div>
          <div style={{ textAlign: 'center', margin: '14px 0' }}>
            <b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b>
            <br />
            Độc lập – Tự do – Hạnh phúc
          </div>
          <div style={{ textAlign: 'center', fontWeight: 700, margin: '16px 0 8px' }}>{doc.loaiPL.toUpperCase()}</div>
          <div style={{ textAlign: 'center', fontStyle: 'italic', marginBottom: 14 }}>V/v {doc.title.toLowerCase()}</div>
          <div style={{ lineHeight: 1.8, color: '#888' }}>
            {'▔'.repeat(46)}<br />{'▔'.repeat(44)}<br />{'▔'.repeat(46)}<br />{'▔'.repeat(40)}
          </div>
        </div>
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
