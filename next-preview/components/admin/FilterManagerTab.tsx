'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import AdminSwitch from './AdminSwitch';
import { FilterConfig, SEED_FILTERS } from './adminTypes';

// Tab 1 — Bộ lọc tìm kiếm. Admin quyết định filter nào hiện ở Search Center,
// thứ tự, mặc định mở, multi-select. MOCK local state (chưa lưu SharePoint).
export default function FilterManagerTab(): React.ReactElement {
  const [filters, setFilters] = React.useState<FilterConfig[]>(() =>
    [...SEED_FILTERS].sort((a, b) => a.order - b.order)
  );
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);

  const reorder = (from: number, to: number): void => {
    if (from === to || from < 0 || to < 0 || from >= filters.length || to >= filters.length) {
      return;
    }
    setFilters((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((f, i) => ({ ...f, order: i + 1 }));
    });
  };

  const patch = (key: string, p: Partial<FilterConfig>): void => {
    setFilters((prev) => prev.map((f) => (f.key === key ? { ...f, ...p } : f)));
  };

  const visibleFilters = filters.filter((f) => f.visible);

  return (
    <div className="apane on">
      <div className="adm-head">
        <div>
          <h1>Bộ lọc tìm kiếm</h1>
          <div className="t-sm mut">Quyết định bộ lọc nào hiển thị ở Search Center · kéo-thả để sắp thứ tự</div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setFilters([...SEED_FILTERS].sort((a, b) => a.order - b.order))}>
          Khôi phục mặc định
        </button>
      </div>

      <div className="adm-panelcard">
        <div className="adm-toolbar">
          <span className="t-xs mut">{filters.length} bộ lọc · {visibleFilters.length} đang hiển thị</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th style={{ width: 52 }}>TT</th>
              <th>Bộ lọc</th>
              <th style={{ width: 110 }}>Hiển thị</th>
              <th style={{ width: 120 }}>Mặc định mở</th>
              <th style={{ width: 120 }}>Chọn nhiều</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {filters.map((f, idx) => (
              <tr
                key={f.key}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIdx(idx);
                }}
                onDrop={() => {
                  if (dragIdx !== null) reorder(dragIdx, idx);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                className={`${dragIdx === idx ? 'adm-row-dragging' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'adm-row-over' : ''}`}
              >
                <td><span className="adm-handle" title="Kéo để sắp xếp">⋮⋮</span></td>
                <td><span className="t-mono t-xs mut">{f.order}</span></td>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.label}</div>
                  <div className="t-2xs mut t-mono">{f.key}</div>
                </td>
                <td><AdminSwitch on={f.visible} label={`Hiển thị ${f.label}`} onChange={(v) => patch(f.key, { visible: v })} /></td>
                <td><AdminSwitch on={f.defaultExpanded} disabled={!f.visible} label={`Mặc định mở ${f.label}`} onChange={(v) => patch(f.key, { defaultExpanded: v })} /></td>
                <td><AdminSwitch on={f.multiSelect} label={`Chọn nhiều ${f.label}`} onChange={(v) => patch(f.key, { multiSelect: v })} /></td>
                <td style={{ textAlign: 'right' }}>
                  <span className="adm-act">
                    <button type="button" className="adm-iconbtn" disabled={idx === 0} title="Lên" onClick={() => reorder(idx, idx - 1)} aria-label="Di chuyển lên">▲</button>
                    <button type="button" className="adm-iconbtn" disabled={idx === filters.length - 1} title="Xuống" onClick={() => reorder(idx, idx + 1)} aria-label="Di chuyển xuống">▼</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Preview thứ tự — đúng những gì Search Center sẽ render */}
        <div className="adm-preview">
          <div className="t-xs mut" style={{ fontWeight: 700, marginBottom: 10 }}>
            Xem trước thứ tự bộ lọc tại Search Center
          </div>
          {visibleFilters.length === 0 ? (
            <div className="t-sm mut">Chưa bật bộ lọc nào.</div>
          ) : (
            <div className="adm-preview-grid">
              {visibleFilters.map((f, i) => (
                <div className="adm-prev-item" key={f.key}>
                  <span className="ord">{i + 1}</span>
                  <span>{f.label}</span>
                  {f.multiSelect && <span className="badge badge-navy" style={{ padding: '2px 7px' }}>Chọn nhiều</span>}
                  <Icon name={f.defaultExpanded ? 'chevdown' : 'chevright'} size={16} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
