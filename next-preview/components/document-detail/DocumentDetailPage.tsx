'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { IDocument } from '@dms/models/IDocument';
import { toDetailDoc } from './documentDetailTypes';
import DocumentHeader from './DocumentHeader';
import DocumentPreview from './DocumentPreview';
import MetadataPanel from './MetadataPanel';

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

  React.useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetch(`/api/documents/${encodeURIComponent(id)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json()) as DetailResponse;
        if (r.status === 404) {
          if (alive) setStatus('notfound');
          return;
        }
        if (!r.ok || !j.ok || !j.document) {
          throw new Error(j?.error ?? `Lỗi tải dữ liệu (HTTP ${r.status}).`);
        }
        if (alive) {
          setDoc(j.document);
          setStatus('ok');
        }
      })
      .catch((e: Error) => {
        if (alive) {
          setError(e.message);
          setStatus('error');
        }
      });
    return () => {
      alive = false;
    };
  }, [id]);

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
      <DocumentHeader doc={detail} returnUrl={returnUrl} />
      <div className="split">
        <DocumentPreview doc={detail} />
        <MetadataPanel doc={detail} />
      </div>
    </div>
  );
}
