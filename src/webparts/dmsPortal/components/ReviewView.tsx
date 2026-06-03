import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocument, IMetadataChoices } from '../models/IDocument';
import { EditIcon, CheckCircleIcon, SearchIcon, TrashIcon } from './Icons';
import BulkEditModal, { IBulkResult } from './BulkEditModal';
import ConfirmDialog from './ConfirmDialog';
import { downloadCsv, timestampedName } from '../utils/exportCsv';
import { needsStandardization, isNotExpired } from '../utils/standardization';

export interface IReviewViewProps {
  documents: IDocument[];
  /** Choices lấy động từ DMS Library field schema. */
  choices?: IMetadataChoices;
  onBulkSave: (ids: string[], values: { [internalName: string]: string }, onProgress?: (done: number, total: number) => void) => Promise<IBulkResult>;
  onReload: () => Promise<void>;
  lastUpdated?: Date;
  onClickDocument: (doc: IDocument) => void;
  onBack: () => void;
  /** Xóa (Thùng rác) nhiều văn bản đã chọn. */
  onDelete?: (docs: IDocument[], onProgress?: (done: number, total: number) => void) => Promise<{ ok: number; failed: number; errors: string[] }>;
}

function isManual(d: IDocument): boolean { return d.nguonMetadata === 'ManualReviewed'; }
function lowConf(d: IDocument): boolean { return d.metadataConfidence === 'NeedsReview' || d.metadataConfidence === 'Low'; }
function noOwnerOrIssuer(d: IDocument): boolean { return !d.donViSoHuu || !d.donViPhatHanh; }
function noSoft(d: IDocument): boolean { return !d.editableSource; }
// needsReview dùng logic chung (utils/standardization) để khớp với KPI Trang chủ.
const needsReview = needsStandardization;

type CritKey = 'all' | 'needsReview' | 'low' | 'noSoft' | 'noUnit' | 'notManual';
const CRIT_CHIPS: { key: CritKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'needsReview', label: 'NeedsReview' },
  { key: 'low', label: 'Low' },
  { key: 'noSoft', label: 'Thiếu bản mềm' },
  { key: 'noUnit', label: 'Thiếu đơn vị' },
  { key: 'notManual', label: 'Chưa rà soát thủ công' }
];

const MAX_ROWS: number = 500;

function confBadgeClass(conf: string | undefined): string {
  switch (conf) {
    case 'High': return styles.confHigh;
    case 'Medium': return styles.confMedium;
    case 'Low': return styles.confLow;
    case 'NeedsReview': return styles.confNeedsReview;
    default: return styles.badgeNeutral;
  }
}

export default function ReviewView(props: IReviewViewProps): React.ReactElement {
  const { documents, choices, onBulkSave, onReload, lastUpdated, onClickDocument, onBack, onDelete } = props;

  const [crit, setCrit] = React.useState<CritKey>('all');
  const [unitFilter, setUnitFilter] = React.useState<string>('');
  const [nhomFilter, setNhomFilter] = React.useState<string>('');
  const [selected, setSelected] = React.useState<{ [id: string]: boolean }>({});
  const [showBulk, setShowBulk] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [reloading, setReloading] = React.useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = React.useState<boolean>(false);
  const [deleting, setDeleting] = React.useState<boolean>(false);
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | undefined>(undefined);

  const showToast = (msg: string, ok: boolean): void => {
    setToast({ msg, ok });
    window.setTimeout((): void => setToast(undefined), 4500);
  };

  // Loại văn bản hết hiệu lực khỏi danh sách "Cần chuẩn hóa" (khớp với KPI Trang chủ).
  const baseList: IDocument[] = React.useMemo(
    (): IDocument[] => documents.filter((d: IDocument): boolean => isNotExpired(d) && needsReview(d)), [documents]);

  // KPI đếm TRÊN baseList (tập "cần chuẩn hóa") để số trên thẻ khớp đúng số dòng
  // hiển thị khi bấm vào thẻ (mỗi thẻ = 1 chip lọc tương ứng bên dưới).
  const kpi = React.useMemo((): { tong: number; nr: number; low: number; soft: number; unit: number; manual: number } => {
    let nr: number = 0, low: number = 0, soft: number = 0, unit: number = 0, manual: number = 0;
    baseList.forEach((d: IDocument): void => {
      if (d.metadataConfidence === 'NeedsReview') { nr++; }
      if (d.metadataConfidence === 'Low') { low++; }
      if (noSoft(d)) { soft++; }
      if (noOwnerOrIssuer(d)) { unit++; }
      if (!isManual(d)) { manual++; }
    });
    return { tong: baseList.length, nr, low, soft, unit, manual };
  }, [baseList]);

  const unitOptions: string[] = React.useMemo((): string[] => {
    const s: { [k: string]: boolean } = {};
    baseList.forEach((d: IDocument): void => { if (d.donViSoHuu) { s[d.donViSoHuu] = true; } });
    return Object.keys(s).sort();
  }, [baseList]);
  const nhomOptions: string[] = React.useMemo((): string[] => {
    const s: { [k: string]: boolean } = {};
    baseList.forEach((d: IDocument): void => { if (d.nhomTaiLieu) { s[d.nhomTaiLieu] = true; } });
    return Object.keys(s).sort();
  }, [baseList]);

  const filtered: IDocument[] = React.useMemo((): IDocument[] => {
    return baseList.filter((d: IDocument): boolean => {
      switch (crit) {
        case 'needsReview': if (d.metadataConfidence !== 'NeedsReview') { return false; } break;
        case 'low': if (d.metadataConfidence !== 'Low') { return false; } break;
        case 'noSoft': if (!noSoft(d)) { return false; } break;
        case 'noUnit': if (!noOwnerOrIssuer(d)) { return false; } break;
        case 'notManual': if (isManual(d)) { return false; } break;
        default: break;
      }
      if (unitFilter && (d.donViSoHuu ?? '') !== unitFilter) { return false; }
      if (nhomFilter && (d.nhomTaiLieu ?? '') !== nhomFilter) { return false; }
      return true;
    });
  }, [baseList, crit, unitFilter, nhomFilter]);

  const list: IDocument[] = filtered.slice(0, MAX_ROWS);
  const selectedIds: string[] = Object.keys(selected).filter((id: string): boolean => selected[id]);
  const allVisibleSelected: boolean = list.length > 0 && list.every((d: IDocument): boolean => selected[d.id]);

  const toggleOne = (id: string): void => {
    setSelected((prev: { [id: string]: boolean }): { [id: string]: boolean } => ({ ...prev, [id]: !prev[id] }));
  };
  const toggleAll = (): void => {
    if (allVisibleSelected) { setSelected({}); return; }
    const next: { [id: string]: boolean } = {};
    list.forEach((d: IDocument): void => { next[d.id] = true; });
    setSelected(next);
  };

  // Đánh dấu đã rà soát (1 item hoặc nhiều item)
  const markReviewed = (ids: string[]): void => {
    if (ids.length === 0) { return; }
    if (!window.confirm(`Đánh dấu "đã rà soát" cho ${ids.length} văn bản?\n→ Nguồn metadata = ManualReviewed, Độ tin cậy = High.`)) { return; }
    setSaving(true);
    onBulkSave(ids, { NguonMetadata: 'ManualReviewed', MetadataConfidence: 'High' })
      .then((r: IBulkResult): void => {
        setSaving(false);
        setSelected({});
        showToast(`Đã đánh dấu rà soát ${r.ok} văn bản${r.failed ? `, lỗi ${r.failed}` : ''}.`, r.failed === 0);
      })
      .catch((e: Error): void => { setSaving(false); showToast(`Lỗi: ${e?.message ?? 'không xác định'}`, false); });
  };

  // Xóa (Thùng rác) các văn bản đã chọn.
  const selectedDocsToDelete: IDocument[] = filtered.filter((d: IDocument): boolean => selected[d.id]);
  const doDelete = (): void => {
    if (!onDelete || selectedDocsToDelete.length === 0) { return; }
    setDeleting(true);
    onDelete(selectedDocsToDelete)
      .then((r: { ok: number; failed: number; errors: string[] }): void => {
        setDeleting(false);
        setConfirmDelete(false);
        setSelected({});
        showToast(`Đã xóa ${r.ok} tài liệu vào Thùng rác${r.failed ? `, lỗi ${r.failed}` : ''}.`, r.failed === 0);
      })
      .catch((e: Error): void => {
        setDeleting(false);
        setConfirmDelete(false);
        showToast(`Lỗi xóa: ${e?.message ?? 'không xác định'}`, false);
      });
  };

  const hasActiveFilter: boolean = crit !== 'all' || unitFilter !== '' || nhomFilter !== '';
  const clearFilters = (): void => { setCrit('all'); setUnitFilter(''); setNhomFilter(''); };

  const doReload = (): void => {
    setReloading(true);
    onReload()
      .then((): void => { setReloading(false); setSelected({}); showToast('Đã tải lại dữ liệu', true); })
      .catch((e: Error): void => { setReloading(false); showToast(`Lỗi tải lại: ${e?.message ?? ''}`, false); });
  };

  const missingReason = (d: IDocument): string => {
    const r: string[] = [];
    if (lowConf(d)) { r.push('Độ tin cậy thấp'); }
    if (!d.soVanBan) { r.push('Thiếu số VB'); }
    if (!d.nhomTaiLieu) { r.push('Thiếu nhóm'); }
    if (!d.donViSoHuu) { r.push('Thiếu cấp lưu trữ'); }
    if (!d.donViPhatHanh) { r.push('Thiếu đơn vị soạn thảo'); }
    if (!d.ngayBanHanh) { r.push('Thiếu ngày ban hành'); }
    if (noSoft(d)) { r.push('Thiếu bản mềm'); }
    return r.join('; ');
  };

  const handleExport = (): void => {
    if (filtered.length === 0) { showToast('Không có dòng nào để xuất.', false); return; }
    const headers: string[] = ['SoVanBan', 'TrichYeu', 'NhomTaiLieu', 'LoaiVanBanPhapLy', 'LoaiTaiLieu', 'DonViSoHuu', 'DonViPhatHanh', 'NguoiKy', 'NgayBanHanh', 'NgayHetHieuLuc', 'TrangThai', 'MucDoBaoMat', 'MetadataConfidence', 'NguonMetadata', 'HasEditableSource', 'EditableSourceUrl', 'PrimaryPdfUrl', 'ServerRelativeUrl', 'MissingReason'];
    const rows: string[][] = filtered.map((d: IDocument): string[] => [
      d.soVanBan ?? '', d.trichYeu ?? '', d.nhomTaiLieu ?? '', d.loaiVanBanPhapLy ?? d.loaiVanBan ?? '',
      d.loaiTaiLieu ?? '', d.donViSoHuu ?? '', d.donViPhatHanh ?? '', d.nguoiKy ?? '',
      d.ngayBanHanh ?? '', d.ngayHetHieuLuc ?? '', String(d.trangThai ?? ''), String(d.mucDoBaoMat ?? ''),
      d.metadataConfidence ?? '', d.nguonMetadata ?? '', d.editableSource ? 'Có' : 'Không',
      d.editableSource ? (d.editableSource.webUrl ?? '') : '', d.webUrl ?? '', d.serverRelativeUrl ?? '', missingReason(d)
    ]);
    downloadCsv(timestampedName('can-chuan-hoa-metadata'), headers, rows);
    showToast(`Đã xuất ${rows.length} dòng CSV.`, true);
  };

  const pad2 = (n: number): string => (n < 10 ? '0' + n : '' + n);
  const updatedStr: string = lastUpdated ? `Cập nhật lúc ${pad2(lastUpdated.getHours())}:${pad2(lastUpdated.getMinutes())} · Cache 5 phút` : '';

  const summary: { display: number; selected: number; nr: number; low: number; soft: number; unit: number; notManual: number } = {
    display: filtered.length,
    selected: selectedIds.length,
    nr: filtered.filter((d: IDocument): boolean => d.metadataConfidence === 'NeedsReview').length,
    low: filtered.filter((d: IDocument): boolean => d.metadataConfidence === 'Low').length,
    soft: filtered.filter(noSoft).length,
    unit: filtered.filter(noOwnerOrIssuer).length,
    notManual: filtered.filter((d: IDocument): boolean => !isManual(d)).length
  };

  const missingBadges = (d: IDocument): React.ReactElement[] => {
    const out: React.ReactElement[] = [];
    if (!d.soVanBan) { out.push(<span key="s" className={`${styles.badge} ${styles.badgeWarning}`}>Số VB</span>); }
    if (!d.nhomTaiLieu) { out.push(<span key="n" className={`${styles.badge} ${styles.badgeWarning}`}>Nhóm</span>); }
    if (!d.ngayBanHanh) { out.push(<span key="d" className={`${styles.badge} ${styles.badgeWarning}`}>Ngày</span>); }
    return out;
  };

  const kpiItems: { label: string; value: number; crit: CritKey }[] = [
    { label: 'Tổng cần chuẩn hóa', value: kpi.tong, crit: 'all' },
    { label: 'NeedsReview', value: kpi.nr, crit: 'needsReview' },
    { label: 'Low confidence', value: kpi.low, crit: 'low' },
    { label: 'Thiếu bản mềm', value: kpi.soft, crit: 'noSoft' },
    { label: 'Thiếu đơn vị', value: kpi.unit, crit: 'noUnit' },
    { label: 'Chưa rà soát thủ công', value: kpi.manual, crit: 'notManual' }
  ];

  return (
    <section className={styles.listView}>
      {toast && (
        <div className={`${styles.reviewToast} ${toast.ok ? styles.reviewToastOk : styles.reviewToastErr}`}>{toast.msg}</div>
      )}

      <div className={styles.listHead}>
        <button type="button" className={styles.listBackBtn} onClick={onBack}>← Trang chủ</button>
        <div className={styles.listTitleBlock}>
          <h2 className={styles.listTitle}>Cần chuẩn hóa dữ liệu</h2>
          <p className={styles.listSubtitle}>Danh sách văn bản có metadata thiếu, độ tin cậy thấp hoặc cần phòng ban xác nhận.</p>
        </div>
        <div className={styles.listMeta}>
          {updatedStr && <span className={styles.reviewUpdated}>{updatedStr}</span>}
          <button type="button" className={styles.secondaryButton} onClick={handleExport} disabled={filtered.length === 0}>Xuất CSV</button>
          <button type="button" className={styles.secondaryButton} onClick={doReload} disabled={reloading}>{reloading ? 'Đang tải…' : 'Tải lại dữ liệu'}</button>
        </div>
      </div>

      <div className={styles.reviewKpis}>
        {kpiItems.map((k: { label: string; value: number; crit: CritKey }): React.ReactElement => (
          <button
            key={k.label}
            type="button"
            className={`${styles.reviewKpi} ${styles.reviewKpiButton} ${crit === k.crit ? styles.reviewKpiActive : ''}`}
            onClick={(): void => setCrit(k.crit)}
            title="Bấm để lọc danh sách"
          >
            <span className={styles.reviewKpiValue}>{k.value}</span>
            <span className={styles.reviewKpiLabel}>{k.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.reviewFilters}>
        {CRIT_CHIPS.map((c: { key: CritKey; label: string }): React.ReactElement => (
          <button key={c.key} type="button" className={styles.filterChip} style={crit === c.key ? { background: 'rgba(0,56,168,0.16)' } : undefined} onClick={(): void => setCrit(c.key)}>
            {c.label}
          </button>
        ))}
        <select className={styles.fieldInput} style={{ maxWidth: '220px', height: '30px' }} value={unitFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setUnitFilter(e.target.value)}>
          <option value="">Theo cấp lưu trữ…</option>
          {unitOptions.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className={styles.fieldInput} style={{ maxWidth: '220px', height: '30px' }} value={nhomFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setNhomFilter(e.target.value)}>
          <option value="">Theo nhóm tài liệu…</option>
          {nhomOptions.map((v: string): React.ReactElement => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* Sticky bulk bar */}
      {selectedIds.length > 0 && (
        <div className={styles.reviewBulkBar}>
          <span className={styles.reviewBulkInfo}>Đã chọn <strong>{selectedIds.length}</strong> văn bản</span>
          <button type="button" className={styles.primaryButton} disabled={saving} onClick={(): void => setShowBulk(true)}>Sửa metadata hàng loạt</button>
          <button type="button" className={styles.reviewRowBtnOk} disabled={saving} onClick={(): void => markReviewed(selectedIds)}>✓ Đánh dấu đã rà soát</button>
          {onDelete && (
            <button
              type="button"
              className={styles.primaryButton}
              style={{ background: '#D13438', borderColor: '#D13438' }}
              disabled={saving || deleting}
              onClick={(): void => setConfirmDelete(true)}
            >
              <TrashIcon size={13} /> Xóa đã chọn
            </button>
          )}
          <button type="button" className={styles.advancedReset} onClick={(): void => setSelected({})}>Bỏ chọn</button>
        </div>
      )}

      {list.length === 0 ? (
        hasActiveFilter ? (
          <div className={styles.listEmpty}>
            <SearchIcon size={30} />
            <p><strong>Không có văn bản phù hợp bộ lọc</strong></p>
            <p>Thử xóa bộ lọc hoặc chọn điều kiện khác.</p>
            <button type="button" className={styles.secondaryButton} onClick={clearFilters}>Xóa bộ lọc</button>
          </div>
        ) : (
          <div className={styles.listEmpty}>
            <CheckCircleIcon size={32} />
            <p><strong>Đã hoàn tất chuẩn hóa</strong></p>
            <p>Không còn văn bản có metadata thiếu, độ tin cậy thấp hoặc thiếu bản mềm theo tiêu chí hiện tại.</p>
          </div>
        )
      ) : (
        <>
          {filtered.length > MAX_ROWS && (
            <div className={styles.reviewCapWarn}>Đang hiển thị {MAX_ROWS} dòng đầu tiên. Hãy lọc hẹp hơn để xử lý chính xác.</div>
          )}
          <div className={styles.tableWrap} style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          <table className={styles.docTable}>
            <thead>
              <tr>
                <th className={styles.colIcon}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Chọn tất cả" /></th>
                <th className={styles.colSoVB}>Số VB</th>
                <th className={styles.colTrichYeu}>Tiêu đề</th>
                <th>Nhóm tài liệu</th>
                <th>Loại VB pháp lý</th>
                <th>Loại tài liệu</th>
                <th>Cấp lưu trữ</th>
                <th>Đơn vị soạn thảo</th>
                <th>Độ tin cậy</th>
                <th>Nguồn</th>
                <th>Bản mềm</th>
                <th>Thiếu</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((doc: IDocument): React.ReactElement => (
                <tr key={doc.id} className={styles.tableRow} onClick={(): void => onClickDocument(doc)}>
                  <td className={styles.colIcon} onClick={(e: React.MouseEvent): void => e.stopPropagation()}>
                    <input type="checkbox" checked={!!selected[doc.id]} onChange={(): void => toggleOne(doc.id)} aria-label="Chọn" />
                  </td>
                  <td className={styles.colSoVB}>{doc.soVanBan || '—'}</td>
                  <td className={styles.colTrichYeu}><div className={styles.trichYeuLine}>{doc.trichYeu || doc.fileName}</div></td>
                  <td>{doc.nhomTaiLieu || <em className={styles.muted}>—</em>}</td>
                  <td>{doc.loaiVanBanPhapLy || doc.loaiVanBan || <em className={styles.muted}>—</em>}</td>
                  <td>{doc.loaiTaiLieu || <em className={styles.muted}>—</em>}</td>
                  <td>{doc.donViSoHuu || <em className={styles.muted}>—</em>}</td>
                  <td>{doc.donViPhatHanh || <em className={styles.muted}>—</em>}</td>
                  <td><span className={`${styles.badge} ${confBadgeClass(doc.metadataConfidence)}`}>{doc.metadataConfidence || '—'}</span></td>
                  <td>
                    {doc.nguonMetadata
                      ? <span className={`${styles.badge} ${isManual(doc) ? styles.srcManual : styles.srcParsed}`}>{isManual(doc) ? 'Đã rà soát' : doc.nguonMetadata}</span>
                      : <em className={styles.muted}>—</em>}
                  </td>
                  <td><span className={`${styles.badge} ${doc.editableSource ? styles.softYes : styles.softNo}`}>{doc.editableSource ? 'Có' : 'Thiếu'}</span></td>
                  <td><div className={styles.reviewMissCell}>{missingBadges(doc)}</div></td>
                  <td onClick={(e: React.MouseEvent): void => e.stopPropagation()}>
                    <div className={styles.reviewRowActions}>
                      <button type="button" className={styles.reviewRowBtn} title="Xem / sửa metadata" onClick={(): void => onClickDocument(doc)}>
                        <EditIcon size={13} /> Sửa
                      </button>
                      <button type="button" className={styles.reviewRowBtnOk} title="Đánh dấu đã rà soát (ManualReviewed + High)" disabled={saving} onClick={(e: React.MouseEvent): void => { e.stopPropagation(); markReviewed([doc.id]); }}>
                        ✓ Đã rà soát
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className={styles.reviewSummary}>
            <span>Đang hiển thị <strong>{summary.display}</strong></span>
            <span>Đã chọn <strong>{summary.selected}</strong></span>
            <span>NeedsReview: {summary.nr}</span>
            <span>Low: {summary.low}</span>
            <span>Thiếu bản mềm: {summary.soft}</span>
            <span>Thiếu đơn vị: {summary.unit}</span>
            <span>Chưa rà soát: {summary.notManual}</span>
          </div>
        </>
      )}

      {showBulk && (
        <BulkEditModal
          selectedCount={selectedIds.length}
          choices={choices}
          onClose={(): void => setShowBulk(false)}
          onSubmit={(values: { [k: string]: string }, onProgress: (done: number, total: number) => void): Promise<IBulkResult> => onBulkSave(selectedIds, values, onProgress)}
          onDone={(r: IBulkResult): void => {
            setSelected({});
            showToast(`Đã cập nhật ${r.ok} văn bản${r.failed ? `, lỗi ${r.failed}` : ''}.`, r.failed === 0);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Xác nhận xóa tài liệu"
          danger={true}
          busy={deleting}
          confirmLabel="Xóa"
          message={
            <>
              <p>Bạn có chắc muốn xóa <strong>{selectedDocsToDelete.length}</strong> tài liệu?</p>
              <p style={{ fontSize: '12px', color: 'var(--dms-secondary, #605E5C)' }}>
                Tài liệu (kèm bản mềm nếu có) sẽ được đưa vào Thùng rác của site và có thể khôi phục.
              </p>
            </>
          }
          onConfirm={doDelete}
          onCancel={(): void => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
