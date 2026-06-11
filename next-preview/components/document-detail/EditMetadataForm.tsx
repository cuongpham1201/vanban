'use client';

import * as React from 'react';
import { IDocument } from '@dms/models/IDocument';

// Form sửa metadata DÙNG CHUNG (EditMetadataDrawer ở Detail + EditMetadataModal ở Search) —
// tránh duplicate code. Chỉ render thân form + footer; phần khung (drawer/modal) do wrapper lo.
type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select';
interface EditField {
  col: string;
  label: string;
  type: FieldType;
  ck?: string;
  full?: boolean;
  staticChoices?: string[];
  req?: boolean;
  ro?: boolean; // hiển thị read-only (quản lý ở tab khác), KHÔNG gửi khi lưu
}

// Cột do tab chuyên dụng quản lý — KHÔNG gửi từ form sửa metadata (tránh ghi đè/bypass validation).
const MANAGED_BY_TABS = new Set(['HasEditableSource', 'EditableSourceUrl', 'VanBanLienQuan', 'VanBanThayThe']);
interface FieldGroup {
  title: string;
  fields: EditField[];
}
const GROUPS: FieldGroup[] = [
  {
    title: 'Thông tin chính',
    fields: [
      { col: 'SoVanBan', label: 'Số văn bản', type: 'text', req: true },
      { col: 'TrichYeu', label: 'Trích yếu', type: 'textarea', full: true, req: true },
      { col: 'NamBanHanh', label: 'Năm ban hành', type: 'number' },
      { col: 'NgayBanHanh', label: 'Ngày ban hành', type: 'date' },
      { col: 'NgayHetHieuLuc', label: 'Ngày hết hiệu lực', type: 'date' },
      { col: 'TrangThai', label: 'Trạng thái', type: 'select', ck: 'trangThai' },
      { col: 'MucDoBaoMat', label: 'Mức độ bảo mật', type: 'select', ck: 'mucDoBaoMat' },
    ],
  },
  {
    title: 'Phân loại Metadata V2',
    fields: [
      { col: 'NhomTaiLieu', label: 'Nhóm tài liệu', type: 'select', ck: 'nhomTaiLieu', req: true },
      { col: 'LoaiVanBanPhapLy', label: 'Loại VB pháp lý', type: 'select', ck: 'loaiVanBanPhapLy' },
      { col: 'LoaiTaiLieu', label: 'Loại tài liệu', type: 'select', ck: 'loaiTaiLieu' },
      { col: 'ChuDeNghiepVu', label: 'Chủ đề nghiệp vụ', type: 'text' },
      { col: 'DonViPhatHanh', label: 'Đơn vị soạn thảo', type: 'select', ck: 'donViPhatHanh' },
      { col: 'DonViSoHuu', label: 'Cấp lưu trữ', type: 'select', ck: 'donViSoHuu' },
      { col: 'NguonMetadata', label: 'Nguồn metadata', type: 'select', ck: 'nguonMetadata' },
      { col: 'MetadataConfidence', label: 'Độ tin cậy', type: 'select', ck: 'metadataConfidence' },
    ],
  },
  {
    title: 'Liên kết / Nguồn',
    fields: [
      { col: 'HasEditableSource', label: 'Có bản mềm', type: 'text', ro: true },
      { col: 'EditableSourceUrl', label: 'URL bản mềm (quản lý ở tab Bản mềm)', type: 'text', full: true, ro: true },
      { col: 'Tags', label: 'Tags', type: 'text', full: true },
    ],
  },
];

function prefill(doc: IDocument): Record<string, string> {
  return {
    SoVanBan: doc.soVanBan ?? '',
    TrichYeu: doc.trichYeu ?? '',
    NhomTaiLieu: doc.nhomTaiLieu ?? '',
    LoaiVanBanPhapLy: doc.loaiVanBanPhapLy ?? '',
    LoaiTaiLieu: doc.loaiTaiLieu ?? '',
    ChuDeNghiepVu: doc.chuDeNghiepVu ?? '',
    NamBanHanh: doc.namBanHanh ? String(doc.namBanHanh) : '',
    NgayBanHanh: (doc.ngayBanHanh ?? '').slice(0, 10),
    NgayHetHieuLuc: (doc.ngayHetHieuLuc ?? '').slice(0, 10),
    TrangThai: doc.trangThai ?? '',
    MucDoBaoMat: doc.mucDoBaoMat ?? '',
    DonViPhatHanh: doc.donViPhatHanh ?? '',
    DonViSoHuu: doc.donViSoHuu ?? '',
    NguonMetadata: doc.nguonMetadata ?? '',
    MetadataConfidence: doc.metadataConfidence ?? '',
    HasEditableSource: doc.editableSource ? 'true' : 'false',
    EditableSourceUrl: doc.editableSource?.webUrl ?? '',
    Tags: doc.tags ?? '',
    VanBanLienQuan: doc.vanBanLienQuan ?? '',
    VanBanThayThe: doc.vanBanThayThe ?? '',
  };
}

export default function EditMetadataForm({
  doc,
  onClose,
  onSaved,
}: {
  doc: IDocument;
  onClose: () => void;
  onSaved: (warning?: string) => void;
}): React.ReactElement {
  const [form, setForm] = React.useState<Record<string, string>>(() => prefill(doc));
  const [choices, setChoices] = React.useState<Record<string, string[]>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/dms/metadata-choices', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => alive && j?.ok && setChoices(j.choices ?? {}))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const set = (col: string, v: string): void => setForm((p) => ({ ...p, [col]: v }));
  const optionsFor = (f: EditField): string[] => f.staticChoices ?? (f.ck ? choices[f.ck] ?? [] : []);

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      // Loại cột do tab chuyên dụng quản lý (bản mềm / liên quan / thay thế) khỏi payload.
      const payload: Record<string, string> = {};
      for (const [k, val] of Object.entries(form)) {
        if (!MANAGED_BY_TABS.has(k)) {
          payload[k] = val;
        }
      }
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (res.status === 403) {
        setError('Bạn chưa có quyền sửa metadata.');
        return;
      }
      if (!res.ok || !j.ok) {
        setError(j?.error ?? `Lưu thất bại (HTTP ${res.status}).`);
        return;
      }
      const warn = Array.isArray(j.skipped) && j.skipped.length ? `Đã bỏ qua: ${j.skipped.join(', ')}` : undefined;
      onSaved(warn);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi mạng khi lưu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="scrollbar" style={{ flex: 1, overflow: 'auto', padding: '12px 20px 8px' }}>
        {GROUPS.map((g) => (
          <section key={g.title} style={{ marginBottom: 18 }}>
            <div className="t-eyebrow" style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gray-500)', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--gray-150)' }}>
              {g.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              {g.fields.map((f) => (
                <div key={f.col} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>
                    {f.label}{f.req ? <span style={{ color: 'var(--danger-600, #c0362c)' }}> *</span> : null}
                  </label>
                  {f.ro ? (
                    <input className="input" value={form[f.col] ?? ''} readOnly disabled style={{ width: '100%', background: 'var(--gray-050)', color: 'var(--gray-500)' }} />
                  ) : f.type === 'select' ? (
                    <select className="select" value={form[f.col] ?? ''} onChange={(e) => set(f.col, e.target.value)} style={{ width: '100%' }}>
                      <option value="">— Chọn —</option>
                      {form[f.col] && !optionsFor(f).includes(form[f.col]) && <option value={form[f.col]}>{form[f.col]} (hiện tại)</option>}
                      {optionsFor(f).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea className="textarea" rows={2} value={form[f.col] ?? ''} onChange={(e) => set(f.col, e.target.value)} style={{ width: '100%' }} />
                  ) : (
                    <input className="input" type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} value={form[f.col] ?? ''} onChange={(e) => set(f.col, e.target.value)} style={{ width: '100%' }} />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--danger-100)', color: 'var(--danger-700)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)' }}>{error}</div>
        )}
      </div>
      <div className="row between" style={{ padding: '14px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--white)' }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Huỷ</button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu metadata'}</button>
      </div>
    </div>
  );
}
