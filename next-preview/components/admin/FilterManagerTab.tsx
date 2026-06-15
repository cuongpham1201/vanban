'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import AdminSwitch from './AdminSwitch';
import {
  FilterConfig,
  DEFAULT_FILTER_CONFIG,
  loadFilterConfig,
  saveFilterConfig,
  resetFilterConfig,
  fetchFilterConfig,
  putFilterConfig,
} from '@/lib/dms/filterConfig';
import { safeJsonFetch } from '@/lib/client/safeJsonFetch';

type SaveState = { kind: 'idle' | 'saving' | 'saved' | 'error'; msg?: string };

// Tab 1 — Bộ lọc tìm kiếm. Source of truth = SharePoint (qua API). localStorage chỉ là cache.
// Đọc API khi mount; mỗi thay đổi (toggle/reorder) PUT lên SharePoint. Chỉ admin/canWrite mới lưu được.
export default function FilterManagerTab(): React.ReactElement {
  // Khởi tạo DETERMINISTIC = default (KHÔNG đọc localStorage ở initializer → tránh hydration mismatch
  // #418/#425: server render default, client phải khớp). Cache localStorage nạp sau khi mount (useEffect).
  const [filters, setFilters] = React.useState<FilterConfig[]>(() => DEFAULT_FILTER_CONFIG.map((d) => ({ ...d })));
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);
  const [save, setSave] = React.useState<SaveState>({ kind: 'idle' });
  const [canWrite, setCanWrite] = React.useState<boolean | null>(null);
  const [provisioning, setProvisioning] = React.useState(false);
  const [provisionMsg, setProvisionMsg] = React.useState<string | null>(null);

  // Mount: nạp cache localStorage (sau hydration), rồi đọc cấu hình thật từ SharePoint + quyền ghi.
  React.useEffect(() => {
    let alive = true;
    const cached = loadFilterConfig(); // an toàn sau mount (đã có window)
    if (alive) setFilters(cached);
    void fetchFilterConfig().then((r) => {
      if (alive && r.config) setFilters(r.config);
    });
    void safeJsonFetch<{ canWrite?: boolean }>('/api/dms/write-status').then(({ data }) => {
      if (alive) setCanWrite(!!data?.canWrite);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Cập nhật state + cache + PUT SharePoint.
  const persist = (next: FilterConfig[]): void => {
    setFilters(next);
    saveFilterConfig(next); // cache lạc quan
    setSave({ kind: 'saving' });
    void putFilterConfig(next).then((r) => {
      if (r.ok) {
        setSave({ kind: 'saved' });
        window.setTimeout(() => setSave((s) => (s.kind === 'saved' ? { kind: 'idle' } : s)), 2500);
      } else {
        setSave({ kind: 'error', msg: r.error });
      }
    });
  };

  const reorder = (from: number, to: number): void => {
    if (from === to || from < 0 || to < 0 || from >= filters.length || to >= filters.length) {
      return;
    }
    const next = [...filters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next.map((f, i) => ({ ...f, order: i + 1 })));
  };

  const patch = (key: string, p: Partial<FilterConfig>): void => {
    persist(filters.map((f) => (f.key === key ? { ...f, ...p } : f)));
  };

  // Khôi phục mặc định: clear cache + lưu default lên SharePoint (chia sẻ toàn hệ thống).
  const restoreDefault = (): void => {
    const def = DEFAULT_FILTER_CONFIG.map((d) => ({ ...d }));
    resetFilterConfig(); // clear cache
    persist(def);
  };

  // Seed list DMSConfig (tạo list + cột nếu chưa có) → /admin filter-config load/save được.
  const onProvision = async (): Promise<void> => {
    setProvisioning(true);
    setProvisionMsg(null);
    try {
      const r = await fetch('/api/admin/provision-config', { method: 'POST', credentials: 'same-origin' });
      // #36: đọc text rồi parse an toàn — KHÔNG res.json() mù (proxy có thể trả HTML 502).
      const raw = await r.text();
      let j: { ok?: boolean; created?: boolean; addedColumns?: string[]; error?: string } | null = null;
      try {
        j = raw ? (JSON.parse(raw) as typeof j) : null;
      } catch {
        j = null;
      }
      if (!j) {
        setProvisionMsg(`Không tạo được list cấu hình (HTTP ${r.status}). Kiểm tra log server.`);
      } else if (j.ok) {
        setProvisionMsg(
          `${j.created ? 'Đã tạo list DMSConfig' : 'List DMSConfig đã sẵn sàng'}${j.addedColumns?.length ? ` (cột: ${j.addedColumns.join(', ')})` : ''}.`
        );
      } else {
        setProvisionMsg(`Không tạo được list cấu hình: ${j.error ?? `HTTP ${r.status}`}. Kiểm tra log server.`);
      }
    } catch (e) {
      setProvisionMsg(`Không tạo được list cấu hình. Kiểm tra log server. (${e instanceof Error ? e.message : String(e)})`);
    } finally {
      setProvisioning(false);
    }
  };

  const readOnly = canWrite === false;
  const visibleFilters = filters.filter((f) => f.visible);

  const saveLabel =
    save.kind === 'saving' ? 'Đang lưu…' :
    save.kind === 'saved' ? 'Đã lưu vào SharePoint' :
    save.kind === 'error' ? `Lưu lỗi: ${save.msg ?? ''}` : '';

  return (
    <div className="apane on">
      <div className="adm-head">
        <div>
          <h1>Bộ lọc tìm kiếm</h1>
          <div className="t-sm mut">Quyết định bộ lọc nào hiển thị ở Search Center · kéo-thả để sắp thứ tự · lưu chung toàn hệ thống (SharePoint)</div>
        </div>
        <div className="row gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => void onProvision()} disabled={readOnly || provisioning} title="Tạo SharePoint list DMSConfig nếu chưa có">
            {provisioning ? 'Đang tạo…' : 'Tạo list cấu hình'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={restoreDefault} disabled={readOnly}>
            Khôi phục mặc định
          </button>
        </div>
      </div>
      {provisionMsg && (
        <div className="t-xs" style={{ marginBottom: 12, color: provisionMsg.startsWith('Lỗi') ? 'var(--danger-700)' : 'var(--success-700)' }}>
          {provisionMsg}
        </div>
      )}

      {readOnly && (
        <div className="rp-warn" style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--warning-100)', border: '1px solid var(--warning-500)', borderRadius: 'var(--r-md)' }}>
          <span className="t-sm">Bạn không có quyền chỉnh sửa cấu hình (chỉ admin/canWrite). Chế độ chỉ xem.</span>
        </div>
      )}

      <div className="adm-panelcard">
        <div className="adm-toolbar">
          <span className="t-xs mut">{filters.length} bộ lọc · {visibleFilters.length} đang hiển thị</span>
          <div style={{ flex: 1 }} />
          {saveLabel && (
            <span className="t-2xs" style={{ fontWeight: 600, color: save.kind === 'error' ? 'var(--danger-700)' : save.kind === 'saved' ? 'var(--success-700)' : 'var(--gray-500)' }}>
              {saveLabel}
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
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
                draggable={!readOnly}
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
                <td><AdminSwitch on={f.visible} disabled={readOnly} label={`Hiển thị ${f.label}`} onChange={(v) => patch(f.key, { visible: v })} /></td>
                <td><AdminSwitch on={f.defaultExpanded} disabled={readOnly || !f.visible} label={`Mặc định mở ${f.label}`} onChange={(v) => patch(f.key, { defaultExpanded: v })} /></td>
                <td><AdminSwitch on={f.multiSelect} disabled={readOnly} label={`Chọn nhiều ${f.label}`} onChange={(v) => patch(f.key, { multiSelect: v })} /></td>
                <td style={{ textAlign: 'right' }}>
                  <span className="adm-act">
                    <button type="button" className="adm-iconbtn" disabled={readOnly || idx === 0} title="Lên" onClick={() => reorder(idx, idx - 1)} aria-label="Di chuyển lên">▲</button>
                    <button type="button" className="adm-iconbtn" disabled={readOnly || idx === filters.length - 1} title="Xuống" onClick={() => reorder(idx, idx + 1)} aria-label="Di chuyển xuống">▼</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

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
