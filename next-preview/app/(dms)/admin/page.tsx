import * as React from 'react';
import './admin.css';
import AdminCenterPage from '@/components/admin/AdminCenterPage';

// Route /admin — Admin Center V2, port pixel từ dms-design-full/Admin.html.
// UI ONLY: mock state local, KHÔNG kết nối SharePoint, KHÔNG API write. Menu "Quản trị"
// đã có sẵn trong SideNav (gated canWrite). Không đổi backend/auth/Search Center.
export const metadata = {
  title: 'Quản trị · Quản lý văn bản',
};

export default function AdminRoute(): React.ReactElement {
  return <AdminCenterPage />;
}
