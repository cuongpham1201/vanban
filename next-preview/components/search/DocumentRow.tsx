'use client';

import * as React from 'react';
import { SearchDoc } from './searchTypes';

// 1 dòng kết quả — port từ sc-app.js rowHTML.
export default function DocumentRow({
  doc,
  selected,
  onSelect,
}: {
  doc: SearchDoc;
  selected: boolean;
  onSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <div className={`docrow ${selected ? 'sel' : ''}`} onClick={() => onSelect(doc.id)}>
      <div className="top">
        <div className={`ficon ${doc.type === 'doc' ? 'doc' : ''}`}>{doc.type === 'doc' ? 'DOC' : 'PDF'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-2" style={{ marginBottom: 2 }}>
            <span className="num">{doc.num}</span>
            {!doc.softcopy && (
              <span className="badge badge-danger" style={{ padding: '2px 7px' }}>Thiếu bản mềm</span>
            )}
            {doc.editable && <span className="tag" title="Có file nguồn chỉnh sửa">✎ nguồn</span>}
          </div>
          <h3>{doc.title}</h3>
        </div>
        <div className="rowbadges">
          <span className={`badge ${doc.statusClass}`}>{doc.statusLabel}</span>
          {doc.conf && (
            <span className="conf" title={`Độ tin cậy metadata: ${doc.conf.label} · ${doc.nguon}`}>
              <span className="conf-bar">
                <i style={{ width: `${doc.conf.pct}%`, background: doc.conf.color }} />
              </span>
              {doc.conf.label}
            </span>
          )}
        </div>
      </div>
      <div className="dmeta">
        <span>
          <b>{doc.donViPH}</b>
        </span>
        {doc.nguoiKy !== '—' && (
          <span>
            Ký: <b>{doc.nguoiKy}</b>
          </span>
        )}
        <span>{doc.ngayBH}</span>
        <span className={`badge ${doc.baomatClass}`}>
          <span className="dot" />
          {doc.baomat}
        </span>
        {doc.tags.map((t) => (
          <span className="tag" key={t}>
            #{t}
          </span>
        ))}
      </div>
    </div>
  );
}
