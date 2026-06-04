'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { DetailDoc } from './documentDetailTypes';

// Khu vực xem PDF — PLACEHOLDER đúng design (KHÔNG iframe). PDF viewer thật sẽ làm sau;
// bấm Tải xuống/Mở file để xem PDF gốc trên SharePoint.
export default function DocumentPreview({ doc }: { doc: DetailDoc }): React.ReactElement {
  return (
    <section className="viewer">
      <div className="vtoolbar">
        <span>Bản xem trước minh hoạ</span>
        <div style={{ flex: 1 }} />
        {doc.webUrl && (
          <a className="iconbtn" href={doc.webUrl} target="_blank" rel="noreferrer" title="Tải xuống / mở file gốc">
            <Icon name="download" />
          </a>
        )}
      </div>
      <div className="vscroll scrollbar">
        <div className="pdfpage">
          <div className="gov" style={{ fontSize: 11 }}>
            <b>CÔNG TY CỔ PHẦN BIA HẠ LONG</b>
            <br />
            {doc.donViPH}
            <br />
            —————
            <br />
            <b>Số: {doc.num}</b>
          </div>
          <div className="gov" style={{ margin: '18px 0' }}>
            <b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b>
            <br />
            Độc lập – Tự do – Hạnh phúc
          </div>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, margin: '22px 0 6px' }}>
            {doc.loaiPL.toUpperCase()}
          </div>
          <div style={{ textAlign: 'center', fontStyle: 'italic', marginBottom: 20 }}>V/v {doc.title.toLowerCase()}</div>
          <div className="ln" style={{ width: '100%' }} />
          <div className="ln" style={{ width: '96%' }} />
          <div className="ln" style={{ width: '88%' }} />
          <div className="ln" style={{ width: '100%' }} />
          <div className="ln" style={{ width: '72%' }} />
        </div>
        <div className="vnote">PDF viewer thật sẽ làm sau — bấm Tải xuống/Mở file để xem PDF gốc.</div>
      </div>
    </section>
  );
}
