'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocument, IMetadataChoices, IStorageFolder } from '../models/IDocument';
import { IUploadRequest, IUploadResult } from '../services/IDmsService';
import { UploadIcon, PdfFileIcon, WordFileIcon } from './Icons';
import { formatDate } from '../utils/format';
import ReplacementDocumentPicker from './ReplacementDocumentPicker';

export interface IUploadDocumentViewProps {
  documents: IDocument[];
  /** Choices lấy động từ DMS Library field schema. */
  choices: IMetadataChoices;
  /** Folder cấp 1 thật trong DMS Library (nguồn chuẩn cho combobox Cấp lưu trữ). */
  storageFolders: IStorageFolder[];
  onUpload: (req: IUploadRequest) => Promise<IUploadResult>;
  onUploaded: (result: IUploadResult) => void;
  onCancel: () => void;
}

const PDF_EXTS: string[] = ['pdf'];
const SOFT_EXTS: string[] = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const MAX_SIZE_MB: number = 100;

interface IUploadForm {
  SoVanBan: string; NamBanHanh: string; NgayBanHanh: string; NgayHetHieuLuc: string;
  TrichYeu: string; NhomTaiLieu: string; LoaiVanBanPhapLy: string; LoaiTaiLieu: string;
  ChuDeNghiepVu: string; DonViPhatHanh: string; DonViSoHuu: string; TrangThai: string;
  MucDoBaoMat: string; NguonMetadata: string; MetadataConfidence: string; Tags: string;
}

function todayIso(): string {
  return new Date().toISOString().substring(0, 10);
}

function initialForm(): IUploadForm {
  const today: string = todayIso();
  return {
    SoVanBan: '', NamBanHanh: String(new Date().getFullYear()), NgayBanHanh: today, NgayHetHieuLuc: '',
    TrichYeu: '', NhomTaiLieu: '', LoaiVanBanPhapLy: '', LoaiTaiLieu: '',
    ChuDeNghiepVu: '', DonViPhatHanh: '', DonViSoHuu: '', TrangThai: 'Đang lưu hành',
    MucDoBaoMat: 'Nội bộ', NguonMetadata: 'ManualReviewed', MetadataConfidence: 'High', Tags: ''
  };
}

function fileExtOf(name: string): string {
  const m: RegExpMatchArray | null = name.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject): void => {
    const reader: FileReader = new FileReader();
    reader.onload = (): void => resolve(reader.result as ArrayBuffer);
    reader.onerror = (): void => reject(new Error('Không đọc được nội dung file.'));
    reader.readAsArrayBuffer(file);
  });
}

export default function UploadDocumentView(props: IUploadDocumentViewProps): React.ReactElement {
  const { documents, choices, storageFolders, onUpload, onUploaded, onCancel } = props;

  const [file, setFile] = React.useState<File | undefined>(undefined);          // PDF chính (bắt buộc)
  const [softFile, setSoftFile] = React.useState<File | undefined>(undefined);   // Bản mềm (tùy chọn)
  const [fileError, setFileError] = React.useState<string | undefined>(undefined);
  const [softError, setSoftError] = React.useState<string | undefined>(undefined);
  const [form, setForm] = React.useState<IUploadForm>(initialForm());
  const [replacement, setReplacement] = React.useState<IDocument | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = React.useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  // Cấp lưu trữ = TÊN FOLDER CẤP 1 THẬT trong DMS Library — lấy từ getStorageFolders()
  // (nguồn chuẩn, gồm cả folder chưa có văn bản; folder mới tạo sẽ thấy sau refresh).
  // KHÔNG suy từ metadata văn bản, KHÔNG hardcode.
  // Fallback (chỉ khi service folder lỗi/rỗng): suy từ đường dẫn văn bản đã có.
  const capLuuTruOptions: string[] = React.useMemo((): string[] => {
    if (storageFolders && storageFolders.length > 0) {
      return storageFolders.map((f: IStorageFolder): string => f.name);
    }
    const marker: string = '/DMS Library/';
    const set: { [k: string]: boolean } = {};
    documents.forEach((d: IDocument): void => {
      const url: string | undefined = d.serverRelativeUrl;
      if (!url) { return; }
      const i: number = url.indexOf(marker);
      if (i < 0) { return; }
      let seg: string = url.substring(i + marker.length).split('/')[0];
      try { seg = decodeURIComponent(seg); } catch { /* giữ nguyên nếu decode lỗi */ }
      if (seg && seg.charAt(0) === '[') { set[seg] = true; }
    });
    return Object.keys(set).sort((a: string, b: string): number => a.localeCompare(b, 'vi', { numeric: true }));
  }, [storageFolders, documents]);

  const setField = (key: keyof IUploadForm): ((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
      const v: string = e.target.value;
      setForm((prev: IUploadForm): IUploadForm => {
        const next: IUploadForm = { ...prev, [key]: v };
        // Tự suy NamBanHanh từ NgayBanHanh.
        if (key === 'NgayBanHanh' && v) { next.NamBanHanh = v.substring(0, 4); }
        return next;
      });
    };

  // Combobox: gợi ý choices lấy từ DMS Library + CHO PHÉP nhập giá trị mới (fill-in).
  // Luôn hiển thị đúng giá trị đang nhập kể cả khi chưa nằm trong danh sách choice.
  const renderCombo = (label: string, key: keyof IUploadForm, options: string[]): React.ReactElement => {
    const listId: string = `ul_${String(key)}`;
    const cur: string = form[key];
    const opts: string[] = cur && options.indexOf(cur) === -1 ? [cur, ...options] : options;
    return (
      <label className={styles.field}><span className={styles.fieldLabel}>{label}</span>
        <input
          className={styles.fieldInput}
          list={listId}
          value={form[key]}
          onChange={setField(key)}
          placeholder="Chọn hoặc nhập giá trị khác…"
          autoComplete="off"
        />
        <datalist id={listId}>
          {opts.map((v: string): React.ReactElement => <option key={v} value={v} />)}
        </datalist>
      </label>
    );
  };

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setFileError(undefined);
    const f: File | undefined = e.target.files && e.target.files.length > 0 ? e.target.files[0] : undefined;
    if (!f) { return; }
    const ext: string = fileExtOf(f.name);
    if (PDF_EXTS.indexOf(ext) === -1) {
      setFileError(`File chính phải là PDF. Định dạng .${ext || '?'} không hợp lệ.`);
      setFile(undefined);
      return;
    }
    if (f.size === 0) { setFileError('File rỗng, vui lòng chọn file khác.'); setFile(undefined); return; }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) { setFileError(`File quá lớn (> ${MAX_SIZE_MB} MB).`); setFile(undefined); return; }
    setFile(f);
  };

  const handlePickSoftFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSoftError(undefined);
    const f: File | undefined = e.target.files && e.target.files.length > 0 ? e.target.files[0] : undefined;
    if (!f) { return; }
    const ext: string = fileExtOf(f.name);
    if (SOFT_EXTS.indexOf(ext) === -1) {
      setSoftError(`Bản mềm chỉ chấp nhận: ${SOFT_EXTS.join(', ')}.`);
      setSoftFile(undefined);
      return;
    }
    if (f.size === 0) { setSoftError('File rỗng, vui lòng chọn file khác.'); setSoftFile(undefined); return; }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) { setSoftError(`File quá lớn (> ${MAX_SIZE_MB} MB).`); setSoftFile(undefined); return; }
    setSoftFile(f);
  };

  const missingFields = (): string[] => {
    const miss: string[] = [];
    if (!file) { miss.push('File PDF'); }
    if (!form.SoVanBan.trim()) { miss.push('Số văn bản'); }
    if (!form.TrichYeu.trim()) { miss.push('Tiêu đề'); }
    if (!form.NhomTaiLieu) { miss.push('Nhóm tài liệu'); }
    if (!form.LoaiTaiLieu) { miss.push('Loại tài liệu'); }
    if (!form.DonViSoHuu) { miss.push('Cấp lưu trữ'); }
    if (!form.TrangThai) { miss.push('Trạng thái'); }
    if (!form.NamBanHanh.trim()) { miss.push('Năm ban hành'); }
    if (!form.NgayBanHanh) { miss.push('Ngày ban hành'); }
    if (!form.MucDoBaoMat) { miss.push('Mức độ bảo mật'); }
    return miss;
  };

  const handleAttemptSave = (): void => {
    setError(undefined);
    const miss: string[] = missingFields();
    if (miss.length > 0) {
      setError(`Vui lòng nhập đủ các trường bắt buộc: ${miss.join(', ')}.`);
      return;
    }
    // Văn bản thay thế phải còn tồn tại trong danh sách (chưa hết hiệu lực được đảm bảo bởi picker).
    setConfirmOpen(true);
  };

  const buildMetadata = (): { [k: string]: string } => {
    const md: { [k: string]: string } = {
      SoVanBan: form.SoVanBan.trim(),
      NamBanHanh: form.NamBanHanh.trim(),
      TrichYeu: form.TrichYeu.trim(),
      NhomTaiLieu: form.NhomTaiLieu,
      LoaiVanBanPhapLy: form.LoaiVanBanPhapLy,
      LoaiTaiLieu: form.LoaiTaiLieu,
      ChuDeNghiepVu: form.ChuDeNghiepVu.trim(),
      DonViPhatHanh: form.DonViPhatHanh.trim(),
      DonViSoHuu: form.DonViSoHuu,
      TrangThai: form.TrangThai,
      MucDoBaoMat: form.MucDoBaoMat,
      NguonMetadata: form.NguonMetadata,
      MetadataConfidence: form.MetadataConfidence,
      Tags: form.Tags.trim()
    };
    if (form.NgayBanHanh) { md.NgayBanHanh = `${form.NgayBanHanh}T00:00:00Z`; }
    if (form.NgayHetHieuLuc) { md.NgayHetHieuLuc = `${form.NgayHetHieuLuc}T00:00:00Z`; }
    // Liên kết thay thế (văn bản mới trỏ tới văn bản cũ).
    if (replacement) {
      md.VanBanThayThe = replacement.soVanBan || replacement.id;
      md.VanBanLienQuan = `Thay thế: ${replacement.soVanBan || ''} - ${replacement.trichYeu || ''}`.trim();
    }
    return md;
  };

  const doUpload = (): void => {
    if (!file) { return; }
    const pdf: File = file;
    setConfirmOpen(false);
    setSaving(true);
    setError(undefined);
    // Đọc PDF + (tùy chọn) bản mềm rồi upload một lần.
    Promise.all([
      readAsArrayBuffer(pdf),
      softFile ? readAsArrayBuffer(softFile) : Promise.resolve(undefined)
    ])
      .then((buffers: [ArrayBuffer, ArrayBuffer | undefined]): Promise<IUploadResult> => onUpload({
        fileBuffer: buffers[0],
        fileName: pdf.name,
        capLuuTru: form.DonViSoHuu,
        metadata: buildMetadata(),
        replacementOldId: replacement ? replacement.id : undefined,
        editableFileBuffer: buffers[1],
        editableFileName: softFile ? softFile.name : undefined
      }))
      .then((result: IUploadResult): void => {
        setSaving(false);
        onUploaded(result);
      })
      .catch((err: Error): void => {
        setSaving(false);
        setError(err?.message ?? 'Upload thất bại.');
      });
  };

  return (
    <section className={styles.listView}>
      <div className={styles.listHead}>
        <button type="button" className={styles.listBackBtn} onClick={onCancel}>← Trang chủ</button>
        <div className={styles.listTitleBlock}>
          <h2 className={styles.listTitle}>Upload văn bản mới</h2>
          <p className={styles.listSubtitle}>Tải văn bản mới lên DMS Library, nhập metadata và (tùy chọn) đánh dấu văn bản cũ hết hiệu lực.</p>
        </div>
      </div>

      {/* 1. Chọn file */}
      <section className={styles.metaSection}>
        <h3 className={styles.metaSectionTitle}>1. Chọn file</h3>

        {/* 1a. File PDF (bắt buộc) */}
        <div className={styles.fieldLabel} style={{ marginBottom: '6px' }}>File PDF *</div>
        {!file ? (
          <label className={styles.uploadDropzone}>
            <UploadIcon size={28} />
            <span className={styles.uploadDropzoneText}>Bấm để chọn file PDF</span>
            <span className={styles.uploadDropzoneHint}>Tối đa {MAX_SIZE_MB} MB · PDF là file chính</span>
            <input type="file" style={{ display: 'none' }} accept=".pdf" onChange={handlePickFile} />
          </label>
        ) : (
          <div className={styles.uploadFileInfo}>
            <span className={styles.docFileIcon} aria-hidden={true}><PdfFileIcon size={24} /></span>
            <div className={styles.uploadFileBody}>
              <div className={styles.fileInfoName}>{file.name}</div>
              <div className={styles.fileInfoMeta}>{fileExtOf(file.name).toUpperCase()} • {(file.size / 1024).toFixed(0)} KB</div>
            </div>
            <label className={styles.secondaryButton} style={{ cursor: 'pointer' }}>
              Đổi file
              <input type="file" style={{ display: 'none' }} accept=".pdf" onChange={handlePickFile} />
            </label>
          </div>
        )}
        {fileError && <div className={styles.uploadFieldError}>⚠ {fileError}</div>}

        {/* 1b. File bản mềm (không bắt buộc) */}
        <div className={styles.fieldLabel} style={{ margin: '14px 0 6px' }}>File bản mềm (không bắt buộc)</div>
        {!softFile ? (
          <label className={styles.uploadDropzone}>
            <UploadIcon size={24} />
            <span className={styles.uploadDropzoneText}>Bấm để chọn DOCX / XLSX / PPTX</span>
            <span className={styles.uploadDropzoneHint}>Lưu cùng thư mục, cùng metadata với PDF</span>
            <input type="file" style={{ display: 'none' }} accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={handlePickSoftFile} />
          </label>
        ) : (
          <div className={styles.uploadFileInfo}>
            <span className={styles.docFileIcon} aria-hidden={true}><WordFileIcon size={24} /></span>
            <div className={styles.uploadFileBody}>
              <div className={styles.fileInfoName}>{softFile.name}</div>
              <div className={styles.fileInfoMeta}>{fileExtOf(softFile.name).toUpperCase()} • {(softFile.size / 1024).toFixed(0)} KB</div>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={(): void => { setSoftFile(undefined); setSoftError(undefined); }}>
              Xóa file
            </button>
          </div>
        )}
        {softError && <div className={styles.uploadFieldError}>⚠ {softError}</div>}
      </section>

      {/* 2. Metadata */}
      <section className={styles.metaSection}>
        <h3 className={styles.metaSectionTitle}>2. Thông tin văn bản (metadata)</h3>
        <div className={styles.uploadGrid}>
          <label className={styles.field}><span className={styles.fieldLabel}>Số văn bản *</span>
            <input className={styles.fieldInput} value={form.SoVanBan} onChange={setField('SoVanBan')} placeholder="vd: 295.2026.QĐ-HCNS" /></label>
          {renderCombo('Nhóm tài liệu *', 'NhomTaiLieu', choices.nhomTaiLieu)}
          {renderCombo('Loại VB pháp lý (hình thức)', 'LoaiVanBanPhapLy', choices.loaiVanBanPhapLy)}
          {renderCombo('Loại tài liệu (nghiệp vụ) *', 'LoaiTaiLieu', choices.loaiTaiLieu)}
          <label className={styles.field}><span className={styles.fieldLabel}>Chủ đề nghiệp vụ</span>
            <input className={styles.fieldInput} value={form.ChuDeNghiepVu} onChange={setField('ChuDeNghiepVu')} /></label>
          {renderCombo('Đơn vị soạn thảo / cấp số', 'DonViPhatHanh', choices.donViPhatHanh)}
          <label className={styles.field}><span className={styles.fieldLabel}>Cấp lưu trữ *</span>
            <select className={styles.fieldInput} value={form.DonViSoHuu} onChange={setField('DonViSoHuu')}>
              <option value="">— Chọn folder cấp 1 —</option>
              {capLuuTruOptions.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
            </select></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Trạng thái *</span>
            <select className={styles.fieldInput} value={form.TrangThai} onChange={setField('TrangThai')}>
              {choices.trangThai.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
            </select></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Mức độ bảo mật *</span>
            <select className={styles.fieldInput} value={form.MucDoBaoMat} onChange={setField('MucDoBaoMat')}>
              {choices.mucDoBaoMat.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
            </select></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Năm ban hành *</span>
            <input type="number" className={styles.fieldInput} value={form.NamBanHanh} onChange={setField('NamBanHanh')} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Ngày ban hành *</span>
            <input type="date" className={styles.fieldInput} value={form.NgayBanHanh} onChange={setField('NgayBanHanh')} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Ngày hết hiệu lực</span>
            <input type="date" className={styles.fieldInput} value={form.NgayHetHieuLuc} onChange={setField('NgayHetHieuLuc')} /></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Nguồn metadata</span>
            <select className={styles.fieldInput} value={form.NguonMetadata} onChange={setField('NguonMetadata')}>
              {choices.nguonMetadata.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
            </select></label>
          <label className={styles.field}><span className={styles.fieldLabel}>Độ tin cậy metadata</span>
            <select className={styles.fieldInput} value={form.MetadataConfidence} onChange={setField('MetadataConfidence')}>
              {choices.metadataConfidence.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
            </select></label>
          <label className={`${styles.field} ${styles.uploadFieldWide}`}><span className={styles.fieldLabel}>Tags</span>
            <input className={styles.fieldInput} value={form.Tags} onChange={setField('Tags')} placeholder="Từ khóa, cách nhau bởi dấu phẩy" /></label>
          <label className={`${styles.field} ${styles.uploadFieldWide}`}><span className={styles.fieldLabel}>Tiêu đề *</span>
            <textarea className={styles.fieldInput} style={{ minHeight: '60px', resize: 'vertical' }} value={form.TrichYeu} onChange={setField('TrichYeu')} /></label>
        </div>
      </section>

      {/* 3. Văn bản thay thế */}
      <section className={styles.metaSection}>
        <h3 className={styles.metaSectionTitle}>3. Văn bản thay thế (tùy chọn)</h3>
        {!replacement ? (
          <button type="button" className={styles.secondaryButton} onClick={(): void => setPickerOpen(true)}>
            Tìm văn bản cũ để thay thế
          </button>
        ) : (
          <div className={styles.replacementCard}>
            <div className={styles.replacementBody}>
              <div className={styles.fileInfoName}>{replacement.soVanBan ? `${replacement.soVanBan} — ` : ''}{replacement.trichYeu || replacement.fileName}</div>
              <div className={styles.fileInfoMeta}>
                Cấp lưu trữ: {replacement.donViSoHuu || replacement.donViSoanThao || '—'} · Ngày BH: {formatDate(replacement.ngayBanHanh)} · {replacement.trangThai}
              </div>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={(): void => setReplacement(undefined)}>Bỏ chọn</button>
          </div>
        )}
        <p className={styles.modalHint} style={{ marginTop: '8px' }}>
          Nếu chọn, sau khi lưu hệ thống sẽ đánh dấu văn bản cũ là Hết hiệu lực và gắn liên kết thay thế. File cũ KHÔNG bị di chuyển.
        </p>
      </section>

      {error && <div className={styles.uploadFieldError}>⚠ {error}</div>}

      <div className={styles.uploadActions}>
        <button type="button" className={styles.primaryButton} disabled={saving} onClick={handleAttemptSave}>
          {saving ? 'Đang lưu…' : 'Lưu văn bản'}
        </button>
        <button type="button" className={styles.secondaryButton} disabled={saving} onClick={onCancel}>Hủy</button>
      </div>

      {pickerOpen && (
        <ReplacementDocumentPicker
          documents={documents}
          selectedId={replacement ? replacement.id : undefined}
          onSelect={(d: IDocument): void => { setReplacement(d); setPickerOpen(false); }}
          onClose={(): void => setPickerOpen(false)}
        />
      )}

      {confirmOpen && (
        <div className={styles.modalOverlay} onClick={(): void => setConfirmOpen(false)} role="presentation">
          <div className={styles.modalBox} onClick={(e: React.MouseEvent): void => e.stopPropagation()} role="dialog" aria-label="Xác nhận upload">
            <div className={styles.modalHead}><span className={styles.modalTitle}>Xác nhận upload văn bản mới</span></div>
            <div className={styles.modalBody}>
              <p>Văn bản mới: <strong>{form.SoVanBan} — {form.TrichYeu}</strong></p>
              <p>Cấp lưu trữ (folder): <strong>{form.DonViSoHuu}</strong></p>
              <p>File: <strong>PDF{softFile ? ' + bản mềm (' + fileExtOf(softFile.name).toUpperCase() + ')' : ' (chưa có bản mềm → sẽ nằm trong KPI "Thiếu bản mềm")'}</strong></p>
              {replacement ? (
                <>
                  <p>Sẽ thay thế: <strong>{replacement.soVanBan} — {replacement.trichYeu || replacement.fileName}</strong></p>
                  <p>Sau khi lưu, hệ thống sẽ:</p>
                  <ol className={styles.bulkConfirmList}>
                    <li>Upload văn bản mới vào folder theo Cấp lưu trữ.</li>
                    <li>Đánh dấu văn bản cũ là Hết hiệu lực (không di chuyển file).</li>
                    <li>Gắn liên kết thay thế giữa văn bản mới và cũ.</li>
                  </ol>
                  <p>Bạn có chắc chắn tiếp tục?</p>
                </>
              ) : (
                <p>Bạn muốn upload văn bản mới này lên DMS Library?</p>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={(): void => setConfirmOpen(false)}>Hủy</button>
              <button type="button" className={styles.primaryButton} onClick={doUpload}>Xác nhận &amp; Lưu</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
