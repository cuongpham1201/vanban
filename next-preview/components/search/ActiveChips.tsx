'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

export interface ActiveChip {
  key: string;
  value: string;
}

// Hàng chip bộ lọc đang áp dụng — port từ SearchCenter.html .activechips.
// BUG#14A: hiện chip "Từ khóa: xxx ×" khi có keyword (clear không xoá filter).
export default function ActiveChips({
  chips,
  onRemove,
  keyword,
  onClearKeyword,
}: {
  chips: ActiveChip[];
  onRemove: (key: string, value: string) => void;
  keyword?: string;
  onClearKeyword?: () => void;
}): React.ReactElement {
  return (
    <div className="activechips">
      <span className="t-xs mut" style={{ fontWeight: 600 }}>Bộ lọc:</span>
      {keyword ? (
        <span className="chip active" style={{ background: 'var(--gold-050)', borderColor: 'var(--gold-200)' }}>
          Từ khóa: {keyword}
          <span className="x" style={{ cursor: 'pointer' }} onClick={() => onClearKeyword?.()}>×</span>
        </span>
      ) : null}
      {chips.length === 0 && !keyword && <span className="t-xs mut">chưa có</span>}
      {chips.map((c) => (
        <span className="chip active" key={`${c.key}:${c.value}`}>
          {c.value}
          <span className="x" style={{ cursor: 'pointer' }} onClick={() => onRemove(c.key, c.value)}>
            ×
          </span>
        </span>
      ))}
      <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--gray-500)' }}>
        <Icon name="plus" /> Thêm bộ lọc
      </span>
      <button type="button" className="savefilter" title="Lưu bộ lọc">
        <Icon name="star" /> Lưu bộ lọc
      </button>
    </div>
  );
}
