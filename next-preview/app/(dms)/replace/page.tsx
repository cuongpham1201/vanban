import * as React from 'react';
import './replace.css';
import ReplacePage from '@/components/replace/ReplacePage';

// Route /replace — port từ dms-design/ReplaceDocument.html. UI ONLY, read-only.
export const metadata = {
  title: 'Thay thế văn bản · BHL - Văn bản điều hành',
};

// Suspense bao quanh vì ReplacePage dùng useSearchParams() (đọc ?old=).
export default function ReplaceRoute(): React.ReactElement {
  return (
    <React.Suspense fallback={<div className="rp-root"><div className="wrap"><div className="rp-empty">Đang tải…</div></div></div>}>
      <ReplacePage />
    </React.Suspense>
  );
}
