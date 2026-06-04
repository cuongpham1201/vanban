'use client';

import * as React from 'react';
import { UploadForm, SelectedFile, REVIEW_KEYS, FIELD_LABEL, computeWarnings } from './uploadTypes';

// Bước 3 — review summary + cảnh báo. KHÔNG gọi API.
export default function ReviewStep({ form, file }: { form: UploadForm; file: SelectedFile | null }): React.ReactElement {
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
        <div className="rev">
          <span className="k">File chính</span>
          <span className="v">{file ? `${file.name} · ${file.sizeKB.toLocaleString('vi-VN')} KB` : '— chưa chọn'}</span>
        </div>
        <div className="rev">
          <span className="k">Có bản mềm</span>
          <span className="v">{form.hasEditableSource || '—'}</span>
        </div>
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
          Gợi ý “đánh dấu thay thế văn bản cũ” sẽ có ở Phase 5/6 (sau khi bật write). Đây là bản xem trước UI —
          <b> chưa ghi SharePoint</b>.
        </div>
      </div>
    </>
  );
}
