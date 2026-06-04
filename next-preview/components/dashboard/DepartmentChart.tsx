'use client';

import * as React from 'react';
import { DistItem } from './dashboardTypes';

// Top đơn vị phát hành nhiều văn bản nhất — bar chart thuần CSS.
export default function DepartmentChart({ items, loading }: { items: DistItem[]; loading: boolean }): React.ReactElement {
  return (
    <div className="widget">
      <div className="whead"><h2>Top đơn vị phát hành</h2></div>
      <div className="wbody">
        {loading ? (
          <div className="db-empty">Đang tải…</div>
        ) : items.length === 0 ? (
          <div className="db-empty">Chưa có dữ liệu đơn vị.</div>
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
