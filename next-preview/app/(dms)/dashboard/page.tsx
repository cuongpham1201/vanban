import * as React from 'react';
import './dashboard.css';
import DashboardPage from '@/components/dashboard/DashboardPage';

// Trang chủ — Dashboard nghiệp vụ (read-only). Số liệu thật từ GET /api/documents.
export const metadata = {
  title: 'BHL - Văn bản điều hành',
};

export default function DashboardRoute(): React.ReactElement {
  return <DashboardPage />;
}
