import * as React from 'react';
import DashboardLanding from '@/components/dashboard/DashboardLanding';

// Trang chủ khu vực điều hành — landing nhẹ (quick actions + KPI tóm tắt).
// KPI lấy từ GET /api/dashboard (aggregate nhẹ, read-only); degrade về placeholder nếu lỗi.
export const metadata = {
  title: 'BHL - Văn bản điều hành',
};

export default function DashboardPage(): React.ReactElement {
  return <DashboardLanding />;
}
