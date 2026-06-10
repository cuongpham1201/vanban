import * as React from 'react';
import './ds.css';
import AppShell from '@/components/shell/AppShell';

// Layout cho nhóm route UI app/(dms)/* — chạy song song UI cũ ở "/".
export const metadata = {
  title: 'Quản lý văn bản',
};

export default function DmsLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <AppShell>{children}</AppShell>;
}
