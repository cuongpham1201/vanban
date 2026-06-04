'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
  const [raw, setRaw] = React.useState<IDocument[] | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<Record<string, Set<string>>>({});
  const [mode, setMode] = React.useState<ViewMode>('3col');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>('relevance');
  const router = useRouter();
  const openDetail = (id: string): void => router.push(`/documents/${encodeURIComponent(id)}`);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/documents', { credentials: 'same-origin' })
      .then(async (res) => {
        const json = (await res.json()) as DocsResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.error ?? `Lỗi tải dữ liệu (HTTP ${res.status}).`);
        }
        if (alive) {
          setRaw(json.documents ?? []);
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const kw = query.trim();

  // 1) Lọc theo từ khoá.
  const afterKeyword = React.useMemo(
    () => (raw ? raw.filter((d) => matchesKeyword(d, kw)) : []),
    [raw, kw]
  );

  // 2) Facet counts (tính từ tập đã lọc từ khoá).
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

  // 3) Lọc theo facet đã chọn (OR trong nhóm, AND giữa nhóm).
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

  // 4) Sort + map view model.
  const viewDocs: SearchDoc[] = React.useMemo(
    () => sortDocs(filtered, sort).map(toSearchDoc),
    [filtered, sort]
  );

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

  // ── States ──
  if (error) {
    return (
      <div className="sc-root">
        <div className="sc-empty" style={{ color: 'var(--danger-700)' }}>Không tải được dữ liệu: {error}</div>
      </div>
    );
  }
  const loading = raw === null;

  const quickLabels = FACET_DEFS.slice(0, 6).map((f) => f.label);

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
          {quickLabels.map((l) => (
            <span className="chip" key={l}>
              {l} <Icon name="chevdown" />
            </span>
          ))}
          <span className="t-xs mut" style={{ marginLeft: 8 }}>
            (Mở chế độ “3 cột” để lọc chi tiết)
          </span>
        </div>
      )}

      <div className="sc-layout">
        {mode === '3col' && (
          <FilterPanel
            groups={facetGroups}
            selected={selected}
            onToggle={toggleFacet}
            onClearAll={() => setSelected({})}
          />
        )}

        {loading ? (
          <section className="listcol scrollbar">
            <div className="sc-empty">Đang tải văn bản…</div>
          </section>
        ) : mode === 'cards' ? (
          // Lưới thẻ: click → mở trang chi tiết.
          <CardGrid docs={viewDocs} onSelect={openDetail} />
        ) : (
          <DocumentList
            docs={viewDocs}
            total={filtered.length}
            selectedId={effectiveId}
            // 3 cột: click cập nhật preview. Danh sách (full-width, không preview): click mở chi tiết.
            onSelect={mode === 'list' ? openDetail : setSelectedId}
            sort={sort}
            onSort={setSort}
          />
        )}

        {mode === '3col' && <PreviewPane doc={selectedDoc} />}
      </div>
    </div>
  );
}
