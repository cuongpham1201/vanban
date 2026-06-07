'use client';

import * as React from 'react';
import { FIELDS, UploadForm } from './uploadTypes';

// Bước 2 — form metadata V2 (UI). Choices: ưu tiên dynamicChoices (schema SharePoint thật)
// rồi mới fallback FIELDS (FALLBACK_METADATA_CHOICES).
export default function MetadataForm({
  form,
  onChange,
  dynamicChoices,
}: {
  form: UploadForm;
  onChange: (k: keyof UploadForm, v: string) => void;
  dynamicChoices?: Partial<Record<keyof UploadForm, string[]>>;
}): React.ReactElement {
  const choicesFor = (f: { key: keyof UploadForm; choices?: string[] }): string[] => {
    const dyn = dynamicChoices?.[f.key];
    return dyn && dyn.length > 0 ? dyn : f.choices ?? [];
  };
  return (
    <>
      {/* BUG#18: ẩn box AI/OCR (chưa có chức năng thật). */}
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
                {choicesFor(f).map((c) => (
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
