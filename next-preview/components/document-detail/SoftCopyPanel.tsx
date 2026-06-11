'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

const ACCEPT = '.docx,.doc,.xlsx,.xls,.pptx,.ppt';

// Tab "Bản mềm" — quản lý file nguồn chỉnh sửa (EditableSourceUrl). 0 hoặc 1 bản mềm.
export default function SoftCopyPanel({
  docId,
  editableSourceUrl,
  editableSourceName,
  canWrite,
  onChanged,
}: {
  docId: string;
  editableSourceUrl: string;
  editableSourceName: string;
  canWrite: boolean;
  onChanged: (msg?: string) => void;
}): React.ReactElement {
  const hasSoft = !!editableSourceUrl;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ext = (editableSourceName.split('.').pop() ?? 'doc').toUpperCase().slice(0, 4);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng file
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/editable-source`, {
        method: hasSoft ? 'PUT' : 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j?.error ?? `Thất bại (HTTP ${res.status}).`);
        return;
      }
      const base = hasSoft ? 'Đã thay thế bản mềm.' : 'Đã upload bản mềm.';
      onChanged(j.warning ? `${base} ${j.warning}` : base);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi mạng khi tải lên.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {hasSoft ? (
        <a className="attrow" href={editableSourceUrl} target="_blank" rel="noreferrer">
          <div className="ficon">{ext}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-sm" style={{ fontWeight: 600, wordBreak: 'break-word' }}>{editableSourceName || 'Bản mềm chỉnh sửa'}</div>
            <div className="t-2xs mut">File nguồn chỉnh sửa · bấm để tải xuống</div>
          </div>
          <Icon name="download" />
        </a>
      ) : (
        <div className="dd-empty">Chưa có bản mềm cho văn bản này.</div>
      )}

      {canWrite && (
        <div style={{ marginTop: 12 }}>
          <input ref={inputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => void onPick(e)} />
          <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={16} />
            <span style={{ marginLeft: 6 }}>{busy ? 'Đang tải lên…' : hasSoft ? 'Thay thế bản mềm' : 'Upload bản mềm'}</span>
          </button>
          <div className="t-2xs mut" style={{ marginTop: 6 }}>
            Chấp nhận .docx/.doc/.xlsx/.xls/.pptx/.ppt. Tên file tự đổi theo PDF chính; bản cũ được giữ lại dạng .verN.
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--danger-100)', color: 'var(--danger-700)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
