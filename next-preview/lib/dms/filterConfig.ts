// Shared filter config cho "filter nào hiển thị ở Search Center", dùng chung bởi:
//   - /admin tab "Bộ lọc tìm kiếm" (đọc + ghi qua API)
//   - /search Search Center (chỉ đọc qua API)
//
// SOURCE OF TRUTH = SharePoint list DMSConfig (ConfigKey=search-filters), truy cập qua
//   GET/PUT /api/admin/config/search-filters.
// localStorage (key dms.search.filterConfig.v1) CHỈ là CACHE client (render tức thì khi chờ API),
//   KHÔNG còn là nguồn chân lý.
//
// Key filter = key nội bộ camelCase, KHỚP FACET_DEFS (searchTypes.ts) và field IDocument
// (vd 'donViPhatHanh'). KHÔNG đổi key nội bộ; chỉ label hiển thị đổi (Đơn vị soạn thảo).
// KHÔNG đụng metadata column / document schema.

export interface FilterConfig {
  key: string;
  label: string;
  visible: boolean;
  defaultExpanded: boolean;
  order: number;
  multiSelect: boolean;
}

/** Key cache localStorage (CHỈ cache, không phải source of truth). */
export const FILTER_CONFIG_STORAGE_KEY = 'dms.search.filterConfig.v1';
/** ConfigKey trong SharePoint list DMSConfig. */
export const SEARCH_FILTERS_CONFIG_KEY = 'search-filters';
/** Endpoint API (source of truth là SharePoint). */
export const SEARCH_FILTERS_API_URL = '/api/admin/config/search-filters';
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

/** Đọc config từ CACHE localStorage (SSR-safe → trả default khi không có window/cache). */
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

/** Ghi config vào CACHE localStorage + phát event đồng bộ (không phải lưu chính thức). */
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

// ── API (source of truth = SharePoint) ─────────────────────────────────────────

export interface FilterConfigResult {
  ok: boolean;
  config: FilterConfig[];
  /** 'sharepoint' nếu đọc/ghi được; 'default' nếu chưa có cấu hình; 'cache' nếu API lỗi (dùng cache/default). */
  source: 'sharepoint' | 'default' | 'cache';
  error?: string;
}

/**
 * Đọc config từ API (SharePoint). Khi có cấu hình → cập nhật cache + trả về.
 * Khi API lỗi/chưa có cấu hình → fallback cache (rồi default), KHÔNG vỡ trang.
 */
export async function fetchFilterConfig(): Promise<FilterConfigResult> {
  try {
    const res = await fetch(SEARCH_FILTERS_API_URL, { credentials: 'same-origin', cache: 'no-store' });
    const json = (await res.json()) as { ok: boolean; config: FilterConfig[] | null; source?: string; error?: string };
    if (res.ok && json.ok && Array.isArray(json.config)) {
      const merged = mergeWithDefaults(json.config);
      saveFilterConfig(merged); // cập nhật cache
      return { ok: true, config: merged, source: 'sharepoint' };
    }
    if (res.ok && json.ok && json.config === null) {
      // Chưa có cấu hình trên SharePoint → default (giữ cache hiện có nếu muốn, nhưng default là chuẩn).
      return { ok: true, config: loadFilterConfig(), source: 'default' };
    }
    return { ok: false, config: loadFilterConfig(), source: 'cache', error: json.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, config: loadFilterConfig(), source: 'cache', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Lưu config qua API (chỉ admin/canWrite). Thành công → cập nhật cache. Lỗi → trả ok:false + message.
 */
export async function putFilterConfig(config: FilterConfig[]): Promise<FilterConfigResult> {
  try {
    const res = await fetch(SEARCH_FILTERS_API_URL, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; config?: FilterConfig[]; error?: string };
    if (res.ok && json.ok && Array.isArray(json.config)) {
      const merged = mergeWithDefaults(json.config);
      saveFilterConfig(merged);
      return { ok: true, config: merged, source: 'sharepoint' };
    }
    return { ok: false, config, source: 'cache', error: json.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, config, source: 'cache', error: e instanceof Error ? e.message : String(e) };
  }
}
