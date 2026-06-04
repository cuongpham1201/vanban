'use client';

import * as React from 'react';
import { IDocument } from '@dms/models/IDocument';
import { toDetailDoc } from './documentDetailTypes';
import DocumentHeader from './DocumentHeader';
import DocumentPreview from './DocumentPreview';
import MetadataPanel from './MetadataPanel';

interface DocsResponse {
  ok: boolean;
  documents?: IDocument[];
  error?: string;
}

// Trang chi tiết — reuse /api/documents (cache) + tìm theo id client-side (read-only, không API mới).
export default function DocumentDetailPage({ id }: { id: string }): React.ReactElement {
  const [raw, setRaw] = React.useState<IDocument[] | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let alive = true;
    fetch('/api/documents', { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json()) as DocsResponse;
        if (!r.ok || !j.ok) {
          throw new Error(j?.error ?? `Lỗi tải dữ liệu (HTTP ${r.status}).`);
        }
        if (alive) {
          setRaw(j.documents ?? []);
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="dd-root">
        <div className="dd-empty" style={{ padding: 24, color: 'var(--danger-700)' }}>Không tải được dữ liệu: {error}</div>
      </div>
    );
  }
  if (raw === null) {
    return (
      <div className="dd-root">
        <div className="dd-empty" style={{ padding: 24 }}>Đang tải văn bản…</div>
      </div>
    );
  }
  const found = raw.find((d) => d.id === id);
  if (!found) {
    return (
      <div className="dd-root">
        <div className="dd-empty" style={{ padding: 24 }}>
          Không tìm thấy văn bản có id <b>{id}</b>.
        </div>
      </div>
    );
  }
  const doc = toDetailDoc(found);
  return (
    <div className="dd-root">
      <DocumentHeader doc={doc} />
      <div className="split">
        <DocumentPreview doc={doc} />
        <MetadataPanel doc={doc} />
      </div>
    </div>
  );
}
