import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocument, DocStatus } from '../models/IDocument';
import { SearchIcon, PdfFileIcon } from './Icons';
import { formatDate } from '../utils/format';

export interface IReplacementDocumentPickerProps {
  /** Toàn bộ văn bản để tìm kiếm. */
  documents: IDocument[];
  /** Id văn bản đang chọn (highlight). */
  selectedId?: string;
  onSelect: (doc: IDocument) => void;
  onClose: () => void;
}

const MAX_RESULTS: number = 80;

export default function ReplacementDocumentPicker(props: IReplacementDocumentPickerProps): React.ReactElement {
  const { documents, selectedId, onSelect, onClose } = props;
  const [term, setTerm] = React.useState<string>('');

  React.useEffect((): (() => void) => {
    const onEsc = (e: KeyboardEvent): void => { if (e.key === 'Escape') { onClose(); } };
    window.addEventListener('keydown', onEsc);
    return (): void => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Chỉ hiển thị văn bản CÒN hiệu lực (không phải Hết hiệu lực).
  const candidates: IDocument[] = React.useMemo((): IDocument[] => {
    const kw: string = term.trim().toLowerCase();
    const base: IDocument[] = documents.filter((d: IDocument): boolean => d.trangThai !== DocStatus.Expired);
    const filtered: IDocument[] = !kw ? base : base.filter((d: IDocument): boolean => {
      const hay: string = [
        d.soVanBan, d.trichYeu, d.loaiVanBan, d.loaiTaiLieu ?? '', d.donViSoHuu ?? '', d.donViSoanThao,
        d.tags ?? '', d.fileName ?? ''
      ].join(' ').toLowerCase();
      return hay.indexOf(kw) >= 0;
    });
    return filtered
      .sort((a: IDocument, b: IDocument): number => (b.ngayBanHanh ?? '').localeCompare(a.ngayBanHanh ?? ''))
      .slice(0, MAX_RESULTS);
  }, [documents, term]);

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div
        className={styles.pickerBox}
        onClick={(e: React.MouseEvent): void => e.stopPropagation()}
        role="dialog"
        aria-label="Tìm văn bản cũ để thay thế"
      >
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Tìm văn bản cũ để thay thế</span>
          <button type="button" className={styles.drawerCloseBtn} onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className={styles.pickerSearch}>
          <SearchIcon size={16} className={styles.pickerSearchIcon} />
          <input
            type="text"
            autoFocus={true}
            className={styles.pickerSearchInput}
            placeholder="Tìm theo số văn bản, tiêu đề, loại tài liệu, cấp lưu trữ…"
            value={term}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setTerm(e.target.value)}
          />
        </div>

        <div className={styles.pickerResults}>
          {candidates.length === 0 ? (
            <div className={styles.listEmpty}>Không tìm thấy văn bản còn hiệu lực phù hợp.</div>
          ) : (
            <table className={styles.docTable}>
              <thead>
                <tr>
                  <th className={styles.colIcon} aria-label="Loại" />
                  <th className={styles.colSoVB}>Số VB</th>
                  <th className={styles.colTrichYeu}>Tiêu đề</th>
                  <th className={styles.colDonVi}>Cấp lưu trữ</th>
                  <th className={styles.colNgay}>Ngày BH</th>
                  <th className={styles.colStatus}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((d: IDocument): React.ReactElement => (
                  <tr
                    key={d.id}
                    className={`${styles.tableRow} ${selectedId === d.id ? styles.pickerRowActive : ''}`}
                    onClick={(): void => onSelect(d)}
                    title="Chọn văn bản này"
                  >
                    <td className={styles.colIcon}><span className={styles.docFileIcon}><PdfFileIcon size={18} /></span></td>
                    <td className={styles.colSoVB}>{d.soVanBan || '—'}</td>
                    <td className={styles.colTrichYeu}><span className={styles.trichYeuLine}>{d.trichYeu || d.fileName}</span></td>
                    <td className={styles.colDonVi}>{d.donViSoHuu || d.donViSoanThao || '—'}</td>
                    <td className={styles.colNgay}>{formatDate(d.ngayBanHanh)}</td>
                    <td className={styles.colStatus}>
                      <span className={`${styles.badge} ${d.trangThai === DocStatus.Active ? styles.statusActive : styles.statusDraft}`}>{d.trangThai}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.modalFooter}>
          <span className={styles.modalHint}>Chỉ hiển thị văn bản còn hiệu lực. Bấm vào 1 dòng để chọn.</span>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
