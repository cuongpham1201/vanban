import { WebPartContext } from '@microsoft/sp-webpart-base';
import { SPHttpClient, SPHttpClientResponse, ISPHttpClientOptions } from '@microsoft/sp-http';

import { IDmsService, IUploadRequest, IUploadResult } from './IDmsService';
import {
  IDocument,
  IUnitStat,
  IKpiStat,
  IDocSearchFilter,
  IMetadataChoices,
  IEditableSource,
  IStorageFolder,
  DocStatus,
  SecurityLevel,
  DocTypeKey,
  FileKind
} from '../models/IDocument';
import { normalizeBaseFileName, isPdfFile, isEditableSourceFile } from '../utils/documentPair';
import { needsStandardization, isRecentlyIssued, isExpired, isNotExpired } from '../utils/standardization';
import { FALLBACK_METADATA_CHOICES } from '../utils/metadataChoices';

/**
 * Real SharePoint implementation of IDmsService.
 *
 * Queries the "DMS Library" Document Library at /sites/vanbandieuhanh
 * using SPHttpClient (REST API). Uses an in-memory cache for the entire item
 * collection so KPI / unit-stats endpoints don't hit SP repeatedly.
 *
 * Phase: 2 — connect dashboard with real metadata after bulk-upload.
 */

const LIBRARY_TITLE: string = 'DMS Library';
const DEFAULT_DMS_SITE_URL: string = 'https://biahalong.sharepoint.com/sites/vanbandieuhanh';

// Cột nền + metadata V1 (Create-DMS-Metadata.ps1) — luôn tồn tại.
const SELECT_FIELDS_BASE: string[] = [
  'Id',
  'FileLeafRef',         // Tên file
  'FileRef',             // Server-relative URL
  'EncodedAbsUrl',       // Full absolute URL (mở file)
  'File_x0020_Type',     // Extension không dấu chấm
  'Modified',
  // metadata V1
  'SoVanBan',
  'NamBanHanh',
  'LoaiVanBan',
  'DonViSoanThao',
  'NgayBanHanh',
  'NgayHetHieuLuc',
  'TrangThai',
  'MucDoBaoMat',
  'TrichYeu'
];

// Cột Metadata V2 (Create-DMS-Metadata-V2.ps1). Có thể CHƯA tồn tại trên library
// (nếu chưa chạy script tạo cột) → query sẽ fallback về SELECT_FIELDS_BASE.
const SELECT_FIELDS_V2: string[] = [
  'NhomTaiLieu',
  'LoaiVanBanPhapLy',
  'LoaiTaiLieu',
  'ChuDeNghiepVu',
  'DonViPhatHanh',
  'DonViSoHuu',
  'NguonMetadata',
  'MetadataConfidence'
];

// Cột liên kết thay thế (Add-DMS-Replacement-Columns.ps1). Có thể CHƯA tồn tại →
// query fallback về (base+V2) rồi base. Đọc về để hiển thị, không bắt buộc.
// Bổ sung cột liên kết bản mềm ↔ PDF (HasEditableSource / EditableSourceUrl / PrimaryPdfUrl).
const SELECT_FIELDS_LINK: string[] = [
  'VanBanThayThe',
  'VanBanLienQuan',
  'Tags',
  'HasEditableSource',
  'EditableSourceUrl',
  'PrimaryPdfUrl'
];

// Các InternalName metadata được COPY từ PDF gốc sang file bản mềm khi upload bản mềm.
// (Không gồm các cột liên kết bản mềm/PDF — những cột đó set riêng.)
const COPYABLE_METADATA_FIELDS: string[] = [
  'SoVanBan', 'NamBanHanh', 'NgayBanHanh', 'NgayHetHieuLuc', 'TrangThai', 'MucDoBaoMat',
  'TrichYeu', 'NhomTaiLieu', 'LoaiVanBanPhapLy', 'LoaiTaiLieu', 'ChuDeNghiepVu',
  'DonViPhatHanh', 'DonViSoHuu', 'NguonMetadata', 'MetadataConfidence',
  'VanBanThayThe', 'VanBanLienQuan', 'Tags'
];

const SELECT_FIELDS_V2_FULL: string[] = SELECT_FIELDS_BASE.concat(SELECT_FIELDS_V2);
const SELECT_FIELDS: string[] = SELECT_FIELDS_V2_FULL.concat(SELECT_FIELDS_LINK);

const EXPAND_FIELDS: string[] = []; // không expand File → query nhanh hơn nhiều

const CACHE_TTL_MS: number = 5 * 60 * 1000; // 5 phút

// Map LoaiVanBan / LoaiVanBanPhapLy (full name) -> stable key cho UI quick filter
const LOAI_TO_KEY: { [key: string]: DocTypeKey } = {
  'Quyết định': 'QD',
  'Quy trình': 'QT',
  'Thông báo': 'TB',
  'Hướng dẫn': 'HD',
  'Văn bản đến': 'CV',
  'Văn bản đi': 'CV',
  'Công văn': 'CV',
  // V2 LoaiVanBanPhapLy bổ sung
  'Tờ trình': 'CV',
  'Nghị quyết': 'KHAC',
  'Biên bản': 'KHAC',
  'Giấy ủy quyền': 'KHAC'
};

// Map DonViSoanThao (full name) -> mã viết tắt cho UI badge / search
const DON_VI_TO_CODE: { [key: string]: string } = {
  'Tổng Giám đốc': 'TGD',
  'Giám đốc Kinh Doanh': 'GDKD',
  'Giám đốc Tài chính và Quản trị': 'GDTC-QT',
  'Giám đốc Vận hành và Chuỗi Cung ứng': 'GDVH',
  'Giám đốc Sản xuất – Kỹ thuật': 'GDSX',
  'Phó Giám đốc Phụ trách Thiết bị': 'PGDTB',
  'Phó Giám đốc Sản xuất – Kỹ thuật': 'PGDSX',
  'Ban Pháp chế – Tuân thủ': 'PCTT',
  'Ban Tài chính – Kiểm soát nội bộ': 'TCKS',
  'Ban S-H-E': 'SHE',
  'Phòng Kỹ thuật, Công nghệ và Cải tiến Sản xuất': 'KTCN',
  'Phòng Vận hành Kinh doanh': 'VHKD',
  'Phòng Marketing': 'MKT',
  'Phòng Kinh doanh Bia hơi': 'KDBH',
  'Phòng Kế toán': 'KT',
  'Phòng Kế hoạch – Vật tư': 'KHVT',
  'Phòng Hành chính – Nhân sự': 'HCNS',
  'Phòng Kiểm soát Chất lượng – KCS': 'KCS',
  'Phòng Cơ điện': 'CD',
  'Kênh Phân phối': 'KPP',
  'Kênh Khách hàng Tổ chức': 'KHTC',
  'Trung tâm Điều hành': 'TTDH',
  'Phân xưởng Sản xuất Đông Mai': 'PXDM',
  'Phân xưởng Cơ điện – Động lực Đông Mai': 'CDDM',
  'Phân xưởng Sản xuất Hạ Long': 'PXHL',
  'Phân xưởng Cơ điện – Động lực Hạ Long': 'CDHL',
  'Văn bản điều hành chung (cấp Công ty)': 'CTY'
};

// Color cho unit card (theo thứ tự đơn vị)
const UNIT_COLORS: string[] = [
  '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#06B6D4', '#84CC16'
];

interface ISPListItem {
  Id: number;
  FileLeafRef: string;
  FileRef: string;
  EncodedAbsUrl: string;
  File_x0020_Type: string;
  Modified: string;
  SoVanBan?: string;
  NamBanHanh?: number;
  LoaiVanBan?: string;
  DonViSoanThao?: string;
  NgayBanHanh?: string;
  NgayHetHieuLuc?: string;
  TrangThai?: string;
  MucDoBaoMat?: string;
  TrichYeu?: string;
  // Metadata V2 (optional — có thể chưa tồn tại trên library)
  NhomTaiLieu?: string;
  LoaiVanBanPhapLy?: string;
  LoaiTaiLieu?: string;
  ChuDeNghiepVu?: string;
  DonViPhatHanh?: string;
  DonViSoHuu?: string;
  NguonMetadata?: string;
  MetadataConfidence?: string;
  // Cột liên kết thay thế (optional)
  VanBanThayThe?: string;
  VanBanLienQuan?: string;
  Tags?: string;
  // Cột liên kết bản mềm ↔ PDF (optional)
  HasEditableSource?: string | boolean;
  EditableSourceUrl?: string;
  PrimaryPdfUrl?: string;
}

export class SharePointDmsService implements IDmsService {
  private _cache: IDocument[] | undefined;
  private _cacheTime: number = 0;
  private _siteUrl: string;
  private _choicesCache: IMetadataChoices | undefined;
  private _foldersCache: IStorageFolder[] | undefined;

  /**
   * @param context  WebPartContext (cho SPHttpClient + auth)
   * @param dmsSiteUrl URL site chứa DMS Library. Mặc định = DEFAULT_DMS_SITE_URL.
   *                   Cần thiết khi web part chạy trên site KHÁC site chứa Library
   *                   (vd. web part ở /sites/bansohoa-Admins nhưng Library ở /sites/vanbandieuhanh).
   */
  public constructor(private context: WebPartContext, dmsSiteUrl?: string) {
    this._siteUrl = (dmsSiteUrl && dmsSiteUrl.trim().length > 0)
      ? dmsSiteUrl.replace(/\/$/, '')
      : DEFAULT_DMS_SITE_URL;
  }

  public async getAllDocuments(): Promise<IDocument[]> {
    return this._getAll();
  }

  public async refreshDocuments(): Promise<IDocument[]> {
    this._cache = undefined;       // bỏ cache để lấy dữ liệu mới
    this._cacheTime = 0;
    this._choicesCache = undefined; // refetch luôn choices (vd vừa thêm choice mới trên SP)
    this._foldersCache = undefined; // refetch folder cấp 1 (vd vừa tạo folder mới trên SP)
    return this._getAll();
  }

  /**
   * Lấy Choices của các Choice field trong DMS Library (động từ field schema).
   * Cache trong runtime session; fallback khi API lỗi.
   */
  public async getMetadataChoices(): Promise<IMetadataChoices> {
    if (this._choicesCache) { return this._choicesCache; }
    try {
      const endpoint: string =
        `${this._siteUrl}/_api/web/lists/getbytitle('${LIBRARY_TITLE}')/fields` +
        `?$select=InternalName,TypeAsString,Choices&$top=500`;
      const resp: SPHttpClientResponse = await this.context.spHttpClient.get(
        endpoint,
        SPHttpClient.configurations.v1,
        { headers: { 'Accept': 'application/json;odata=nometadata', 'OData-Version': '3.0' } } as ISPHttpClientOptions
      );
      if (!resp.ok) {
        const text: string = await resp.text();
        throw new Error(`${resp.status} ${resp.statusText} — ${text}`);
      }
      const json: { value?: Array<{ InternalName?: string; TypeAsString?: string; Choices?: string[] | { results?: string[] } }> } = await resp.json();
      const map: { [name: string]: string[] } = {};
      (json.value ?? []).forEach((f): void => {
        if (!f.InternalName) { return; }
        const raw: string[] | { results?: string[] } | undefined = f.Choices;
        const arr: string[] | undefined = Array.isArray(raw) ? raw : (raw && raw.results ? raw.results : undefined);
        if (arr && arr.length > 0) { map[f.InternalName] = arr; }
      });
      const result: IMetadataChoices = {
        nhomTaiLieu: map.NhomTaiLieu ?? FALLBACK_METADATA_CHOICES.nhomTaiLieu,
        loaiVanBanPhapLy: map.LoaiVanBanPhapLy ?? FALLBACK_METADATA_CHOICES.loaiVanBanPhapLy,
        loaiTaiLieu: map.LoaiTaiLieu ?? FALLBACK_METADATA_CHOICES.loaiTaiLieu,
        trangThai: map.TrangThai ?? FALLBACK_METADATA_CHOICES.trangThai,
        mucDoBaoMat: map.MucDoBaoMat ?? FALLBACK_METADATA_CHOICES.mucDoBaoMat,
        nguonMetadata: map.NguonMetadata ?? FALLBACK_METADATA_CHOICES.nguonMetadata,
        metadataConfidence: map.MetadataConfidence ?? FALLBACK_METADATA_CHOICES.metadataConfidence,
        donViPhatHanh: map.DonViPhatHanh ?? [],
        capLuuTru: map.DonViSoHuu ?? []
      };
      this._choicesCache = result;
      return result;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load SharePoint metadata choices, using fallback choices', (e as Error)?.message ?? e);
      return FALLBACK_METADATA_CHOICES;
    }
  }

  public async getRecentDocuments(): Promise<IDocument[]> {
    const all: IDocument[] = await this._getAll();
    return all
      .filter((d: IDocument): boolean => d.trangThai === DocStatus.Active && isNotExpired(d))
      .sort((a: IDocument, b: IDocument): number => b.ngayBanHanh.localeCompare(a.ngayBanHanh))
      .slice(0, 10);
  }

  public async getExpiringDocuments(): Promise<IDocument[]> {
    const all: IDocument[] = await this._getAll();
    const today: string = new Date().toISOString().substring(0, 10);
    const in60Days: Date = new Date();
    in60Days.setDate(in60Days.getDate() + 60);
    const cutoff: string = in60Days.toISOString().substring(0, 10);

    return all
      .filter((d: IDocument): boolean => {
        // Văn bản hết hiệu lực không tham gia thống kê "sắp hết hiệu lực".
        if (isExpired(d)) { return false; }
        if (!d.ngayHetHieuLuc) {
          return false;
        }
        return d.ngayHetHieuLuc >= today && d.ngayHetHieuLuc <= cutoff;
      })
      .sort((a: IDocument, b: IDocument): number => (a.ngayHetHieuLuc ?? '').localeCompare(b.ngayHetHieuLuc ?? ''))
      .slice(0, 10);
  }

  public async getUnitStats(): Promise<IUnitStat[]> {
    // NGUỒN CHUẨN = folder cấp 1 thật trong DMS Library (kể cả folder chưa có văn bản).
    // Số lượng = đếm văn bản CÒN HIỆU LỰC theo mã [NN] của folder.
    const folders: IStorageFolder[] = await this.getStorageFolders();
    const docs: IDocument[] = (await this._getAll()).filter(isNotExpired);

    const countByCode: { [code: string]: number } = {};
    for (const doc of docs) {
      const code: string = doc.donViCode || 'KHAC';
      countByCode[code] = (countByCode[code] ?? 0) + 1;
    }

    const result: IUnitStat[] = folders.map((f: IStorageFolder, idx: number): IUnitStat => {
      const code: string = this._folderCode(f.name);
      return {
        code,
        name: f.name,
        count: countByCode[code] ?? 0,   // folder chưa có văn bản → 0
        color: UNIT_COLORS[idx % UNIT_COLORS.length]
      };
    });

    // Sắp theo mã số trong [] (numeric natural): [00] [01] ... [06] [06.02] ... [99].
    result.sort((a: IUnitStat, b: IUnitStat): number => {
      const ka: number = this._folderSortKey(a.name);
      const kb: number = this._folderSortKey(b.name);
      if (ka !== kb) { return ka - kb; }
      return a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' });
    });
    return result;
  }

  /**
   * Lấy danh sách folder cấp 1 (cấp lưu trữ) thật trong DMS Library.
   * REST: rootFolder/folders. Loại folder hệ thống (Forms, tên bắt đầu '_', ẩn).
   * Có cache runtime; refreshDocuments() sẽ xóa cache để bắt folder mới.
   */
  public async getStorageFolders(): Promise<IStorageFolder[]> {
    if (this._foldersCache) { return this._foldersCache; }
    const endpoint: string =
      `${this._siteUrl}/_api/web/lists/getbytitle('${LIBRARY_TITLE}')/rootFolder/folders` +
      `?$select=Name,ServerRelativeUrl,ItemCount&$top=500`;
    try {
      const resp: SPHttpClientResponse = await this.context.spHttpClient.get(
        endpoint,
        SPHttpClient.configurations.v1,
        { headers: { 'Accept': 'application/json;odata=nometadata', 'OData-Version': '3.0' } } as ISPHttpClientOptions
      );
      if (!resp.ok) {
        const text: string = await resp.text();
        throw new Error(`${resp.status} ${resp.statusText} — ${text}`);
      }
      const json: { value?: Array<{ Name?: string; ServerRelativeUrl?: string; ItemCount?: number }> } = await resp.json();
      const folders: IStorageFolder[] = (json.value ?? [])
        .filter((f): boolean => {
          const n: string = (f.Name ?? '').trim();
          if (!n) { return false; }
          if (n === 'Forms') { return false; }       // folder hệ thống của Document Library
          if (n.charAt(0) === '_') { return false; }  // folder ẩn/hệ thống
          return true;
        })
        .map((f): IStorageFolder => ({
          name: (f.Name ?? '').trim(),
          serverRelativeUrl: f.ServerRelativeUrl,
          itemCount: f.ItemCount
        }));
      folders.sort((a: IStorageFolder, b: IStorageFolder): number => {
        const ka: number = this._folderSortKey(a.name);
        const kb: number = this._folderSortKey(b.name);
        if (ka !== kb) { return ka - kb; }
        return a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' });
      });
      this._foldersCache = folders;
      return folders;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DMS] Không lấy được folder cấp 1, fallback rỗng:', (e as Error)?.message ?? e);
      return [];
    }
  }

  /** Mã [NN] (hoặc [NN.MM]) của folder; fallback chính tên folder. */
  private _folderCode(name: string): string {
    const m: RegExpMatchArray | null = (name ?? '').match(/^\s*\[(\d{2}(?:\.\d{2})?)\]/);
    return m ? m[1] : (name ?? 'KHAC');
  }

  /** Khóa sắp xếp numeric từ tiền tố [NN]/[NN.MM]; không khớp → đẩy xuống cuối. */
  private _folderSortKey(name: string): number {
    const m: RegExpMatchArray | null = (name ?? '').match(/^\s*\[(\d+(?:\.\d+)?)\]/);
    return m ? parseFloat(m[1]) : Number.MAX_VALUE;
  }

  public async getKpis(): Promise<IKpiStat[]> {
    const all: IDocument[] = await this._getAll();
    // Tập thống kê chung = TOÀN BỘ văn bản TRỪ văn bản hết hiệu lực.
    // KPI "Văn bản hết hiệu lực" đếm riêng trên tập hết hiệu lực.
    const visible: IDocument[] = all.filter(isNotExpired);
    const today: string = new Date().toISOString().substring(0, 10);
    const in30Days: Date = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const cutoff30: string = in30Days.toISOString().substring(0, 10);

    const total: number = visible.length;
    const active: number = visible.filter((d: IDocument): boolean => d.trangThai === DocStatus.Active).length;
    const expired: number = all.filter(isExpired).length;
    const expiring: number = visible.filter((d: IDocument): boolean => {
      if (!d.ngayHetHieuLuc) {
        return false;
      }
      return d.ngayHetHieuLuc >= today && d.ngayHetHieuLuc <= cutoff30;
    }).length;
    const hasSource: number = visible.filter((d: IDocument): boolean => !!d.editableSource).length;
    const missingSource: number = total - hasSource;
    const recent: number = visible.filter((d: IDocument): boolean => isRecentlyIssued(d, 2)).length;
    const needsReview: number = visible.filter(needsStandardization).length;
    const pct = (n: number): string => (total ? `${((n * 100) / total).toFixed(1)}% tổng số` : '');

    return [
      { key: 'total',        label: 'Tổng số văn bản',          value: total,         caption: '' },
      { key: 'byUnit',       label: 'Văn bản theo cấp lưu trữ', value: total,         caption: 'Xem theo cấp lưu trữ' },
      { key: 'active',       label: 'Văn bản đang lưu hành',    value: active,        caption: pct(active) },
      { key: 'recent',       label: 'Văn bản mới ban hành',     value: recent,        caption: '2 tháng gần đây' },
      { key: 'expiringSoon', label: 'Văn bản sắp hết hiệu lực', value: expiring,      caption: '30 ngày tới' },
      { key: 'expired',      label: 'Văn bản hết hiệu lực',     value: expired,       caption: expired === 0 ? 'Không có' : '' },
      { key: 'needsReview',  label: 'Cần chuẩn hóa',            value: needsReview,   caption: pct(needsReview) },
      { key: 'missingSource',label: 'Thiếu bản mềm',            value: missingSource, caption: pct(missingSource) },
      { key: 'hasSource',    label: 'Có bản mềm',               value: hasSource,     caption: pct(hasSource) }
    ];
  }

  public async searchDocuments(filter: IDocSearchFilter): Promise<IDocument[]> {
    const all: IDocument[] = await this._getAll();
    const keyword: string = (filter.keyword ?? '').trim().toLowerCase();

    return all.filter((d: IDocument): boolean => {
      // Mặc định loại văn bản hết hiệu lực khỏi kết quả tìm kiếm (thường + nâng cao).
      if (isExpired(d)) { return false; }
      if (filter.typeKey && d.loaiVanBanKey !== filter.typeKey) { return false; }
      if (filter.soVanBan && d.soVanBan.toLowerCase().indexOf(filter.soVanBan.toLowerCase()) === -1) { return false; }
      if (filter.loaiVanBan && d.loaiVanBan !== filter.loaiVanBan) { return false; }
      if (filter.donViCode && d.donViCode !== filter.donViCode) { return false; }
      if (filter.nhomTaiLieu && (d.nhomTaiLieu ?? '') !== filter.nhomTaiLieu) { return false; }
      if (filter.loaiTaiLieu && (d.loaiTaiLieu ?? '') !== filter.loaiTaiLieu) { return false; }
      if (filter.donViPhatHanh && (d.donViPhatHanh ?? '') !== filter.donViPhatHanh) { return false; }
      if (filter.nguoiKy && d.nguoiKy.toLowerCase().indexOf(filter.nguoiKy.toLowerCase()) === -1) { return false; }
      if (filter.tuNgay && d.ngayBanHanh < filter.tuNgay) { return false; }
      if (filter.denNgay && d.ngayBanHanh > filter.denNgay) { return false; }
      if (keyword) {
        const haystack: string = [
          d.soVanBan, d.trichYeu, d.loaiVanBan, d.donViSoanThao, d.donViCode, d.nguoiKy,
          d.nhomTaiLieu ?? '', d.loaiTaiLieu ?? '', d.chuDeNghiepVu ?? '', d.donViPhatHanh ?? ''
        ].join(' ').toLowerCase();
        if (haystack.indexOf(keyword) === -1) { return false; }
      }
      return true;
    });
  }

  // MERGE 1 item (dùng chung cho update lẻ + hàng loạt). Không refresh cache.
  private async _mergeItem(id: string, values: { [internalName: string]: string }): Promise<void> {
    const webUrl: string = this._siteUrl;
    // DateTime: ISO 8601; Number (NamBanHanh): kiểu số; còn lại: string.
    const DATE_FIELDS: string[] = ['NgayBanHanh', 'NgayHetHieuLuc'];
    const NUMBER_FIELDS: string[] = ['NamBanHanh'];
    const body: { [k: string]: string | number } = {};
    Object.keys(values).forEach((k: string): void => {
      const raw: string = values[k] ?? '';
      if (NUMBER_FIELDS.indexOf(k) >= 0) {
        const n: number = parseInt(raw, 10);
        if (!isNaN(n)) { body[k] = n; }
      } else if (DATE_FIELDS.indexOf(k) >= 0) {
        if (raw !== '') { body[k] = raw; }
      } else {
        body[k] = raw;
      }
    });

    const endpoint: string = `${webUrl}/_api/web/lists/getbytitle('${LIBRARY_TITLE}')/items(${id})`;
    const resp: SPHttpClientResponse = await this.context.spHttpClient.post(
      endpoint,
      SPHttpClient.configurations.v1,
      {
        headers: {
          'Accept': 'application/json;odata=nometadata',
          'Content-type': 'application/json;odata=nometadata',
          'OData-Version': '3.0',
          'IF-MATCH': '*',
          'X-HTTP-Method': 'MERGE'
        },
        body: JSON.stringify(body)
      } as ISPHttpClientOptions
    );
    if (!resp.ok) {
      const text: string = await resp.text();
      throw new Error(`${resp.status} ${resp.statusText} — ${text}`);
    }
  }

  public async updateMetadataMany(
    ids: string[],
    values: { [internalName: string]: string },
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: number; failed: number; errors: string[] }> {
    let ok: number = 0;
    let failed: number = 0;
    const errors: string[] = [];
    for (let i: number = 0; i < ids.length; i++) {
      try {
        await this._mergeItem(ids[i], values);
        ok++;
      } catch (e) {
        failed++;
        errors.push(`#${ids[i]}: ${(e as Error)?.message ?? 'lỗi'}`);
      }
      if (onProgress) { onProgress(i + 1, ids.length); }
    }
    this._cache = undefined; // refresh 1 lần sau khi ghi xong
    await this._getAll();
    return { ok, failed, errors };
  }

  public async updateMetadata(id: string, values: { [internalName: string]: string }): Promise<IDocument | undefined> {
    await this._mergeItem(id, values);

    // Làm mới cache + trả về document đã cập nhật để UI refresh
    this._cache = undefined;
    const all: IDocument[] = await this._getAll();
    for (let i: number = 0; i < all.length; i++) {
      if (all[i].id === String(id)) { return all[i]; }
    }
    return undefined;
  }

  // ============================================================
  // Upload văn bản mới (+ thay thế văn bản cũ)
  // ============================================================
  public async uploadDocument(req: IUploadRequest): Promise<IUploadResult> {
    const LINK_FIELDS: string[] = ['VanBanThayThe', 'VanBanLienQuan', 'Tags'];

    // 1) Resolve folder cấp 1 theo Cấp lưu trữ + upload file.
    const sitePath: string = this._siteServerRelativePath();
    const folderRel: string = `${sitePath}/${LIBRARY_TITLE}/${req.capLuuTru}`;

    let serverRel: string;
    try {
      serverRel = await this._uploadFile(folderRel, req.fileName, req.fileBuffer);
    } catch (e) {
      const msg: string = (e as Error)?.message ?? '';
      if (msg.indexOf(' 403 ') >= 0 || msg.toLowerCase().indexOf('access denied') >= 0) {
        throw new Error('Bạn không có quyền upload vào DMS Library. Vui lòng liên hệ quản trị viên.');
      }
      if (msg.indexOf(' 404 ') >= 0) {
        throw new Error(`Không tìm thấy thư mục cấp lưu trữ "${req.capLuuTru}" trong DMS Library.`);
      }
      throw new Error(`Upload file thất bại: ${msg}`);
    }

    // 2) Lấy item Id của file mới.
    const newId: string = await this._getItemIdByServerRelativeUrl(serverRel);

    // 3) Set metadata cho file mới — tách core (cột chắc chắn có) và link (cột tùy chọn).
    const core: { [k: string]: string } = {};
    const link: { [k: string]: string } = {};
    Object.keys(req.metadata).forEach((k: string): void => {
      const val: string = req.metadata[k] ?? '';
      if (val === '') { return; } // bỏ field rỗng — tránh lỗi ghi rỗng vào cột Choice
      if (LINK_FIELDS.indexOf(k) >= 0) { link[k] = val; }
      else { core[k] = val; }
    });

    let warning: string | undefined = undefined;
    try {
      await this._mergeItem(newId, core);
    } catch (e) {
      warning = `Văn bản mới đã upload nhưng set metadata lỗi: ${(e as Error)?.message ?? ''}. Vui lòng kiểm tra trong "Cần chuẩn hóa".`;
    }
    // Link fields: ghi an toàn (bỏ qua nếu cột chưa tồn tại).
    const linkNonEmpty: { [k: string]: string } = {};
    Object.keys(link).forEach((k: string): void => { if (link[k]) { linkNonEmpty[k] = link[k]; } });
    if (Object.keys(linkNonEmpty).length > 0) { await this._mergeItemSafe(newId, linkNonEmpty); }

    // 3b) Bản mềm upload đồng thời (tùy chọn) — lưu CÙNG thư mục, CÙNG metadata, liên kết 2 chiều.
    const origin: string = this._origin();
    const pdfUrl: string = origin + encodeURI(serverRel);
    if (req.editableFileBuffer && req.editableFileName) {
      try {
        const pdfBase: string = req.fileName.replace(/\.[^.]+$/, '');
        const softExtMatch: RegExpMatchArray | null = req.editableFileName.match(/\.([^.]+)$/);
        const softExt: string = softExtMatch ? `.${softExtMatch[1].toLowerCase()}` : '';
        const softName: string = `${pdfBase}${softExt}`;
        const softServerRel: string = await this._uploadFile(folderRel, softName, req.editableFileBuffer);
        const softId: string = await this._getItemIdByServerRelativeUrl(softServerRel);
        const softUrl: string = origin + encodeURI(softServerRel);
        // Bản mềm nhận cùng metadata với PDF (core + link).
        if (Object.keys(core).length > 0) { await this._mergeItemSafe(softId, core); }
        if (Object.keys(linkNonEmpty).length > 0) { await this._mergeItemSafe(softId, linkNonEmpty); }
        const linkBoth: { [k: string]: string } = { HasEditableSource: 'Yes', EditableSourceUrl: softUrl, PrimaryPdfUrl: pdfUrl };
        await this._mergeItemSafe(newId, linkBoth);
        await this._mergeItemSafe(softId, linkBoth);
      } catch (e) {
        warning = `Văn bản PDF đã upload nhưng bản mềm lỗi: ${(e as Error)?.message ?? ''}. Có thể bổ sung bản mềm sau ở màn chi tiết.`;
      }
    } else {
      // Chỉ PDF → đánh dấu chưa có bản mềm (thuộc KPI "Thiếu bản mềm").
      await this._mergeItemSafe(newId, { HasEditableSource: 'No', EditableSourceUrl: '', PrimaryPdfUrl: pdfUrl });
    }

    // 4) Thay thế văn bản cũ (KHÔNG move file — chỉ update metadata).
    let oldDocUpdated: boolean = false;
    if (req.replacementOldId) {
      const todayIso: string = `${new Date().toISOString().substring(0, 10)}T00:00:00Z`;
      try {
        await this._mergeItem(req.replacementOldId, {
          TrangThai: 'Hết hiệu lực',
          NhomTaiLieu: 'Hết hiệu lực',
          NgayHetHieuLuc: todayIso
        });
        oldDocUpdated = true;
        // Ghi liên kết ngược trên văn bản cũ (an toàn): bị thay thế bởi VB mới.
        const newSo: string = req.metadata.SoVanBan ?? '';
        const oldLink: { [k: string]: string } = {};
        if (newSo) { oldLink.VanBanThayThe = newSo; oldLink.VanBanLienQuan = `Được thay thế bởi: ${newSo}`; }
        if (Object.keys(oldLink).length > 0) { await this._mergeItemSafe(req.replacementOldId, oldLink); }
      } catch (e) {
        warning = `Văn bản mới đã được upload, nhưng chưa cập nhật được văn bản cũ (${(e as Error)?.message ?? ''}). Vui lòng xử lý trong "Cần chuẩn hóa".`;
      }
    }

    // 5) Refresh cache + trả về văn bản mới.
    this._cache = undefined;
    const all: IDocument[] = await this._getAll();
    let doc: IDocument | undefined = undefined;
    for (let i: number = 0; i < all.length; i++) {
      if (all[i].id === newId) { doc = all[i]; break; }
    }
    return { document: doc, oldDocUpdated, warning };
  }

  // ============================================================
  // Xóa văn bản (đưa vào Thùng rác)
  // ============================================================
  public async deleteDocument(doc: IDocument): Promise<void> {
    // 1) Recycle item PDF chính.
    await this._recycleItem(doc.id);
    // 2) Recycle file bản mềm đi kèm (nếu có) — không chặn nếu lỗi/không tồn tại.
    const softRel: string | undefined = this._editableServerRelativeUrl(doc);
    if (softRel) {
      try {
        await this._recycleFileByServerRelativeUrl(softRel);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[DMS] Không recycle được bản mềm đi kèm:', (e as Error)?.message ?? '');
      }
    }
    this._cache = undefined;
  }

  public async deleteDocuments(
    docs: IDocument[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: number; failed: number; errors: string[] }> {
    let ok: number = 0;
    let failed: number = 0;
    const errors: string[] = [];
    for (let i: number = 0; i < docs.length; i++) {
      try {
        await this.deleteDocument(docs[i]);
        ok++;
      } catch (e) {
        failed++;
        errors.push(`${docs[i].soVanBan || docs[i].fileName || docs[i].id}: ${(e as Error)?.message ?? 'lỗi'}`);
      }
      if (onProgress) { onProgress(i + 1, docs.length); }
    }
    this._cache = undefined;
    await this._getAll();
    return { ok, failed, errors };
  }

  /** POST recycle() cho 1 list item → đưa vào Thùng rác site. */
  private async _recycleItem(id: string): Promise<void> {
    const endpoint: string = `${this._siteUrl}/_api/web/lists/getbytitle('${LIBRARY_TITLE}')/items(${id})/recycle()`;
    const resp: SPHttpClientResponse = await this.context.spHttpClient.post(
      endpoint,
      SPHttpClient.configurations.v1,
      { headers: { 'Accept': 'application/json;odata=nometadata', 'OData-Version': '3.0' } } as ISPHttpClientOptions
    );
    if (!resp.ok) {
      const text: string = await resp.text();
      if (resp.status === 403 || text.toLowerCase().indexOf('access denied') >= 0) {
        throw new Error('Bạn không có quyền xóa tài liệu này.');
      }
      throw new Error(`${resp.status} ${resp.statusText} — ${text}`);
    }
  }

  /** POST recycle() cho 1 file theo server-relative url → đưa vào Thùng rác. */
  private async _recycleFileByServerRelativeUrl(serverRel: string): Promise<void> {
    const endpoint: string =
      `${this._siteUrl}/_api/web/GetFileByServerRelativeUrl(@f)/recycle()` +
      `?@f=${encodeURIComponent(`'${serverRel}'`)}`;
    const resp: SPHttpClientResponse = await this.context.spHttpClient.post(
      endpoint,
      SPHttpClient.configurations.v1,
      { headers: { 'Accept': 'application/json;odata=nometadata', 'OData-Version': '3.0' } } as ISPHttpClientOptions
    );
    if (!resp.ok) {
      const text: string = await resp.text();
      throw new Error(`${resp.status} ${resp.statusText} — ${text}`);
    }
  }

  /** Server-relative url của bản mềm (ưu tiên field, fallback suy từ webUrl). */
  private _editableServerRelativeUrl(doc: IDocument): string | undefined {
    const es: IEditableSource | undefined = doc.editableSource;
    if (!es) { return undefined; }
    if (es.serverRelativeUrl) { return es.serverRelativeUrl; }
    if (es.webUrl) {
      const noQuery: string = es.webUrl.split('?')[0];
      const m: RegExpMatchArray | null = noQuery.match(/^https?:\/\/[^/]+(\/.*)$/);
      if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
    }
    return undefined;
  }

  // ============================================================
  // Bản mềm: upload mới / gắn link cho văn bản PDF thiếu bản mềm
  // ============================================================
  public async uploadEditableSource(doc: IDocument, fileBuffer: ArrayBuffer, fileName: string): Promise<IDocument | undefined> {
    if (!doc.serverRelativeUrl) {
      throw new Error('Không xác định được vị trí file PDF gốc để lưu bản mềm cùng thư mục.');
    }
    // 1) Cùng thư mục với PDF; tên bản mềm = base name của PDF + đuôi của file bản mềm.
    const folderRel: string = doc.serverRelativeUrl.replace(/\/[^/]+$/, '');
    const pdfLeaf: string = doc.fileName ?? doc.serverRelativeUrl.split('/').slice(-1)[0];
    const pdfBase: string = pdfLeaf.replace(/\.[^.]+$/, '');
    const softExtMatch: RegExpMatchArray | null = fileName.match(/\.([^.]+)$/);
    const softExt: string = softExtMatch ? `.${softExtMatch[1].toLowerCase()}` : '';
    const softName: string = `${pdfBase}${softExt}`;

    let softServerRel: string;
    try {
      softServerRel = await this._uploadFile(folderRel, softName, fileBuffer);
    } catch (e) {
      const msg: string = (e as Error)?.message ?? '';
      if (msg.indexOf(' 403 ') >= 0 || msg.toLowerCase().indexOf('access denied') >= 0) {
        throw new Error('Bạn không có quyền upload bản mềm vào DMS Library.');
      }
      throw new Error(`Upload bản mềm thất bại: ${msg}`);
    }

    const softId: string = await this._getItemIdByServerRelativeUrl(softServerRel);

    // 2) Copy toàn bộ metadata từ PDF gốc sang file bản mềm.
    try {
      await this._copyMetadata(doc.id, softId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DMS] Copy metadata sang bản mềm lỗi (tiếp tục gắn liên kết):', (e as Error)?.message ?? '');
    }

    // 3) Liên kết PDF ↔ bản mềm trên cả hai item.
    const origin: string = this._origin();
    const softUrl: string = origin + encodeURI(softServerRel);
    const pdfUrl: string = origin + encodeURI(doc.serverRelativeUrl);
    const link: { [k: string]: string } = {
      HasEditableSource: 'Yes',
      EditableSourceUrl: softUrl,
      PrimaryPdfUrl: pdfUrl
    };
    await this._mergeItemSafe(doc.id, link);
    await this._mergeItemSafe(softId, link);

    // 4) Refresh + trả về PDF đã cập nhật.
    this._cache = undefined;
    const all: IDocument[] = await this._getAll();
    for (let i: number = 0; i < all.length; i++) {
      if (all[i].id === doc.id) { return all[i]; }
    }
    return undefined;
  }

  public async linkEditableSource(doc: IDocument, editableSourceUrl: string): Promise<IDocument | undefined> {
    const url: string = (editableSourceUrl ?? '').trim();
    if (!url) { throw new Error('Vui lòng nhập URL bản mềm.'); }
    const pdfUrl: string = doc.serverRelativeUrl ? this._origin() + encodeURI(doc.serverRelativeUrl) : (doc.webUrl ?? '');
    try {
      await this._mergeItem(doc.id, {
        HasEditableSource: 'Yes',
        EditableSourceUrl: url,
        PrimaryPdfUrl: pdfUrl
      });
    } catch (e) {
      const msg: string = (e as Error)?.message ?? '';
      if (msg.indexOf('does not exist') >= 0 || msg.indexOf('Column') >= 0 || msg.indexOf(' 400 ') >= 0) {
        throw new Error('Cột HasEditableSource/EditableSourceUrl chưa tồn tại trên DMS Library. Vui lòng tạo cột hoặc dùng "Upload bản mềm".');
      }
      throw e;
    }
    this._cache = undefined;
    const all: IDocument[] = await this._getAll();
    for (let i: number = 0; i < all.length; i++) {
      if (all[i].id === doc.id) { return all[i]; }
    }
    return undefined;
  }

  /** Origin (https://host) của site. */
  private _origin(): string {
    const m: RegExpMatchArray | null = this._siteUrl.match(/^(https?:\/\/[^/]+)/);
    return m ? m[1] : '';
  }

  /** Copy các cột metadata (COPYABLE_METADATA_FIELDS) từ item nguồn sang item đích. */
  private async _copyMetadata(sourceId: string, targetId: string): Promise<void> {
    const raw: { [k: string]: unknown } = await this._getItemAllFields(sourceId);
    const body: { [k: string]: string } = {};
    COPYABLE_METADATA_FIELDS.forEach((f: string): void => {
      const v: unknown = raw[f];
      if (v === undefined || v === null || v === '') { return; }
      body[f] = typeof v === 'number' ? String(v) : String(v);
    });
    if (Object.keys(body).length > 0) { await this._mergeItemSafe(targetId, body); }
  }

  /** GET toàn bộ field của 1 item (không $select) → tránh lỗi cột chưa tồn tại. */
  private async _getItemAllFields(id: string): Promise<{ [k: string]: unknown }> {
    const endpoint: string = `${this._siteUrl}/_api/web/lists/getbytitle('${LIBRARY_TITLE}')/items(${id})`;
    const resp: SPHttpClientResponse = await this.context.spHttpClient.get(
      endpoint,
      SPHttpClient.configurations.v1,
      { headers: { 'Accept': 'application/json;odata=nometadata', 'OData-Version': '3.0' } } as ISPHttpClientOptions
    );
    if (!resp.ok) {
      const text: string = await resp.text();
      throw new Error(`${resp.status} ${resp.statusText} — ${text}`);
    }
    return resp.json();
  }

  /** Server-relative path của site (vd "/sites/vanbandieuhanh") từ siteUrl. */
  private _siteServerRelativePath(): string {
    const m: RegExpMatchArray | null = this._siteUrl.match(/^https?:\/\/[^/]+(\/.*)$/);
    return m ? m[1].replace(/\/$/, '') : '';
  }

  /** POST add file vào folder; trả ServerRelativeUrl của file mới. */
  private async _uploadFile(folderRel: string, fileName: string, buffer: ArrayBuffer): Promise<string> {
    const q: string =
      `?@f=${encodeURIComponent(`'${folderRel}'`)}&@n=${encodeURIComponent(`'${fileName}'`)}`;
    const endpoint: string =
      `${this._siteUrl}/_api/web/GetFolderByServerRelativeUrl(@f)/Files/Add(url=@n,overwrite=false)${q}`;
    const resp: SPHttpClientResponse = await this.context.spHttpClient.post(
      endpoint,
      SPHttpClient.configurations.v1,
      {
        headers: {
          'Accept': 'application/json;odata=nometadata',
          'OData-Version': '3.0',
          'Content-Type': 'application/octet-stream'
        },
        body: buffer
      } as ISPHttpClientOptions
    );
    if (!resp.ok) {
      const text: string = await resp.text();
      throw new Error(` ${resp.status} ${resp.statusText} — ${text}`);
    }
    const json: { ServerRelativeUrl?: string } = await resp.json();
    if (!json.ServerRelativeUrl) {
      throw new Error('Upload thành công nhưng không nhận được đường dẫn file.');
    }
    return json.ServerRelativeUrl;
  }

  /** Lấy list item Id của file theo server-relative url. */
  private async _getItemIdByServerRelativeUrl(serverRel: string): Promise<string> {
    const endpoint: string =
      `${this._siteUrl}/_api/web/GetFileByServerRelativeUrl(@f)/ListItemAllFields` +
      `?@f=${encodeURIComponent(`'${serverRel}'`)}&$select=Id`;
    const resp: SPHttpClientResponse = await this.context.spHttpClient.get(
      endpoint,
      SPHttpClient.configurations.v1,
      { headers: { 'Accept': 'application/json;odata=nometadata', 'OData-Version': '3.0' } } as ISPHttpClientOptions
    );
    if (!resp.ok) {
      const text: string = await resp.text();
      throw new Error(`Không lấy được Id file mới: ${resp.status} ${resp.statusText} — ${text}`);
    }
    const json: { Id?: number } = await resp.json();
    if (json.Id === undefined) { throw new Error('Không lấy được Id file mới.'); }
    return String(json.Id);
  }

  /** MERGE an toàn (nuốt lỗi cột thiếu) — dùng cho cột liên kết tùy chọn. */
  private async _mergeItemSafe(id: string, values: { [internalName: string]: string }): Promise<boolean> {
    try {
      await this._mergeItem(id, values);
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DMS] Bỏ qua ghi cột liên kết (có thể chưa tạo cột):', (e as Error)?.message ?? '');
      return false;
    }
  }

  // ============================================================
  // Internal: fetch all + cache
  // ============================================================
  private async _getAll(): Promise<IDocument[]> {
    const now: number = Date.now();
    if (this._cache && (now - this._cacheTime) < CACHE_TTL_MS) {
      return this._cache;
    }

    const items: ISPListItem[] = await this._fetchAllPaged();
    const mapped: IDocument[] = items.map((it: ISPListItem): IDocument => this._mapItem(it));

    // PDF-first business rule:
    //   - Chỉ giữ PDF làm primary document
    //   - DOCX/XLSX/PPTX cùng base name → gắn vào primary làm editableSource
    //   - DOCX standalone (không có PDF pair) → ẩn khỏi list (giữ trong raw để future feature)
    this._cache = this._pairDocuments(mapped);
    this._cacheTime = now;
    return this._cache;
  }

  /**
   * Group documents by folder + normalized base filename. Trả về chỉ PDF rows làm primary,
   * gắn DOCX cùng tên làm editableSource. Bản DOCX standalone bị ẩn khỏi list view.
   *
   * PDF-FIRST BUSINESS RULE:
   *   - 1 row = 1 văn bản ban hành (PDF)
   *   - DOCX/XLSX cùng tên = bản mềm editable (attached as editableSource)
   *   - DOCX standalone (không PDF pair) = ẩn khỏi list (chưa published)
   */
  private _pairDocuments(docs: IDocument[]): IDocument[] {
    // Group key = folder + normalized base filename
    const groups: { [key: string]: IDocument[] } = {};
    for (const d of docs) {
      const base: string = normalizeBaseFileName(d.fileName ?? '');
      const folderPath: string = (d.serverRelativeUrl ?? '').split('/').slice(0, -1).join('/');
      const key: string = `${folderPath}::${base}`;
      if (!groups[key]) { groups[key] = []; }
      groups[key].push(d);
    }

    const result: IDocument[] = [];
    for (const key of Object.keys(groups)) {
      const groupDocs: IDocument[] = groups[key];

      // Tìm primary (PDF) + editable (DOCX/XLSX/...) — không dùng .find() vì TS lib target ES5
      let pdf: IDocument | undefined = undefined;
      let editable: IDocument | undefined = undefined;
      for (let i: number = 0; i < groupDocs.length; i++) {
        const d: IDocument = groupDocs[i];
        if (!pdf && isPdfFile(d.fileExt)) { pdf = d; }
        if (!editable && isEditableSourceFile(d.fileExt)) { editable = d; }
        if (pdf && editable) { break; }
      }

      if (pdf) {
        // Ưu tiên file DOCX cùng tên trong folder; nếu không có, dùng bản mềm khai báo
        // qua cột (HasEditableSource/EditableSourceUrl) đã map ở _mapItem (pdf.editableSource).
        const fileEditable: IEditableSource | undefined = editable
          ? {
            fileName: editable.fileName ?? '',
            fileExt: editable.fileExt ?? '',
            webUrl: editable.webUrl ?? '',
            serverRelativeUrl: editable.serverRelativeUrl,
            sizeKB: editable.fileSizeKB
          }
          : undefined;
        const resolvedEditable: IEditableSource | undefined = fileEditable ?? pdf.editableSource;
        const hasDocx: boolean = !!resolvedEditable;
        const merged: IDocument = {
          ...pdf,
          hasPdf: true,
          hasDocx,
          hasPair: hasDocx,
          editableSource: resolvedEditable
        };
        result.push(merged);
      }
      // Nếu chỉ có DOCX (không PDF): KHÔNG add vào result (ẩn khỏi list view).
    }

    return result;
  }

  private async _fetchAllPaged(): Promise<ISPListItem[]> {
    // 3 tầng fallback (giữ tối đa dữ liệu hiển thị):
    //   1) base + V2 + link  → đầy đủ
    //   2) base + V2         → nếu cột link (VanBanThayThe...) chưa tồn tại
    //   3) base              → nếu cột V2 cũng chưa tồn tại
    const isMissingField = (err: unknown): boolean => {
      const msg: string = (err as Error)?.message ?? '';
      return msg.indexOf('does not exist') >= 0 || msg.indexOf('Column') >= 0 || msg.indexOf(' 400 ') >= 0;
    };
    try {
      return await this._fetchAllPagedWith(SELECT_FIELDS);
    } catch (err1) {
      if (!isMissingField(err1)) { throw err1; }
      // eslint-disable-next-line no-console
      console.warn('[DMS] Cột liên kết thay thế chưa có — fallback select base+V2.');
      try {
        return await this._fetchAllPagedWith(SELECT_FIELDS_V2_FULL);
      } catch (err2) {
        if (!isMissingField(err2)) { throw err2; }
        // eslint-disable-next-line no-console
        console.warn('[DMS] Cột V2 chưa có — fallback select base (V1).');
        return await this._fetchAllPagedWith(SELECT_FIELDS_BASE);
      }
    }
  }

  private async _fetchAllPagedWith(selectFields: string[]): Promise<ISPListItem[]> {
    // Dùng siteUrl của DMS Library (vanbandieuhanh), KHÔNG dùng pageContext của site hiện tại
    const webUrl: string = this._siteUrl;
    const select: string = selectFields.join(',');
    const baseUrl: string = `${webUrl}/_api/web/lists/getbytitle('${LIBRARY_TITLE}')/items` +
      `?$select=${select}` +
      (EXPAND_FIELDS.length > 0 ? `&$expand=${EXPAND_FIELDS.join(',')}` : '') +
      `&$top=2000` +
      `&$filter=FSObjType eq 0`; // chỉ lấy file, bỏ folder

    const allItems: ISPListItem[] = [];
    let nextUrl: string | undefined = baseUrl;

    while (nextUrl) {
      const response: SPHttpClientResponse = await this.context.spHttpClient.get(
        nextUrl,
        SPHttpClient.configurations.v1,
        {
          headers: {
            'Accept': 'application/json;odata=nometadata',
            'odata-version': ''
          }
        } as ISPHttpClientOptions
      );

      if (!response.ok) {
        const text: string = await response.text();
        throw new Error(`SharePoint REST call failed: ${response.status} ${response.statusText} — ${text}`);
      }

      const json: { value: ISPListItem[]; ['odata.nextLink']?: string } = await response.json();
      if (json.value && json.value.length > 0) {
        allItems.push(...json.value);
      }

      nextUrl = json['odata.nextLink'];
    }

    return allItems;
  }

  private _mapItem(it: ISPListItem): IDocument {
    // V2 ưu tiên, fallback V1:
    //  - loaiVanBan (hình thức pháp lý) = LoaiVanBanPhapLy ?? LoaiVanBan
    //  - đơn vị hiển thị/nhóm = DonViSoHuu (nhãn folder cấp 1) ?? DonViSoanThao
    const loaiVanBan: string = it.LoaiVanBanPhapLy ?? it.LoaiVanBan ?? 'Khác';
    const donViSoanThao: string = it.DonViSoHuu ?? it.DonViSoanThao ?? 'Khác';
    const trangThaiRaw: string = it.TrangThai ?? DocStatus.Active;
    const baoMatRaw: string = it.MucDoBaoMat ?? SecurityLevel.Internal;
    const ext: string = (it.File_x0020_Type ?? '').toLowerCase();

    // Build "view in browser" URL.
    // Cách đơn giản nhất + reliable: thêm ?web=1 vào EncodedAbsUrl.
    // Đây là chuẩn của SharePoint để force "open in browser" thay vì download.
    //   - .pdf: SP PDF viewer mở inline
    //   - .docx/.xlsx/.pptx: Office Online mở trong tab mới
    const browserViewableExts: string[] = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'];
    const isBrowserViewable: boolean = browserViewableExts.indexOf(ext) >= 0;
    let viewUrl: string = it.EncodedAbsUrl;
    if (isBrowserViewable && it.EncodedAbsUrl) {
      const separator: string = it.EncodedAbsUrl.indexOf('?') >= 0 ? '&' : '?';
      viewUrl = `${it.EncodedAbsUrl}${separator}web=1`;
    }

    return {
      id: String(it.Id),
      soVanBan: it.SoVanBan ?? '',
      trichYeu: it.TrichYeu ?? this._extractTrichYeuFromName(it.FileLeafRef),
      namBanHanh: it.NamBanHanh ?? this._yearFromDate(it.NgayBanHanh),
      loaiVanBan,
      loaiVanBanKey: LOAI_TO_KEY[loaiVanBan] ?? 'KHAC',
      donViSoanThao,
      donViCode: this._unitCode(it.DonViSoHuu, donViSoanThao),
      nguoiKy: '',  // NguoiKy chưa fill (cột person field)
      ngayBanHanh: this._isoDate(it.NgayBanHanh),
      ngayHetHieuLuc: it.NgayHetHieuLuc ? this._isoDate(it.NgayHetHieuLuc) : undefined,
      trangThai: this._mapStatus(trangThaiRaw),
      mucDoBaoMat: this._mapSecurity(baoMatRaw),
      fileKind: this._mapFileKind(ext),
      webUrl: viewUrl,
      serverRelativeUrl: it.FileRef,
      fileName: it.FileLeafRef,
      fileExt: ext ? `.${ext}` : '',
      fileSizeKB: undefined,  // SP REST không trả về size đơn giản, sẽ bổ sung Phase sau
      hasDocx: ext === 'doc' || ext === 'docx',
      hasPdf: ext === 'pdf',
      // ===== Metadata V2 (raw, để UI hiển thị / filter) =====
      nhomTaiLieu: it.NhomTaiLieu ?? undefined,
      loaiVanBanPhapLy: it.LoaiVanBanPhapLy ?? undefined,
      loaiTaiLieu: it.LoaiTaiLieu ?? undefined,
      chuDeNghiepVu: it.ChuDeNghiepVu ?? undefined,
      donViPhatHanh: it.DonViPhatHanh ?? undefined,
      donViSoHuu: it.DonViSoHuu ?? undefined,
      nguonMetadata: it.NguonMetadata ?? undefined,
      metadataConfidence: it.MetadataConfidence ?? undefined,
      vanBanThayThe: it.VanBanThayThe ?? undefined,
      vanBanLienQuan: it.VanBanLienQuan ?? undefined,
      tags: it.Tags ?? undefined,
      // Bản mềm khai báo qua cột (HasEditableSource/EditableSourceUrl) — fallback khi
      // không tìm thấy file DOCX cùng tên trong folder (xem _pairDocuments).
      editableSource: this._editableSourceFromColumns(it),
      folderUrl: this._folderUrl(it.EncodedAbsUrl, it.FileRef),
      editPropertiesUrl: this._editPropertiesUrl(it.Id)
    };
  }

  /**
   * Dựng IEditableSource từ cột HasEditableSource/EditableSourceUrl (nếu có khai báo).
   * BẤT BIẾN: không bao giờ throw (tránh làm hỏng toàn bộ load dữ liệu). Xử lý được cả
   * cột kiểu Text (string) lẫn Hyperlink (object {Url, Description}) và mọi giá trị lạ.
   */
  private _editableSourceFromColumns(it: ISPListItem): IEditableSource | undefined {
    try {
      const rawFlag: unknown = it.HasEditableSource;
      const flag: string = (typeof rawFlag === 'string' ? rawFlag : (rawFlag === true ? 'yes' : '')).toLowerCase();
      const declared: boolean = flag === 'yes' || flag === 'true' || flag === '1' || rawFlag === true;
      if (!declared) { return undefined; }
      // EditableSourceUrl: Text → string; Hyperlink → { Url, Description }.
      const url: string = this._asUrlString(it.EditableSourceUrl);
      if (!url) { return undefined; }
      const leaf: string = url.split('?')[0].split('/').slice(-1)[0] || 'Bản mềm';
      const extMatch: RegExpMatchArray | null = leaf.match(/\.([^.]+)$/);
      let fileName: string = leaf;
      try { fileName = decodeURIComponent(leaf); } catch { /* giữ nguyên */ }
      return {
        fileName,
        fileExt: extMatch ? `.${extMatch[1].toLowerCase()}` : '',
        webUrl: url,
        serverRelativeUrl: undefined,
        sizeKB: undefined
      };
    } catch {
      return undefined;
    }
  }

  /** Lấy URL dạng string từ giá trị cột (string Text, hoặc object Hyperlink {Url}). */
  private _asUrlString(raw: unknown): string {
    if (typeof raw === 'string') { return raw; }
    if (raw && typeof raw === 'object') {
      const u: unknown = (raw as { Url?: unknown }).Url;
      if (typeof u === 'string') { return u; }
    }
    return '';
  }

  /** URL mở thư mục chứa file (server-relative folder + origin từ EncodedAbsUrl). */
  private _folderUrl(absUrl: string | undefined, fileRef: string | undefined): string | undefined {
    if (!absUrl || !fileRef) { return undefined; }
    const m: RegExpMatchArray | null = absUrl.match(/^(https?:\/\/[^/]+)/);
    if (!m) { return undefined; }
    const origin: string = m[1];
    const parentFolder: string = fileRef.replace(/\/[^/]+$/, ''); // bỏ tên file
    if (!parentFolder) { return undefined; }
    return origin + encodeURI(parentFolder);
  }

  /** URL form Sửa thuộc tính (EditForm) của item — để sửa metadata trực tiếp. */
  private _editPropertiesUrl(id: number): string | undefined {
    if (!id && id !== 0) { return undefined; }
    // Forms/EditForm.aspx?ID=<id> dưới library; encode khoảng trắng trong tên library.
    const libPath: string = LIBRARY_TITLE.replace(/ /g, '%20');
    const source: string = encodeURIComponent(`${this._siteUrl}/${libPath}`);
    return `${this._siteUrl}/${libPath}/Forms/EditForm.aspx?ID=${id}&Source=${source}`;
  }

  /**
   * Mã đơn vị ổn định cho grouping/filter.
   * Ưu tiên mã [NN] trong DonViSoHuu (vd "[18] CĐ - Phòng Cơ điện" -> "18");
   * fallback bảng DON_VI_TO_CODE theo tên đầy đủ (V1); cuối cùng "KHAC".
   */
  private _unitCode(donViSoHuu: string | undefined, donViDisplay: string): string {
    if (donViSoHuu) {
      const m: RegExpMatchArray | null = donViSoHuu.match(/^\s*\[(\d{2}(?:\.\d{2})?)\]/);
      if (m) { return m[1]; }
    }
    return DON_VI_TO_CODE[donViDisplay] ?? 'KHAC';
  }

  private _isoDate(raw: string | undefined): string {
    if (!raw) { return ''; }
    // SP trả về "2026-05-15T00:00:00Z" → cắt thành "2026-05-15"
    return raw.substring(0, 10);
  }

  private _yearFromDate(raw: string | undefined): number {
    if (!raw) { return new Date().getFullYear(); }
    return parseInt(raw.substring(0, 4), 10) || new Date().getFullYear();
  }

  private _extractTrichYeuFromName(filename: string): string {
    if (!filename) { return ''; }
    // Bỏ extension và lấy phần "<trích yếu>"
    let stem: string = filename.replace(/\.[^.]+$/, '');
    // Bỏ pattern <số>.<năm>.<loại>-<đơn vị>- ở đầu
    stem = stem.replace(/^[^-]*-[^-]*-/, '');
    // Bỏ pattern ngày .DD-MM-YYYY ở cuối
    stem = stem.replace(/\.\d{1,2}[-.]\d{1,2}[-.]\d{4}.*$/, '');
    return stem.trim();
  }

  private _mapStatus(raw: string): DocStatus {
    switch (raw) {
      case 'Bản nháp':       return DocStatus.Draft;
      case 'Đang lưu hành':  return DocStatus.Active;
      case 'Hết hiệu lực':   return DocStatus.Expired;
      case 'Thu hồi':        return DocStatus.Revoked;
      default:               return DocStatus.Active;
    }
  }

  private _mapSecurity(raw: string): SecurityLevel {
    switch (raw) {
      case 'Công khai':  return SecurityLevel.Public;
      case 'Nội bộ':     return SecurityLevel.Internal;
      case 'Bảo mật':    return SecurityLevel.Confidential;
      case 'Tuyệt mật':  return SecurityLevel.TopSecret;
      default:           return SecurityLevel.Internal;
    }
  }

  private _mapFileKind(ext: string): FileKind {
    if (ext === 'pdf') { return 'pdf'; }
    if (ext === 'xlsx' || ext === 'xls') { return 'xlsx'; }
    return 'docx';
  }
}
// EOF — SharePointDmsService (v1.0.39.0)
