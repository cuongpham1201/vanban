'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

export interface ActiveChip {
  key: string;
  value: string;
}

// Hàng chip bộ lọc đang áp dụng — port từ SearchCenter.html .activechips.
export default function ActiveChips({
  chips,
  onRemove,
}: {
  chips: ActiveChip[];
  onRemove: (key: string, value: string) => void;
}): React.ReactElement {
  return (
    <div className="activechips">
      <span className="t-xs mut" style={{ fontWeight: 600 }}>Bộ lọc:</span>
      {chips.length === 0 && <span className="t-xs mut">chưa có</span>}
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
