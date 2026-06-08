// Shared client-side filter config store (TẠM THỜI — chưa SharePoint/API write).
// Nguồn chân lý DUY NHẤT cho "filter nào hiển thị ở Search Center", dùng chung bởi:
//   - /admin tab "Bộ lọc tìm kiếm" (đọc + ghi)
//   - /search Search Center (chỉ đọc)
// Lưu localStorage key: dms.search.filterConfig.v1.
//
// Key filter = key nội bộ camelCase, KHỚP FACET_DEFS (searchTypes.ts) và field IDocument
// (vd 'donViPhatHanh'). KHÔNG đổi key nội bộ; chỉ label hiển thị đổi (Đơn vị soạn thảo).
// KHÔNG đụng SharePoint column / API / metadata schema.

export interface FilterConfig {
  key: string;
  label: string;
  visible: boolean;
  defaultExpanded: boolean;
  order: number;
  multiSelect: boolean;
}

export const FILTER_CONFIG_STORAGE_KEY = 'dms.search.filterConfig.v1';
/** Event phát khi config đổi (đồng bộ trong cùng tab; cross-tab dùng 'storage'). */
export const FILTER_CONFIG_EVENT = 'dms:filterConfigChanged';

// Mặc định: TẤT CẢ visible=true (giữ nguyên hành vi Search hiện tại — không ẩn filter nào
// khi chưa có cấu hình). defaultExpanded mirror FACET_DEFS.open. Thứ tự = thứ tự facet hiện tại.
export const DEFAULT_FILTER_CONFIG: FilterConfig[] = [
  { key: 'nhomTaiLieu', label: 'Nhóm tài liệu', visible: true, defaultExpanded: true, order: 1, multiSelect: true },
  { key: 'loaiTaiLieu', label: 'Loại tài liệu', visible: true, defaultExpanded: true, order: 2, multiSelect: true },
  { key: 'loaiVanBanPhapLy', label: 'Loại VB pháp lý', visible: true, defaultExpanded: true, order: 3, multiSelect: true },
  { key: 'chuDeNghiepVu', label: 'Chủ đề nghiệp vụ', visible: true, defaultExpanded: false, order: 4, multiSelect: true },
  { key: 'donViPhatHanh', label: 'Đơn vị soạn thảo', visible: true, defaultExpanded: true, order: 5, multiSelect: true },
  { key: 'donViSoHuu', label: 'Đơn vị sở hữu', visible: true, defaultExpanded: false, order: 6, multiSelect: true },
  { key: 'namBanHanh', label: 'Năm ban hành', visible: true, defaultExpanded: false, order: 7, multiSelect: false },
  { key: 'trangThai', label: 'Trạng thái', visible: true, defaultExpanded: false, order: 8, multiSelect: true },
  { key: 'mucDoBaoMat', label: 'Mức độ bảo mật', visible: true, defaultExpanded: false, order: 9, multiSelect: true },
  { key: 'metadataConfidence', label: 'Độ tin cậy', visible: true, defaultExpanded: false, order: 10, multiSelect: true },
  { key: 'nguonMetadata', label: 'Nguồn metadata', visible: true, defaultExpanded: false, order: 11, multiSelect: true },
  { key: 'hasEditableSource', label: 'Bản mềm', visible: true, defaultExpanded: false, order: 12, multiSelect: false },
];

function cloneDefaults(): FilterConfig[] {
  return DEFAULT_FILTER_CONFIG.map((d) => ({ ...d }));
}

/**
 * Hợp nhất config đã lưu với DEFAULT:
 *  - Chỉ giữ key có trong DEFAULT (loại key lạ/cũ).
 *  - Label LUÔN lấy từ DEFAULT (đổi tên trong code phải thắng — user không config được label).
 *  - visible/defaultExpanded/multiSelect/order lấy từ stored nếu hợp lệ, fallback DEFAULT.
 *  - Sắp theo order rồi đánh số lại 1..n cho liền mạch.
 */
export function mergeWithDefaults(stored: unknown): FilterConfig[] {
  if (!Array.isArray(stored)) {
    return cloneDefaults();
  }
  const byKey = new Map<string, Partial<FilterConfig>>();
  for (const s of stored) {
    if (s && typeof s === 'object' && typeof (s as { key?: unknown }).key === 'string') {
      byKey.set((s as { key: string }).key, s as Partial<FilterConfig>);
    }
  }
  const merged = DEFAULT_FILTER_CONFIG.map((def) => {
    const s = byKey.get(def.key);
    if (!s) {
      return { ...def };
    }
    return {
      key: def.key,
      label: def.label, // luôn theo code
      visible: typeof s.visible === 'boolean' ? s.visible : def.visible,
      defaultExpanded: typeof s.defaultExpanded === 'boolean' ? s.defaultExpanded : def.defaultExpanded,
      multiSelect: typeof s.multiSelect === 'boolean' ? s.multiSelect : def.multiSelect,
      order: typeof s.order === 'number' ? s.order : def.order,
    };
  });
  merged.sort((a, b) => a.order - b.order);
  return merged.map((f, i) => ({ ...f, order: i + 1 }));
}

/** Đọc config từ localStorage (SSR-safe → trả default khi không có window). */
export function loadFilterConfig(): FilterConfig[] {
  if (typeof window === 'undefined') {
    return cloneDefaults();
  }
  try {
    const raw = window.localStorage.getItem(FILTER_CONFIG_STORAGE_KEY);
    return mergeWithDefaults(raw ? JSON.parse(raw) : null);
  } catch {
    return cloneDefaults();
  }
}

/** Ghi config vào localStorage + phát event đồng bộ. */
export function saveFilterConfig(config: FilterConfig[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(FILTER_CONFIG_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(FILTER_CONFIG_EVENT));
  } catch {
    /* ignore quota/serialize errors */
  }
}

/** Xoá config khỏi localStorage (về mặc định) + phát event. */
export function resetFilterConfig(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(FILTER_CONFIG_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(FILTER_CONFIG_EVENT));
  } catch {
    /* ignore */
  }
}

/** Lắng nghe thay đổi config (cùng tab qua custom event + cross-tab qua 'storage'). */
export function subscribeFilterConfig(cb: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const onStorage = (e: StorageEvent): void => {
    if (e.key === FILTER_CONFIG_STORAGE_KEY) cb();
  };
  const onCustom = (): void => cb();
  window.addEventListener('storage', onStorage);
  window.addEventListener(FILTER_CONFIG_EVENT, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(FILTER_CONFIG_EVENT, onCustom);
  };
}
