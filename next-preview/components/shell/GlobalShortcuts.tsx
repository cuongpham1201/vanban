'use client';

import * as React from 'react';

// Phím tắt toàn cục cho khu vực DMS.
//   Ctrl+K / Cmd+K  → focus ô tìm kiếm:
//     - Ưu tiên #q (ô tìm kiếm chính của Trung tâm tìm kiếm) nếu đang ở /search.
//     - Nếu không có #q → focus #global-search trên AppBar.
//   preventDefault để không bị browser chiếm (address/search bar).
//   Hoạt động kể cả khi con trỏ đang ở trong input/textarea (vẫn re-focus + select).
export default function GlobalShortcuts(): React.ReactElement | null {
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const isK = e.key === 'k' || e.key === 'K';
      if (!isK || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) {
        return;
      }
      const target =
        (document.getElementById('q') as HTMLInputElement | null) ??
        (document.getElementById('global-search') as HTMLInputElement | null);
      if (!target) {
        return;
      }
      e.preventDefault();
      target.focus();
      try {
        target.select();
      } catch {
        /* một số input type không hỗ trợ select() — bỏ qua */
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}
