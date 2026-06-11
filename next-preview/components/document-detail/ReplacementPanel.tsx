'use client';

import * as React from 'react';
import Link from 'next/link';
import Icon from '@/components/shell/Icon';
import DocumentPicker from '@/components/replace/DocumentPicker';
import { useAllDocs, invalidateAllDocs } from './useAllDocs';
import type { SearchDoc } from '@/components/search/searchTypes';

// Tab "Thay thế" — khu 1: văn bản này thay thế (B); khu 2: bị thay thế bởi (tính ngược từ kho).
export default function ReplacementPanel({
  docId,
  soVanBan,
  thaythe,
  canWrite,
  onChanged,
}: {
  docId: string;
  soVanBan: string;
  thaythe: string;
  canWrite: boolean;
  onChanged: (msg?: string) => void;
}): React.ReactElement {
  const { docs, loading } = useAllDocs();
  const [current, setCurrent] = React.useState<string>(thaythe);
  const [picking, setPicking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const byNum = React.useMemo(() => {
    const m = new Map<string, SearchDoc>();
    for (const d of docs) {
      m.set(d.num.trim().toLowerCase(), d);
    }
    return m;
  }, [docs]);

  const replacesDoc = current ? byNum.get(current.trim().toLowerCase()) : undefined;
  // "Bị thay thế bởi": văn bản nào trong kho có thaythe == soVanBan của văn bản này.
  const replacedBy = React.useMemo(
    () => docs.find((d) => d.thaythe && d.thaythe.trim().toLowerCase() === soVanBan.trim().toLowerCase()),
    [docs, soVanBan]
  );

  const setReplacement = async (target: SearchDoc): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/replacement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ targetId: target.id }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j?.error ?? `Thất bại (HTTP ${res.status}).`);
        return;
      }
      setCurrent(j.targetSoVanBan ?? target.num);
      setPicking(false);
      invalidateAllDocs();
      onChanged(j.warning ? `Đã thiết lập thay thế. ${j.warning}` : 'Đã thiết lập thay thế. Văn bản cũ chuyển hết hiệu lực.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi mạng.');
    } finally {
      setBusy(false);
    }
  };

  const clearReplacement = async (): Promise<void> => {
    if (!window.confirm('Gỡ liên kết thay thế? Trạng thái văn bản cũ sẽ KHÔNG tự khôi phục.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/replacement`, { method: 'DELETE', credentials: 'same-origin' });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j?.error ?? `Thất bại (HTTP ${res.status}).`);
        return;
      }
      setCurrent('');
      invalidateAllDocs();
      onChanged('Đã gỡ liên kết thay thế.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi mạng.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Khu 1 — văn bản này thay thế */}
      <div className="sec-block" style={{ background: 'var(--navy-050)', borderColor: 'var(--navy-100)' }}>
        <div className="h" style={{ color: 'var(--navy-600)' }}>Văn bản này thay thế</div>
        {current ? (
          <div className="relrow" style={{ background: '#fff', margin: 0 }}>
            <div className="ficon" style={{ background: 'var(--gray-150)', color: 'var(--gray-500)' }}>PDF</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="num">{current}</div>
              {replacesDoc && <div className="t-sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{replacesDoc.title}</div>}
            </div>
            {replacesDoc && (
              <Link className="btn btn-ghost btn-icon" href={`/documents/${encodeURIComponent(replacesDoc.id)}`} title="Mở chi tiết" aria-label="Mở chi tiết">
                <Icon name="eye" size={16} />
              </Link>
            )}
            {canWrite && (
              <button className="btn btn-ghost btn-icon" disabled={busy} title="Gỡ liên kết" aria-label="Gỡ liên kết" onClick={() => void clearReplacement()}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
        ) : (
          <div className="dd-empty" style={{ padding: '4px 2px' }}>Không thay thế văn bản nào.</div>
        )}

        {canWrite && (
          <div style={{ marginTop: 10 }}>
            {picking ? (
              <div>
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="t-2xs mut" style={{ fontWeight: 600 }}>Chọn văn bản bị thay thế</span>
                  <button className="btn btn-ghost btn-icon" title="Đóng" aria-label="Đóng" onClick={() => setPicking(false)}><Icon name="x" size={16} /></button>
                </div>
                <DocumentPicker
                  variant="old"
                  placeholder="Tìm văn bản bị thay thế…"
                  docs={docs}
                  loading={loading || busy}
                  selected={null}
                  excludeId={docId}
                  onPick={(d) => void setReplacement(d)}
                />
              </div>
            ) : (
              <button className="btn btn-subtle" disabled={busy} onClick={() => setPicking(true)}>
                <Icon name="replace" size={16} />
                <span style={{ marginLeft: 6 }}>{current ? 'Thay đổi văn bản bị thay thế' : 'Chọn văn bản bị thay thế'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Khu 2 — bị thay thế bởi (read-only, tính ngược) */}
      <div className="sec-block">
        <div className="h">Bị thay thế bởi</div>
        {replacedBy ? (
          <div className="relrow" style={{ background: '#fff', margin: 0 }}>
            <div className="ficon" style={{ background: 'var(--gray-150)', color: 'var(--gray-500)' }}>PDF</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="num">{replacedBy.num}</div>
              <div className="t-sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{replacedBy.title}</div>
            </div>
            <Link className="btn btn-ghost btn-icon" href={`/documents/${encodeURIComponent(replacedBy.id)}`} title="Mở chi tiết" aria-label="Mở chi tiết">
              <Icon name="eye" size={16} />
            </Link>
          </div>
        ) : (
          <div className="dd-empty" style={{ padding: '4px 2px' }}>
            {loading ? 'Đang tra cứu…' : 'Chưa bị thay thế — đây là phiên bản hiện hành.'}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--danger-100)', color: 'var(--danger-700)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
