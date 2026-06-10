import * as React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { canWriteDms } from '@/lib/dms/writeGuard';
import AccessDenied from '@/components/common/AccessDenied';
import './replace.css';
import ReplacePage from '@/components/replace/ReplacePage';

// Route /replace. #40: CHỈ render Replace Wizard khi có DMS write (canWriteDms — nguồn quyền duy nhất).
// Không có quyền → AccessDenied (không render wizard).
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Thay thế văn bản · Quản lý văn bản',
};

// Suspense bao quanh vì ReplacePage dùng useSearchParams() (đọc ?old=).
export default async function ReplaceRoute(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!canWriteDms(session)) {
    return <AccessDenied />;
  }
  return (
    <React.Suspense fallback={<div className="rp-root"><div className="wrap"><div className="rp-empty">Đang tải…</div></div></div>}>
      <ReplacePage />
    </React.Suspense>
  );
}
