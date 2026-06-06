'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { SearchDoc } from './searchTypes';

// Chế độ lưới thẻ — port từ sc-app.js grid.innerHTML. Click thẻ → chọn + (mở 3 cột do orchestrator xử lý).
export default function CardGrid({
  docs,
  onSelect,
  onOpen,
  onQuick,
}: {
  docs: SearchDoc[];
  onSelect: (id: string) => void;
  onOpen?: (id: string) => void;
  onQuick?: (id: string) => void;
}): React.ReactElement {
  return (
    <section className="listcol scrollbar">
      {docs.length === 0 ? (
        <div className="sc-empty">Không có văn bản nào khớp từ khoá / bộ lọc hiện tại.</div>
      ) : (
        <div className="cardgrid">
          {docs.map((d) => (
            <div
              className="dcard"
              key={d.id}
              onClick={() => onSelect(d.id)}
              onDoubleClick={() => (onOpen ?? onSelect)(d.id)}
              title="Nhấn đúp để mở chi tiết"
            >
              {onQuick && d.type === 'pdf' && (
                <button
                  type="button"
                  className="rowquick dcard-quick"
                  title="Xem nhanh PDF"
                  aria-label="Xem nhanh PDF"
                  onClick={(e) => { e.stopPropagation(); onQuick(d.id); }}
                >
                  <Icon name="search" size={14} />
                </button>
              )}
              <div className="thumb">
                <div className="mini" />
              </div>
              <div className="body">
                <div className="row gap-2" style={{ marginBottom: 6 }}>
                  <span
                    className="num"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--navy-600)' }}
                  >
                    {d.num}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--fs-sm)', fontWeight: 600, lineHeight: 1.3, marginBottom: 10,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}
                >
                  {d.title}
                </div>
                <div className="row between">
                  <span className="t-2xs mut">{d.donViPH}</span>
                  <span className={`badge ${d.statusClass}`}>{d.statusLabel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
