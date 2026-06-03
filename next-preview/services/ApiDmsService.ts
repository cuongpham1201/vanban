// ApiDmsService — implement IDmsService phía CLIENT cho chế độ Graph (read-only).
// Fetch toàn bộ documents qua /api/documents (server gọi Microsoft Graph), rồi tính
// KPI / recent / expiring / unit-stats / search / folders client-side bằng logic đã port.
// MỌI thao tác GHI đều bị disable trong phase này.
import {
  IDmsService,
  IUploadRequest,
  IUploadResult,
} from '@dms/services/IDmsService';
import {
  IDocument,
  IUnitStat,
  IKpiStat,
  IDocSearchFilter,
  IMetadataChoices,
  IStorageFolder,
} from '@dms/models/IDocument';
import { FALLBACK_METADATA_CHOICES } from '@dms/utils/metadataChoices';
import {
  computeKpis,
  computeRecent,
  computeExpiring,
  computeUnitStats,
  computeStorageFolders,
  searchDocuments as deriveSearch,
} from '@/lib/dms/derive';

const READONLY_MSG = 'Read-only Graph preview: write operation is not implemented yet.';

interface DocumentsApiResponse {
  ok: boolean;
  count?: number;
  documents?: IDocument[];
  error?: string;
}

export class ApiDmsService implements IDmsService {
  private _cache: IDocument[] | undefined;

  private async _fetchAll(): Promise<IDocument[]> {
    const res = await fetch('/api/documents', { credentials: 'same-origin' });
    let json: DocumentsApiResponse;
    try {
      json = (await res.json()) as DocumentsApiResponse;
    } catch {
      throw new Error(`/api/documents trả về không phải JSON (HTTP ${res.status}).`);
    }
    if (!res.ok || !json.ok) {
      throw new Error(json?.error ?? `/api/documents lỗi HTTP ${res.status}.`);
    }
    return json.documents ?? [];
  }

  public async getAllDocuments(): Promise<IDocument[]> {
    if (this._cache) {
      return this._cache;
    }
    this._cache = await this._fetchAll();
    return this._cache;
  }

  public async refreshDocuments(): Promise<IDocument[]> {
    this._cache = undefined;
    this._cache = await this._fetchAll();
    return this._cache;
  }

  public async getRecentDocuments(): Promise<IDocument[]> {
    return computeRecent(await this.getAllDocuments());
  }

  public async getExpiringDocuments(): Promise<IDocument[]> {
    return computeExpiring(await this.getAllDocuments());
  }

  public async getUnitStats(): Promise<IUnitStat[]> {
    return computeUnitStats(await this.getAllDocuments());
  }

  public async getStorageFolders(): Promise<IStorageFolder[]> {
    return computeStorageFolders(await this.getAllDocuments());
  }

  public async getKpis(): Promise<IKpiStat[]> {
    return computeKpis(await this.getAllDocuments());
  }

  public async searchDocuments(filter: IDocSearchFilter): Promise<IDocument[]> {
    return deriveSearch(await this.getAllDocuments(), filter);
  }

  public async getMetadataChoices(): Promise<IMetadataChoices> {
    // Read-only preview: dùng fallback choices (không gọi /lists/{id}/columns ở phase này).
    return FALLBACK_METADATA_CHOICES;
  }

  // ===== WRITE — disabled trong phase read-only =====
  public async updateMetadata(): Promise<IDocument | undefined> {
    throw new Error(READONLY_MSG);
  }
  public async updateMetadataMany(): Promise<{ ok: number; failed: number; errors: string[] }> {
    throw new Error(READONLY_MSG);
  }
  public async uploadDocument(_req: IUploadRequest): Promise<IUploadResult> {
    throw new Error(READONLY_MSG);
  }
  public async deleteDocument(): Promise<void> {
    throw new Error(READONLY_MSG);
  }
  public async deleteDocuments(): Promise<{ ok: number; failed: number; errors: string[] }> {
    throw new Error(READONLY_MSG);
  }
  public async uploadEditableSource(): Promise<IDocument | undefined> {
    throw new Error(READONLY_MSG);
  }
  public async linkEditableSource(): Promise<IDocument | undefined> {
    throw new Error(READONLY_MSG);
  }
}
