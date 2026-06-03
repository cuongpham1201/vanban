'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocument, DocStatus, SecurityLevel, IMetadataChoices } from '../models/IDocument';
import { formatDate, remainingLabel, daysUntil } from '../utils/format';
import { FALLBACK_METADATA_CHOICES } from '../utils/metadataChoices';
import { PdfFileIcon, WordFileIcon, ArrowRightIcon, TrashIcon, UploadIcon } from './Icons';
import ConfirmDialog from './ConfirmDialog';

const EDITABLE_EXTS: string[] = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

export interface IDocumentDetailDrawerProps {
  document: IDocument | undefined;
  /** Choices lấy động từ DMS Library field schema (fallback nếu chưa truyền). */
  choices?: IMetadataChoices;
  onClose: () => void;
  /** Lưu metadata đã sửa (id, map InternalName->value). Trả document mới để refresh. */
  onSave?: (id: string, values: { [internalName: string]: string }) => Promise<IDocument | undefined>;
  /** Xóa (Thùng rác) văn bản này (+ bản mềm đi kèm). */
  onDelete?: (docs: IDocument[], onProgress?: (done: number, total: number) => void) => Promise<{ ok: number; failed: number; errors: string[] }>;
  /** Upload bản mềm cho văn bản PDF thiếu bản mềm. */
  onUploadEditableSource?: (doc: IDocument, fileBuffer: ArrayBuffer, fileName: string) => Promise<IDocument | undefined>;
  /** Gắn link bản mềm sẵn có (URL SharePoint). */
  onLinkEditableSource?: (doc: IDocument, url: string) => Promise<IDocument | undefined>;
}

interface ICopyState {
  copied: boolean;
}

// Style inline cho form sửa (tránh phụ thuộc SCSS mới)
const F_FIELD: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' };
const F_LBL: React.CSSProperties = { fontSize: '12px', color: 'var(--dms-secondary, #605E5C)', fontWeight: 600 };
const F_INP: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--dms-border, #ccc)', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };

/** Form state cho sửa metadata — key = InternalName SharePoint. */
interface IEditForm {
  SoVanBan: string; NamBanHanh: string; NgayBanHanh: string; NgayHetHieuLuc: string;
  TrichYeu: string; NhomTaiLieu: string; LoaiVanBanPhapLy: string; LoaiTaiLieu: string;
  ChuDeNghiepVu: string; DonViPhatHanh: string; DonViSoHuu: string; TrangThai: string;
  MucDoBaoMat: string; NguonMetadata: string; MetadataConfidence: string;
  VanBanThayThe: string; VanBanLienQuan: string; Tags: string;
}

function buildEditForm(d: IDocument): IEditForm {
  return {
    SoVanBan: d.soVanBan ?? '',
    NamBanHanh: d.namBanHanh ? String(d.namBanHanh) : '',
    NgayBanHanh: d.ngayBanHanh ?? '',
    NgayHetHieuLuc: d.ngayHetHieuLuc ?? '',
    TrichYeu: d.trichYeu ?? '',
    NhomTaiLieu: d.nhomTaiLieu ?? '',
    LoaiVanBanPhapLy: d.loaiVanBanPhapLy ?? d.loaiVanBan ?? '',
    LoaiTaiLieu: d.loaiTaiLieu ?? '',
    ChuDeNghiepVu: d.chuDeNghiepVu ?? '',
    DonViPhatHanh: d.donViPhatHanh ?? '',
    DonViSoHuu: d.donViSoHuu ?? '',
    TrangThai: (d.trangThai as string) ?? '',
    MucDoBaoMat: (d.mucDoBaoMat as string) ?? '',
    NguonMetadata: d.nguonMetadata ?? '',
    MetadataConfidence: d.metadataConfidence ?? '',
    // Các trường này chưa được service đọc về (thường rỗng) — cho phép nhập mới
    VanBanThayThe: '',
    VanBanLienQuan: '',
    Tags: ''
  };
}

function statusBadgeClass(status: DocStatus): string {
  switch (status) {
    case DocStatus.Active:   return styles.statusActive;
    case DocStatus.Draft:    return styles.statusDraft;
    case DocStatus.Expired:  return styles.statusExpired;
    case DocStatus.Revoked:  return styles.statusRevoked;
    default: return '';
  }
}

function securityBadgeClass(level: SecurityLevel): string {
  switch (level) {
    case SecurityLevel.Public:       return styles.secPublic;
    case SecurityLevel.Internal:     return styles.secInternal;
    case SecurityLevel.Confidential: return styles.secConfidential;
    case SecurityLevel.TopSecret:    return styles.secTopSecret;
    default: return '';
  }
}

export default function DocumentDetailDrawer({ document, choices, onClose, onSave, onDelete, onUploadEditableSource, onLinkEditableSource }: IDocumentDetailDrawerProps): React.ReactElement {
  const ch: IMetadataChoices = choices ?? FALLBACK_METADATA_CHOICES;
  const [copyState, setCopyState] = React.useState<ICopyState>({ copied: false });
  const [previewLoading, setPreviewLoading] = React.useState<boolean>(true);
  const [previewError, setPreviewError] = React.useState<boolean>(false);

  // Xóa văn bản
  const [confirmDelete, setConfirmDelete] = React.useState<boolean>(false);
  const [deleting, setDeleting] = React.useState<boolean>(false);

  // Bản mềm: upload mới / gắn link
  const [softMode, setSoftMode] = React.useState<'none' | 'link'>('none');
  const [linkUrl, setLinkUrl] = React.useState<string>('');
  const [softBusy, setSoftBusy] = React.useState<boolean>(false);
  const [softError, setSoftError] = React.useState<string | undefined>(undefined);

  // Sửa metadata tại chỗ
  const [editing, setEditing] = React.useState<boolean>(false);
  const [form, setForm] = React.useState<IEditForm | undefined>(undefined);
  const [initialForm, setInitialForm] = React.useState<IEditForm | undefined>(undefined);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
  const [saveOk, setSaveOk] = React.useState<boolean>(false);

  // Đóng có kiểm soát: nếu đang sửa & có thay đổi chưa lưu thì xác nhận trước khi đóng.
  // Dùng ref để handler ESC luôn gọi phiên bản mới nhất.
  const requestCloseRef = React.useRef<() => void>(onClose);

  React.useEffect((): (() => void) => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { requestCloseRef.current(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Reset preview + thoát chế độ sửa khi đổi document
  React.useEffect((): void => {
    setPreviewLoading(true);
    setPreviewError(false);
    setEditing(false);
    setSaveError(undefined);
    setSaveOk(false);
    setConfirmDelete(false);
    setSoftMode('none');
    setLinkUrl('');
    setSoftError(undefined);
  }, [document && document.id]);

  // Caller (DmsPortal) chỉ render Drawer khi selectedDoc != undefined,
  // nên hàm này không cần early return undefined nữa.
  if (!document) {
    return <React.Fragment />;
  }

  const handleCopyLink = (): void => {
    if (!document.webUrl) { return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(document.webUrl)
        .then((): void => {
          setCopyState({ copied: true });
          window.setTimeout((): void => setCopyState({ copied: false }), 2000);
        })
        .catch((): void => { /* fallback could go here */ });
    }
  };

  const startEdit = (): void => {
    const f: IEditForm = buildEditForm(document);
    setForm(f);
    setInitialForm(f);
    setSaveError(undefined);
    setSaveOk(false);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setSaveError(undefined);
  };

  // Có thay đổi chưa lưu trong form sửa metadata không?
  const isDirty = (): boolean => {
    if (!editing || !form || !initialForm) { return false; }
    return (Object.keys(form) as (keyof IEditForm)[]).some((k: keyof IEditForm): boolean => form[k] !== initialForm[k]);
  };

  // Đóng drawer có kiểm soát: chỉ đóng khi không sửa, hoặc xác nhận bỏ thay đổi.
  const requestClose = (): void => {
    if (isDirty()) {
      if (!window.confirm('Bạn có thay đổi chưa lưu. Đóng và bỏ các thay đổi?')) { return; }
    }
    onClose();
  };
  requestCloseRef.current = requestClose;

  // Click ra ngoài (overlay): KHÔNG đóng khi đang sửa metadata (tránh mất dữ liệu).
  const handleOverlayClick = (): void => { if (!editing) { requestClose(); } };

  const setField = (key: keyof IEditForm): ((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ): void => {
    setForm((prev: IEditForm | undefined): IEditForm | undefined =>
      prev ? { ...prev, [key]: e.target.value } : prev);
  };

  // Render field Choice = DROPDOWN (select) thực sự, options lấy động từ DMS Library
  // (getMetadataChoices → SharePoint Choice Field). Giá trị hiện tại luôn hiển thị, kể cả
  // khi chưa nằm trong danh sách choice (được thêm vào đầu danh sách).
  // Nếu field KHÔNG có choices (không phải Choice field) → render input text phù hợp.
  const renderCombo = (label: string, key: keyof IEditForm, options: string[]): React.ReactElement => {
    const cur: string = form ? form[key] : '';
    if (!options || options.length === 0) {
      // Không phải Choice field (hoặc chưa load được choices) → input text.
      return (
        <label style={F_FIELD}>
          <span style={F_LBL}>{label}</span>
          <input style={F_INP} value={cur} onChange={setField(key)} placeholder="Nhập giá trị…" autoComplete="off" />
        </label>
      );
    }
    const opts: string[] = cur && options.indexOf(cur) === -1 ? [cur, ...options] : options;
    return (
      <label style={F_FIELD}>
        <span style={F_LBL}>{label}</span>
        <select style={F_INP} value={cur} onChange={setField(key)}>
          <option value="">— Chọn —</option>
          {opts.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
    );
  };

  const handleSave = (): void => {
    if (!onSave || !form || !initialForm) { return; }
    // Chỉ gửi field đã thay đổi (tránh ghi đè rỗng ngoài ý muốn)
    const values: { [k: string]: string } = {};
    (Object.keys(form) as (keyof IEditForm)[]).forEach((k: keyof IEditForm): void => {
      if (form[k] !== initialForm[k]) {
        let v: string = form[k];
        // Field ngày: gửi ISO 8601 để SharePoint parse đúng (không phụ thuộc locale)
        if ((k === 'NgayBanHanh' || k === 'NgayHetHieuLuc') && v) { v = `${v}T00:00:00Z`; }
        values[k] = v;
      }
    });
    if (Object.keys(values).length === 0) { setEditing(false); return; }
    setSaving(true);
    setSaveError(undefined);
    onSave(document.id, values)
      .then((): void => {
        setSaving(false);
        setSaveOk(true);
        setEditing(false);
        window.setTimeout((): void => setSaveOk(false), 2500);
      })
      .catch((err: Error): void => {
        setSaving(false);
        setSaveError(err?.message ?? 'Lưu thất bại');
      });
  };

  // === Xóa văn bản ===
  const doDelete = (): void => {
    if (!onDelete || !document) { return; }
    setDeleting(true);
    onDelete([document])
      .then((): void => { setDeleting(false); setConfirmDelete(false); onClose(); })
      .catch((): void => { setDeleting(false); setConfirmDelete(false); });
  };

  // === Bản mềm: upload file ===
  const handleSoftFilePick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSoftError(undefined);
    const f: File | undefined = e.target.files && e.target.files.length > 0 ? e.target.files[0] : undefined;
    e.target.value = ''; // cho phép chọn lại cùng file
    if (!f || !onUploadEditableSource || !document) { return; }
    const ext: string = (f.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() ?? '';
    if (EDITABLE_EXTS.indexOf(ext) === -1) {
      setSoftError(`Định dạng .${ext || '?'} không hợp lệ. Chỉ chấp nhận: ${EDITABLE_EXTS.join(', ')}.`);
      return;
    }
    setSoftBusy(true);
    const reader: FileReader = new FileReader();
    reader.onload = (): void => {
      onUploadEditableSource(document, reader.result as ArrayBuffer, f.name)
        .then((): void => { setSoftBusy(false); setSoftMode('none'); })
        .catch((err: Error): void => { setSoftBusy(false); setSoftError(err?.message ?? 'Upload bản mềm thất bại.'); });
    };
    reader.onerror = (): void => { setSoftBusy(false); setSoftError('Không đọc được nội dung file.'); };
    reader.readAsArrayBuffer(f);
  };

  // === Bản mềm: gắn link ===
  const doLinkSoft = (): void => {
    if (!onLinkEditableSource || !document) { return; }
    const url: string = linkUrl.trim();
    if (!url) { setSoftError('Vui lòng nhập URL bản mềm.'); return; }
    setSoftBusy(true);
    setSoftError(undefined);
    onLinkEditableSource(document, url)
      .then((): void => { setSoftBusy(false); setSoftMode('none'); setLinkUrl(''); })
      .catch((err: Error): void => { setSoftBusy(false); setSoftError(err?.message ?? 'Gắn link bản mềm thất bại.'); });
  };

  const expiryDays: number | undefined = daysUntil(document.ngayHetHieuLuc);
  const isPdfDocument: boolean = (document.fileExt ?? '').toLowerCase() === '.pdf' || document.fileKind === 'pdf';

  return (
    <div className={styles.drawerOverlay} onClick={handleOverlayClick} role="presentation">
      <aside
        className={styles.drawer}
        onClick={(e: React.MouseEvent): void => e.stopPropagation()}
        role="dialog"
        aria-label="Chi tiết văn bản"
      >
        <header className={styles.drawerHead}>
          <div className={styles.drawerHeadIcon} aria-hidden={true}>
            {document.fileKind === 'pdf' ? <PdfFileIcon size={28} /> : <WordFileIcon size={28} />}
          </div>
          <div className={styles.drawerHeadBody}>
            <div className={styles.drawerHeadKicker}>{document.loaiVanBan}</div>
            <h2 className={styles.drawerHeadTitle}>
              {document.soVanBan ? `${document.soVanBan} — ` : ''}{document.trichYeu || document.fileName}
            </h2>
            <div className={styles.drawerBadgeRow}>
              <span className={`${styles.badge} ${statusBadgeClass(document.trangThai)}`}>{document.trangThai}</span>
              <span className={`${styles.badge} ${securityBadgeClass(document.mucDoBaoMat)}`}>{document.mucDoBaoMat}</span>
              {document.editableSource && (
                <span className={`${styles.badge} ${styles.badgeNeutral}`}>Có bản mềm</span>
              )}
              {!document.editableSource && document.hasPdf && (
                <span className={`${styles.badge} ${styles.badgeWarning}`}>Thiếu bản mềm</span>
              )}
            </div>
          </div>
          {onSave && !editing && (
            <button
              type="button"
              onClick={startEdit}
              title="Sửa metadata tại chỗ"
              aria-label="Sửa thông tin"
              style={{ marginRight: '8px', padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--dms-border, #ccc)', background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
            >
              ✏️ Sửa
            </button>
          )}
          {onDelete && !editing && (
            <button
              type="button"
              onClick={(): void => setConfirmDelete(true)}
              title="Xóa tài liệu (đưa vào Thùng rác)"
              aria-label="Xóa tài liệu"
              style={{ marginRight: '8px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #E6A3A5', background: '#fff', color: '#D13438', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
            >
              🗑 Xóa
            </button>
          )}
          <button type="button" className={styles.drawerCloseBtn} onClick={requestClose} aria-label="Đóng">×</button>
        </header>

        <div className={styles.drawerBody}>
          {saveOk && !editing && (
            <div style={{ background: '#DEF7E5', color: '#0B6A2F', border: '1px solid #9AD8AE', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '13px' }}>
              ✓ Đã lưu metadata. (Danh sách sẽ cập nhật sau khi tải lại / hết cache ~5 phút.)
            </div>
          )}

          {editing && form && (
            <section className={styles.metaSection} style={{ background: '#F4F8FF', border: '1px solid var(--dms-border, #dce3f0)', borderRadius: '8px', padding: '12px' }}>
              <h3 className={styles.metaSectionTitle}>Sửa metadata (tại chỗ)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={F_FIELD}><span style={F_LBL}>Số văn bản</span>
                  <input style={F_INP} value={form.SoVanBan} onChange={setField('SoVanBan')} /></label>
                {renderCombo('Nhóm tài liệu', 'NhomTaiLieu', ch.nhomTaiLieu)}
                {renderCombo('Loại VB pháp lý (hình thức)', 'LoaiVanBanPhapLy', ch.loaiVanBanPhapLy)}
                {renderCombo('Loại tài liệu (nghiệp vụ)', 'LoaiTaiLieu', ch.loaiTaiLieu)}
                <label style={F_FIELD}><span style={F_LBL}>Chủ đề nghiệp vụ</span>
                  <input style={F_INP} value={form.ChuDeNghiepVu} onChange={setField('ChuDeNghiepVu')} /></label>
                {renderCombo('Đơn vị soạn thảo / cấp số', 'DonViPhatHanh', ch.donViPhatHanh)}
                {renderCombo('Cấp lưu trữ', 'DonViSoHuu', ch.capLuuTru)}
                <label style={F_FIELD}><span style={F_LBL}>Trạng thái</span>
                  <select style={F_INP} value={form.TrangThai} onChange={setField('TrangThai')}>
                    <option value="">—</option>
                    {ch.trangThai.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
                  </select></label>
                <label style={F_FIELD}><span style={F_LBL}>Mức độ bảo mật</span>
                  <select style={F_INP} value={form.MucDoBaoMat} onChange={setField('MucDoBaoMat')}>
                    <option value="">—</option>
                    {ch.mucDoBaoMat.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
                  </select></label>
                <label style={F_FIELD}><span style={F_LBL}>Năm ban hành</span>
                  <input type="number" style={F_INP} value={form.NamBanHanh} onChange={setField('NamBanHanh')} /></label>
                <label style={F_FIELD}><span style={F_LBL}>Ngày ban hành</span>
                  <input type="date" style={F_INP} value={form.NgayBanHanh} onChange={setField('NgayBanHanh')} /></label>
                <label style={F_FIELD}><span style={F_LBL}>Ngày hết hiệu lực</span>
                  <input type="date" style={F_INP} value={form.NgayHetHieuLuc} onChange={setField('NgayHetHieuLuc')} /></label>
                <label style={F_FIELD}><span style={F_LBL}>Nguồn metadata</span>
                  <select style={F_INP} value={form.NguonMetadata} onChange={setField('NguonMetadata')}>
                    <option value="">—</option>
                    {ch.nguonMetadata.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
                  </select></label>
                <label style={F_FIELD}><span style={F_LBL}>Độ tin cậy metadata</span>
                  <select style={F_INP} value={form.MetadataConfidence} onChange={setField('MetadataConfidence')}>
                    <option value="">—</option>
                    {ch.metadataConfidence.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
                  </select></label>
                <label style={F_FIELD}><span style={F_LBL}>Văn bản thay thế</span>
                  <input style={F_INP} value={form.VanBanThayThe} onChange={setField('VanBanThayThe')} placeholder="Số VB thay thế (nếu có)" /></label>
                <label style={F_FIELD}><span style={F_LBL}>Văn bản liên quan</span>
                  <input style={F_INP} value={form.VanBanLienQuan} onChange={setField('VanBanLienQuan')} placeholder="VB liên quan (nếu có)" /></label>
                <label style={{ ...F_FIELD, gridColumn: '1 / span 2' }}><span style={F_LBL}>Tags</span>
                  <input style={F_INP} value={form.Tags} onChange={setField('Tags')} placeholder="Từ khóa, cách nhau bởi dấu phẩy" /></label>
                <label style={{ ...F_FIELD, gridColumn: '1 / span 2' }}><span style={F_LBL}>Tiêu đề</span>
                  <textarea style={{ ...F_INP, minHeight: '56px', resize: 'vertical' }} value={form.TrichYeu} onChange={setField('TrichYeu')} /></label>
              </div>
              {saveError && (
                <div style={{ color: '#B00020', marginTop: '8px', fontSize: '13px' }}>⚠ {saveError}</div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button type="button" className={styles.primaryButton} disabled={saving} onClick={handleSave}>
                  {saving ? 'Đang lưu…' : 'Lưu'}
                </button>
                <button type="button" className={styles.secondaryButton} disabled={saving} onClick={cancelEdit}>
                  Hủy
                </button>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--dms-secondary, #888)', marginTop: '8px' }}>
                Chỉ các trường thay đổi mới được ghi. Cần quyền sửa trên DMS Library.
              </p>
            </section>
          )}

          <section className={styles.metaSection}>
            <h3 className={styles.metaSectionTitle}>Thông tin văn bản</h3>
            <dl className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <dt>Số văn bản</dt>
                <dd>{document.soVanBan || '—'}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Năm ban hành</dt>
                <dd>{document.namBanHanh || '—'}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>
                  Loại văn bản (hình thức)
                  <span
                    className={styles.metaHint}
                    title="Hình thức pháp lý (Quyết định/Thông báo/Công văn...). Phân loại chi tiết xem mục 'Phân loại Metadata V2' bên dưới."
                    aria-label="Giải thích"
                  >
                    ⓘ
                  </span>
                </dt>
                <dd>{document.loaiVanBan}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>
                  Cấp lưu trữ
                  <span
                    className={styles.metaHint}
                    title="Cấp lưu trữ (folder cấp 1 [NN]) — chuẩn hóa ở Metadata V2."
                    aria-label="Giải thích"
                  >
                    ⓘ
                  </span>
                </dt>
                <dd>{document.donViSoanThao}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Người ký duyệt</dt>
                <dd>{document.nguoiKy || <em className={styles.muted}>Chưa cập nhật</em>}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Ngày ban hành</dt>
                <dd>{formatDate(document.ngayBanHanh)}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Ngày hết hiệu lực</dt>
                <dd>
                  {document.ngayHetHieuLuc ? (
                    <>
                      {formatDate(document.ngayHetHieuLuc)}
                      {expiryDays !== undefined && (
                        <span className={styles.expiryNote}>
                          {' '}({remainingLabel(document.ngayHetHieuLuc)})
                        </span>
                      )}
                    </>
                  ) : <em className={styles.muted}>Vô thời hạn</em>}
                </dd>
              </div>
              <div className={styles.metaItem}>
                <dt>Mức độ bảo mật</dt>
                <dd>{document.mucDoBaoMat}</dd>
              </div>
            </dl>
          </section>

          {(document.nhomTaiLieu || document.loaiVanBanPhapLy || document.loaiTaiLieu ||
            document.chuDeNghiepVu || document.donViPhatHanh || document.donViSoHuu) && (
            <section className={styles.metaSection}>
              <h3 className={styles.metaSectionTitle}>Phân loại Metadata V2</h3>
              <dl className={styles.metaGrid}>
                {document.nhomTaiLieu && (
                  <div className={styles.metaItem}>
                    <dt>Nhóm tài liệu</dt>
                    <dd>{document.nhomTaiLieu}</dd>
                  </div>
                )}
                {document.loaiVanBanPhapLy && (
                  <div className={styles.metaItem}>
                    <dt>Loại VB pháp lý (hình thức)</dt>
                    <dd>{document.loaiVanBanPhapLy}</dd>
                  </div>
                )}
                {document.loaiTaiLieu && (
                  <div className={styles.metaItem}>
                    <dt>Loại tài liệu (nghiệp vụ)</dt>
                    <dd>{document.loaiTaiLieu}</dd>
                  </div>
                )}
                {document.chuDeNghiepVu && (
                  <div className={styles.metaItem}>
                    <dt>Chủ đề nghiệp vụ</dt>
                    <dd>{document.chuDeNghiepVu}</dd>
                  </div>
                )}
                {document.donViPhatHanh && (
                  <div className={styles.metaItem}>
                    <dt>Đơn vị soạn thảo / cấp số</dt>
                    <dd>{document.donViPhatHanh}</dd>
                  </div>
                )}
                {document.donViSoHuu && (
                  <div className={styles.metaItem}>
                    <dt>Cấp lưu trữ</dt>
                    <dd>{document.donViSoHuu}</dd>
                  </div>
                )}
                {document.metadataConfidence && (
                  <div className={styles.metaItem}>
                    <dt>Độ tin cậy metadata</dt>
                    <dd>
                      <span
                        className={`${styles.badge} ${document.metadataConfidence === 'NeedsReview' ? styles.badgeWarning : styles.badgeNeutral}`}
                      >
                        {document.metadataConfidence}
                      </span>
                      {document.nguonMetadata ? ` · ${document.nguonMetadata}` : ''}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {document.trichYeu && (
            <section className={styles.metaSection}>
              <h3 className={styles.metaSectionTitle}>Tiêu đề</h3>
              <p className={styles.trichYeuBlock}>{document.trichYeu}</p>
            </section>
          )}

          {/* PDF PREVIEW INLINE — chỉ cho PDF files */}
          {isPdfDocument && document.webUrl && (
            <section className={styles.metaSection}>
              <h3 className={styles.metaSectionTitle}>Xem nhanh PDF</h3>
              {previewError ? (
                <div className={styles.previewError}>
                  <span>Không thể xem trước file trong khung này.</span>
                  <button
                    type="button"
                    className={styles.pairItemBtn}
                    onClick={(): void => {
                      if (document.webUrl) {
                        window.open(document.webUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    Mở file ở tab mới
                  </button>
                </div>
              ) : (
                <div className={styles.previewWrap}>
                  {previewLoading && (
                    <div className={styles.previewLoading}>Đang tải bản xem trước...</div>
                  )}
                  <iframe
                    title={`PDF preview: ${document.fileName ?? ''}`}
                    src={document.webUrl}
                    className={styles.previewIframe}
                    onLoad={(): void => setPreviewLoading(false)}
                    onError={(): void => { setPreviewLoading(false); setPreviewError(true); }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                </div>
              )}
            </section>
          )}

          <section className={styles.metaSection}>
            <h3 className={styles.metaSectionTitle}>Văn bản ban hành (PDF)</h3>
            <div className={styles.fileInfoRow}>
              <span className={styles.docFileIcon} aria-hidden={true}>
                <PdfFileIcon size={20} />
              </span>
              <div className={styles.fileInfoBody}>
                <div className={styles.fileInfoName}>{document.fileName ?? '—'}</div>
                <div className={styles.fileInfoMeta}>
                  {document.fileExt} {document.fileSizeKB ? `• ${Math.round(document.fileSizeKB)} KB` : ''}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.metaSection}>
            <h3 className={styles.metaSectionTitle}>Bản mềm chỉnh sửa</h3>
            {document.editableSource ? (
              <div className={`${styles.fileInfoRow} ${styles.pairItem}`}>
                <span className={styles.pairItemIcon} aria-hidden={true}>
                  <WordFileIcon size={20} />
                </span>
                <div className={styles.pairItemBody}>
                  <div className={styles.fileInfoName}>{document.editableSource.fileName}</div>
                  <div className={styles.fileInfoMeta}>
                    {document.editableSource.fileExt}
                    {document.editableSource.sizeKB ? ` • ${Math.round(document.editableSource.sizeKB)} KB` : ''}
                    {' · Dùng để chỉnh sửa nội bộ / soạn phiên bản kế tiếp'}
                  </div>
                </div>
                <div className={styles.pairItemActions}>
                  <button
                    type="button"
                    className={styles.pairItemBtn}
                    onClick={(): void => {
                      if (document.editableSource && document.editableSource.webUrl) {
                        window.open(document.editableSource.webUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    title="Mở bản mềm trong Office Online"
                  >
                    Mở DOCX
                  </button>
                  <button
                    type="button"
                    className={styles.pairItemBtnSecondary}
                    onClick={(): void => {
                      if (document.editableSource && document.editableSource.serverRelativeUrl) {
                        // SharePoint download URL: ?download=1 forces download
                        const downloadUrl: string = document.editableSource.webUrl.split('?')[0] + '?download=1';
                        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    title="Tải DOCX về máy"
                  >
                    Tải DOCX
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className={styles.pairMissingNote}>
                  <span className={`${styles.badge} ${styles.badgeWarning}`}>Thiếu bản mềm</span>
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--dms-secondary)' }}>
                    Chưa có DOCX/XLSX đi kèm. Bổ sung bản mềm để chỉnh sửa phiên bản tiếp theo.
                  </span>
                </div>
                {(onUploadEditableSource || onLinkEditableSource) && (
                  <div className={styles.pairItemActions} style={{ marginTop: '10px' }}>
                    {onUploadEditableSource && (
                      <label className={styles.pairItemBtn} style={{ cursor: softBusy ? 'default' : 'pointer', opacity: softBusy ? 0.6 : 1 }}>
                        <UploadIcon size={14} /> {softBusy ? 'Đang xử lý…' : 'Upload bản mềm'}
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx"
                          disabled={softBusy}
                          onChange={handleSoftFilePick}
                        />
                      </label>
                    )}
                    {onLinkEditableSource && (
                      <button
                        type="button"
                        className={styles.pairItemBtnSecondary}
                        disabled={softBusy}
                        onClick={(): void => { setSoftMode((m: 'none' | 'link'): 'none' | 'link' => m === 'link' ? 'none' : 'link'); setSoftError(undefined); }}
                      >
                        Gắn link bản mềm
                      </button>
                    )}
                  </div>
                )}
                {softMode === 'link' && onLinkEditableSource && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setLinkUrl(e.target.value)}
                      placeholder="Dán URL SharePoint của bản mềm…"
                      style={{ flex: '1 1 240px', padding: '6px 8px', border: '1px solid var(--dms-border, #ccc)', borderRadius: '6px', fontSize: '13px' }}
                    />
                    <button type="button" className={styles.primaryButton} disabled={softBusy} onClick={doLinkSoft}>
                      {softBusy ? 'Đang lưu…' : 'Lưu link'}
                    </button>
                  </div>
                )}
                {softError && <div style={{ color: '#B00020', marginTop: '8px', fontSize: '13px' }}>⚠ {softError}</div>}
              </div>
            )}
          </section>

          <section className={styles.metaSection}>
            <h3 className={styles.metaSectionTitle}>File &amp; liên kết</h3>
            <div className={styles.fileInfoMeta} style={{ wordBreak: 'break-all', marginBottom: '8px' }}>
              {document.serverRelativeUrl ?? '—'}
            </div>
            <div className={styles.pairItemActions}>
              {document.folderUrl && (
                <button
                  type="button"
                  className={styles.pairItemBtnSecondary}
                  onClick={(): void => { if (document.folderUrl) { window.open(document.folderUrl, '_blank', 'noopener,noreferrer'); } }}
                  title="Mở thư mục chứa file trên SharePoint"
                >
                  Mở thư mục chứa file
                </button>
              )}
              {document.editPropertiesUrl && (
                <button
                  type="button"
                  className={styles.pairItemBtn}
                  onClick={(): void => { if (document.editPropertiesUrl) { window.open(document.editPropertiesUrl, '_blank', 'noopener,noreferrer'); } }}
                  title="Mở form Sửa thuộc tính (metadata) của file này để chỉnh sửa trực tiếp"
                >
                  Sửa thông tin (metadata)
                </button>
              )}
            </div>
          </section>
        </div>

        <footer className={styles.drawerFooter}>
          <button
            type="button"
            className={`${styles.primaryButton} ${!document.webUrl ? styles.disabledButton : ''}`}
            onClick={(e: React.MouseEvent<HTMLButtonElement>): void => {
              e.preventDefault();
              e.stopPropagation();
              if (!document.webUrl) { return; }
              // Dùng window.open explicit để force tab mới, tránh SharePoint
              // page intercept anchor click và navigate trong tab hiện tại.
              window.open(document.webUrl, '_blank', 'noopener,noreferrer');
            }}
            disabled={!document.webUrl}
          >
            Mở file
            <ArrowRightIcon size={14} />
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleCopyLink}
            disabled={!document.webUrl}
          >
            {copyState.copied ? '✓ Đã copy link' : 'Copy link'}
          </button>
          {onDelete && (
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ marginLeft: 'auto', color: '#D13438', borderColor: '#E6A3A5' }}
              onClick={(): void => setConfirmDelete(true)}
              title="Xóa tài liệu (đưa vào Thùng rác)"
            >
              <TrashIcon size={14} /> Xóa
            </button>
          )}
        </footer>
      </aside>

      {confirmDelete && (
        <ConfirmDialog
          title="Xác nhận xóa tài liệu"
          danger={true}
          busy={deleting}
          confirmLabel="Xóa"
          message={
            <>
              <p>Bạn có chắc muốn xóa <strong>1</strong> tài liệu?</p>
              <p style={{ fontSize: '13px' }}>{document.soVanBan ? `${document.soVanBan} — ` : ''}{document.trichYeu || document.fileName}</p>
              <p style={{ fontSize: '12px', color: 'var(--dms-secondary, #605E5C)' }}>
                Tài liệu (kèm bản mềm nếu có) sẽ được đưa vào Thùng rác của site và có thể khôi phục.
              </p>
            </>
          }
          onConfirm={doDelete}
          onCancel={(): void => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
