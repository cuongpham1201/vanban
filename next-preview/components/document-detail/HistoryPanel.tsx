'use client';

import * as React from 'react';

interface HistoryEntry {
  id: string;
  time?: string;
  actor: string;
  label: string;
  detail?: string;
}

function fmtWhen(iso?: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

// Tab "Lịch sử" — timeline từ SharePoint version history gốc (GET /history).
export default function HistoryPanel({ docId }: { docId: string }): React.ReactElement {
  const [items, setItems] = React.useState<HistoryEntry[]>([]);
  const [status, setStatus] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/documents/${encodeURIComponent(docId)}/history`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) {
          return;
        }
        if (j?.ok) {
          setItems(j.history ?? []);
          setStatus('ok');
        } else {
          setError(j?.error ?? 'Không tải được lịch sử.');
          setStatus('error');
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof Error ? e.message : 'Lỗi mạng.');
          setStatus('error');
        }
      });
    return () => {
      alive = false;
    };
  }, [docId]);

  if (status === 'loading') {
    return <div className="dd-empty">Đang tải lịch sử…</div>;
  }
  if (status === 'error') {
    return <div className="dd-empty">Không tải được lịch sử: {error}</div>;
  }
  if (items.length === 0) {
    return <div className="dd-empty">Chưa có dữ liệu lịch sử.</div>;
  }
  return (
    <div className="tl">
      {items.map((h) => (
        <div className="tlitem" key={h.id}>
          <div className="when">{fmtWhen(h.time)} · {h.actor}</div>
          <div className="what">{h.label}</div>
          {h.detail && <div className="t-2xs mut" style={{ marginTop: 2 }}>{h.detail}</div>}
        </div>
      ))}
    </div>
  );
}
