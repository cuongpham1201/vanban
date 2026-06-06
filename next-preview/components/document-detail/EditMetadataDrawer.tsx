'use client';

import * as React from 'react';
import Icon from '@/components/shell/Icon';
import { IDocument } from '@dms/models/IDocument';

// Các trường metadata cho phép sửa (internal name). Loại trừ NguoiKy/file/folder/content.
type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select';
interface EditField {
  col: string;
  label: string;
  type: FieldType;
  ck?: string; // key trong metadata-choices (select)
  full?: boolean;
  staticChoices?: string[];
  req?: boolean; // trường quan trọng (đánh dấu *)
}
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
      { col: 'DonViPhatHanh', label: 'Đơn vị phát hành', type: 'select', ck: 'donViPhatHanh' },
      { col: 'DonViSoHuu', label: 'Đơn vị sở hữu', type: 'select', ck: 'donViSoHuu' },
      { col: 'NguonMetadata', label: 'Nguồn metadata', type: 'select', ck: 'nguonMetadata' },
      { col: 'MetadataConfidence', label: 'Độ tin cậy', type: 'select', ck: 'metadataConfidence' },
    ],
  },
  {
    title: 'Liên kết / Nguồn',
    fields: [
      { col: 'HasEditableSource', label: 'Có bản mềm', type: 'select', staticChoices: ['true', 'false'] },
      { col: 'EditableSourceUrl', label: 'URL bản mềm', type: 'text', full: true },
      { col: 'Tags', label: 'Tags', type: 'text', full: true },
      { col: 'VanBanLienQuan', label: 'Văn bản liên quan', type: 'text', full: true },
      { col: 'VanBanThayThe', label: 'Văn bản thay thế', type: 'text' },
    ],
  },
];

// Prefill từ IDocument (camelCase) → internal column name.
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

export default function EditMetadataDrawer({
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

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(form),
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

  const optionsFor = (f: EditField): string[] => f.staticChoices ?? (f.ck ? choices[f.ck] ?? [] : []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,31,77,.35)' }} />
      <aside
        className="scrollbar"
        style={{
          position: 'relative', width: 'min(560px, 96vw)', height: '100%', background: 'var(--white)',
          boxShadow: 'var(--sh-2, -8px 0 32px -8px rgba(0,0,0,.25))', overflow: 'auto', display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="row between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-200)', position: 'sticky', top: 0, background: 'var(--white)', zIndex: 1 }}>
          <h2 className="t-h3" style={{ margin: 0 }}>Sửa metadata</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} title="Đóng" aria-label="Đóng"><Icon name="plus" size={18} /></button>
        </div>

        <div style={{ padding: '12px 20px 8px' }}>
          {GROUPS.map((g) => (
            <section key={g.title} style={{ marginBottom: 18 }}>
              <div
                className="t-eyebrow"
                style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--gray-500)', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--gray-150)' }}
              >
                {g.title}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                {g.fields.map((f) => (
                  <div key={f.col} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
                    <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>
                      {f.label}{f.req ? <span style={{ color: 'var(--danger-600, #c0362c)' }}> *</span> : null}
                    </label>
                    {f.type === 'select' ? (
                      <select className="select" value={form[f.col] ?? ''} onChange={(e) => set(f.col, e.target.value)} style={{ width: '100%' }}>
                        <option value="">— Chọn —</option>
                        {form[f.col] && !optionsFor(f).includes(form[f.col]) && <option value={form[f.col]}>{form[f.col]} (hiện tại)</option>}
                        {optionsFor(f).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea className="textarea" rows={2} value={form[f.col] ?? ''} onChange={(e) => set(f.col, e.target.value)} style={{ width: '100%' }} />
                    ) : (
                      <input
                        className="input"
                        type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                        value={form[f.col] ?? ''}
                        onChange={(e) => set(f.col, e.target.value)}
                        style={{ width: '100%' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {error && (
          <div style={{ margin: '0 20px 12px', padding: '10px 14px', background: 'var(--danger-100)', color: 'var(--danger-700)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)' }}>
            {error}
          </div>
        )}

        <div className="row between" style={{ padding: '14px 20px', borderTop: '1px solid var(--gray-200)', marginTop: 'auto', position: 'sticky', bottom: 0, background: 'var(--white)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu metadata'}
          </button>
        </div>
      </aside>
    </div>
  );
}
