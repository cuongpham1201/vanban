'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/shell/Icon';
import { IDocument } from '@dms/models/IDocument';
import { isExpired } from '@dms/utils/standardization';
import {
  FACET_DEFS, FacetDef, toSearchDoc, SearchDoc,
  SortKey, SORT_OPTIONS, DEFAULT_SORT, sortDocuments,
  SPECIAL_SORTED_FACETS, compareFacetItems,
  scoreDocument, scoreDocumentDetailed, MIN_RELEVANCE, normalizeVi,
} from './searchTypes';
import { loadFilterConfig, subscribeFilterConfig, fetchFilterConfig } from '@/lib/dms/filterConfig';
import SearchSubBar, { ViewMode } from './SearchSubBar';
import SearchBar from './SearchBar';
import ActiveChips, { ActiveChip } from './ActiveChips';
import FilterPanel, { FacetGroup } from './FilterPanel';
import DocumentList from './DocumentList';
import CardGrid from './CardGrid';
import PreviewPane from './PreviewPane';
import FastPdfModal from './FastPdfModal';
import EditMetadataModal from '@/components/document-detail/EditMetadataModal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { deleteDocument, bulkDeleteDocuments } from '@/lib/dms/deleteClient';

interface DocsResponse {
  ok: boolean;
  documents?: IDocument[];
  error?: string;
}

const EXPIRED_LABEL = 'Hết hiệu lực';

// BUG#7/#13: cache client documents (module-level).
// Cache theo phạm vi: 'pdf' = chỉ PDF (mặc định), 'all' = gộp thêm Word mồ côi (khi bật nút tick).
const _docsCache: { pdf?: IDocument[]; all?: IDocument[] } = {};
const DOCX_PREF_KEY = 'dms.search.includeDocx';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SearchCenterPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Nút tick "Tìm cả bản Word": bật → mở rộng phạm vi tìm sang .docx/.doc mồ côi. Nhớ lựa chọn qua localStorage.
  const [includeDocx, setIncludeDocx] = React.useState<boolean>(() => {
    if (searchParams.get('docx') === '1') return true;
    try {
      return localStorage.getItem(DOCX_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [raw, setRaw] = React.useState<IDocument[] | null>((includeDocx ? _docsCache.all : _docsCache.pdf) ?? null);
  const [error, setError] = React.useState<string | undefined>();
  const [query, setQuery] = React.useState(searchParams.get('q') ?? '');
  // Cấu hình filter dùng chung với /admin. Source of truth = SharePoint (API); cache localStorage
  // dùng để render tức thì; nếu API lỗi → fallback cache/default. Chỉ render filter visible=true, theo order.
  const [filterConfig, setFilterConfig] = React.useState(() => loadFilterConfig());
  React.useEffect(() => subscribeFilterConfig(() => setFilterConfig(loadFilterConfig())), []);
  React.useEffect(() => {
    let alive = true;
    void fetchFilterConfig().then((r) => {
      if (alive && r.config) setFilterConfig(r.config);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [selected, setSelected] = React.useState<Record<string, Set<string>>>(() => {
    const visibleSet = new Set(loadFilterConfig().filter((c) => c.visible).map((c) => c.key));
    const init: Record<string, Set<string>> = {};
    for (const def of FACET_DEFS) {
      if (!visibleSet.has(def.key)) continue; // bỏ qua filter bị ẩn (kể cả nếu URL có sẵn value)
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
    return SORT_OPTIONS.some((o) => o.key === s) ? (s as SortKey) : DEFAULT_SORT;
  });
  const [quickDoc, setQuickDoc] = React.useState<SearchDoc | null>(null); // BUG#9 modal
  const [canWrite, setCanWrite] = React.useState(false); // BUG#12A
  const [editingDoc, setEditingDoc] = React.useState<IDocument | null>(null);
  // Xóa văn bản (multi-select + single).
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<{ kind: 'single' | 'bulk'; ids: string[] } | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const showToast = (m: string): void => {
    setToast(m);
    window.setTimeout(() => setToast(null), 5000);
  };
  // BUG#24: mobile ép view = list (không 3 cột). Không đổi state `mode` để không ghi URL.
  const [isMobile, setIsMobile] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false); // BUG#29 mobile filter drawer
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = (): void => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

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
    if (sort !== DEFAULT_SORT) p.set('sort', sort);
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
  // includeDocx → gọi kèm ?includeDocx=1 để API gộp thêm Word mồ côi. Cache tách theo phạm vi.
  const loadDocs = React.useCallback((): void => {
    const key: 'pdf' | 'all' = includeDocx ? 'all' : 'pdf';
    fetch(`/api/documents${includeDocx ? '?includeDocx=1' : ''}`, { credentials: 'same-origin' })
      .then(async (res) => {
        const json = (await res.json()) as DocsResponse;
        if (!res.ok || !json.ok) throw new Error(json?.error ?? `Lỗi tải dữ liệu (HTTP ${res.status}).`);
        _docsCache[key] = json.documents ?? [];
        setRaw(_docsCache[key] ?? []);
      })
      .catch((e: Error) => !_docsCache[key] && setError(e.message));
  }, [includeDocx]);

  React.useEffect(() => {
    // Đổi phạm vi → hiện ngay bản cache tương ứng (nếu có) rồi tải nền cho tươi.
    const cached = includeDocx ? _docsCache.all : _docsCache.pdf;
    if (cached) setRaw(cached);
    loadDocs();
  }, [loadDocs, includeDocx]);

  const toggleIncludeDocx = React.useCallback((next: boolean): void => {
    setIncludeDocx(next);
    try {
      localStorage.setItem(DOCX_PREF_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

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
  // Điểm relevance theo keyword (chỉ tính khi có keyword). 0 = không đủ liên quan.
  const scoreMap = React.useMemo(() => {
    const m = new Map<string, number>();
    if (kw && raw) {
      for (const d of raw) {
        m.set(d.id, scoreDocument(d, kw));
      }
    }
    return m;
  }, [raw, kw]);
  const afterKeyword = React.useMemo(
    () => (raw ? (kw ? raw.filter((d) => (scoreMap.get(d.id) ?? 0) >= MIN_RELEVANCE) : raw) : []),
    [raw, kw, scoreMap]
  );

  // Debug relevance — CHỈ dev (browser console), không hiển thị UI và không log ở production build.
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !kw || !raw) {
      return;
    }
    const top = raw
      .map((d) => ({ d, ...scoreDocumentDetailed(d, kw) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => ({ num: x.d.soVanBan, title: x.d.trichYeu, score: x.score, reasons: x.reasons }));
    // eslint-disable-next-line no-console
    console.debug('[search-relevance]', { kw, normalized: normalizeVi(kw), before: raw.length, after: afterKeyword.length, top });
  }, [kw, raw, afterKeyword.length]);

  // BUG#14B: ẩn văn bản Hết hiệu lực mặc định, trừ khi user chọn trạng thái/nhóm "Hết hiệu lực".
  const showExpired =
    (selected.trangThai?.has(EXPIRED_LABEL) ?? false) || (selected.nhomTaiLieu?.has(EXPIRED_LABEL) ?? false);

  // Filter hiển thị + thứ tự theo cấu hình Admin: chỉ visible=true, sort theo order,
  // label + trạng thái mở (open) lấy từ config. Filter bị ẩn KHÔNG render & KHÔNG lọc kết quả.
  const orderedDefs = React.useMemo<FacetDef[]>(() => {
    const byKey = new Map(FACET_DEFS.map((d) => [d.key, d]));
    return filterConfig
      .filter((c) => c.visible)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => {
        const def = byKey.get(c.key);
        return def ? { ...def, label: c.label, open: c.defaultExpanded } : null;
      })
      .filter((x): x is FacetDef => x !== null);
  }, [filterConfig]);

  const visibleKeys = React.useMemo(() => new Set(orderedDefs.map((d) => d.key)), [orderedDefs]);

  // Khi config đổi (vd Admin ẩn 1 filter): clear selected value của filter không còn hiển thị.
  React.useEffect(() => {
    setSelected((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (!visibleKeys.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [visibleKeys]);

  // Helper: lọc theo facet đã chọn (chỉ facet đang hiển thị), có thể bỏ qua 1 facet (cho contextual count).
  //
  // BUG#14B + đồng bộ count/result: "ẩn Hết hiệu lực mặc định" là RÀNG BUỘC NGẦM trên dimension
  // trạng thái (isExpired ⟺ giá trị facet trangThai = "Hết hiệu lực"). Vì vậy ràng buộc này được áp
  // dụng GIỐNG NHAU cho cả facet count lẫn kết quả, và CHỈ được bỏ qua khi đang đếm chính facet
  // 'trangThai' (để lộ tùy chọn "Hết hiệu lực"/"Sắp hết hiệu lực" cho user opt-in). Nhờ đó facet count
  // LUÔN khớp số kết quả khi tick (vd "Thiếu bản mềm").
  const applyFacets = React.useCallback(
    (docs: IDocument[], exceptKey?: string): IDocument[] => {
      const hideExpiredHere = !showExpired && exceptKey !== 'trangThai';
      return docs.filter((d) => {
        if (hideExpiredHere && isExpired(d)) return false;
        return orderedDefs.every((def) => {
          if (def.key === exceptKey) return true;
          const sel = selected[def.key];
          return !sel || sel.size === 0 || sel.has(def.get(d));
        });
      });
    },
    [selected, orderedDefs, showExpired]
  );

  // BUG#10/#15: CONTEXTUAL facet count — count trên tập đã áp dụng MỌI filter khác (trừ facet đang tính).
  const facetGroups: FacetGroup[] = React.useMemo(
    () =>
      orderedDefs.map((def) => {
        const base = applyFacets(afterKeyword, def.key);
        const counts = new Map<string, number>();
        for (const d of base) {
          const val = def.get(d);
          counts.set(val, (counts.get(val) ?? 0) + 1);
        }
        const items = Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
        // FIX B: facet đặc biệt (Cấp lưu trữ/Loại tài liệu/Năm/Nhóm) sort theo quy tắc riêng;
        // còn lại theo count giảm dần. Áp dụng chung cho left panel · mobile drawer · quick dropdown.
        if (SPECIAL_SORTED_FACETS.has(def.key)) {
          items.sort((a, b) => compareFacetItems(def.key, a.value, b.value));
        } else {
          items.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'vi'));
        }
        return { key: def.key, label: def.label, open: def.open, items };
      }),
    [afterKeyword, applyFacets, orderedDefs]
  );

  // applyFacets đã tự áp dụng ẩn-Hết-hiệu-lực (trừ khi user opt-in) → count facet == số kết quả.
  const filtered = React.useMemo(() => applyFacets(afterKeyword), [afterKeyword, applyFacets]);

  // Có keyword + đang để sort mặc định (ngày) → ưu tiên RELEVANCE (relevance desc, rồi NgayBanHanh desc).
  // User chủ động chọn sort khác (ngày cũ nhất / số VB / độ tin cậy) thì tôn trọng lựa chọn đó.
  const effectiveSort: SortKey = kw && sort === DEFAULT_SORT ? 'relevance' : sort;
  const viewDocs: SearchDoc[] = React.useMemo(
    () => sortDocuments(filtered, effectiveSort, (d) => scoreMap.get(d.id) ?? 0).map(toSearchDoc),
    [filtered, effectiveSort, scoreMap]
  );

  const selectedDoc = React.useMemo(
    () => viewDocs.find((v) => v.id === selectedId) ?? viewDocs[0] ?? null,
    [viewDocs, selectedId]
  );
  const effectiveId = selectedDoc?.id ?? null;

  const chips: ActiveChip[] = React.useMemo(
    () =>
      Object.entries(selected)
        .filter(([key]) => visibleKeys.has(key)) // không hiện chip của filter bị ẩn
        .flatMap(([key, set]) => Array.from(set).map((value) => ({ key, value }))),
    [selected, visibleKeys]
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

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = (): void => setSelectedIds(new Set());

  // Xóa: chỉ id số (list item thật) mới xóa được. Lọc bỏ id mock/không hợp lệ.
  const deletableIds = (ids: string[]): string[] => ids.filter((x) => /^\d+$/.test(x));

  const runDelete = async (): Promise<void> => {
    if (!confirm) return;
    const ids = deletableIds(confirm.ids);
    if (ids.length === 0) {
      setConfirm(null);
      showToast('Không có văn bản hợp lệ để xóa.');
      return;
    }
    setDeleting(true);
    if (confirm.kind === 'single') {
      const r = await deleteDocument(ids[0]);
      setDeleting(false);
      setConfirm(null);
      if (!r.ok) {
        showToast(`Xóa thất bại: ${r.error ?? 'lỗi không xác định'}`);
        return;
      }
      // chọn item kế tiếp nếu có
      const idx = viewDocs.findIndex((v) => v.id === ids[0]);
      const nextDoc = viewDocs[idx + 1] ?? viewDocs[idx - 1] ?? null;
      setSelectedId(nextDoc ? nextDoc.id : null);
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(ids[0]);
        return n;
      });
      loadDocs();
      showToast('Đã xóa 1 văn bản.');
    } else {
      const res = await bulkDeleteDocuments(ids);
      setDeleting(false);
      setConfirm(null);
      if (!res.ok) {
        showToast(`Xóa hàng loạt thất bại: ${res.error ?? 'lỗi không xác định'}`);
        return;
      }
      const results = res.results ?? [];
      const okCount = results.filter((x) => x.ok).length;
      const failed = results.filter((x) => !x.ok);
      clearSelection();
      loadDocs();
      const failMsg = failed.length ? ` Lỗi: ${failed.slice(0, 3).map((f) => `#${f.id}`).join(', ')}${failed.length > 3 ? '…' : ''}.` : '';
      showToast(`Đã xóa ${okCount}/${ids.length} văn bản.${failMsg}`);
    }
  };

  if (error) {
    return (
      <div className="sc-root">
        <div className="sc-empty" style={{ color: 'var(--danger-700)' }}>Không tải được dữ liệu: {error}</div>
      </div>
    );
  }
  const loading = raw === null;
  const effectiveMode: ViewMode = isMobile && mode === '3col' ? 'list' : mode;

  return (
    <div className="sc-root">
      <SearchSubBar count={filtered.length} mode={mode} onMode={setMode} sort={sort} onSort={setSort} includeDocx={includeDocx} onIncludeDocx={toggleIncludeDocx} />

      {canWrite && selectedIds.size > 0 && (
        <div className="bulkbar" role="region" aria-label="Hành động hàng loạt">
          <span className="bulkbar-count">Đã chọn {selectedIds.size} văn bản</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ kind: 'bulk', ids: Array.from(selectedIds) })}>
            <Icon name="trash" size={15} /> Xóa
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Bỏ chọn</button>
        </div>
      )}

      <div className="searchrow">
        <div className="searchrow-top">
          <SearchBar value={query} onChange={setQuery} onClear={() => setQuery('')} />
          {/* BUG#29: mobile chỉ còn Search + Sort + nút Bộ lọc; chips/facets vào drawer. */}
          <button type="button" className="sc-filter-btn" onClick={() => setFilterOpen(true)} aria-label="Bộ lọc">
            <Icon name="filter" /> <span className="sc-filter-label">Bộ lọc{chips.length ? ` (${chips.length})` : ''}</span>
          </button>
        </div>
        <ActiveChips
          chips={chips}
          onRemove={toggleFacet}
          keyword={dq.trim()}
          onClearKeyword={() => setQuery('')}
        />
      </div>

      {effectiveMode !== '3col' && (
        <div className="topbar2">
          <span className="t-xs mut" style={{ fontWeight: 600 }}>
            <Icon name="filter" /> Lọc nhanh:
          </span>
          {orderedDefs.slice(0, 6).map((def) => {
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

      <div className={`sc-layout${effectiveMode === '3col' ? ' sc-3col' : ''}`}>
        {effectiveMode === '3col' && (
          <FilterPanel groups={facetGroups} selected={selected} onToggle={toggleFacet} onClearAll={() => setSelected({})} />
        )}

        {loading ? (
          <section className="listcol scrollbar">
            <div className="sc-empty">Đang tải văn bản…</div>
          </section>
        ) : effectiveMode === 'cards' ? (
          <CardGrid
            docs={viewDocs}
            onSelect={openDetail}
            onOpen={openDetail}
            onQuick={openQuick}
            onPrefetch={prefetchDetail}
            selectable={canWrite}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ) : (
          <DocumentList
            docs={viewDocs}
            total={filtered.length}
            selectedId={effectiveId}
            onSelect={effectiveMode === 'list' ? openDetail : selectItem}
            onOpen={openDetail}
            onQuick={openQuick}
            onPrefetch={prefetchDetail}
            selectable={canWrite}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}

        {effectiveMode === '3col' && (
          <PreviewPane
            doc={selectedDoc}
            openHref={selectedDoc ? detailHref(selectedDoc.id) : undefined}
            canWrite={canWrite}
            onEdit={selectedDoc ? () => openEdit(selectedDoc.id) : undefined}
            onQuickPdf={selectedDoc ? () => setQuickDoc(selectedDoc) : undefined}
            onDelete={selectedDoc && /^\d+$/.test(selectedDoc.id) ? () => setConfirm({ kind: 'single', ids: [selectedDoc.id] }) : undefined}
          />
        )}
      </div>

      {/* BUG#29: Filter drawer cho mobile — chips + facets gom vào đây. */}
      {filterOpen && (
        <div className="sc-filter-overlay" onClick={() => setFilterOpen(false)}>
          <div className="sc-filter-drawer scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="sc-filter-head">
              <span className="t-h3">Bộ lọc</span>
              <button className="btn btn-ghost btn-icon" aria-label="Đóng" onClick={() => setFilterOpen(false)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="sc-filter-chips">
              <ActiveChips chips={chips} onRemove={toggleFacet} keyword={dq.trim()} onClearKeyword={() => setQuery('')} />
            </div>
            <FilterPanel groups={facetGroups} selected={selected} onToggle={toggleFacet} onClearAll={() => setSelected({})} />
            <div className="sc-filter-foot">
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setFilterOpen(false)}>
                Xem {filtered.length.toLocaleString('vi-VN')} kết quả
              </button>
            </div>
          </div>
        </div>
      )}

      {quickDoc && (
        <FastPdfModal doc={quickDoc} detailHref={detailHref(quickDoc.id)} onClose={() => setQuickDoc(null)} />
      )}

      {editingDoc && (
        <EditMetadataModal
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSaved={() => {
            setEditingDoc(null);
            loadDocs(); // refresh metadata panel + list
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'bulk' ? `Xóa ${deletableIds(confirm.ids).length} văn bản?` : 'Xóa văn bản?'}
          message={
            <>
              {confirm.kind === 'bulk' ? (
                <div style={{ marginBottom: 6 }}>Bạn sắp xóa <b>{deletableIds(confirm.ids).length}</b> văn bản.</div>
              ) : (
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{viewDocs.find((v) => v.id === confirm.ids[0])?.num ?? confirm.ids[0]}</div>
              )}
              <div>Hành động này sẽ xóa file PDF và file bản mềm liên quan khỏi SharePoint (vào thùng rác).</div>
            </>
          }
          confirmLabel="Xóa"
          busy={deleting}
          onConfirm={() => void runDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
            background: 'var(--navy-700)', color: '#fff', padding: '10px 18px', borderRadius: 'var(--r-md)',
            boxShadow: '0 8px 24px -8px rgba(0,0,0,.3)', fontSize: 'var(--fs-sm)', maxWidth: '90vw', textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
