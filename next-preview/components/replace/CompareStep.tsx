'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { SearchDoc, COMPARE_ROWS } from './replaceTypes';

// So sánh song song văn bản cũ ↔ mới. UI port từ ReplaceDocument.html (.flow/.docbox/.arrow).
export default function CompareStep({
  oldDoc,
  newDoc,
}: {
  oldDoc: SearchDoc;
  newDoc: SearchDoc;
}): React.ReactElement {
  const box = (doc: SearchDoc, variant: 'old' | 'new', heading: string): React.ReactElement => (
    <div className={`docbox ${variant}`}>
      <div className="head">{heading}</div>
      <div className="body">
        {COMPARE_ROWS.map((r) => (
          <div className="rp-cmp-row" key={r.label}>
            <span className="rp-cmp-k">{r.label}</span>
            <span className="rp-cmp-v">{r.get(doc)}</span>
          </div>
        ))}
        <div className="rp-cmp-row">
          <span className="rp-cmp-k">Trạng thái</span>
          <span className="rp-cmp-v">
            <span className={`badge ${doc.statusClass}`} style={{ padding: '2px 7px' }}>{doc.statusLabel}</span>
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flow">
        {box(oldDoc, 'old', '① Văn bản bị thay thế (cũ)')}
        <div className="arrow"><Icon name="replace" /></div>
        {box(newDoc, 'new', '② Văn bản thay thế (mới)')}
      </div>

      <div className="rp-relation">
        <span className="tagk rp-tag-new">{newDoc.num}</span>
        <span className="mut">thay thế</span>
        <span className="tagk rp-tag-old">{oldDoc.num}</span>
      </div>
    </div>
  );
}
