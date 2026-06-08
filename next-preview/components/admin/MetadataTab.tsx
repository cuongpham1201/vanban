'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import AdminSwitch from './AdminSwitch';
import { MetaFieldConfig, SEED_META } from './adminTypes';

// Tab 2 — Cấu hình Metadata V2. Mỗi trường: Visible / Required / Searchable / Filterable / Sortable.
// MOCK local state (chưa lưu SharePoint).
type ToggleKey = 'visible' | 'required' | 'searchable' | 'filterable' | 'sortable';
const COLS: { key: ToggleKey; label: string }[] = [
  { key: 'visible', label: 'Hiển thị' },
  { key: 'required', label: 'Bắt buộc' },
  { key: 'searchable', label: 'Tìm kiếm' },
  { key: 'filterable', label: 'Lọc' },
  { key: 'sortable', label: 'Sắp xếp' },
];

export default function MetadataTab(): React.ReactElement {
  const [fields, setFields] = React.useState<MetaFieldConfig[]>(SEED_META);
  const [q, setQ] = React.useState('');

  const patch = (key: string, col: ToggleKey, value: boolean): void => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, [col]: value } : f)));
  };

  const rows = fields.filter(
    (f) => !q.trim() || f.label.toLowerCase().includes(q.trim().toLowerCase()) || f.key.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="apane on">
      <div className="adm-head">
        <div>
          <h1>Cấu hình Metadata</h1>
          <div className="t-sm mut">Bật/tắt hiển thị, đặt bắt buộc, và quyết định trường nào tìm kiếm / lọc / sắp xếp</div>
        </div>
        <span className="t-xs mut">{fields.length} trường (Metadata V2)</span>
      </div>

      <div className="adm-panelcard">
        <div className="adm-toolbar">
          <div className="adm-picksearch">
            <Icon name="search" size={15} />
            <input placeholder="Tìm trường metadata…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm trường metadata" />
          </div>
          <div style={{ flex: 1 }} />
          <span className="t-xs mut">{rows.length} trường</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Trường</th>
              <th style={{ width: 120 }}>Kiểu</th>
              {COLS.map((c) => (
                <th key={c.key} style={{ width: 90, textAlign: 'center' }}>{c.label}</th>
              ))}
              <th style={{ width: 120 }}>Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.label}</div>
                  <div className="t-2xs mut t-mono">{f.key}</div>
                </td>
                <td><span className="tag">{f.type}</span></td>
                {COLS.map((c) => (
                  <td key={c.key} style={{ textAlign: 'center' }}>
                    <AdminSwitch on={f[c.key]} label={`${c.label} — ${f.label}`} onChange={(v) => patch(f.key, c.key, v)} />
                  </td>
                ))}
                <td><span className="t-xs mut">{f.source}</span></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2 + COLS.length + 1} className="adm-empty">Không có trường phù hợp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
