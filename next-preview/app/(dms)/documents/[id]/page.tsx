import * as React from 'react';
import './document-detail.css';
import DocumentDetailPage from '@/components/document-detail/DocumentDetailPage';

// Route /documents/[id] — port từ dms-design/DocumentDetail.html. Read-only.
export const metadata = {
  title: 'Chi tiết văn bản · BHL - Văn bản điều hành',
};

// Next.js đã tự percent-decode route param → KHÔNG decode lại (tránh double-decode
// gây URIError với id chứa ký tự "%"). Truyền thẳng params.id.
export default function DocumentDetailRoute({ params }: { params: { id: string } }): React.ReactElement {
  return <DocumentDetailPage id={params.id} />;
}
