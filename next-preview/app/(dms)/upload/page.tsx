import * as React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { canWriteDms } from '@/lib/dms/writeGuard';
import AccessDenied from '@/components/common/AccessDenied';
import './upload-wizard.css';
import UploadWizardPage from '@/components/upload/UploadWizardPage';

// Route /upload. #40: CHỈ render Upload Wizard khi có DMS write (canWriteDms — nguồn quyền duy nhất).
// Không có quyền → AccessDenied (không render wizard/form).
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Tải lên văn bản · Quản lý văn bản',
};

export default async function UploadRoute(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!canWriteDms(session)) {
    return <AccessDenied />;
  }
  return <UploadWizardPage />;
}
