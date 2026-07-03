'use client';

import * as React from 'react';
import { IDocument } from '@dms/models/IDocument';
import { SearchDoc, toSearchDoc } from '@/components/search/searchTypes';

// Nạp toàn bộ văn bản (1 lần, cache module-scope) để: resolve SoVanBan -> doc + nuôi search picker
// ở các tab Liên quan / Thay thế. Tránh fetch lặp khi đổi tab.
let _cache: { docs: SearchDoc[]; ts: number } | undefined;
let _inflight: Promise<SearchDoc[]> | undefined;
const TTL = 5 * 60 * 1000;

async function fetchDocs(): Promise<SearchDoc[]> {
  // fields=lite: cắt payload (~132KB→~70KB br). Picker/resolve chỉ đọc field lite qua toSearchDoc.
  const r = await fetch('/api/documents?fields=lite', { credentials: 'same-origin' });
  const j = (await r.json()) as { documents?: IDocument[] };
  return (j.documents ?? []).map(toSearchDoc);
}

/** Xóa cache (gọi sau khi có mutation thay đổi quan hệ/thay thế để picker phản ánh ngay). */
export function invalidateAllDocs(): void {
  _cache = undefined;
  _inflight = undefined;
}

export function useAllDocs(): { docs: SearchDoc[]; loading: boolean } {
  const [docs, setDocs] = React.useState<SearchDoc[]>(_cache?.docs ?? []);
  const [loading, setLoading] = React.useState(!_cache);

  React.useEffect(() => {
    let alive = true;
    if (_cache && Date.now() - _cache.ts < TTL) {
      setDocs(_cache.docs);
      setLoading(false);
      return;
    }
    setLoading(true);
    _inflight =
      _inflight ??
      fetchDocs()
        .then((d) => {
          _cache = { docs: d, ts: Date.now() };
          return d;
        })
        .finally(() => {
          _inflight = undefined;
        });
    _inflight
      .then((d) => {
        if (alive) {
          setDocs(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return { docs, loading };
}
