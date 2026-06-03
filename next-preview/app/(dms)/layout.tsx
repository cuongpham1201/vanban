import * as React from 'react';
import './ds.css';
import AppShell from '@/components/shell/AppShell';

// Layout cho nhóm route UI mới app/(dms)/* — chạy SONG SONG UI cũ ở "/".
// Phase 1: chỉ dựng shell + design system (ds.css). Các trang nội dung làm ở Phase 2-7.
export const metadata = {
  title: 'BHL DMS',
};

export default function DmsLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <AppShell>{children}</AppShell>;
}
