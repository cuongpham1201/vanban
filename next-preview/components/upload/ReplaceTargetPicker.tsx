'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { IDocument } from '@dms/models/IDocument';
import DocumentPicker from '@/components/replace/DocumentPicker';
import { SearchDoc, toSearchDoc } from '@/components/replace/replaceTypes';

const EXPIRED_LABEL = 'Hết hiệu lực';

// #35 — Chọn "Văn bản thay thế" NGAY trong Upload Wizard. Tái sử dụng:
//   - GET /api/documents (Search Center endpoint) để lấy kho văn bản.
//   - toSearchDoc + DocumentPicker (renderer card/search dùng chung với /replace).
// Khi văn bản mới publish → orchestrator gọi POST /api/documents/replace.
export default function ReplaceTargetPicker({
  target,
  onChange,
}: {
  target: SearchDoc | null;
  onChange: (d: SearchDoc | null) => void;
}): React.ReactElement {
  const [docs, setDocs] = React.useState<SearchDoc[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/documents?fields=lite', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j: { ok: boolean; documents?: IDocument[] }) => {
        if (alive && j?.ok) setDocs((j.documents ?? []).map(toSearchDoc));
      })
      .catch(() => alive && setDocs([]));
    return () => { alive = false; };
  }, []);

  const expired = target?.statusLabel === EXPIRED_LABEL;

  return (
    <section className="uw-replace" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--gray-200)' }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="field-label" style={{ margin: 0 }}>Văn bản thay thế <span className="t-xs mut">(nếu văn bản mới này thay thế một văn bản cũ)</span></span>
        {target && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)} title="Bỏ chọn văn bản thay thế">
            <Icon name="x" size={14} /> Bỏ chọn
          </button>
        )}
      </div>

      <DocumentPicker
        variant="old"
        placeholder="Tìm văn bản bị thay thế…"
        docs={docs ?? []}
        loading={docs === null}
        selected={target}
        onPick={onChange}
      />

      {expired && (
        <div className="rp-warn" style={{ marginTop: 10, background: 'var(--warning-100)', borderColor: 'var(--warning-500)' }}>
          <Icon name="help" size={18} />
          <div className="t-sm">
            Văn bản này đã <b>“Hết hiệu lực”</b> — không nên chọn làm văn bản bị thay thế. Vui lòng chọn văn bản khác hoặc bỏ chọn.
          </div>
        </div>
      )}
    </section>
  );
}
