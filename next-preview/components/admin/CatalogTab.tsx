'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import AdminSwitch from './AdminSwitch';
import { CatalogDef, CatalogItem, SEED_CATALOGS } from './adminTypes';

// Tab 3 — Danh mục. CRUD UI cho 4 danh mục (Nhóm / Loại tài liệu / Loại VB pháp lý / Đơn vị).
// MOCK local state (chưa lưu SharePoint, chưa API write).
export default function CatalogTab(): React.ReactElement {
  const [catalogs, setCatalogs] = React.useState<CatalogDef[]>(() => SEED_CATALOGS.map((c) => ({ ...c, items: [...c.items] })));
  const [activeKey, setActiveKey] = React.useState<CatalogDef['key']>('nhom');

  const active = catalogs.find((c) => c.key === activeKey) ?? catalogs[0];

  const update = (items: CatalogItem[]): void => {
    setCatalogs((prev) => prev.map((c) => (c.key === activeKey ? { ...c, items } : c)));
  };

  return (
    <div className="apane on">
      <div className="adm-head">
        <div>
          <h1>Danh mục</h1>
          <div className="t-sm mut">Quản lý các danh mục dùng cho phân loại &amp; lọc văn bản</div>
        </div>
        <div className="adm-seg" role="tablist" aria-label="Chọn danh mục">
          {catalogs.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={c.key === activeKey}
              className={c.key === activeKey ? 'on' : ''}
              onClick={() => setActiveKey(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <CatalogPanel def={active} onChange={update} />
    </div>
  );
}

function CatalogPanel({ def, onChange }: { def: CatalogDef; onChange: (items: CatalogItem[]) => void }): React.ReactElement {
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [parent, setParent] = React.useState('');
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');

  const add = (): void => {
    const n = name.trim();
    if (!n) return;
    const item: CatalogItem = {
      id: `${def.key}-${n}-${def.items.length}`,
      name: n,
      count: 0,
      active: true,
      ...(def.hasCode ? { code: code.trim() || '—', parent: parent.trim() || '—' } : {}),
    };
    onChange([item, ...def.items]);
    setName('');
    setCode('');
    setParent('');
  };

  const remove = (id: string): void => onChange(def.items.filter((i) => i.id !== id));
  const toggle = (id: string): void => onChange(def.items.map((i) => (i.id === id ? { ...i, active: !i.active } : i)));
  const startEdit = (i: CatalogItem): void => {
    setEditId(i.id);
    setEditName(i.name);
  };
  const commitEdit = (): void => {
    if (editId) {
      const n = editName.trim();
      if (n) onChange(def.items.map((i) => (i.id === editId ? { ...i, name: n } : i)));
    }
    setEditId(null);
    setEditName('');
  };

  const total = def.items.reduce((s, i) => s + i.count, 0);

  return (
    <div className="adm-panelcard">
      {/* Hàng thêm mới */}
      <div className="adm-addrow">
        <input className="input" placeholder={`Tên ${def.label.toLowerCase()} mới…`} value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Tên mục mới" />
        {def.hasCode && (
          <>
            <input className="input code" placeholder="Mã (vd HCNS)" value={code}
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Mã đơn vị" />
            <input className="input" placeholder="Trực thuộc…" value={parent}
              onChange={(e) => setParent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Trực thuộc" />
          </>
        )}
        <button type="button" className="btn btn-primary" onClick={add} disabled={!name.trim()}>
          <Icon name="plus" size={16} /> Thêm
        </button>
      </div>

      <div className="adm-toolbar">
        <span className="t-xs mut">{def.hint}</span>
        <div style={{ flex: 1 }} />
        <span className="t-xs mut">{def.items.length} mục · {total.toLocaleString('vi-VN')} văn bản</span>
      </div>

      {/* Bảng có cột cố định (Mã/Trực thuộc/Số VB...) → cuộn ngang TRONG container trên mobile,
          không đẩy tràn cả trang (body đã overflow-x:hidden). */}
      <div style={{ overflowX: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>{def.label}</th>
            {def.hasCode && <th style={{ width: 90 }}>Mã</th>}
            {def.hasCode && <th style={{ width: 160 }}>Trực thuộc</th>}
            <th style={{ width: 120 }}>Số văn bản</th>
            <th style={{ width: 120 }}>Đang dùng</th>
            <th style={{ width: 100 }} />
          </tr>
        </thead>
        <tbody>
          {def.items.map((i) => (
            <tr key={i.id}>
              <td style={{ fontWeight: 600 }}>
                {editId === i.id ? (
                  <input
                    className="adm-inline-input"
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') { setEditId(null); setEditName(''); }
                    }}
                    onBlur={commitEdit}
                    aria-label="Sửa tên mục"
                  />
                ) : (
                  i.name
                )}
              </td>
              {def.hasCode && <td><span className="t-mono t-xs">{i.code}</span></td>}
              {def.hasCode && <td className="mut">{i.parent}</td>}
              <td>{i.count.toLocaleString('vi-VN')}</td>
              <td>
                {i.active
                  ? <span className="badge badge-ok">Đang dùng</span>
                  : <span className="badge badge-neutral">Ẩn</span>}
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className="adm-act">
                  <AdminSwitch on={i.active} label={`Bật/tắt ${i.name}`} onChange={() => toggle(i.id)} />
                  <button type="button" className="adm-iconbtn" title="Sửa tên" onClick={() => startEdit(i)} aria-label="Sửa">
                    <Icon name="edit" size={15} />
                  </button>
                  <button type="button" className="adm-iconbtn danger" title="Xóa" onClick={() => remove(i.id)} aria-label="Xóa">
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </td>
            </tr>
          ))}
          {def.items.length === 0 && (
            <tr>
              <td colSpan={def.hasCode ? 6 : 4} className="adm-empty">Chưa có mục nào — thêm ở trên.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
