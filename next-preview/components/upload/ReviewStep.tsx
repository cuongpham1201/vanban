'use client';

import * as React from 'react';
import { UploadForm, SelectedFile, REVIEW_KEYS, FIELD_LABEL, computeWarnings } from './uploadTypes';
import { SearchDoc } from '@/components/replace/replaceTypes';

// Bước 3 — review summary + cảnh báo. KHÔNG gọi API.
export default function ReviewStep({
  form,
  file,
  editableFile,
  attachments = [],
  replaceTarget,
}: {
  form: UploadForm;
  file: SelectedFile | null;
  editableFile?: SelectedFile | null;
  attachments?: SelectedFile[];
  replaceTarget?: SearchDoc | null;
}): React.ReactElement {
  const warnings = computeWarnings(form, file);
  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h2 className="t-h2" style={{ margin: 0 }}>Kiểm tra trước khi xuất bản</h2>
      </div>
      <div className="rev-grid">
        {REVIEW_KEYS.map((k) => (
          <div className="rev" key={k}>
            <span className="k">{FIELD_LABEL[k]}</span>
            <span className="v">{form[k] || '—'}</span>
          </div>
        ))}
        <div className="rev full">
          <span className="k">1. PDF chính</span>
          <span className="v">{file ? `${file.name} · ${file.sizeKB.toLocaleString('vi-VN')} KB` : '— chưa chọn'}</span>
        </div>
        <div className="rev full">
          <span className="k">2. Bản mềm</span>
          <span className="v">{editableFile ? `${editableFile.name} · ${editableFile.sizeKB.toLocaleString('vi-VN')} KB` : (form.hasEditableSource && form.hasEditableSource !== 'Không' ? form.hasEditableSource : '— không có')}</span>
        </div>
        <div className="rev full">
          <span className="k">3. File đính kèm{attachments.length ? ` (${attachments.length})` : ''}</span>
          <span className="v">
            {attachments.length
              ? attachments.map((a) => `${a.name} · ${a.sizeKB.toLocaleString('vi-VN')} KB`).join('; ')
              : '— không có'}
          </span>
        </div>
        {replaceTarget && (
          <div className="rev full">
            <span className="k">Văn bản thay thế</span>
            <span className="v"><b style={{ fontFamily: 'var(--font-mono)' }}>{replaceTarget.num}</b> — {replaceTarget.title}</span>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="warnbox">
          <b className="t-sm" style={{ color: 'var(--warning-700)' }}>Cảnh báo thiếu thông tin</b>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="ai-note info" style={{ marginTop: 20 }}>
        <div className="ic">i</div>
        <div className="t-sm">
          Khi bấm <b>Xuất bản</b> (có quyền ghi), file sẽ được tải lên SharePoint. Nếu <b>Số văn bản</b> đã tồn tại,
          hệ thống chỉ <b>cảnh báo</b> — bạn có thể <b>Vẫn tạo mới</b> hoặc <b>chuyển sang Thay thế</b>.
        </div>
      </div>
    </>
  );
}
