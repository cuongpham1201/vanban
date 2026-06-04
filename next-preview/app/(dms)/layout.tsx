import * as React from 'react';
import './ds.css';
import AppShell from '@/components/shell/AppShell';

// Layout cho nhóm route UI app/(dms)/* — chạy song song UI cũ ở "/".
export const metadata = {
  title: 'BHL - Văn bản điều hành',
};

export default function DmsLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <AppShell>{children}</AppShell>;
}
