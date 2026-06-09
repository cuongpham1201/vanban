'use client';

import * as React from 'react';

// Nguồn quyền DUY NHẤT phía client cho DMS write: GET /api/dms/write-status → canWrite
// (server tính bằng canWriteDms = DMS_WRITE_ENABLED + DMS_WRITE_ALLOWED_EMAILS). KHÔNG hardcode email,
// KHÔNG lặp lại logic phân quyền — mọi component dùng chung hook này.
// Trả: null = đang tải (chưa biết) · false = không có quyền · true = có quyền.
export function useDmsWrite(): boolean | null {
  const [canWrite, setCanWrite] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch('/api/dms/write-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setCanWrite(!!j?.canWrite);
      })
      .catch(() => {
        if (alive) setCanWrite(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return canWrite;
}
