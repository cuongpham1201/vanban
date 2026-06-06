'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/shell/Icon';
import { IDocument } from '@dms/models/IDocument';
import { FACET_DEFS, matchesKeyword, toSearchDoc, SearchDoc } from './searchTypes';
import SearchSubBar, { ViewMode } from './SearchSubBar';
import SearchBar from './SearchBar';
import ActiveChips, { ActiveChip } from './ActiveChips';
import FilterPanel, { FacetGroup } from './FilterPanel';
import DocumentList, { SortKey } from './DocumentList';
import CardGrid from './CardGrid';
import PreviewPane from './PreviewPane';

interface DocsResponse {
  ok: boolean;
  documents?: IDocument[];
  error?: string;
}

// BUG#7: cache client (module-level) — back từ detail render ngay từ cache, refresh nền.
let _docsCache: IDocument[] | undefined;

// BUG#2: debounce — không filter/sync URL mỗi ký tự.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function sortDocs(docs: IDocument[], sort: SortKey): IDocument[] {
  if (sort === 'relevance') {
    return docs;
  }
  const arr = [...docs];
  if (sort === 'newest') {
    arr.sort((a, b) => (b.ngayBanHanh ?? '').localeCompare(a.ngayBanHanh ?? ''));
  } else if (sort === 'num') {
    arr.sort((a, b) => (a.soVanBan ?? '').localeCompare(b.soVanBan ?? '', 'vi', { numeric: true }));
  }
  return arr;
}

export default function SearchCenterPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [raw, setRaw] = React.useState<IDocument[] | null>(_docsCache ?? null);
  const [error, setError] = React.useState<string | undefined>();
  // Seed TOÀN BỘ state từ URL (q · view · sort · facets · sel).
  const [query, setQuery] = React.useState(searchParams.get('q') ?? '');
  const [selected, setSelected] = React.useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const def of FACET_DEFS) {
      const vals = searchParams.getAll(def.key);
      if (vals.length) {
        init[def.key] = new Set(vals);
      }
    }
    return init;
  });
  const [mode, setMode] = React.useState<ViewMode>(() => {
    const v = searchParams.get('view');
    return v === 'list' || v === 'cards' ? v : '3col';
  });
  const [selectedId, setSelectedId] = React.useState<string | null>(searchParams.get('sel'));
  const [sort, setSort] = React.useState<SortKey>(() => {
    const s = searchParams.get('sort');
    return s === 'newest' || s === 'num' ? s : 'relevance';
  });

  const dq = useDebounced(query, 300); // dùng cho filter + URL (BUG#2)

  // BUG#1: đồng bộ ô search Header (AppBar push /search?q=) → cập nhật Search Center.
  // So với cả query lẫn dq để không clobber khi typing/ghi URL nội bộ.
  const queryRef = React.useRef(query);
  queryRef.current = query;
  const dqRef = React.useRef(dq);
  dqRef.current = dq;
  React.useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    if (urlQ !== queryRef.current && urlQ !== dqRef.current) {
      setQuery(urlQ);
    }
  }, [searchParams]);

  // Build query string từ state (q dùng dq đã debounce) — cho URL sync + returnUrl.
  const buildQs = React.useCallback((): string => {
    const p = new URLSearchParams();
    const q = dq.trim();
    if (q) p.set('q', q);
    if (mode !== '3col') p.set('view', mode);
    if (sort !== 'relevance') p.set('sort', sort);
    for (const [key, set] of Object.entries(selected)) {
      for (const v of set) {
        p.append(key, v);
      }
    }
    if (selectedId) p.set('sel', selectedId);
    return p.toString();
  }, [dq, mode, sort, selected, selectedId]);

  React.useEffect(() => {
    const qs = buildQs();
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
  }, [buildQs, router]);

  const detailHref = (id: string): string => {
    const qs = buildQs();
    const ret = qs ? `/search?${qs}` : '/search';
    return `/documents/${encodeURIComponent(id)}?returnUrl=${encodeURIComponent(ret)}`;
  };
  const openDetail = (id: string): void => router.push(detailHref(id)); // double click / list / card
  const selectItem = (id: string): void => setSelectedId(id); // single click (3 cột)
  // BUG#5B: Xem nhanh PDF — chọn item + đảm bảo có preview (chuyển về 3 cột nếu cần).
  const quickPreview = (id: string): void => {
    setSelectedId(id);
    if (mode !== '3col') {
      setMode('3col');
    }
  };

  // BUG#7: fetch nền. Có cache → đã render ngay (raw seeded), fetch để refresh; không cache → fetch lần đầu.
  React.useEffect(() => {
    let alive = true;
    fetch('/api/documents', { credentials: 'same-origin' })
      .then(async (res) => {
        const json = (await res.json()) as DocsResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.error ?? `Lỗi tải dữ liệu (HTTP ${res.status}).`);
        }
        _docsCache = json.documents ?? [];
        if (alive) {
          setRaw(_docsCache);
        }
      })
      .catch((e: Error) => alive && !_docsCache && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const kw = dq.trim();
  const afterKeyword = React.useMemo(() => (raw ? raw.filter((d) => matchesKeyword(d, kw)) : []), [raw, kw]);

  const facetGroups: FacetGroup[] = React.useMemo(
    () =>
      FACET_DEFS.map((def) => {
        const counts = new Map<string, number>();
        for (const d of afterKeyword) {
          const val = def.get(d);
          counts.set(val, (counts.get(val) ?? 0) + 1);
        }
        const items = Array.from(counts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'vi'));
        return { key: def.key, label: def.label, open: def.open, items };
      }),
    [afterKeyword]
  );

  const filtered = React.useMemo(
    () =>
      afterKeyword.filter((d) =>
        FACET_DEFS.every((def) => {
          const sel = selected[def.key];
          return !sel || sel.size === 0 || sel.has(def.get(d));
        })
      ),
    [afterKeyword, selected]
  );

  const viewDocs: SearchDoc[] = React.useMemo(() => sortDocs(filtered, sort).map(toSearchDoc), [filtered, sort]);

  const selectedDoc = React.useMemo(
    () => viewDocs.find((v) => v.id === selectedId) ?? viewDocs[0] ?? null,
    [viewDocs, selectedId]
  );
  const effectiveId = selectedDoc?.id ?? null;

  const chips: ActiveChip[] = React.useMemo(
    () => Object.entries(selected).flatMap(([key, set]) => Array.from(set).map((value) => ({ key, value }))),
    [selected]
  );

  const toggleFacet = (key: string, value: string): void => {
    setSelected((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      const set = new Set(next[key] ?? []);
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      if (set.size) {
        next[key] = set;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  // BUG#4: quick filter (1 giá trị/facet) — chung state với panel trái + chips + URL + list.
  const setFacetSingle = (key: string, value: string): void => {
    setSelected((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      if (value) {
        next[key] = new Set([value]);
      } else {
        delete next[key];
      }
      return next;
    });
  };

  if (error) {
    return (
      <div className="sc-root">
        <div className="sc-empty" style={{ color: 'var(--danger-700)' }}>Không tải được dữ liệu: {error}</div>
      </div>
    );
  }
  const loading = raw === null;

  return (
    <div className="sc-root">
      <SearchSubBar count={filtered.length} mode={mode} onMode={setMode} />

      <div className="searchrow">
        <SearchBar value={query} onChange={setQuery} />
        <ActiveChips chips={chips} onRemove={toggleFacet} />
      </div>

      {mode !== '3col' && (
        <div className="topbar2">
          <span className="t-xs mut" style={{ fontWeight: 600 }}>
            <Icon name="filter" /> Lọc nhanh:
          </span>
          {FACET_DEFS.slice(0, 6).map((def) => {
            const group = facetGroups.find((g) => g.key === def.key);
            const cur = selected[def.key] ? Array.from(selected[def.key])[0] ?? '' : '';
            return (
              <select
                key={def.key}
                className="qf-select"
                value={cur}
                onChange={(e) => setFacetSingle(def.key, e.target.value)}
                title={def.label}
              >
                <option value="">{def.label}</option>
                {group?.items.map((it) => (
                  <option key={it.value} value={it.value}>{it.value} ({it.count})</option>
                ))}
              </select>
            );
          })}
        </div>
      )}

      <div className="sc-layout">
        {mode === '3col' && (
          <FilterPanel groups={facetGroups} selected={selected} onToggle={toggleFacet} onClearAll={() => setSelected({})} />
        )}

        {loading ? (
          <section className="listcol scrollbar">
            <div className="sc-empty">Đang tải văn bản…</div>
          </section>
        ) : mode === 'cards' ? (
          <CardGrid docs={viewDocs} onSelect={openDetail} onOpen={openDetail} onQuick={quickPreview} />
        ) : (
          <DocumentList
            docs={viewDocs}
            total={filtered.length}
            selectedId={effectiveId}
            // 3 cột: single = chọn (preview), double = mở. List: single/double = mở.
            onSelect={mode === 'list' ? openDetail : selectItem}
            onOpen={openDetail}
            onQuick={quickPreview}
            sort={sort}
            onSort={setSort}
          />
        )}

        {mode === '3col' && (
          <PreviewPane doc={selectedDoc} openHref={selectedDoc ? detailHref(selectedDoc.id) : undefined} />
        )}
      </div>
    </div>
  );
}
