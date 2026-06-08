'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IDocument } from '@dms/models/IDocument';
import { toDetailDoc } from './documentDetailTypes';
import DocumentHeader from './DocumentHeader';
import DocumentPreview from './DocumentPreview';
import MetadataPanel, { DetailTab } from './MetadataPanel';
import EditMetadataDrawer from './EditMetadataDrawer';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { deleteDocument } from '@/lib/dms/deleteClient';

interface DetailResponse {
  ok: boolean;
  document?: IDocument;
  error?: string;
}

// BUG#13: cache detail client (TTL) → back mở lại tức thì, không "Đang tải" trên màn trắng.
const _detailCache = new Map<string, { doc: IDocument; ts: number }>();
const DETAIL_TTL = 5 * 60 * 1000;

// Trang chi tiết — gọi GET /api/documents/[id] (read-only). Render header+metadata trước,
// PDF load async (iframe). Có cache → render ngay + refresh nền (BUG#13).
export default function DocumentDetailPage({ id }: { id: string }): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturn = searchParams.get('returnUrl');
  const returnUrl = rawReturn && rawReturn.startsWith('/') ? rawReturn : undefined;
  const cached = _detailCache.get(id);
  const [doc, setDoc] = React.useState<IDocument | null>(cached?.doc ?? null);
  const [status, setStatus] = React.useState<'loading' | 'ok' | 'notfound' | 'error'>(cached ? 'ok' : 'loading');
  const [error, setError] = React.useState<string | undefined>();
  const [canWrite, setCanWrite] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  // BUG#27: tab điều khiển nội dung; mobile chỉ hiện PDF khi tab = "Thông tin".
  const [tab, setTab] = React.useState<DetailTab>('info');
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const apply = (): void => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const onDelete = React.useCallback(async (): Promise<void> => {
    setDeleting(true);
    const r = await deleteDocument(id);
    setDeleting(false);
    if (!r.ok) {
      setConfirmDelete(false);
      setToast(`Xóa thất bại: ${r.error ?? 'lỗi không xác định'}`);
      window.setTimeout(() => setToast(null), 5000);
      return;
    }
    _detailCache.delete(id);
    router.push(returnUrl ?? '/search');
  }, [id, returnUrl, router]);

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
      _detailCache.set(id, { doc: j.document, ts: Date.now() });
      setDoc(j.document);
      setStatus('ok');
    } catch (e) {
      // Có cache cũ → giữ hiển thị, không bung lỗi che màn.
      if (!_detailCache.has(id)) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    }
  }, [id]);

  React.useEffect(() => {
    const c = _detailCache.get(id);
    if (c && Date.now() - c.ts < DETAIL_TTL) {
      setDoc(c.doc);
      setStatus('ok'); // render ngay từ cache
    } else if (!c) {
      setStatus('loading');
    }
    void load(); // luôn refresh nền
  }, [id, load]);

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
    // BUG#13: skeleton thay vì "Đang tải…" trên màn trắng.
    return (
      <div className="dd-root">
        <div className="dochead">
          <div className="dd-skel" style={{ width: 140, height: 14, marginBottom: 10 }} />
          <div className="titlerow">
            <div className="dd-skel" style={{ width: 40, height: 46, borderRadius: 8 }} />
            <div style={{ flex: 1 }}>
              <div className="dd-skel" style={{ width: 180, height: 12, marginBottom: 8 }} />
              <div className="dd-skel" style={{ width: '60%', height: 20 }} />
            </div>
          </div>
        </div>
        <div className="split">
          <section className="viewer" style={{ display: 'grid', placeItems: 'center' }}>
            <div className="dd-skel" style={{ width: '70%', height: '70%', maxWidth: 520, borderRadius: 8 }} />
          </section>
          <div className="dd-meta" style={{ padding: 'var(--sp-5)' }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="dd-skel" style={{ height: 14, marginBottom: 14, width: `${90 - i * 6}%` }} />
            ))}
          </div>
        </div>
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
      <DocumentHeader doc={detail} returnUrl={returnUrl} canWrite={canWrite} onEdit={() => setEditing(true)} onDelete={() => setConfirmDelete(true)} />
      <div className={`split ${isMobile && tab !== 'info' ? 'tab-only' : ''}`}>
        {(!isMobile || tab === 'info') && <DocumentPreview doc={detail} />}
        <MetadataPanel doc={detail} tab={tab} onTab={setTab} />
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

      {confirmDelete && (
        <ConfirmDialog
          title="Xóa văn bản?"
          message={
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{detail.num}</div>
              <div>Xóa văn bản này khỏi SharePoint, bao gồm file PDF và file bản mềm liên quan nếu có. Văn bản sẽ vào thùng rác SharePoint.</div>
            </>
          }
          confirmLabel="Xóa văn bản"
          busy={deleting}
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirmDelete(false)}
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
