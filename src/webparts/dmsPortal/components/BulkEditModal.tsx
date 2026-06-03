import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IMetadataChoices } from '../models/IDocument';
import { FALLBACK_METADATA_CHOICES } from '../utils/metadataChoices';

export interface IBulkResult { ok: number; failed: number; errors: string[]; }

export interface IBulkEditModalProps {
  selectedCount: number;
  /** Choices lấy động từ DMS Library field schema (fallback nếu chưa truyền). */
  choices?: IMetadataChoices;
  /** Ghi values cho các item đã chọn; báo tiến độ qua onProgress. */
  onSubmit: (values: { [internalName: string]: string }, onProgress: (done: number, total: number) => void) => Promise<IBulkResult>;
  onClose: () => void;
  /** Gọi khi cập nhật xong (parent toast + clear selection + refresh). */
  onDone: (result: IBulkResult) => void;
}

interface IField { key: string; label: string; choices?: string[]; }

function buildFields(ch: IMetadataChoices): IField[] {
  return [
    { key: 'NhomTaiLieu', label: 'Nhóm tài liệu', choices: ch.nhomTaiLieu },
    { key: 'LoaiVanBanPhapLy', label: 'Loại VB pháp lý', choices: ch.loaiVanBanPhapLy },
    { key: 'LoaiTaiLieu', label: 'Loại tài liệu (nghiệp vụ)', choices: ch.loaiTaiLieu },
    { key: 'DonViSoHuu', label: 'Cấp lưu trữ', choices: ch.capLuuTru.length > 0 ? ch.capLuuTru : undefined },
    { key: 'DonViPhatHanh', label: 'Đơn vị soạn thảo', choices: ch.donViPhatHanh.length > 0 ? ch.donViPhatHanh : undefined },
    { key: 'TrangThai', label: 'Trạng thái', choices: ch.trangThai },
    { key: 'MucDoBaoMat', label: 'Mức độ bảo mật', choices: ch.mucDoBaoMat },
    { key: 'MetadataConfidence', label: 'Độ tin cậy metadata', choices: ch.metadataConfidence },
    { key: 'NguonMetadata', label: 'Nguồn metadata', choices: ch.nguonMetadata }
  ];
}

interface IFieldState { apply: boolean; value: string; }
type Step = 'edit' | 'confirm' | 'saving' | 'error';

export default function BulkEditModal(props: IBulkEditModalProps): React.ReactElement {
  const { selectedCount, choices, onSubmit, onClose, onDone } = props;

  const FIELDS: IField[] = buildFields(choices ?? FALLBACK_METADATA_CHOICES);

  const initial: { [k: string]: IFieldState } = {};
  FIELDS.forEach((f: IField): void => { initial[f.key] = { apply: false, value: '' }; });
  const [fields, setFields] = React.useState<{ [k: string]: IFieldState }>(initial);
  const [step, setStep] = React.useState<Step>('edit');
  const [progress, setProgress] = React.useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [errMsg, setErrMsg] = React.useState<string>('');

  const toggleApply = (key: string): ((e: React.ChangeEvent<HTMLInputElement>) => void) => (e: React.ChangeEvent<HTMLInputElement>): void => {
    const checked: boolean = e.target.checked;
    setFields((prev: { [k: string]: IFieldState }): { [k: string]: IFieldState } => ({ ...prev, [key]: { ...prev[key], apply: checked } }));
  };
  const setValue = (key: string): ((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    const v: string = e.target.value;
    setFields((prev: { [k: string]: IFieldState }): { [k: string]: IFieldState } => ({ ...prev, [key]: { ...prev[key], value: v } }));
  };

  const appliedFields: IField[] = FIELDS.filter((f: IField): boolean => fields[f.key].apply);

  const handleConfirm = (): void => {
    setStep('saving');
    setProgress({ done: 0, total: selectedCount });
    const values: { [k: string]: string } = {};
    appliedFields.forEach((f: IField): void => { values[f.key] = fields[f.key].value; });
    onSubmit(values, (done: number, total: number): void => setProgress({ done, total }))
      .then((r: IBulkResult): void => { onDone(r); onClose(); })
      .catch((e: Error): void => { setErrMsg(e?.message ?? 'Lỗi không xác định'); setStep('error'); });
  };

  const pct: number = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={styles.modalOverlay} onClick={step === 'saving' ? undefined : onClose} role="presentation">
      <div className={styles.modalBox} onClick={(e: React.MouseEvent): void => e.stopPropagation()} role="dialog" aria-label="Sửa metadata hàng loạt">
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>Sửa metadata hàng loạt — {selectedCount} văn bản</h3>
          {step !== 'saving' && <button type="button" className={styles.drawerCloseBtn} onClick={onClose} aria-label="Đóng">×</button>}
        </div>

        <div className={styles.modalBody}>
          {step === 'edit' && (
            <>
              <p className={styles.modalHint}>Tick &quot;Áp dụng&quot; cho trường muốn cập nhật. Trường KHÔNG tick sẽ giữ nguyên.</p>
              {FIELDS.map((f: IField): React.ReactElement => {
                const st: IFieldState = fields[f.key];
                return (
                  <div key={f.key} className={styles.bulkRow}>
                    <label className={styles.bulkApply}>
                      <input type="checkbox" checked={st.apply} onChange={toggleApply(f.key)} />
                      <span>{f.label}</span>
                    </label>
                    {f.choices
                      ? (
                        <select className={styles.fieldInput} disabled={!st.apply} value={st.value} onChange={setValue(f.key)}>
                          <option value="">— Giá trị —</option>
                          {f.choices.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
                        </select>
                      )
                      : <input className={styles.fieldInput} disabled={!st.apply} value={st.value} placeholder="Nhập giá trị..." onChange={setValue(f.key)} />}
                  </div>
                );
              })}
            </>
          )}

          {step === 'confirm' && (
            <div className={styles.bulkConfirm}>
              <p>Bạn sắp cập nhật <strong>{selectedCount}</strong> văn bản với các trường:</p>
              <ul className={styles.bulkConfirmList}>
                {appliedFields.map((f: IField): React.ReactElement => (
                  <li key={f.key}><strong>{f.label}</strong> → <span className={styles.bulkConfirmVal}>{fields[f.key].value || '(để trống)'}</span></li>
                ))}
              </ul>
              <p className={styles.modalHint}>Các trường khác giữ nguyên. Ghi tuần tự từng văn bản; lỗi 1 văn bản không ảnh hưởng các văn bản khác.</p>
            </div>
          )}

          {step === 'saving' && (
            <div className={styles.bulkSaving}>
              <p>Đang cập nhật <strong>{progress.done}</strong> / {progress.total} văn bản…</p>
              <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
            </div>
          )}

          {step === 'error' && (
            <div className={styles.bulkConfirm}>
              <p style={{ color: '#B00020' }}>⚠ Có lỗi khi cập nhật: {errMsg}</p>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          {step === 'edit' && (
            <>
              <button type="button" className={styles.primaryButton} disabled={appliedFields.length === 0} onClick={(): void => setStep('confirm')}>
                Tiếp tục ({appliedFields.length} trường)
              </button>
              <button type="button" className={styles.secondaryButton} onClick={onClose}>Hủy</button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button type="button" className={styles.primaryButton} onClick={handleConfirm}>Xác nhận cập nhật</button>
              <button type="button" className={styles.secondaryButton} onClick={(): void => setStep('edit')}>Quay lại</button>
            </>
          )}
          {step === 'error' && (
            <button type="button" className={styles.secondaryButton} onClick={(): void => setStep('edit')}>Quay lại</button>
          )}
        </div>
      </div>
    </div>
  );
}
