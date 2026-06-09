'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

export interface FacetItem {
  value: string;
  count: number;
}
export interface FacetGroup {
  key: string;
  label: string;
  open: boolean;
  items: FacetItem[];
}

const MAX_VISIBLE = 8;

// Bộ lọc trái — port từ sc-app.js filter panel. Counts tính client-side (truyền vào).
export default function FilterPanel({
  groups,
  selected,
  onToggle,
  onClearAll,
}: {
  groups: FacetGroup[];
  selected: Record<string, Set<string>>;
  onToggle: (key: string, value: string) => void;
  onClearAll: () => void;
}): React.ReactElement {
  // Mặc định COLLAPSE tất cả nhóm (chỉ hiện header). Nhóm chỉ tự mở khi:
  //  - g.open = true (admin đặt "Mặc định mở"), hoặc
  //  - nhóm đang có filter active (vd mở từ link drill-down) → tiện cho user.
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.open || (selected[g.key]?.size ?? 0) > 0]))
  );
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleOpen = (k: string): void => setOpenMap((m) => ({ ...m, [k]: !m[k] }));
  const toggleExpand = (k: string): void => setExpanded((m) => ({ ...m, [k]: !m[k] }));

  return (
    <aside className="filters scrollbar">
      <div className="row between" style={{ marginBottom: 16 }}>
        <span className="t-eyebrow">Bộ lọc</span>
        <span
          className="t-xs"
          style={{ color: 'var(--navy-600)', fontWeight: 600, cursor: 'pointer' }}
          onClick={onClearAll}
        >
          Xoá tất cả
        </span>
      </div>

      {groups.map((g) => {
        const open = openMap[g.key];
        const sel = selected[g.key];
        const showAll = expanded[g.key];
        const items = showAll ? g.items : g.items.slice(0, MAX_VISIBLE);
        return (
          <div className="fgroup" key={g.key}>
            <div className="fhead" onClick={() => toggleOpen(g.key)}>
              {g.label}
              <span className="chev" style={{ transform: `rotate(${open ? 0 : -90}deg)` }}>
                <Icon name="chevdown" />
              </span>
            </div>
            {open && (
              <div className="fbody">
                {items.map((it) => (
                  <label className="frow" key={it.value}>
                    <input
                      type="checkbox"
                      checked={!!sel && sel.has(it.value)}
                      onChange={() => onToggle(g.key, it.value)}
                    />
                    <span>{it.value}</span>
                    <span className="n">{it.count.toLocaleString('vi-VN')}</span>
                  </label>
                ))}
                {g.items.length > MAX_VISIBLE && (
                  <div
                    className="t-xs"
                    style={{ color: 'var(--navy-600)', fontWeight: 600, cursor: 'pointer', marginTop: 6 }}
                    onClick={() => toggleExpand(g.key)}
                  >
                    {showAll ? 'Thu gọn' : `Xem thêm ${g.items.length - MAX_VISIBLE}…`}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
