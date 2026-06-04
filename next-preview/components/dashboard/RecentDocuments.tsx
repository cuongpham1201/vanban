'use client';

import * as React from 'react';
import Link from 'next/link';
import { RecentDoc } from './dashboardTypes';

// Văn bản mới nhất (Top 10) — port .li từ Dashboard.html. Mỗi dòng mở chi tiết.
export default function RecentDocuments({ docs, loading }: { docs: RecentDoc[]; loading: boolean }): React.ReactElement {
  return (
    <div className="widget">
      <div className="whead">
        <h2>Văn bản mới nhất</h2>
        <Link href="/search">Xem tất cả →</Link>
      </div>
      <div className="wbody">
        {loading ? (
          <div className="db-empty">Đang tải…</div>
        ) : docs.length === 0 ? (
          <div className="db-empty">Chưa có văn bản.</div>
        ) : (
          docs.map((d) => (
            <Link className="li" key={d.id} href={`/documents/${encodeURIComponent(d.id)}`} style={{ textDecoration: 'none' }}>
              <div className={`ficon ${d.type === 'doc' ? 'doc' : ''}`}>{d.type.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="num">{d.num}</div>
                <div className="ti">{d.title}</div>
              </div>
              <div className="sub" style={{ textAlign: 'right' }}>
                <div>{d.donVi}</div>
                <div>{d.ngayBH}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
