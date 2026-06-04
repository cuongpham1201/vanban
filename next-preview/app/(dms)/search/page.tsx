import * as React from 'react';
import './search.css';
import SearchCenterPage from '@/components/search/SearchCenterPage';

// Route /search — port từ dms-design/SearchCenter.html. Dữ liệu thật qua /api/documents.
export const metadata = {
  title: 'Trung tâm tìm kiếm · BHL DMS',
};

export default function SearchRoute(): React.ReactElement {
  return <SearchCenterPage />;
}
