import * as React from 'react';
import './document-detail.css';
import DocumentDetailPage from '@/components/document-detail/DocumentDetailPage';

// Route /documents/[id] — port từ dms-design/DocumentDetail.html. Read-only.
export const metadata = {
  title: 'Chi tiết văn bản · Quản lý văn bản',
};

// Next.js đã tự percent-decode route param → KHÔNG decode lại (tránh double-decode
// gây URIError với id chứa ký tự "%"). Truyền thẳng params.id.
// Suspense vì DocumentDetailPage dùng useSearchParams() (đọc returnUrl).
export default function DocumentDetailRoute({ params }: { params: { id: string } }): React.ReactElement {
  return (
    <React.Suspense fallback={<div className="dd-root"><div className="dd-empty" style={{ padding: 24 }}>Đang tải…</div></div>}>
      <DocumentDetailPage id={params.id} />
    </React.Suspense>
  );
}
