'use client';
import * as React from 'react';
import styles from './DmsPortal.module.scss';
import type { IDmsPortalProps } from './IDmsPortalProps';
import {
  IDocument,
  IUnitStat,
  IKpiStat,
  IDocSearchFilter,
  IMetadataChoices,
  IStorageFolder,
  DocStatus,
  KpiKey,
  NavKey
} from '../models/IDocument';
import { FALLBACK_METADATA_CHOICES } from '../utils/metadataChoices';

import Sidebar from './Sidebar';
import PortalHeader from './PortalHeader';
import Hero from './Hero';
import RecentDocsCard from './RecentDocsCard';
import ExpiringDocsCard from './ExpiringDocsCard';
import ByUnitCard from './ByUnitCard';
import KpiCards from './KpiCards';
import AdvancedSearch from './AdvancedSearch';
import DocumentDetailDrawer from './DocumentDetailDrawer';
import DocumentListView from './DocumentListView';
import ReviewView from './ReviewView';
import UploadDocumentView from './UploadDocumentView';
import { IUploadRequest, IUploadResult } from '../services/IDmsService';
// import DisclaimerBanner from './DisclaimerBanner'; // tạm ẩn banner "đang chuẩn hóa"
import SkeletonLoader from './SkeletonLoader';
import { DocGroupKey, IDocGroup, DOC_GROUPS, matchesGroup, getGroup } from '../utils/documentTypeGroups';
import { isRecentlyIssued, isExpired, isNotExpired } from '../utils/standardization';

type ViewMode = 'home' | 'list' | 'help' | 'stats' | 'review' | 'placeholder' | 'upload';

interface IContextFilter {
  title: string;
  subtitle?: string;
  predicate: (doc: IDocument) => boolean;
  /**
   * Khi true: phạm vi này được phép hiển thị văn bản HẾT HIỆU LỰC
   * (chỉ dùng cho KPI/menu "Văn bản hết hiệu lực"). Mặc định: false → loại hết hiệu lực.
   */
  includeExpired?: boolean;
}

function hasAdvancedCriteria(f: IDocSearchFilter): boolean {
  return Boolean(
    f.soVanBan || f.loaiVanBan || f.donViCode || f.nguoiKy || f.tuNgay || f.denNgay ||
    f.nhomTaiLieu || f.loaiTaiLieu || f.donViPhatHanh
  );
}

function withinDaysFromNow(isoDate: string | undefined, days: number): boolean {
  if (!isoDate) { return false; }
  const today: string = new Date().toISOString().substring(0, 10);
  const cutoffDate: Date = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);
  const cutoff: string = cutoffDate.toISOString().substring(0, 10);
  return isoDate >= today && isoDate <= cutoff;
}

export default function DmsPortal(props: IDmsPortalProps): React.ReactElement {
  const { dmsService, hasTeamsContext } = props;

  // === Data loaded once ===
  const [allDocs, setAllDocs] = React.useState<IDocument[]>([]);
  const [recent, setRecent] = React.useState<IDocument[]>([]);
  const [expiring, setExpiring] = React.useState<IDocument[]>([]);
  const [units, setUnits] = React.useState<IUnitStat[]>([]);
  const [kpis, setKpis] = React.useState<IKpiStat[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [lastUpdated, setLastUpdated] = React.useState<Date | undefined>(undefined);
  const [placeholderTitle, setPlaceholderTitle] = React.useState<string>('');
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | undefined>(undefined);
  const [metadataChoices, setMetadataChoices] = React.useState<IMetadataChoices>(FALLBACK_METADATA_CHOICES);
  const [storageFolders, setStorageFolders] = React.useState<IStorageFolder[]>([]);

  const showToast = (msg: string, ok: boolean): void => {
    setToast({ msg, ok });
    window.setTimeout((): void => setToast(undefined), 5000);
  };

  // === Search + filter state ===
  const [searchTerm, setSearchTerm] = React.useState<string>('');
  const [activeGroup, setActiveGroup] = React.useState<DocGroupKey | undefined>(undefined);
  const [advancedFilter, setAdvancedFilter] = React.useState<IDocSearchFilter>({});

  // === View mode + nav + drawer ===
  const [viewMode, setViewMode] = React.useState<ViewMode>('home');
  const [activeNav, setActiveNav] = React.useState<NavKey>('home');
  const [contextFilter, setContextFilter] = React.useState<IContextFilter | undefined>(undefined);
  const [selectedDoc, setSelectedDoc] = React.useState<IDocument | undefined>(undefined);

  // === Advanced search panel (collapsible, dùng chung toàn portal) ===
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = React.useState<boolean>(false);

  // === Initial load ===
  React.useEffect((): void => {
    setLoading(true);
    setError(undefined);
    Promise.all([
      dmsService.getAllDocuments(),
      dmsService.getRecentDocuments(),
      dmsService.getExpiringDocuments(),
      dmsService.getUnitStats(),
      dmsService.getKpis()
    ])
      .then((results): void => {
        setAllDocs(results[0]);
        setRecent(results[1]);
        setExpiring(results[2]);
        setUnits(results[3]);
        setKpis(results[4]);
        setLastUpdated(new Date());
        setLoading(false);
      })
      .catch((err: Error): void => {
        setError(err?.message ?? 'Không tải được dữ liệu từ DMS Library');
        setLoading(false);
      });
    // Choices lấy động từ DMS Library field schema (không chặn luồng tải chính).
    dmsService.getMetadataChoices()
      .then((c: IMetadataChoices): void => setMetadataChoices(c))
      .catch((): void => { /* giữ FALLBACK */ });
    // Folder cấp 1 (cấp lưu trữ) — nguồn chuẩn cho Upload + filter (không chặn luồng chính).
    dmsService.getStorageFolders()
      .then((f: IStorageFolder[]): void => setStorageFolders(f))
      .catch((): void => { /* giữ rỗng */ });
  }, [dmsService]);

  // Văn bản còn hiệu lực — nền tảng cho MỌI danh sách/thống kê mặc định.
  const visibleDocs: IDocument[] = React.useMemo(
    (): IDocument[] => allDocs.filter(isNotExpired), [allDocs]);

  // Phạm vi "hết hiệu lực": chỉ khi bấm KPI/menu "Văn bản hết hiệu lực"
  // (contextFilter.includeExpired) hoặc chọn nhóm "Hết hiệu lực" trên sidebar.
  const inExpiredScope: boolean =
    (contextFilter ? !!contextFilter.includeExpired : false) || activeGroup === 'HET_HIEU_LUC';

  // Nền danh sách: hết-hiệu-lực-scope dùng toàn bộ; còn lại chỉ dùng văn bản còn hiệu lực.
  const baseDocs: IDocument[] = inExpiredScope ? allDocs : visibleDocs;

  // === Compute list docs: contextFilter ∩ search ∩ quick ∩ advanced ===
  const listDocs: IDocument[] = React.useMemo((): IDocument[] => {
    let docs: IDocument[] = contextFilter
      ? baseDocs.filter(contextFilter.predicate)
      : baseDocs;

    const kw: string = (searchTerm ?? '').trim().toLowerCase();
    const adv: IDocSearchFilter = advancedFilter;
    const advKw: string = (adv.keyword ?? '').trim().toLowerCase();
    const combinedKw: string = kw || advKw;

    docs = docs.filter((d: IDocument): boolean => {
      if (activeGroup && !matchesGroup(d, activeGroup)) { return false; }
      if (adv.soVanBan && d.soVanBan.toLowerCase().indexOf(adv.soVanBan.toLowerCase()) === -1) { return false; }
      if (adv.nhomTaiLieu && (d.nhomTaiLieu ?? '') !== adv.nhomTaiLieu) { return false; }
      if (adv.loaiVanBan && d.loaiVanBan !== adv.loaiVanBan) { return false; }
      if (adv.loaiTaiLieu && (d.loaiTaiLieu ?? '') !== adv.loaiTaiLieu) { return false; }
      if (adv.donViCode && d.donViCode !== adv.donViCode) { return false; }
      if (adv.donViPhatHanh && (d.donViPhatHanh ?? '') !== adv.donViPhatHanh) { return false; }
      if (adv.nguoiKy && d.nguoiKy.toLowerCase().indexOf(adv.nguoiKy.toLowerCase()) === -1) { return false; }
      if (adv.tuNgay && d.ngayBanHanh < adv.tuNgay) { return false; }
      if (adv.denNgay && d.ngayBanHanh > adv.denNgay) { return false; }
      if (combinedKw) {
        const haystack: string = [
          d.soVanBan, d.trichYeu, d.loaiVanBan, d.donViSoanThao, d.donViCode, d.nguoiKy, d.fileName ?? ''
        ].join(' ').toLowerCase();
        if (haystack.indexOf(combinedKw) === -1) { return false; }
      }
      return true;
    });

    return docs;
  }, [baseDocs, contextFilter, searchTerm, activeGroup, advancedFilter]);

  const homeRecent: IDocument[] = React.useMemo((): IDocument[] => {
    const filterActive: boolean = searchTerm.trim() !== '' || activeGroup !== undefined;
    if (!filterActive) { return recent; }
    const kw: string = searchTerm.trim().toLowerCase();
    // Trang chủ không bao giờ hiển thị văn bản hết hiệu lực.
    return visibleDocs.filter((d: IDocument): boolean => {
      if (activeGroup && !matchesGroup(d, activeGroup)) { return false; }
      if (kw) {
        const haystack: string = [d.soVanBan, d.trichYeu, d.loaiVanBan, d.donViSoanThao, d.donViCode, d.nguoiKy].join(' ').toLowerCase();
        if (haystack.indexOf(kw) === -1) { return false; }
      }
      return true;
    }).slice(0, 10);
  }, [visibleDocs, recent, searchTerm, activeGroup]);

  // Facet base: tập đang lọc theo MỌI điều kiện TRỪ chính chiều "nhóm tài liệu"
  // (activeGroup + advancedFilter.nhomTaiLieu) — để quick filter chạy như facet động.
  const facetBaseDocs: IDocument[] = React.useMemo((): IDocument[] => {
    const kw: string = (searchTerm ?? '').trim().toLowerCase();
    const adv: IDocSearchFilter = advancedFilter;
    const advKw: string = (adv.keyword ?? '').trim().toLowerCase();
    const combinedKw: string = kw || advKw;
    const docs: IDocument[] = contextFilter ? allDocs.filter(contextFilter.predicate) : allDocs;
    return docs.filter((d: IDocument): boolean => {
      if (adv.soVanBan && d.soVanBan.toLowerCase().indexOf(adv.soVanBan.toLowerCase()) === -1) { return false; }
      if (adv.loaiVanBan && d.loaiVanBan !== adv.loaiVanBan) { return false; }
      if (adv.loaiTaiLieu && (d.loaiTaiLieu ?? '') !== adv.loaiTaiLieu) { return false; }
      if (adv.donViCode && d.donViCode !== adv.donViCode) { return false; }
      if (adv.donViPhatHanh && (d.donViPhatHanh ?? '') !== adv.donViPhatHanh) { return false; }
      if (adv.nguoiKy && d.nguoiKy.toLowerCase().indexOf(adv.nguoiKy.toLowerCase()) === -1) { return false; }
      if (adv.tuNgay && d.ngayBanHanh < adv.tuNgay) { return false; }
      if (adv.denNgay && d.ngayBanHanh > adv.denNgay) { return false; }
      if (combinedKw) {
        const hay: string = [
          d.soVanBan, d.trichYeu, d.loaiVanBan, d.donViSoanThao, d.donViCode, d.nguoiKy, d.fileName ?? '',
          d.nhomTaiLieu ?? '', d.loaiTaiLieu ?? '', d.chuDeNghiepVu ?? '', d.donViPhatHanh ?? ''
        ].join(' ').toLowerCase();
        if (hay.indexOf(combinedKw) === -1) { return false; }
      }
      return true;
    });
  }, [allDocs, contextFilter, searchTerm, advancedFilter]);

  // Quick filter count = đếm theo dataset đang lọc (facet động, không lấy tổng cố định).
  // Văn bản hết hiệu lực CHỈ tính vào nhóm "Hết hiệu lực"; các nhóm khác bỏ qua hết hiệu lực.
  const groupCounts: { [key: string]: number } = React.useMemo((): { [key: string]: number } => {
    const m: { [key: string]: number } = {};
    DOC_GROUPS.forEach((g: IDocGroup): void => { m[g.key] = 0; });
    facetBaseDocs.forEach((d: IDocument): void => {
      const expired: boolean = isExpired(d);
      DOC_GROUPS.forEach((g: IDocGroup): void => {
        if (g.key === 'HET_HIEU_LUC') {
          if (expired) { m[g.key] += 1; }
        } else if (!expired && matchesGroup(d, g.key)) {
          m[g.key] += 1;
        }
      });
    });
    return m;
  }, [facetBaseDocs]);

  const hasUserFilter: boolean = searchTerm.trim() !== '' || activeGroup !== undefined || hasAdvancedCriteria(advancedFilter);

  // Active filter chips (xóa từng điều kiện)
  const removeAdv = (k: keyof IDocSearchFilter): (() => void) => (): void =>
    setAdvancedFilter((prev: IDocSearchFilter): IDocSearchFilter => ({ ...prev, [k]: undefined }));
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (searchTerm.trim()) { activeChips.push({ key: 'kw', label: `Từ khóa: "${searchTerm.trim()}"`, onRemove: (): void => setSearchTerm('') }); }
  if (activeGroup) {
    const g: IDocGroup | undefined = getGroup(activeGroup);
    activeChips.push({ key: 'grp', label: `Nhóm: ${g ? g.label : activeGroup}`, onRemove: (): void => setActiveGroup(undefined) });
  }
  if (advancedFilter.soVanBan) { activeChips.push({ key: 'so', label: `Số VB: ${advancedFilter.soVanBan}`, onRemove: removeAdv('soVanBan') }); }
  if (advancedFilter.nhomTaiLieu) { activeChips.push({ key: 'nhom', label: `Nhóm: ${advancedFilter.nhomTaiLieu}`, onRemove: removeAdv('nhomTaiLieu') }); }
  if (advancedFilter.loaiVanBan) { activeChips.push({ key: 'loai', label: `Loại: ${advancedFilter.loaiVanBan}`, onRemove: removeAdv('loaiVanBan') }); }
  if (advancedFilter.loaiTaiLieu) { activeChips.push({ key: 'ltl', label: `Loại TL: ${advancedFilter.loaiTaiLieu}`, onRemove: removeAdv('loaiTaiLieu') }); }
  if (advancedFilter.donViCode) { activeChips.push({ key: 'dv', label: `Cấp lưu trữ: ${advancedFilter.donViCode}`, onRemove: removeAdv('donViCode') }); }
  if (advancedFilter.donViPhatHanh) { activeChips.push({ key: 'dvph', label: `ĐV phát hành: ${advancedFilter.donViPhatHanh}`, onRemove: removeAdv('donViPhatHanh') }); }
  if (advancedFilter.nguoiKy) { activeChips.push({ key: 'nk', label: `Người ký: ${advancedFilter.nguoiKy}`, onRemove: removeAdv('nguoiKy') }); }
  if (advancedFilter.tuNgay) { activeChips.push({ key: 'tu', label: `Từ: ${advancedFilter.tuNgay}`, onRemove: removeAdv('tuNgay') }); }
  if (advancedFilter.denNgay) { activeChips.push({ key: 'den', label: `Đến: ${advancedFilter.denNgay}`, onRemove: removeAdv('denNgay') }); }

  // === Handlers ===
  const handleSearchSubmit = (): void => {
    if (hasUserFilter) {
      setContextFilter({
        title: 'Kết quả tìm kiếm',
        predicate: (): boolean => true
      });
      setViewMode('list');
      setActiveNav('search');
    }
  };

  const handleToggleAdvanced = (): void => {
    setIsAdvancedSearchOpen((prev: boolean): boolean => !prev);
  };

  // Apply advanced search — combine với context hiện tại.
  // Nếu đang ở home → switch sang list với context "all".
  // Nếu đang ở list view (có context) → giữ context, chỉ apply advanced filter (listDocs tự combine).
  const handleAdvancedSearch = (f: IDocSearchFilter): void => {
    setAdvancedFilter(f);
    if (viewMode !== 'list' || !contextFilter) {
      setContextFilter({ title: 'Kết quả tìm kiếm nâng cao', predicate: (): boolean => true });
      setViewMode('list');
      setActiveNav('search');
    }
    // else: giữ nguyên context (vd "Văn bản sắp hết hiệu lực") → combine với advanced
  };

  // Clear CHỈ advanced filter (giữ context + search keyword).
  const handleClearAdvancedOnly = (): void => {
    setAdvancedFilter({});
  };

  const handleShowAllRecent = (): void => {
    setContextFilter({
      title: 'Văn bản mới ban hành',
      subtitle: 'Có ngày ban hành trong 2 tháng gần đây',
      predicate: (d: IDocument): boolean => isRecentlyIssued(d, 2)
    });
    setViewMode('list');
    setActiveNav('recent');
  };

  const handleShowAllExpiring = (): void => {
    setContextFilter({
      title: 'Văn bản sắp hết hiệu lực',
      subtitle: 'Có ngày hết hiệu lực trong 60 ngày tới',
      predicate: (d: IDocument): boolean =>
        d.trangThai === DocStatus.Active && withinDaysFromNow(d.ngayHetHieuLuc, 60)
    });
    setViewMode('list');
    setActiveNav('expiring');
  };

  const handleClickUnit = (unitCode: string, unitName: string): void => {
    setContextFilter({
      title: 'Văn bản theo cấp lưu trữ',
      subtitle: unitName,
      predicate: (d: IDocument): boolean => d.donViCode === unitCode
    });
    setViewMode('list');
    setActiveNav('byUnit');
  };

  const handleClickKpi = (key: KpiKey): void => {
    // Các KPI điều hướng sang view riêng (không phải danh sách lọc).
    if (key === 'recent') { handleShowAllRecent(); return; }
    if (key === 'byUnit') {
      setActiveNav('byUnit');
      setSearchTerm('');
      setActiveGroup(undefined);
      setContextFilter({
        title: 'Văn bản theo cấp lưu trữ',
        subtitle: 'Dùng tìm kiếm nâng cao để chọn cấp lưu trữ',
        predicate: (): boolean => true
      });
      setViewMode('list');
      return;
    }
    if (key === 'needsReview') {
      setActiveNav('review');
      setSearchTerm('');
      setActiveGroup(undefined);
      setContextFilter(undefined);
      setViewMode('review');
      return;
    }
    switch (key) {
      case 'total':
        setContextFilter({ title: 'Toàn bộ văn bản', predicate: (): boolean => true });
        break;
      case 'active':
        setContextFilter({
          title: 'Văn bản đang lưu hành',
          predicate: (d: IDocument): boolean => d.trangThai === DocStatus.Active
        });
        break;
      case 'expiringSoon':
        setContextFilter({
          title: 'Văn bản sắp hết hiệu lực',
          subtitle: '30 ngày tới',
          predicate: (d: IDocument): boolean =>
            d.trangThai === DocStatus.Active && withinDaysFromNow(d.ngayHetHieuLuc, 30)
        });
        break;
      case 'expired':
        // Khu vực riêng — phạm vi duy nhất được phép hiển thị văn bản hết hiệu lực.
        setContextFilter({
          title: 'Văn bản hết hiệu lực',
          subtitle: 'TrangThai = "Hết hiệu lực" hoặc NhomTaiLieu = "Hết hiệu lực"',
          predicate: isExpired,
          includeExpired: true
        });
        break;
      case 'pending':
        setContextFilter({
          title: 'Văn bản chờ ban hành',
          predicate: (d: IDocument): boolean => d.trangThai === DocStatus.Draft
        });
        break;
      case 'missingSource':
        setContextFilter({
          title: 'Văn bản thiếu bản mềm',
          subtitle: 'Chưa có bản DOCX/XLSX đi kèm PDF',
          predicate: (d: IDocument): boolean => !d.editableSource
        });
        break;
      case 'hasSource':
        setContextFilter({
          title: 'Văn bản có bản mềm',
          subtitle: 'Đã có DOCX/XLSX đi kèm',
          predicate: (d: IDocument): boolean => !!d.editableSource
        });
        break;
      default:
        return;
    }
    setViewMode('list');
  };

  const handleBackHome = (): void => {
    setViewMode('home');
    setContextFilter(undefined);
    setSearchTerm('');
    setActiveGroup(undefined);
    setAdvancedFilter({});
    setActiveNav('home');
  };

  const handleClearFilter = (): void => {
    setSearchTerm('');
    setActiveGroup(undefined);
    setAdvancedFilter({});
  };

  // === Sidebar nav handler ===
  const handleNavSelect = (key: NavKey): void => {
    setActiveNav(key);
    // Clear search/quick filter khi đổi nav (advanced filter giữ lại để user lưu setting)
    setSearchTerm('');
    setActiveGroup(undefined);
    setSelectedDoc(undefined);

    switch (key) {
      case 'home':
        setViewMode('home');
        setContextFilter(undefined);
        setAdvancedFilter({});
        break;
      case 'search':
        // Mở list view với context "all" để user search/filter
        setContextFilter({ title: 'Tra cứu văn bản', predicate: (): boolean => true });
        setViewMode('list');
        break;
      case 'upload':
        setViewMode('upload');
        setContextFilter(undefined);
        setAdvancedFilter({});
        break;
      case 'recent':
        setContextFilter({
          title: 'Văn bản mới ban hành',
          subtitle: 'Sắp xếp theo ngày ban hành mới nhất',
          predicate: (d: IDocument): boolean => d.trangThai === DocStatus.Active
        });
        setViewMode('list');
        break;
      case 'expiring':
        setContextFilter({
          title: 'Văn bản sắp hết hiệu lực',
          subtitle: 'Có ngày hết hiệu lực trong 60 ngày tới',
          predicate: (d: IDocument): boolean =>
            d.trangThai === DocStatus.Active && withinDaysFromNow(d.ngayHetHieuLuc, 60)
        });
        setViewMode('list');
        break;
      case 'byUnit':
        // Show top units grouped — list view all docs, user click filter từ AdvancedSearch
        setContextFilter({
          title: 'Văn bản theo cấp lưu trữ',
          subtitle: 'Dùng tìm kiếm nâng cao để chọn cấp lưu trữ',
          predicate: (): boolean => true
        });
        setViewMode('list');
        break;
      case 'byType':
        setContextFilter({
          title: 'Văn bản theo loại (hình thức)',
          subtitle: 'Dùng nút filter ở Hero hoặc tìm kiếm nâng cao',
          predicate: (): boolean => true
        });
        setViewMode('list');
        break;
      case 'review':
        setViewMode('review');
        setContextFilter(undefined);
        break;
      case 'stats':
        setViewMode('stats');
        setContextFilter(undefined);
        break;
      case 'help':
        setViewMode('help');
        setContextFilter(undefined);
        break;
      case 'favorites':
        setPlaceholderTitle('Yêu thích');
        setViewMode('placeholder');
        setContextFilter(undefined);
        break;
      case 'following':
        setPlaceholderTitle('Văn bản đang theo dõi');
        setViewMode('placeholder');
        setContextFilter(undefined);
        break;
      case 'trash':
        setPlaceholderTitle('Thùng rác');
        setViewMode('placeholder');
        setContextFilter(undefined);
        break;
      default:
        break;
    }
  };

  // Chọn 1 nhóm loại văn bản từ sidebar.
  // QUAN TRỌNG: KHÔNG ghi đè contextFilter/search/advanced đang có — chỉ thêm chiều "nhóm".
  // Nhờ vậy nếu đang ở 1 kết quả (KPI/tìm kiếm/filter) thì click nhóm = giao với kết quả đó,
  // đúng với số đếm hiển thị ở sidebar (facet động). listDocs đã tự giao contextFilter ∩ activeGroup ∩ search ∩ advanced.
  const handleGroupSelect = (key: DocGroupKey): void => {
    // Toggle: bấm lại nhóm đang chọn → bỏ chọn nhóm.
    if (activeGroup === key) {
      setActiveGroup(undefined);
      // Nếu không còn điều kiện lọc nào khác → quay về trang chủ.
      if (!contextFilter && searchTerm.trim() === '' && !hasAdvancedCriteria(advancedFilter)) {
        setViewMode('home');
        setActiveNav('home');
      }
      return;
    }
    setActiveGroup(key);
    setViewMode('list');
  };

  // Tải lại dữ liệu (bỏ cache) — giữ filter, refresh toàn bộ
  const handleReload = (): Promise<void> => {
    return dmsService.refreshDocuments().then((docs: IDocument[]): Promise<void> => {
      setAllDocs(docs);
      setLastUpdated(new Date());
      dmsService.getMetadataChoices().then((c: IMetadataChoices): void => setMetadataChoices(c)).catch((): void => { /* giữ choices cũ */ });
      dmsService.getStorageFolders().then((f: IStorageFolder[]): void => setStorageFolders(f)).catch((): void => { /* giữ folder cũ */ });
      return Promise.all([
        dmsService.getRecentDocuments(),
        dmsService.getExpiringDocuments(),
        dmsService.getUnitStats(),
        dmsService.getKpis()
      ]).then((res: [IDocument[], IDocument[], IUnitStat[], IKpiStat[]]): void => {
        setRecent(res[0]); setExpiring(res[1]); setUnits(res[2]); setKpis(res[3]);
      });
    });
  };

  // Upload văn bản mới → service upload + refresh toàn bộ state, trả result cho view.
  const handleUpload = (req: IUploadRequest): Promise<IUploadResult> => {
    return dmsService.uploadDocument(req).then((result: IUploadResult): Promise<IUploadResult> => {
      return Promise.all([
        dmsService.getAllDocuments(),
        dmsService.getRecentDocuments(),
        dmsService.getExpiringDocuments(),
        dmsService.getUnitStats(),
        dmsService.getKpis()
      ]).then((res: [IDocument[], IDocument[], IDocument[], IUnitStat[], IKpiStat[]]): IUploadResult => {
        setAllDocs(res[0]); setRecent(res[1]); setExpiring(res[2]); setUnits(res[3]); setKpis(res[4]);
        setLastUpdated(new Date());
        return result;
      });
    });
  };

  // Sau khi upload thành công → toast + mở chi tiết văn bản mới (hoặc list tra cứu).
  const handleUploaded = (result: IUploadResult): void => {
    const baseMsg: string = result.oldDocUpdated
      ? 'Đã upload văn bản mới và đánh dấu văn bản cũ hết hiệu lực.'
      : 'Đã upload văn bản mới thành công.';
    showToast(result.warning ? `${baseMsg} ⚠ ${result.warning}` : baseMsg, !result.warning);
    if (result.document) {
      const newDoc: IDocument = result.document;
      setContextFilter({
        title: 'Văn bản vừa upload',
        subtitle: newDoc.soVanBan || newDoc.fileName,
        predicate: (d: IDocument): boolean => d.id === newDoc.id
      });
      setViewMode('list');
      setActiveNav('search');
      setSelectedDoc(newDoc);
    } else {
      setViewMode('home');
      setActiveNav('home');
    }
  };

  // Sửa hàng loạt từ trang Cần chuẩn hóa → ghi nhiều item rồi refresh danh sách
  const handleBulkSave = (ids: string[], values: { [k: string]: string }, onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: number; errors: string[] }> => {
    return dmsService.updateMetadataMany(ids, values, onProgress).then(
      (r: { ok: number; failed: number; errors: string[] }): Promise<{ ok: number; failed: number; errors: string[] }> =>
        dmsService.getAllDocuments().then((docs: IDocument[]): { ok: number; failed: number; errors: string[] } => {
          setAllDocs(docs);
          setLastUpdated(new Date());
          return r;
        })
    );
  };

  // Tải lại toàn bộ state phụ thuộc (recent/expiring/units/kpis) sau khi dữ liệu đổi.
  const refreshAllState = (): Promise<void> => {
    return Promise.all([
      dmsService.getAllDocuments(),
      dmsService.getRecentDocuments(),
      dmsService.getExpiringDocuments(),
      dmsService.getUnitStats(),
      dmsService.getKpis()
    ]).then((res: [IDocument[], IDocument[], IDocument[], IUnitStat[], IKpiStat[]]): void => {
      setAllDocs(res[0]); setRecent(res[1]); setExpiring(res[2]); setUnits(res[3]); setKpis(res[4]);
      setLastUpdated(new Date());
    });
  };

  // Xóa (đưa vào Thùng rác) nhiều văn bản → service + refresh toàn bộ.
  const handleDelete = (
    docs: IDocument[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: number; failed: number; errors: string[] }> => {
    return dmsService.deleteDocuments(docs, onProgress).then(
      (r: { ok: number; failed: number; errors: string[] }): Promise<{ ok: number; failed: number; errors: string[] }> => {
        // Nếu văn bản đang mở chi tiết bị xóa → đóng drawer.
        if (selectedDoc && docs.some((d: IDocument): boolean => d.id === selectedDoc.id)) {
          setSelectedDoc(undefined);
        }
        return refreshAllState().then((): { ok: number; failed: number; errors: string[] } => r);
      }
    );
  };

  // Upload bản mềm cho 1 văn bản PDF thiếu bản mềm → service + refresh + cập nhật doc đang chọn.
  const handleUploadEditableSource = (doc: IDocument, fileBuffer: ArrayBuffer, fileName: string): Promise<IDocument | undefined> => {
    return dmsService.uploadEditableSource(doc, fileBuffer, fileName).then((updated: IDocument | undefined): Promise<IDocument | undefined> => {
      return refreshAllState().then((): IDocument | undefined => {
        if (updated) { setSelectedDoc(updated); }
        return updated;
      });
    });
  };

  // Gắn link bản mềm sẵn có cho 1 văn bản PDF.
  const handleLinkEditableSource = (doc: IDocument, url: string): Promise<IDocument | undefined> => {
    return dmsService.linkEditableSource(doc, url).then((updated: IDocument | undefined): Promise<IDocument | undefined> => {
      return refreshAllState().then((): IDocument | undefined => {
        if (updated) { setSelectedDoc(updated); }
        return updated;
      });
    });
  };

  // Lưu metadata sửa tại chỗ từ drawer → cập nhật state local + doc đang chọn
  const handleSaveMetadata = (id: string, values: { [k: string]: string }): Promise<IDocument | undefined> => {
    return dmsService.updateMetadata(id, values).then((updated: IDocument | undefined): IDocument | undefined => {
      if (updated) {
        setAllDocs((prev: IDocument[]): IDocument[] =>
          prev.map((d: IDocument): IDocument => (d.id === id ? updated : d)));
        setSelectedDoc(updated);
        setLastUpdated(new Date());
      }
      return updated;
    });
  };

  // === Render ===
  return (
    <div className={`${styles.dmsPortal} ${hasTeamsContext ? styles.teams : ''}`}>
      <Sidebar
        activeKey={activeNav}
        onSelect={handleNavSelect}
        groups={DOC_GROUPS}
        groupCounts={groupCounts}
        activeGroup={activeGroup}
        onGroupSelect={handleGroupSelect}
      />

      <div className={styles.main}>
        <PortalHeader />

        <div className={styles.content}>
          {toast && (
            <div className={`${styles.reviewToast} ${toast.ok ? styles.reviewToastOk : styles.reviewToastErr}`}>{toast.msg}</div>
          )}
          {/* <DisclaimerBanner /> — tạm ẩn banner "đang chuẩn hóa" */}

          <Hero
            searchTerm={searchTerm}
            isAdvancedSearchOpen={isAdvancedSearchOpen}
            onSearchTermChange={setSearchTerm}
            onSearchSubmit={handleSearchSubmit}
            onToggleAdvanced={handleToggleAdvanced}
          />

          {/* AdvancedSearch — collapsible, ngay dưới Hero, dùng chung toàn portal */}
          {isAdvancedSearchOpen && (
            <div className={styles.advancedPanel}>
              <AdvancedSearch
                allDocs={allDocs}
                units={units}
                storageFolders={storageFolders}
                value={advancedFilter}
                onSearch={handleAdvancedSearch}
                onClear={handleClearAdvancedOnly}
              />
            </div>
          )}

          {error && (
            <div className={styles.errorBanner}>
              <strong>Lỗi tải dữ liệu:</strong> {error}
              <button type="button" className={styles.secondaryButton} onClick={(): void => window.location.reload()}>
                Tải lại
              </button>
            </div>
          )}

          {loading && <SkeletonLoader />}

          {!loading && viewMode === 'home' && (
            <>
              <KpiCards kpis={kpis} onClickKpi={handleClickKpi} />

              <div className={styles.cardsGrid}>
                <RecentDocsCard
                  documents={homeRecent}
                  onClickItem={setSelectedDoc}
                  onShowAll={handleShowAllRecent}
                />
                <ByUnitCard
                  units={units}
                  onClickUnit={handleClickUnit}
                />
                <ExpiringDocsCard
                  documents={expiring}
                  onClickItem={setSelectedDoc}
                  onShowAll={handleShowAllExpiring}
                />
              </div>
            </>
          )}

          {!loading && viewMode === 'list' && activeChips.length > 0 && (
            <div className={styles.filterChips}>
              <span className={styles.filterChipsLabel}>Đang lọc:</span>
              {activeChips.map((c: { key: string; label: string; onRemove: () => void }): React.ReactElement => (
                <button key={c.key} type="button" className={styles.filterChip} onClick={c.onRemove} title="Bỏ điều kiện lọc này">
                  <span>{c.label}</span>
                  <span className={styles.filterChipX}>×</span>
                </button>
              ))}
              <button type="button" className={styles.filterChipsClear} onClick={handleClearFilter}>Xóa tất cả</button>
            </div>
          )}

          {!loading && viewMode === 'list' && (
            <DocumentListView
              documents={listDocs}
              title={contextFilter ? contextFilter.title : 'Danh sách văn bản'}
              subtitle={
                ((): string => {
                  const parts: string[] = [];
                  if (contextFilter && contextFilter.subtitle) { parts.push(contextFilter.subtitle); }
                  if (searchTerm.trim()) { parts.push(`Từ khóa: "${searchTerm.trim()}"`); }
                  if (activeGroup) {
                    const g: IDocGroup | undefined = getGroup(activeGroup);
                    parts.push(`Nhóm: ${g ? g.label : activeGroup}`);
                  }
                  return parts.join(' · ');
                })()
              }
              onClickDocument={setSelectedDoc}
              onBack={handleBackHome}
              onClearFilter={hasUserFilter ? handleClearFilter : undefined}
              onDelete={handleDelete}
            />
          )}

          {!loading && viewMode === 'review' && (
            <ReviewView
              documents={allDocs}
              choices={metadataChoices}
              onBulkSave={handleBulkSave}
              onReload={handleReload}
              lastUpdated={lastUpdated}
              onClickDocument={setSelectedDoc}
              onBack={handleBackHome}
              onDelete={handleDelete}
            />
          )}

          {!loading && viewMode === 'stats' && (
            <div className={styles.placeholderPage}>
              <h2>Thống kê - Báo cáo</h2>
              <p>Trang thống kê sẽ được hoàn thiện ở Phase 5 (compliance dashboard với 6 KPI).</p>
              <button type="button" className={styles.secondaryButton} onClick={handleBackHome}>← Trang chủ</button>
            </div>
          )}

          {!loading && viewMode === 'help' && (
            <div className={styles.placeholderPage}>
              <h2>Hướng dẫn sử dụng</h2>
              <p>Hệ thống quản lý văn bản điều hành Bia Hạ Long.</p>
              <ul>
                <li><strong>Tra cứu văn bản:</strong> Gõ từ khóa vào ô tìm kiếm hoặc dùng tìm kiếm nâng cao.</li>
                <li><strong>Click vào văn bản:</strong> Xem chi tiết metadata + mở file gốc.</li>
                <li><strong>Filter nhanh theo loại:</strong> Bấm các nút Quyết định / Quy trình / Thông báo... ở trang chủ.</li>
                <li><strong>Văn bản theo cấp lưu trữ:</strong> Bấm vào tên cấp lưu trữ để xem danh sách văn bản.</li>
                <li><strong>Văn bản sắp hết hiệu lực:</strong> Badge màu thể hiện độ khẩn: đỏ ≤7 ngày, vàng ≤30 ngày, xanh &gt;30 ngày.</li>
              </ul>
              <p><em>Lưu ý: Dữ liệu đang trong giai đoạn chuẩn hóa. Một số metadata có thể chưa phản ánh đầy đủ.</em></p>
              <button type="button" className={styles.secondaryButton} onClick={handleBackHome}>← Trang chủ</button>
            </div>
          )}

          {!loading && viewMode === 'placeholder' && (
            <div className={styles.placeholderPage}>
              <h2>{placeholderTitle}</h2>
              <p>Tính năng đang được phát triển và sẽ có ở phiên bản kế tiếp.</p>
              <button type="button" className={styles.secondaryButton} onClick={handleBackHome}>← Trang chủ</button>
            </div>
          )}

          {!loading && viewMode === 'upload' && (
            <UploadDocumentView
              documents={allDocs}
              choices={metadataChoices}
              storageFolders={storageFolders}
              onUpload={handleUpload}
              onUploaded={handleUploaded}
              onCancel={handleBackHome}
            />
          )}
        </div>

        <footer className={styles.appFooter}>
          © 2025 Bia Hạ Long. Hệ thống quản lý văn bản điều hành. All rights reserved.
        </footer>
      </div>

      {selectedDoc && (
        <DocumentDetailDrawer
          document={selectedDoc}
          choices={metadataChoices}
          onClose={(): void => setSelectedDoc(undefined)}
          onSave={handleSaveMetadata}
          onDelete={handleDelete}
          onUploadEditableSource={handleUploadEditableSource}
          onLinkEditableSource={handleLinkEditableSource}
        />
      )}
    </div>
  );
}
