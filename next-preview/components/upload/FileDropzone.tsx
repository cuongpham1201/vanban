'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { SelectedFile } from './uploadTypes';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx';

// Bước 1 — chọn file (KHÔNG upload thật). Hiển thị tên + size; UI preview only.
export default function FileDropzone({
  file,
  onFile,
  attachSource,
  onAttachToggle,
}: {
  file: SelectedFile | null;
  onFile: (f: SelectedFile | null) => void;
  attachSource: boolean;
  onAttachToggle: () => void;
}): React.ReactElement {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);

  const pick = (f: File | undefined): void => {
    if (!f) {
      return;
    }
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    onFile({ name: f.name, sizeKB: Math.max(1, Math.round(f.size / 1024)), ext });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="big">
          <Icon name="upload" />
        </div>
        <div className="t-h3" style={{ marginBottom: 4 }}>Kéo thả file vào đây hoặc bấm để chọn</div>
        <div className="t-sm mut">Hỗ trợ PDF, DOCX, XLSX · Tối đa 50 MB / file</div>
      </div>

      {file && (
        <div className="filecard">
          <div className={`ficon ${file.ext === 'pdf' ? '' : 'doc'}`}>{(file.ext || '?').toUpperCase().slice(0, 4)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-sm" style={{ fontWeight: 600 }}>{file.name}</div>
            <div className="t-2xs mut">{file.sizeKB.toLocaleString('vi-VN')} KB · đã chọn (chưa tải lên — UI preview)</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => onFile(null)}>Bỏ chọn</button>
        </div>
      )}

      <label
        style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, fontSize: 'var(--fs-sm)', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={attachSource}
          onChange={onAttachToggle}
          style={{ width: 16, height: 16, accentColor: 'var(--navy-600)' }}
        />
        <span>Đính kèm file nguồn chỉnh sửa (.docx) — giúp chuẩn hoá và tái sử dụng sau này</span>
      </label>
    </>
  );
}
