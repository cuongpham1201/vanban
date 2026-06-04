'use client';

import * as React from 'react';
import Icon, { IconName } from '@/components/shell/Icon';

export type ViewMode = '3col' | 'list' | 'cards';

const MODES: { mode: ViewMode; label: string; icon: IconName }[] = [
  { mode: '3col', label: '3 cột', icon: 'cols' },
  { mode: 'list', label: 'Danh sách', icon: 'list' },
  { mode: 'cards', label: 'Lưới thẻ', icon: 'grid' },
];

// Sub-toolbar — port từ SearchCenter.html .subbar + #modeSeg.
export default function SearchSubBar({
  count,
  mode,
  onMode,
}: {
  count: number;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
}): React.ReactElement {
  return (
    <div className="subbar">
      <h1>Trung tâm tìm kiếm</h1>
      <span className="badge badge-neutral">{count.toLocaleString('vi-VN')} văn bản</span>
      <div style={{ flex: 1 }} />
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
