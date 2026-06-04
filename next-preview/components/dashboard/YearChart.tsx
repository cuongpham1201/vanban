'use client';

import * as React from 'react';
import { DistItem } from './dashboardTypes';

// Phân bố theo Năm ban hành — bar chart thuần CSS.
export default function YearChart({ items, loading }: { items: DistItem[]; loading: boolean }): React.ReactElement {
  return (
    <div className="widget">
      <div className="whead"><h2>Phân bố theo năm ban hành</h2></div>
      <div className="wbody">
        {loading ? (
          <div className="db-empty">Đang tải…</div>
        ) : items.length === 0 ? (
          <div className="db-empty">Chưa có dữ liệu năm ban hành.</div>
        ) : (
          items.map((it) => (
            <div className="bar" key={it.label}>
              <div className="lbl" title={it.label}>{it.label}</div>
              <div className="track"><i style={{ width: `${it.pct}%` }} /></div>
              <div className="v">{it.count.toLocaleString('vi-VN')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
