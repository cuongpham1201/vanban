import { IDmsService, IUploadRequest, IUploadResult } from './IDmsService';
import {
  IDocument,
  IUnitStat,
  IKpiStat,
  IDocSearchFilter,
  IMetadataChoices,
  IStorageFolder,
  DocStatus,
  SecurityLevel
} from '../models/IDocument';
import { FALLBACK_METADATA_CHOICES } from '../utils/metadataChoices';
import {
  RECENT_DOCUMENTS,
  EXPIRING_DOCUMENTS,
  UNIT_STATS,
  KPI_STATS
} from '../mock/mockData';

/**
 * In-memory implementation used during the UI-only phase.
 *
 * Every method returns a Promise (resolved synchronously) so that the calling
 * components already use the exact async flow they will need once a real
 * SharePoint-backed service is plugged in.
 */
export class MockDmsService implements IDmsService {
  public getRecentDocuments(): Promise<IDocument[]> {
    return Promise.resolve(RECENT_DOCUMENTS);
  }

  public getExpiringDocuments(): Promise<IDocument[]> {
    return Promise.resolve(EXPIRING_DOCUMENTS);
  }

  public getUnitStats(): Promise<IUnitStat[]> {
    return Promise.resolve(UNIT_STATS);
  }

  public getKpis(): Promise<IKpiStat[]> {
    return Promise.resolve(KPI_STATS);
  }

  public getAllDocuments(): Promise<IDocument[]> {
    return Promise.resolve(this._uniqueById([
      ...RECENT_DOCUMENTS,
      ...EXPIRING_DOCUMENTS
    ]));
  }

  public refreshDocuments(): Promise<IDocument[]> {
    return this.getAllDocuments();
  }

  public searchDocuments(filter: IDocSearchFilter): Promise<IDocument[]> {
    // Search across the combined recent + expiring sample set.
    const pool: IDocument[] = this._uniqueById([
      ...RECENT_DOCUMENTS,
      ...EXPIRING_DOCUMENTS
    ]);

    const keyword: string = (filter.keyword ?? '').trim().toLowerCase();

    const result: IDocument[] = pool.filter((doc: IDocument): boolean => {
      if (filter.typeKey && doc.loaiVanBanKey !== filter.typeKey) {
        return false;
      }
      if (filter.soVanBan && doc.soVanBan.toLowerCase().indexOf(filter.soVanBan.toLowerCase()) === -1) {
        return false;
      }
      if (filter.loaiVanBan && doc.loaiVanBan !== filter.loaiVanBan) {
        return false;
      }
      if (filter.donViCode && doc.donViCode !== filter.donViCode) {
        return false;
      }
      if (filter.nguoiKy && doc.nguoiKy.toLowerCase().indexOf(filter.nguoiKy.toLowerCase()) === -1) {
        return false;
      }
      if (filter.tuNgay && doc.ngayBanHanh < filter.tuNgay) {
        return false;
      }
      if (filter.denNgay && doc.ngayBanHanh > filter.denNgay) {
        return false;
      }
      if (keyword) {
        const haystack: string = [
          doc.soVanBan,
          doc.trichYeu,
          doc.loaiVanBan,
          doc.donViSoanThao,
          doc.donViCode,
          doc.nguoiKy
        ]
          .join(' ')
          .toLowerCase();
        if (haystack.indexOf(keyword) === -1) {
          return false;
        }
      }
      return true;
    });

    return Promise.resolve(result);
  }

  public updateMetadata(id: string, _values: { [internalName: string]: string }): Promise<IDocument | undefined> {
    // Mock: không ghi thật, chỉ trả lại document hiện có (dev mode).
    const pool: IDocument[] = this._uniqueById([...RECENT_DOCUMENTS, ...EXPIRING_DOCUMENTS]);
    for (let i: number = 0; i < pool.length; i++) {
      if (pool[i].id === id) { return Promise.resolve(pool[i]); }
    }
    return Promise.resolve(undefined);
  }

  public updateMetadataMany(
    ids: string[],
    _values: { [internalName: string]: string },
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: number; failed: number; errors: string[] }> {
    if (onProgress) { onProgress(ids.length, ids.length); }
    return Promise.resolve({ ok: ids.length, failed: 0, errors: [] });
  }

  public uploadDocument(req: IUploadRequest): Promise<IUploadResult> {
    // Mock: không ghi thật. Trả về 1 document giả dựng từ metadata để dev xem flow.
    const fakeDoc: IDocument = {
      id: `new-${Date.now()}`,
      soVanBan: req.metadata.SoVanBan ?? '',
      trichYeu: req.metadata.TrichYeu ?? req.fileName,
      namBanHanh: parseInt(req.metadata.NamBanHanh ?? '', 10) || new Date().getFullYear(),
      loaiVanBan: req.metadata.LoaiVanBanPhapLy ?? 'Khác',
      loaiVanBanKey: 'KHAC',
      donViSoanThao: req.capLuuTru,
      donViCode: 'KHAC',
      nguoiKy: '',
      ngayBanHanh: (req.metadata.NgayBanHanh ?? '').substring(0, 10),
      trangThai: DocStatus.Active,
      mucDoBaoMat: SecurityLevel.Internal,
      fileKind: 'pdf',
      fileName: req.fileName,
      nhomTaiLieu: req.metadata.NhomTaiLieu,
      donViSoHuu: req.capLuuTru
    };
    return Promise.resolve({ document: fakeDoc, oldDocUpdated: !!req.replacementOldId, warning: undefined });
  }

  public getMetadataChoices(): Promise<IMetadataChoices> {
    return Promise.resolve(FALLBACK_METADATA_CHOICES);
  }

  public getStorageFolders(): Promise<IStorageFolder[]> {
    // Mock: vài folder cấp 1 minh họa (gồm folder chưa có văn bản như [01]).
    return Promise.resolve([
      { name: '[00] Văn bản điều hành chung', itemCount: 0 },
      { name: '[01] Tổng Giám đốc', itemCount: 0 },
      { name: '[18] CĐ - Phòng Cơ điện', itemCount: 0 },
      { name: '[26] Phân Xưởng Sản Xuất Hạ Long', itemCount: 0 },
      { name: '[99] Archive', itemCount: 0 }
    ]);
  }

  public deleteDocument(_doc: IDocument): Promise<void> {
    // Mock: không xóa thật (dữ liệu là const module-level).
    return Promise.resolve();
  }

  public deleteDocuments(
    docs: IDocument[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: number; failed: number; errors: string[] }> {
    if (onProgress) { onProgress(docs.length, docs.length); }
    return Promise.resolve({ ok: docs.length, failed: 0, errors: [] });
  }

  public uploadEditableSource(doc: IDocument, _fileBuffer: ArrayBuffer, fileName: string): Promise<IDocument | undefined> {
    // Mock: trả lại doc với editableSource giả để dev xem flow.
    const ext: string = (fileName.match(/\.([^.]+)$/) || [])[1] ?? 'docx';
    const updated: IDocument = {
      ...doc,
      editableSource: { fileName, fileExt: `.${ext}`, webUrl: '#mock-editable', serverRelativeUrl: undefined }
    };
    return Promise.resolve(updated);
  }

  public linkEditableSource(doc: IDocument, editableSourceUrl: string): Promise<IDocument | undefined> {
    const updated: IDocument = {
      ...doc,
      editableSource: { fileName: 'Bản mềm (link)', fileExt: '', webUrl: editableSourceUrl, serverRelativeUrl: undefined }
    };
    return Promise.resolve(updated);
  }

  private _uniqueById(docs: IDocument[]): IDocument[] {
    const seen: Record<string, boolean> = {};
    const out: IDocument[] = [];
    for (const doc of docs) {
      if (!seen[doc.id]) {
        seen[doc.id] = true;
        out.push(doc);
      }
    }
    return out;
  }
}
