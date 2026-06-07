'use client';

import * as React from 'react';
import Icon, { IconName } from '@/components/shell/Icon';
import { SortKey, SORT_OPTIONS } from './searchTypes';

export type ViewMode = '3col' | 'list' | 'cards';

const MODES: { mode: ViewMode; label: string; icon: IconName }[] = [
  { mode: '3col', label: '3 cột', icon: 'cols' },
  { mode: 'list', label: 'Danh sách', icon: 'list' },
  { mode: 'cards', label: 'Lưới thẻ', icon: 'grid' },
];

// Sub-toolbar — count + sort dropdown (BUG#19, áp mọi view) + mode segments.
export default function SearchSubBar({
  count,
  mode,
  onMode,
  sort,
  onSort,
}: {
  count: number;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}): React.ReactElement {
  return (
    <div className="subbar">
      <h1>Trung tâm tìm kiếm</h1>
      <span className="badge badge-neutral">{count.toLocaleString('vi-VN')} văn bản</span>
      <div style={{ flex: 1 }} />
      <label className="sortbox" title="Sắp xếp kết quả">
        <span className="t-xs mut">Sắp xếp:</span>
        <select className="qf-select" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </label>
      <div className="seg" role="tablist">
        {MODES.map((m) => (
          <button key={m.mode} className={mode === m.mode ? 'on' : ''} onClick={() => onMode(m.mode)}>
            <Icon name={m.icon} />
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
