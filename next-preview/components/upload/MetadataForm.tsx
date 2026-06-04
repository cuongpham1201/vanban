'use client';

import * as React from 'react';
import { FIELDS, UploadForm } from './uploadTypes';

// Bước 2 — form metadata V2 (UI). Choices reuse FALLBACK_METADATA_CHOICES qua FIELDS.
export default function MetadataForm({
  form,
  onChange,
}: {
  form: UploadForm;
  onChange: (k: keyof UploadForm, v: string) => void;
}): React.ReactElement {
  return (
    <>
      <div className="ai-note">
        <div className="ic">AI</div>
        <div>
          <div className="t-sm" style={{ fontWeight: 600, marginBottom: 2 }}>Nhập / kiểm tra metadata</div>
          <div className="t-xs mut">
            Bản preview nhập tay. Tự động trích xuất (OCR/AI) + độ tin cậy theo từng trường sẽ có ở Phase 5.
          </div>
        </div>
      </div>

      <div className="fgrid">
        {FIELDS.map((f) => (
          <div className={f.full ? 'full' : ''} key={f.key}>
            <div className="lblrow">
              <span className="field-label" style={{ margin: 0 }}>
                {f.label}
                {f.required ? ' *' : ''}
              </span>
            </div>
            {f.type === 'select' ? (
              <select className="select" value={form[f.key]} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">— Chọn —</option>
                {f.choices?.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                className="textarea"
                rows={2}
                value={form[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : (
              <input
                className="input"
                type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                value={form[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
