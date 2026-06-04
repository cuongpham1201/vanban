import * as React from 'react';
import './upload-wizard.css';
import UploadWizardPage from '@/components/upload/UploadWizardPage';

// Route /upload — port từ dms-design/UploadWizard.html. UI ONLY (không ghi SharePoint).
export const metadata = {
  title: 'Tải lên văn bản · BHL DMS',
};

export default function UploadRoute(): React.ReactElement {
  return <UploadWizardPage />;
}
