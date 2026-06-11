'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';

interface AttachmentInfo {
  id: string;
  name: string;
  ext: string;
  sizeKB?: number;
  webUrl: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv,.zip';

function fmtSize(kb?: number): string {
  if (kb == null) {
    return '';
  }
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}
function fmtWhen(iso?: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

// Tab "File đính kèm" — tài liệu bổ trợ (nhiều file), lưu ở subfolder Attachments/<SoVanBan>.
export default function AttachmentsPanel({
  docId,
  soVanBan,
  canWrite,
  onChanged,
}: {
  docId: string;
  soVanBan: string;
  canWrite: boolean;
  onChanged: (msg?: string) => void;
}): React.ReactElement {
  const [items, setItems] = React.useState<AttachmentInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const qs = `?soVanBan=${encodeURIComponent(soVanBan)}`;

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const r = await fetch(`/api/documents/${encodeURIComponent(docId)}/attachments${qs}`, { credentials: 'same-origin' });
      const j = await r.json();
      if (r.ok && j.ok) {
        setItems(j.attachments ?? []);
        setError(null);
      } else {
        setError(j?.error ?? 'Không tải được danh sách đính kèm.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi mạng.');
    } finally {
      setLoading(false);
    }
  }, [docId, qs]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('soVanBan', soVanBan);
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/attachments`, {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j?.error ?? `Thêm thất bại (HTTP ${res.status}).`);
        return;
      }
      await load();
      onChanged('Đã thêm file đính kèm.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi mạng khi tải lên.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (att: AttachmentInfo): Promise<void> => {
    if (!window.confirm(`Gỡ file đính kèm "${att.name}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/documents/${encodeURIComponent(docId)}/attachments/${encodeURIComponent(att.id)}${qs}`,
        { method: 'DELETE', credentials: 'same-origin' }
      );
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j?.error ?? `Gỡ thất bại (HTTP ${res.status}).`);
        return;
      }
      await load();
      onChanged('Đã gỡ file đính kèm.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi mạng khi gỡ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {canWrite && (
        <div style={{ marginBottom: 12 }}>
          <input ref={inputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => void onPick(e)} />
          <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Icon name="plus" size={16} />
            <span style={{ marginLeft: 6 }}>{busy ? 'Đang xử lý…' : 'Thêm file đính kèm'}</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="dd-empty">Đang tải danh sách đính kèm…</div>
      ) : items.length === 0 ? (
        <div className="dd-empty">Chưa có file đính kèm.</div>
      ) : (
        items.map((att) => (
          <div className="attrow" key={att.id}>
            <div className="ficon">{(att.ext || 'file').toUpperCase().slice(0, 4)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={att.webUrl} target="_blank" rel="noreferrer" className="t-sm" style={{ fontWeight: 600, wordBreak: 'break-word', textDecoration: 'none', color: 'var(--ink)' }}>
                {att.name}
              </a>
              <div className="t-2xs mut">
                {[fmtSize(att.sizeKB), att.uploadedBy, fmtWhen(att.uploadedAt)].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <a className="btn btn-ghost btn-icon" href={att.webUrl} target="_blank" rel="noreferrer" title="Tải xuống" aria-label="Tải xuống">
              <Icon name="download" size={16} />
            </a>
            {canWrite && (
              <button className="btn btn-ghost btn-icon" disabled={busy} title="Gỡ" aria-label="Gỡ" onClick={() => void remove(att)}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
        ))
      )}

      {error && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--danger-100)', color: 'var(--danger-700)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
