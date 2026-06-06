'use client';

import * as React from 'react';
import DocumentRow from './DocumentRow';
import { SearchDoc } from './searchTypes';

export type SortKey = 'relevance' | 'newest' | 'num';

// Cột danh sách kết quả — port từ SearchCenter.html .listcol/.listhead/.doclist.
export default function DocumentList({
  docs,
  total,
  selectedId,
  onSelect,
  onOpen,
  onQuick,
  sort,
  onSort,
}: {
  docs: SearchDoc[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen?: (id: string) => void;
  onQuick?: (id: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}): React.ReactElement {
  const sortItem = (key: SortKey, label: string): React.ReactElement => (
    <span
      style={{ cursor: 'pointer', color: sort === key ? 'var(--navy-600)' : undefined, fontWeight: sort === key ? 600 : undefined }}
      onClick={() => onSort(key)}
    >
      {label}
    </span>
  );

  return (
    <section className="listcol scrollbar">
      <div className="listhead">
        <div className="row gap-3">
          <span className="t-sm" style={{ fontWeight: 600 }}>Kết quả</span>
          <span className="t-xs mut">{total.toLocaleString('vi-VN')} văn bản</span>
        </div>
        <div className="row gap-2 t-xs mut">
          {sortItem('newest', 'Mới nhất')}·{sortItem('num', 'Số VB')}·{sortItem('relevance', 'Liên quan')}
        </div>
      </div>
      {docs.length === 0 ? (
        <div className="sc-empty">Không có văn bản nào khớp từ khoá / bộ lọc hiện tại.</div>
      ) : (
        <div className="doclist">
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} selected={d.id === selectedId} onSelect={onSelect} onOpen={onOpen} onQuick={onQuick} />
          ))}
        </div>
      )}
    </section>
  );
}
