'use client';

import * as React from 'react';
import DocumentRow from './DocumentRow';
import { SearchDoc } from './searchTypes';

// Cột danh sách kết quả. Sort đã chuyển lên SearchSubBar (BUG#19).
export default function DocumentList({
  docs,
  total,
  selectedId,
  onSelect,
  onOpen,
  onQuick,
  onPrefetch,
}: {
  docs: SearchDoc[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen?: (id: string) => void;
  onQuick?: (id: string) => void;
  onPrefetch?: (id: string) => void;
}): React.ReactElement {
  return (
    <section className="listcol scrollbar">
      <div className="listhead">
        <div className="row gap-3">
          <span className="t-sm" style={{ fontWeight: 600 }}>Kết quả</span>
          <span className="t-xs mut">{total.toLocaleString('vi-VN')} văn bản</span>
        </div>
      </div>
      {docs.length === 0 ? (
        <div className="sc-empty">Không có văn bản nào khớp từ khoá / bộ lọc hiện tại.</div>
      ) : (
        <div className="doclist">
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} selected={d.id === selectedId} onSelect={onSelect} onOpen={onOpen} onQuick={onQuick} onPrefetch={onPrefetch} />
          ))}
        </div>
      )}
    </section>
  );
}
