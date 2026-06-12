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

// A6: trạng thái upload từng file (hiển thị tiến trình + thành công/thất bại).
type UploadStatus = 'uploading' | 'done' | 'error';
interface UploadItem {
  name: string;
  status: UploadStatus;
  error?: string;
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
  const [uploads, setUploads] = React.useState<UploadItem[]>([]); // A6: trạng thái upload từng file
  const [drag, setDrag] = React.useState(false);
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

  // A6: upload NHIỀU file TUẦN TỰ (queue) — tránh đua tạo folder Attachments/<SoVanBan> (409).
  // Cập nhật trạng thái từng file; cuối cùng refresh danh sách (không cần F5).
  const uploadFiles = React.useCallback(
    async (files: File[]): Promise<void> => {
      if (!files.length) {
        return;
      }
      setError(null);
      setBusy(true);
      setUploads(files.map((f) => ({ name: f.name, status: 'uploading' as UploadStatus })));
      let okCount = 0;
      for (let i = 0; i < files.length; i++) {
        try {
          const fd = new FormData();
          fd.append('file', files[i]);
          fd.append('soVanBan', soVanBan);
          const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/attachments`, {
            method: 'POST',
            body: fd,
            credentials: 'same-origin',
          });
          const j = await res.json();
          if (res.ok && j.ok) {
            okCount++;
            setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, status: 'done' } : u)));
          } else {
            const msg = j?.error ?? `HTTP ${res.status}`;
            setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, status: 'error', error: msg } : u)));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Lỗi mạng';
          setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, status: 'error', error: msg } : u)));
        }
      }
      setBusy(false);
      await load();
      onChanged(
        okCount === files.length
          ? `Đã thêm ${okCount} file đính kèm.`
          : `Đã thêm ${okCount}/${files.length} file đính kèm — xem chi tiết lỗi bên dưới.`
      );
    },
    [docId, soVanBan, load, onChanged]
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void uploadFiles(files);
  };

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDrag(false);
    if (!canWrite || busy) {
      return;
    }
    void uploadFiles(Array.from(e.dataTransfer.files ?? []));
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
          <input ref={inputRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={onPick} />
          <div
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            style={{
              border: `1.5px dashed ${drag ? 'var(--navy-400)' : 'var(--gray-300)'}`,
              background: drag ? 'var(--navy-050)' : 'transparent',
              borderRadius: 'var(--r-md)', padding: '12px', textAlign: 'center', transition: 'background .12s, border-color .12s',
            }}
          >
            <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Icon name="plus" size={16} />
              <span style={{ marginLeft: 6 }}>{busy ? 'Đang tải lên…' : 'Thêm file đính kèm'}</span>
            </button>
            <div className="t-2xs mut" style={{ marginTop: 8 }}>Chọn nhiều file hoặc kéo-thả vào đây.</div>
          </div>

          {uploads.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {uploads.map((u, i) => (
                <div key={`${u.name}-${i}`} className="t-2xs" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flexShrink: 0, width: 14, textAlign: 'center', color: u.status === 'done' ? 'var(--success-600, #16794c)' : u.status === 'error' ? 'var(--danger-600, #c0362c)' : 'var(--gray-500)' }}>
                    {u.status === 'done' ? '✓' : u.status === 'error' ? '✕' : '…'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.name}>{u.name}</span>
                  <span style={{ flexShrink: 0, color: u.status === 'error' ? 'var(--danger-600, #c0362c)' : 'var(--gray-500)' }}>
                    {u.status === 'uploading' ? 'đang tải…' : u.status === 'done' ? 'xong' : (u.error ?? 'lỗi')}
                  </span>
                </div>
              ))}
            </div>
          )}
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
