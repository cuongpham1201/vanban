import * as React from 'react';
import './search.css';
import SearchCenterPage from '@/components/search/SearchCenterPage';

// Route /search — port từ dms-design/SearchCenter.html. Dữ liệu thật qua /api/documents.
export const metadata = {
  title: 'Trung tâm tìm kiếm · Quản lý văn bản',
};

// Suspense bao quanh SearchCenterPage vì component dùng useSearchParams() (đọc ?q=).
export default function SearchRoute(): React.ReactElement {
  return (
    <React.Suspense fallback={<div className="sc-root"><div className="sc-empty">Đang tải…</div></div>}>
      <SearchCenterPage />
    </React.Suspense>
  );
}
