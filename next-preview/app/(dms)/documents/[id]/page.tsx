import * as React from 'react';
import './document-detail.css';
import DocumentDetailPage from '@/components/document-detail/DocumentDetailPage';

// Route /documents/[id] — port từ dms-design/DocumentDetail.html. Read-only.
export const metadata = {
  title: 'Chi tiết văn bản · BHL DMS',
};

export default function DocumentDetailRoute({ params }: { params: { id: string } }): React.ReactElement {
  return <DocumentDetailPage id={decodeURIComponent(params.id)} />;
}
