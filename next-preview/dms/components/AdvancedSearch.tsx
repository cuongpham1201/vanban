'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import { IDocSearchFilter, IDocument, IUnitStat, IStorageFolder } from '../models/IDocument';
import { DOC_TYPE_OPTIONS } from '../mock/mockData';
import { SearchIcon, CalendarIcon } from './Icons';

export interface IAdvancedSearchProps {
  onSearch: (filter: IDocSearchFilter) => void;
  onClear: () => void;
  /** Toàn bộ documents để derive dropdown options động. */
  allDocs?: IDocument[];
  /** Đơn vị stats (đã có sẵn từ service). */
  units?: IUnitStat[];
  /** Folder cấp 1 thật trong DMS Library (nguồn chuẩn cho filter Cấp lưu trữ). */
  storageFolders?: IStorageFolder[];
  /** Bộ lọc hiện tại (để đồng bộ form khi user xóa chip filter bên ngoài). */
  value?: IDocSearchFilter;
}

interface IFormState {
  soVanBan: string;
  nhomTaiLieu: string;
  loaiVanBan: string;
  loaiTaiLieu: string;
  donViCode: string;
  donViPhatHanh: string;
  nguoiKy: string;
  tuNgay: string;
  denNgay: string;
}

const EMPTY_FORM: IFormState = {
  soVanBan: '',
  nhomTaiLieu: '',
  loaiVanBan: '',
  loaiTaiLieu: '',
  donViCode: '',
  donViPhatHanh: '',
  nguoiKy: '',
  tuNgay: '',
  denNgay: ''
};

/** Lấy danh sách giá trị distinct của 1 field V2 (đã bỏ rỗng), sort. */
function distinctValues(docs: IDocument[] | undefined, pick: (d: IDocument) => string | undefined): string[] {
  if (!docs || docs.length === 0) { return []; }
  const set: { [k: string]: boolean } = {};
  docs.forEach((d: IDocument): void => {
    const v: string | undefined = pick(d);
    if (v && v.trim().length > 0) { set[v] = true; }
  });
  return Object.keys(set).sort();
}

/** form -> IDocSearchFilter (bỏ field rỗng). */
function buildFilter(f: IFormState): IDocSearchFilter {
  return {
    soVanBan: f.soVanBan || undefined,
    nhomTaiLieu: f.nhomTaiLieu || undefined,
    loaiVanBan: f.loaiVanBan || undefined,
    loaiTaiLieu: f.loaiTaiLieu || undefined,
    donViCode: f.donViCode || undefined,
    donViPhatHanh: f.donViPhatHanh || undefined,
    nguoiKy: f.nguoiKy || undefined,
    tuNgay: f.tuNgay || undefined,
    denNgay: f.denNgay || undefined
  };
}

export default function AdvancedSearch(props: IAdvancedSearchProps): React.ReactElement {
  const { onSearch, onClear, allDocs, units, storageFolders, value } = props;
  const [form, setForm] = React.useState<IFormState>(EMPTY_FORM);
  const [dateError, setDateError] = React.useState<string | undefined>(undefined);

  // Build dropdown options từ data thật (fallback về mock nếu chưa có)
  const loaiVanBanOptions: { value: string; label: string }[] = React.useMemo((): { value: string; label: string }[] => {
    if (!allDocs || allDocs.length === 0) {
      return DOC_TYPE_OPTIONS;
    }
    const set: { [k: string]: boolean } = {};
    allDocs.forEach((d: IDocument): void => {
      if (d.loaiVanBan) { set[d.loaiVanBan] = true; }
    });
    return Object.keys(set).sort().map((v: string): { value: string; label: string } => ({ value: v, label: v }));
  }, [allDocs]);

  const donViOptions: { code: string; name: string }[] = React.useMemo((): { code: string; name: string }[] => {
    // NGUỒN CHUẨN: folder cấp 1 thật (getStorageFolders) — đủ folder kể cả chưa có văn bản.
    const codeOf = (name: string): string => {
      const m: RegExpMatchArray | null = (name ?? '').match(/^\s*\[(\d{2}(?:\.\d{2})?)\]/);
      return m ? m[1] : name;
    };
    const sortKey = (name: string): number => {
      const m: RegExpMatchArray | null = (name ?? '').match(/^\s*\[(\d+(?:\.\d+)?)\]/);
      return m ? parseFloat(m[1]) : Number.MAX_VALUE;
    };
    if (storageFolders && storageFolders.length > 0) {
      return storageFolders
        .slice()
        .sort((a: IStorageFolder, b: IStorageFolder): number => sortKey(a.name) - sortKey(b.name) || a.name.localeCompare(b.name, 'vi', { numeric: true }))
        .map((f: IStorageFolder): { code: string; name: string } => ({ code: codeOf(f.name), name: f.name }));
    }
    // Fallback (folder service lỗi/rỗng): suy từ docs rồi units.
    const map: { [code: string]: string } = {};
    if (allDocs) {
      allDocs.forEach((d: IDocument): void => {
        if (d.donViCode) { map[d.donViCode] = d.donViSoanThao || d.donViCode; }
      });
    }
    if (Object.keys(map).length === 0 && units) {
      units.forEach((u: IUnitStat): void => { map[u.code] = u.name; });
    }
    return Object.keys(map).sort().map((c: string): { code: string; name: string } => ({ code: c, name: map[c] }));
  }, [storageFolders, allDocs, units]);

  // V2 dropdowns (chỉ hiện khi có dữ liệu V2)
  const nhomTaiLieuOptions: string[] = React.useMemo(
    (): string[] => distinctValues(allDocs, (d: IDocument): string | undefined => d.nhomTaiLieu), [allDocs]);
  const loaiTaiLieuOptions: string[] = React.useMemo(
    (): string[] => distinctValues(allDocs, (d: IDocument): string | undefined => d.loaiTaiLieu), [allDocs]);
  const donViPhatHanhOptions: string[] = React.useMemo(
    (): string[] => distinctValues(allDocs, (d: IDocument): string | undefined => d.donViPhatHanh), [allDocs]);

  type ChangeHandler = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;

  // Đồng bộ form theo bộ lọc bên ngoài (vd user xóa 1 chip filter → reset đúng combobox).
  React.useEffect((): void => {
    if (!value) { return; }
    setForm({
      soVanBan: value.soVanBan ?? '',
      nhomTaiLieu: value.nhomTaiLieu ?? '',
      loaiVanBan: value.loaiVanBan ?? '',
      loaiTaiLieu: value.loaiTaiLieu ?? '',
      donViCode: value.donViCode ?? '',
      donViPhatHanh: value.donViPhatHanh ?? '',
      nguoiKy: value.nguoiKy ?? '',
      tuNgay: value.tuNgay ?? '',
      denNgay: value.denNgay ?? ''
    });
    setDateError(undefined);
  }, [value]);

  // Text input (Số VB, Người ký): chỉ cập nhật form, áp dụng khi bấm "Tìm kiếm"/Enter.
  const update = (field: keyof IFormState): ChangeHandler => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    setForm((prev: IFormState): IFormState => ({ ...prev, [field]: e.target.value }));
  };

  // Select/Date: cập nhật form + LỌC NGAY (không cần bấm Tìm kiếm).
  const updateApply = (field: keyof IFormState): ChangeHandler => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const newForm: IFormState = { ...form, [field]: e.target.value };
    setForm(newForm);
    if (field === 'tuNgay' || field === 'denNgay') {
      if (newForm.tuNgay && newForm.denNgay && newForm.tuNgay > newForm.denNgay) {
        setDateError('Từ ngày phải trước hoặc bằng đến ngày.');
        return; // sai range -> không áp dụng
      }
      setDateError(undefined);
    }
    onSearch(buildFilter(newForm));
  };

  const handleSearch = (): void => {
    if (dateError) { return; }
    onSearch(buildFilter(form));
  };

  const handleClear = (): void => {
    setForm(EMPTY_FORM);
    setDateError(undefined);
    onClear();
  };

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { handleSearch(); }
  };

  return (
    <section className={styles.advanced}>
      <h3 className={styles.advancedTitle}>TÌM KIẾM NÂNG CAO</h3>

      <div className={styles.advancedGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Số văn bản</span>
          <input
            type="text"
            className={styles.fieldInput}
            placeholder="Nhập số văn bản..."
            value={form.soVanBan}
            onChange={update('soVanBan')}
            onKeyDown={handleEnter}
          />
        </label>

        {nhomTaiLieuOptions.length > 0 && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Nhóm tài liệu</span>
            <select className={styles.fieldInput} value={form.nhomTaiLieu} onChange={updateApply('nhomTaiLieu')}>
              <option value="">Tất cả nhóm</option>
              {nhomTaiLieuOptions.map((v: string): React.ReactElement => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Loại văn bản (hình thức)</span>
          <select className={styles.fieldInput} value={form.loaiVanBan} onChange={updateApply('loaiVanBan')}>
            <option value="">Tất cả loại</option>
            {loaiVanBanOptions.map((opt: { value: string; label: string }): React.ReactElement => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        {loaiTaiLieuOptions.length > 0 && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Loại tài liệu (nghiệp vụ)</span>
            <select className={styles.fieldInput} value={form.loaiTaiLieu} onChange={updateApply('loaiTaiLieu')}>
              <option value="">Tất cả</option>
              {loaiTaiLieuOptions.map((v: string): React.ReactElement => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Cấp lưu trữ</span>
          <select className={styles.fieldInput} value={form.donViCode} onChange={updateApply('donViCode')}>
            <option value="">Tất cả đơn vị</option>
            {donViOptions.map((u: { code: string; name: string }): React.ReactElement => (
              <option key={u.code} value={u.code}>{u.name}</option>
            ))}
          </select>
        </label>

        {donViPhatHanhOptions.length > 0 && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Đơn vị soạn thảo</span>
            <select className={styles.fieldInput} value={form.donViPhatHanh} onChange={updateApply('donViPhatHanh')}>
              <option value="">Tất cả</option>
              {donViPhatHanhOptions.map((v: string): React.ReactElement => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Người ký</span>
          <input
            type="text"
            className={styles.fieldInput}
            placeholder="Nhập tên người ký..."
            value={form.nguoiKy}
            onChange={update('nguoiKy')}
            onKeyDown={handleEnter}
          />
        </label>

        <div className={styles.fieldDateGroup}>
          <span className={styles.fieldLabel}>Ngày ban hành</span>
          <div className={styles.fieldDates}>
            <span className={styles.dateWrap}>
              <input
                type="date"
                className={styles.fieldInput}
                aria-label="Từ ngày"
                value={form.tuNgay}
                max={form.denNgay || undefined}
                onChange={updateApply('tuNgay')}
              />
              <CalendarIcon size={15} className={styles.dateIcon} />
            </span>
            <span className={styles.dateWrap}>
              <input
                type="date"
                className={styles.fieldInput}
                aria-label="Đến ngày"
                value={form.denNgay}
                min={form.tuNgay || undefined}
                onChange={updateApply('denNgay')}
              />
              <CalendarIcon size={15} className={styles.dateIcon} />
            </span>
          </div>
          {dateError && <span className={styles.fieldError}>{dateError}</span>}
        </div>

        <div className={styles.advancedActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSearch}
            disabled={Boolean(dateError)}
          >
            <SearchIcon size={16} />
            <span>Tìm kiếm</span>
          </button>
          <button type="button" className={styles.advancedReset} onClick={handleClear}>
            Xóa bộ lọc
          </button>
        </div>
      </div>
    </section>
  );
}
