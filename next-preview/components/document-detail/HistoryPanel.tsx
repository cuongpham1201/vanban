'use client';

import * as React from 'react';

// Lịch sử — CHƯA có nguồn dữ liệu thật (version history SharePoint). Fallback an toàn, không fake.
export default function HistoryPanel(): React.ReactElement {
  return (
    <div className="dd-empty">
      Lịch sử thay đổi chưa có dữ liệu. Sẽ bổ sung từ version history của SharePoint ở phase sau.
    </div>
  );
}
