'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/shell/Icon';
import { IDocument } from '@dms/models/IDocument';
import { isExpired } from '@dms/utils/standardization';
import { FACET_DEFS, matchesKeyword, toSearchDoc, SearchDoc } from './searchTypes';
import SearchSubBar, { ViewMode } from './SearchSubBar';
import SearchBar from './SearchBar';
import ActiveChips, { ActiveChip } from './ActiveChips';
import FilterPanel, { FacetGroup } from './FilterPanel';
import DocumentList, { SortKey } from './DocumentList';
import CardGrid from './CardGrid';
import PreviewPane from './PreviewPane';
import FastPdfModal from './FastPdfModal';
import EditMetadataDrawer from '@/components/document-detail/EditMetadataDrawer';

interface DocsResponse {
  ok: boolean;
  documents?: IDocument[];
  error?: string;
}

const EXPIRED_LABEL = 'Hết hiệu lực';

// BUG#7/#13: cache client documents (module-level).
let _docsCache: IDocument[] | undefined;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function sortDocs(docs: IDocument[], sort: SortKey): IDocument[] {
  if (sort === 'relevance') return docs;
  const arr = [...docs];
  if (sort === 'newest') arr.sort((a, b) => (b.ngayBanHanh ?? '').localeCompare(a.ngayBanHanh ?? ''));
  else if (sort === 'num') arr.sort((a, b) => (a.soVanBan ?? '').localeCompare(b.soVanBan ?? '', 'vi', { numeric: true }));
  return arr;
}

export default function SearchCenterPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [raw, setRaw] = React.useState<IDocument[] | null>(_docsCache ?? null);
  const [error, setError] = React.useState<string | undefined>();
  const [query, setQuery] = React.useState(searchParams.get('q') ?? '');
  const [selected, setSelected] = React.useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const def of FACET_DEFS) {
      const vals = searchParams.getAll(def.key);
      if (vals.length) init[def.key] = new Set(vals);
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
  const [quickDoc, setQuickDoc] = React.useState<SearchDoc | null>(null); // BUG#9 modal
  const [canWrite, setCanWrite] = React.useState(false); // BUG#12A
  const [editingDoc, setEditingDoc] = React.useState<IDocument | null>(null);

  const dq = useDebounced(query, 300);

  // BUG#1: đồng bộ với ô search Header.
  const queryRef = React.useRef(query);
  queryRef.current = query;
  const dqRef = React.useRef(dq);
  dqRef.current = dq;
  React.useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    if (urlQ !== queryRef.current && urlQ !== dqRef.current) setQuery(urlQ);
  }, [searchParams]);

  const buildQs = React.useCallback((): string => {
    const p = new URLSearchParams();
    const q = dq.trim();
    if (q) p.set('q', q);
    if (mode !== '3col') p.set('view', mode);
    if (sort !== 'relevance') p.set('sort', sort);
    for (const [key, set] of Object.entries(selected)) {
      for (const v of set) p.append(key, v);
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
  const openDetail = (id: string): void => router.push(detailHref(id));
  const selectItem = (id: string): void => setSelectedId(id);
  // BUG#13: prefetch route khi hover/select để mở chi tiết nhanh hơn.
  const prefetchDetail = (id: string): void => {
    try {
      router.prefetch(`/documents/${encodeURIComponent(id)}`);
    } catch {
      /* ignore */
    }
  };

  // Tải documents (dùng chung cache). Gọi nền; refresh sau khi sửa metadata.
  const loadDocs = React.useCallback((): void => {
    fetch('/api/documents', { credentials: 'same-origin' })
      .then(async (res) => {
        const json = (await res.json()) as DocsResponse;
        if (!res.ok || !json.ok) throw new Error(json?.error ?? `Lỗi tải dữ liệu (HTTP ${res.status}).`);
        _docsCache = json.documents ?? [];
        setRaw(_docsCache);
      })
      .catch((e: Error) => !_docsCache && setError(e.message));
  }, []);

  React.useEffect(() => {
    loadDocs();
  }, [loadDocs]);

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

  const kw = dq.trim();
  const afterKeyword = React.useMemo(() => (raw ? raw.filter((d) => matchesKeyword(d, kw)) : []), [raw, kw]);

  // BUG#14B: ẩn văn bản Hết hiệu lực mặc định, trừ khi user chọn trạng thái/nhóm "Hết hiệu lực".
  const showExpired =
    (selected.trangThai?.has(EXPIRED_LABEL) ?? false) || (selected.nhomTaiLieu?.has(EXPIRED_LABEL) ?? false);

  // Helper: lọc theo facet đã chọn, có thể bỏ qua 1 facet (cho contextual count).
  const applyFacets = React.useCallback(
    (docs: IDocument[], exceptKey?: string): IDocument[] =>
      docs.filter((d) =>
        FACET_DEFS.every((def) => {
          if (def.key === exceptKey) return true;
          const sel = selected[def.key];
          return !sel || sel.size === 0 || sel.has(def.get(d));
        })
      ),
    [selected]
  );

  // BUG#10/#15: CONTEXTUAL facet count — count trên tập đã áp dụng MỌI filter khác (trừ facet đang tính).
  const facetGroups: FacetGroup[] = React.useMemo(
    () =>
      FACET_DEFS.map((def) => {
        const base = applyFacets(afterKeyword, def.key);
        const counts = new Map<string, number>();
        for (const d of base) {
          const val = def.get(d);
          counts.set(val, (counts.get(val) ?? 0) + 1);
        }
        const items = Array.from(counts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'vi'));
        return { key: def.key, label: def.label, open: def.open, items };
      }),
    [afterKeyword, applyFacets]
  );

  const filtered = React.useMemo(() => {
    const byFacets = applyFacets(afterKeyword);
    return showExpired ? byFacets : byFacets.filter((d) => !isExpired(d));
  }, [afterKeyword, applyFacets, showExpired]);

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
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size) next[key] = set;
      else delete next[key];
      return next;
    });
  };

  const setFacetSingle = (key: string, value: string): void => {
    setSelected((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      if (value) next[key] = new Set([value]);
      else delete next[key];
      return next;
    });
  };

  const openQuick = (id: string): void => {
    const d = viewDocs.find((v) => v.id === id);
    if (d) setQuickDoc(d);
  };
  const openEdit = (id: string): void => {
    const d = raw?.find((x) => x.id === id);
    if (d) setEditingDoc(d);
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
        <SearchBar value={query} onChange={setQuery} onClear={() => setQuery('')} />
        <ActiveChips
          chips={chips}
          onRemove={toggleFacet}
          keyword={dq.trim()}
          onClearKeyword={() => setQuery('')}
        />
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
              <select key={def.key} className="qf-select" value={cur} onChange={(e) => setFacetSingle(def.key, e.target.value)} title={def.label}>
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
          <CardGrid docs={viewDocs} onSelect={openDetail} onOpen={openDetail} onQuick={openQuick} onPrefetch={prefetchDetail} />
        ) : (
          <DocumentList
            docs={viewDocs}
            total={filtered.length}
            selectedId={effectiveId}
            onSelect={mode === 'list' ? openDetail : selectItem}
            onOpen={openDetail}
            onQuick={openQuick}
            onPrefetch={prefetchDetail}
            sort={sort}
            onSort={setSort}
          />
        )}

        {mode === '3col' && (
          <PreviewPane
            doc={selectedDoc}
            openHref={selectedDoc ? detailHref(selectedDoc.id) : undefined}
            canWrite={canWrite}
            onEdit={selectedDoc ? () => openEdit(selectedDoc.id) : undefined}
            onQuickPdf={selectedDoc ? () => setQuickDoc(selectedDoc) : undefined}
          />
        )}
      </div>

      {quickDoc && (
        <FastPdfModal doc={quickDoc} detailHref={detailHref(quickDoc.id)} onClose={() => setQuickDoc(null)} />
      )}

      {editingDoc && (
        <EditMetadataDrawer
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSaved={() => {
            setEditingDoc(null);
            loadDocs(); // refresh metadata panel + list
          }}
        />
      )}
    </div>
  );
}
