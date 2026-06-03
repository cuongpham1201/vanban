'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocument, DocStatus, SecurityLevel } from '../models/IDocument';
import { formatDate } from '../utils/format';
import { PdfFileIcon, WordFileIcon, TrashIcon } from './Icons';
import ConfirmDialog from './ConfirmDialog';

export type SortField = 'soVanBan' | 'nhomTaiLieu' | 'loaiVanBan' | 'loaiTaiLieu' | 'donViPhatHanh' | 'donViSoanThao' | 'ngayBanHanh' | 'trangThai';
export type SortDir = 'asc' | 'desc';

export interface IDocumentListViewProps {
  documents: IDocument[];
  title: string;
  subtitle?: string;
  onClickDocument: (doc: IDocument) => void;
  onBack: () => void;
  onClearFilter?: () => void;
  /** Xóa (Thùng rác) nhiều văn bản đã chọn. Có truyền → hiện cột chọn + nút xóa. */
  onDelete?: (docs: IDocument[], onProgress?: (done: number, total: number) => void) => Promise<{ ok: number; failed: number; errors: string[] }>;
}

const PAGE_SIZE: number = 25;

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

function compare(a: string | number | undefined, b: string | number | undefined): number {
  const av: string | number = a ?? '';
  const bv: string | number = b ?? '';
  if (typeof av === 'number' && typeof bv === 'number') {
    return av - bv;
  }
  return String(av).localeCompare(String(bv), 'vi', { numeric: true, sensitivity: 'base' });
}

export default function DocumentListView(props: IDocumentListViewProps): React.ReactElement {
  const { documents, title, subtitle, onClickDocument, onBack, onClearFilter, onDelete } = props;

  const [sortField, setSortField] = React.useState<SortField>('ngayBanHanh');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [page, setPage] = React.useState<number>(1);

  // === Chọn nhiều dòng để xóa ===
  const [selected, setSelected] = React.useState<{ [id: string]: boolean }>({});
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);
  const [deleting, setDeleting] = React.useState<boolean>(false);
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | undefined>(undefined);

  const showToast = (msg: string, ok: boolean): void => {
    setToast({ msg, ok });
    window.setTimeout((): void => setToast(undefined), 4500);
  };

  // Reset to page 1 + bỏ chọn nếu documents đổi (vd filter mới)
  React.useEffect((): void => {
    setPage(1);
    setSelected({});
  }, [documents.length]);

  const sortedDocs: IDocument[] = React.useMemo((): IDocument[] => {
    const copy: IDocument[] = [...documents];
    copy.sort((a: IDocument, b: IDocument): number => {
      const av: string | number | undefined = (a as unknown as Record<SortField, string | number>)[sortField];
      const bv: string | number | undefined = (b as unknown as Record<SortField, string | number>)[sortField];
      const c: number = compare(av, bv);
      return sortDir === 'asc' ? c : -c;
    });
    return copy;
  }, [documents, sortField, sortDir]);

  const totalPages: number = Math.max(1, Math.ceil(sortedDocs.length / PAGE_SIZE));
  const pageDocs: IDocument[] = sortedDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Độ phủ bản mềm (PDF-first): có bản mềm (DOCX/XLSX đi kèm) vs thiếu bản mềm
  const pairStats: { withSrc: number; missing: number } = React.useMemo((): { withSrc: number; missing: number } => {
    let withSrc: number = 0;
    for (let i: number = 0; i < documents.length; i++) {
      if (documents[i].editableSource) { withSrc++; }
    }
    return { withSrc, missing: documents.length - withSrc };
  }, [documents]);

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDir((d: SortDir): SortDir => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const renderSortIndicator = (field: SortField): React.ReactNode => {
    if (sortField !== field) { return null; }
    return <span className={styles.sortIndicator}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  // === Selection (chọn nhiều dòng) ===
  const canDelete: boolean = !!onDelete;
  const selectedIds: string[] = Object.keys(selected).filter((id: string): boolean => selected[id]);
  const selectedDocs: IDocument[] = sortedDocs.filter((d: IDocument): boolean => selected[d.id]);
  const allPageSelected: boolean = pageDocs.length > 0 && pageDocs.every((d: IDocument): boolean => selected[d.id]);

  const toggleOne = (id: string): void => {
    setSelected((prev: { [id: string]: boolean }): { [id: string]: boolean } => ({ ...prev, [id]: !prev[id] }));
  };
  const togglePage = (): void => {
    if (allPageSelected) {
      setSelected((prev: { [id: string]: boolean }): { [id: string]: boolean } => {
        const next: { [id: string]: boolean } = { ...prev };
        pageDocs.forEach((d: IDocument): void => { next[d.id] = false; });
        return next;
      });
      return;
    }
    setSelected((prev: { [id: string]: boolean }): { [id: string]: boolean } => {
      const next: { [id: string]: boolean } = { ...prev };
      pageDocs.forEach((d: IDocument): void => { next[d.id] = true; });
      return next;
    });
  };

  const doDelete = (): void => {
    if (!onDelete || selectedDocs.length === 0) { return; }
    setDeleting(true);
    onDelete(selectedDocs)
      .then((r: { ok: number; failed: number; errors: string[] }): void => {
        setDeleting(false);
        setConfirmOpen(false);
        setSelected({});
        showToast(`Đã xóa ${r.ok} tài liệu vào Thùng rác${r.failed ? `, lỗi ${r.failed}` : ''}.`, r.failed === 0);
      })
      .catch((e: Error): void => {
        setDeleting(false);
        setConfirmOpen(false);
        showToast(`Lỗi xóa: ${e?.message ?? 'không xác định'}`, false);
      });
  };

  return (
    <section className={styles.listView}>
      {toast && (
        <div className={`${styles.reviewToast} ${toast.ok ? styles.reviewToastOk : styles.reviewToastErr}`}>{toast.msg}</div>
      )}
      <div className={styles.listHead}>
        <button type="button" className={styles.listBackBtn} onClick={onBack}>← Trang chủ</button>
        <div className={styles.listTitleBlock}>
          <h2 className={styles.listTitle}>{title}</h2>
          {subtitle && <p className={styles.listSubtitle}>{subtitle}</p>}
        </div>
        <div className={styles.listMeta}>
          <span>{sortedDocs.length} văn bản</span>
          {sortedDocs.length > 0 && (
            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 400, color: 'var(--dms-secondary)' }}>
              · {pairStats.withSrc} có bản mềm · {pairStats.missing} thiếu bản mềm
            </span>
          )}
          {onClearFilter && (
            <button type="button" className={styles.listClearBtn} onClick={onClearFilter}>
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {canDelete && selectedIds.length > 0 && (
        <div className={styles.reviewBulkBar}>
          <span className={styles.reviewBulkInfo}>Đã chọn <strong>{selectedIds.length}</strong> tài liệu</span>
          <button
            type="button"
            className={styles.primaryButton}
            style={{ background: '#D13438', borderColor: '#D13438' }}
            disabled={deleting}
            onClick={(): void => setConfirmOpen(true)}
          >
            <TrashIcon size={14} /> Xóa đã chọn
          </button>
          <button type="button" className={styles.advancedReset} onClick={(): void => setSelected({})}>Bỏ chọn</button>
        </div>
      )}

      {sortedDocs.length === 0 ? (
        <div className={styles.listEmpty}>
          <p>Không tìm thấy văn bản phù hợp với điều kiện lọc.</p>
          {onClearFilter && (
            <button type="button" className={styles.secondaryButton} onClick={onClearFilter}>
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.docTable}>
              <thead>
                <tr>
                  {canDelete && (
                    <th className={styles.colIcon}>
                      <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Chọn tất cả trong trang" title="Chọn tất cả trong trang" />
                    </th>
                  )}
                  <th className={styles.colIcon} />
                  <th className={`${styles.sortable} ${styles.colSoVB}`} onClick={(): void => handleSort('soVanBan')}>
                    Số VB {renderSortIndicator('soVanBan')}
                  </th>
                  <th className={styles.colTrichYeu}>Tiêu đề</th>
                  <th className={`${styles.sortable} ${styles.colNhom}`} onClick={(): void => handleSort('nhomTaiLieu')}>
                    Nhóm tài liệu {renderSortIndicator('nhomTaiLieu')}
                  </th>
                  <th
                    className={`${styles.sortable} ${styles.colLoai}`}
                    onClick={(): void => handleSort('loaiVanBan')}
                    title="Loại văn bản theo hình thức ban hành (Quyết định, Thông báo...)"
                  >
                    Loại VB (hình thức) {renderSortIndicator('loaiVanBan')}
                  </th>
                  <th
                    className={`${styles.sortable} ${styles.colNghiepVu}`}
                    onClick={(): void => handleSort('loaiTaiLieu')}
                    title="Loại tài liệu theo nghiệp vụ (Quy trình, Quy định, Hướng dẫn...)"
                  >
                    Loại tài liệu (nghiệp vụ) {renderSortIndicator('loaiTaiLieu')}
                  </th>
                  <th className={`${styles.sortable} ${styles.colDvph}`} onClick={(): void => handleSort('donViPhatHanh')}>
                    Đơn vị soạn thảo {renderSortIndicator('donViPhatHanh')}
                  </th>
                  <th
                    className={`${styles.sortable} ${styles.colDonVi}`}
                    onClick={(): void => handleSort('donViSoanThao')}
                    title="Cấp lưu trữ (folder cấp 1 [NN]) — chuẩn hóa Metadata V2"
                  >
                    Cấp lưu trữ {renderSortIndicator('donViSoanThao')}
                  </th>
                  <th className={`${styles.sortable} ${styles.colNgay}`} onClick={(): void => handleSort('ngayBanHanh')}>
                    Ngày BH {renderSortIndicator('ngayBanHanh')}
                  </th>
                  <th className={`${styles.sortable} ${styles.colStatus}`} onClick={(): void => handleSort('trangThai')}>
                    Trạng thái {renderSortIndicator('trangThai')}
                  </th>
                  <th className={styles.colSec}>Bảo mật</th>
                </tr>
              </thead>
              <tbody>
                {pageDocs.map((doc: IDocument): React.ReactElement => (
                  <tr
                    key={doc.id}
                    className={styles.tableRow}
                    onClick={(): void => onClickDocument(doc)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLTableRowElement>): void => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickDocument(doc); }
                    }}
                    tabIndex={0}
                  >
                    {canDelete && (
                      <td className={styles.colIcon} onClick={(e: React.MouseEvent): void => e.stopPropagation()}>
                        <input type="checkbox" checked={!!selected[doc.id]} onChange={(): void => toggleOne(doc.id)} aria-label="Chọn dòng" />
                      </td>
                    )}
                    <td className={styles.colIcon}>
                      {doc.fileKind === 'pdf' ? <PdfFileIcon size={18} /> : <WordFileIcon size={18} />}
                    </td>
                    <td className={styles.colSoVB}>{doc.soVanBan}</td>
                    <td className={styles.colTrichYeu}>
                      <div className={styles.trichYeuLine}>{doc.trichYeu || doc.fileName}</div>
                    </td>
                    <td className={styles.colNhom}>{doc.nhomTaiLieu || '—'}</td>
                    <td className={styles.colLoai}>
                      <span className={styles.loaiBadge}>{doc.loaiVanBanPhapLy || doc.loaiVanBan}</span>
                    </td>
                    <td className={styles.colNghiepVu}>{doc.loaiTaiLieu || '—'}</td>
                    <td className={styles.colDvph}>{doc.donViPhatHanh || '—'}</td>
                    <td className={styles.colDonVi}>{doc.donViSoanThao}</td>
                    <td className={styles.colNgay}>{formatDate(doc.ngayBanHanh)}</td>
                    <td className={styles.colStatus}>
                      <span className={`${styles.badge} ${statusBadgeClass(doc.trangThai)}`}>{doc.trangThai}</span>
                    </td>
                    <td className={styles.colSec}>
                      <span className={`${styles.badge} ${securityBadgeClass(doc.mucDoBaoMat)}`}>{doc.mucDoBaoMat}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={styles.pager}>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={page <= 1}
                onClick={(): void => setPage((p: number): number => Math.max(1, p - 1))}
              >
                ← Trang trước
              </button>
              <span className={styles.pagerInfo}>
                Trang <strong>{page}</strong> / {totalPages} &nbsp;|&nbsp; {sortedDocs.length} văn bản
              </span>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={page >= totalPages}
                onClick={(): void => setPage((p: number): number => Math.min(totalPages, p + 1))}
              >
                Trang sau →
              </button>
            </div>
          )}
        </>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Xác nhận xóa tài liệu"
          danger={true}
          busy={deleting}
          confirmLabel="Xóa"
          message={
            <>
              <p>Bạn có chắc muốn xóa <strong>{selectedDocs.length}</strong> tài liệu?</p>
              <p style={{ fontSize: '12px', color: 'var(--dms-secondary, #605E5C)' }}>
                Tài liệu (kèm bản mềm nếu có) sẽ được đưa vào Thùng rác của site và có thể khôi phục.
              </p>
            </>
          }
          onConfirm={doDelete}
          onCancel={(): void => setConfirmOpen(false)}
        />
      )}
    </section>
  );
}
