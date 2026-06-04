'use client';

import * as React from 'react';
import { DetailDoc } from './documentDetailTypes';

// Liên quan — từ VanBanLienQuan (text V2). Không có → fallback.
export default function RelatedDocuments({ doc }: { doc: DetailDoc }): React.ReactElement {
  if (!doc.relatedList.length) {
    return <div className="dd-empty">Chưa có văn bản liên quan.</div>;
  }
  return (
    <>
      <div className="t-xs mut" style={{ fontWeight: 600, marginBottom: 10 }}>Văn bản liên quan</div>
      {doc.relatedList.map((r, i) => (
        <div className="relrow" key={`${r}-${i}`}>
          <div className="ficon">DOC</div>
          <div style={{ flex: 1 }}>
            <div className="num">{r}</div>
          </div>
        </div>
      ))}
    </>
  );
}
