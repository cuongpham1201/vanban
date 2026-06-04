'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

// Ô tìm kiếm lớn — port từ SearchCenter.html .bigsearch. Ctrl/Cmd K focus vào input này
// (xử lý ở GlobalShortcuts qua id="q").
export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div className="bigsearch">
      <Icon name="search" />
      <input
        id="q"
        aria-label="Tìm kiếm văn bản"
        placeholder="Tìm theo trích yếu, số văn bản, người ký, tags…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span
        className="kbd"
        style={{
          fontSize: 'var(--fs-2xs)', color: 'var(--gray-400)', background: 'var(--gray-100)',
          padding: '3px 7px', borderRadius: 'var(--r-xs)',
        }}
      >
        Ctrl K
      </span>
    </div>
  );
}
