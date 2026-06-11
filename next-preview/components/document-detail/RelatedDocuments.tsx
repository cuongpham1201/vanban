'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon from '@/components/shell/Icon';
import DocumentPicker from '@/components/replace/DocumentPicker';
import { useAllDocs, invalidateAllDocs } from './useAllDocs';
import type { SearchDoc } from '@/components/search/searchTypes';

// Tab "Liên quan" — danh sách văn bản liên quan (cột VanBanLienQuan, lưu danh sách SoVanBan).
export default function RelatedDocuments({
  docId,
  soVanBan,
  relatedList,
  canWrite,
  onChanged,
}: {
  docId: string;
  soVanBan: string;
  relatedList: string[];
  canWrite: boolean;
  onChanged: (msg?: string) => void;
}): React.ReactElement {
  const { docs, loading } = useAllDocs();
  const [related, setRelated] = React.useState<string[]>(relatedList);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const byNum = React.useMemo(() => {
    const m = new Map<string, SearchDoc>();
    for (const d of docs) {
      m.set(d.num.trim().toLowerCase(), d);
    }
    return m;
  }, [docs]);

  const callApi = async (method: 'POST' | 'DELETE', sovb: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const url =
        method === 'POST'
          ? `/api/documents/${encodeURIComponent(docId)}/relations`
          : `/api/documents/${encodeURIComponent(docId)}/relations?soVanBan=${encodeURIComponent(sovb)}`;
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        ...(method === 'POST'
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soVanBan: sovb }) }
          : {}),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j?.error ?? `Thất bại (HTTP ${res.status}).`);
        return;
      }
      setRelated(j.related ?? []);
      setAdding(false);
      invalidateAllDocs();
      onChanged(method === 'POST' ? 'Đã thêm văn bản liên quan.' : 'Đã gỡ liên kết.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi mạng.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {related.length === 0 ? (
        <div className="dd-empty">Chưa có văn bản liên quan.</div>
      ) : (
        related.map((r, i) => {
          const hit = byNum.get(r.trim().toLowerCase());
          return (
            <div className="relrow" key={`${r}-${i}`}>
              <div className="ficon">DOC</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="num">{r}</div>
                {hit && <div className="t-sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{hit.title}</div>}
                <div className="row gap-2" style={{ marginTop: 4 }}>
                  {hit && <span className={`badge ${hit.statusClass}`} style={{ padding: '2px 7px' }}>{hit.statusLabel}</span>}
                  {hit && <span className="t-2xs mut">{hit.donViPH}</span>}
                  {!hit && <span className="t-2xs mut">{loading ? 'Đang tra cứu…' : 'Không tìm thấy trong kho'}</span>}
                </div>
              </div>
              {hit && (
                <Link className="btn btn-ghost btn-icon" href={`/documents/${encodeURIComponent(hit.id)}`} title="Mở chi tiết" aria-label="Mở chi tiết">
                  <Icon name="eye" size={16} />
                </Link>
              )}
              {canWrite && (
                <button className="btn btn-ghost btn-icon" disabled={busy} title="Gỡ liên kết" aria-label="Gỡ liên kết" onClick={() => void callApi('DELETE', r)}>
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          );
        })
      )}

      {canWrite && (
        <div style={{ marginTop: 12 }}>
          {adding ? (
            <div className="sec-block">
              <div className="row between" style={{ marginBottom: 8 }}>
                <div className="h" style={{ margin: 0 }}>Chọn văn bản liên quan</div>
                <button className="btn btn-ghost btn-icon" title="Đóng" aria-label="Đóng" onClick={() => setAdding(false)}><Icon name="x" size={16} /></button>
              </div>
              <DocumentPicker
                variant="old"
                placeholder="Tìm theo số / trích yếu / đơn vị…"
                docs={docs}
                loading={loading || busy}
                selected={null}
                excludeId={docId}
                onPick={(d) => void callApi('POST', d.num)}
              />
            </div>
          ) : (
            <button className="btn btn-subtle" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} />
              <span style={{ marginLeft: 6 }}>Thêm văn bản liên quan</span>
            </button>
          )}
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
