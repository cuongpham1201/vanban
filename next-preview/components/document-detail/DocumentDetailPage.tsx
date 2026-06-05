'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { IDocument } from '@dms/models/IDocument';
import { toDetailDoc } from './documentDetailTypes';
import DocumentHeader from './DocumentHeader';
import DocumentPreview from './DocumentPreview';
import MetadataPanel from './MetadataPanel';
import EditMetadataDrawer from './EditMetadataDrawer';

interface DetailResponse {
  ok: boolean;
  document?: IDocument;
  error?: string;
}

// Trang chi tiết — gọi GET /api/documents/[id] (read-only, server tìm trong cache dùng chung).
// Không fetch-all rồi find client-side nữa. Phase 4.5 data wiring.
export default function DocumentDetailPage({ id }: { id: string }): React.ReactElement {
  const searchParams = useSearchParams();
  // returnUrl = URL kết quả tìm kiếm (đã encode) để "Quay lại kết quả"; chỉ chấp nhận path nội bộ.
  const rawReturn = searchParams.get('returnUrl');
  const returnUrl = rawReturn && rawReturn.startsWith('/') ? rawReturn : undefined;
  const [doc, setDoc] = React.useState<IDocument | null>(null);
  const [status, setStatus] = React.useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [error, setError] = React.useState<string | undefined>();
  const [canWrite, setCanWrite] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const r = await fetch(`/api/documents/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
      const j = (await r.json()) as DetailResponse;
      if (r.status === 404) {
        setStatus('notfound');
        return;
      }
      if (!r.ok || !j.ok || !j.document) {
        throw new Error(j?.error ?? `Lỗi tải dữ liệu (HTTP ${r.status}).`);
      }
      setDoc(j.document);
      setStatus('ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [id]);

  React.useEffect(() => {
    setStatus('loading');
    void load();
  }, [load]);

  // Quyền sửa metadata (flag + allowlist). Nút "Sửa metadata" chỉ hiện khi canWrite.
  React.useEffect(() => {
    let alive = true;
    fetch('/api/dms/write-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => alive && setCanWrite(!!j?.canWrite))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (status === 'error') {
    return (
      <div className="dd-root">
        <div className="dd-empty" style={{ padding: 24, color: 'var(--danger-700)' }}>Không tải được dữ liệu: {error}</div>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <div className="dd-root">
        <div className="dd-empty" style={{ padding: 24 }}>Đang tải văn bản…</div>
      </div>
    );
  }
  if (status === 'notfound' || !doc) {
    return (
      <div className="dd-root">
        <div className="dd-empty" style={{ padding: 24 }}>
          Không tìm thấy văn bản có id <b>{id}</b>.
        </div>
      </div>
    );
  }
  const detail = toDetailDoc(doc);
  return (
    <div className="dd-root">
      <DocumentHeader doc={detail} returnUrl={returnUrl} canWrite={canWrite} onEdit={() => setEditing(true)} />
      <div className="split">
        <DocumentPreview doc={detail} />
        <MetadataPanel doc={detail} />
      </div>

      {editing && (
        <EditMetadataDrawer
          doc={doc}
          onClose={() => setEditing(false)}
          onSaved={(warn) => {
            setEditing(false);
            setToast(warn ? `Đã lưu metadata. ${warn}` : 'Đã lưu metadata.');
            void load();
            window.setTimeout(() => setToast(null), 4000);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
            background: 'var(--navy-700)', color: '#fff', padding: '10px 18px', borderRadius: 'var(--r-md)',
            boxShadow: 'var(--sh-2, 0 8px 24px -8px rgba(0,0,0,.3))', fontSize: 'var(--fs-sm)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
