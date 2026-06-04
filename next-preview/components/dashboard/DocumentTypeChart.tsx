'use client';

import * as React from 'react';
import { DistItem } from './dashboardTypes';

// Phân bố theo Loại VB pháp lý — bar chart thuần CSS (.bar) port từ Dashboard.html.
export default function DocumentTypeChart({ items, loading }: { items: DistItem[]; loading: boolean }): React.ReactElement {
  return (
    <div className="widget">
      <div className="whead"><h2>Phân bố theo loại văn bản</h2></div>
      <div className="wbody">
        {loading ? (
          <div className="db-empty">Đang tải…</div>
        ) : items.length === 0 ? (
          <div className="db-empty">Chưa có dữ liệu loại văn bản.</div>
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
