'use client';

import * as React from 'react';
import Link from 'next/link';
import { DistItem } from './dashboardTypes';

// Phân bố theo Năm ban hành — bar chart. Bar click → drill-down search (BUG#11).
export default function YearChart({ items, loading, hrefFor }: { items: DistItem[]; loading: boolean; hrefFor?: (label: string) => string }): React.ReactElement {
  return (
    <div className="widget">
      <div className="whead"><h2>Phân bố theo năm ban hành</h2></div>
      <div className="wbody">
        {loading ? (
          <div className="db-empty">Đang tải…</div>
        ) : items.length === 0 ? (
          <div className="db-empty">Chưa có dữ liệu năm ban hành.</div>
        ) : (
          items.map((it) => {
            const href = hrefFor?.(it.label);
            const inner = (
              <>
                <div className="lbl" title={it.label}>{it.label}</div>
                <div className="track"><i style={{ width: `${it.pct}%` }} /></div>
                <div className="v">{it.count.toLocaleString('vi-VN')}</div>
              </>
            );
            return href ? (
              <Link className="bar bar-link" key={it.label} href={href} title={`Lọc: ${it.label}`}>{inner}</Link>
            ) : (
              <div className="bar" key={it.label}>{inner}</div>
            );
          })
        )}
      </div>
    </div>
  );
}
