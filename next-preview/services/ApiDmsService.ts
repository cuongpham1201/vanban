// ApiDmsService — IDmsService phía CLIENT, chế độ Graph READ-ONLY.
// P0: in-flight promise dedupe — nhiều caller đồng thời dùng CHUNG 1 promise (1 fetch).
// P3: dashboard methods gọi /api/dashboard (aggregate); getAllDocuments gọi /api/documents
//     (cần cho list/search/facets). Cả 2 endpoint share server cache → ≤1 Graph fetch/đợt.
// Write ops: disabled (throw).
import { IDmsService, IUploadRequest, IUploadResult } from '@dms/services/IDmsService';
import {
  IDocument,
  IUnitStat,
  IKpiStat,
  IDocSearchFilter,
  IMetadataChoices,
  IStorageFolder,
} from '@dms/models/IDocument';
import { FALLBACK_METADATA_CHOICES } from '@dms/utils/metadataChoices';
import { searchDocuments as deriveSearch } from '@/lib/dms/derive';

const READONLY_MSG = 'Read-only Graph preview: write operation is not implemented yet.';

interface DocumentsApiResponse {
  ok: boolean;
  documents?: IDocument[];
  error?: string;
}
interface DashboardApiResponse {
  ok: boolean;
  kpis?: IKpiStat[];
  recentDocuments?: IDocument[];
  expiringDocuments?: IDocument[];
  storageStats?: IUnitStat[];
  storageFolders?: IStorageFolder[];
  error?: string;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class ApiDmsService implements IDmsService {
  // /api/documents (full list)
  private _docsCache: IDocument[] | undefined;
  private _docsInflight: Promise<IDocument[]> | undefined;
  // /api/dashboard (aggregate)
  private _dashCache: DashboardApiResponse | undefined;
  private _dashInflight: Promise<DashboardApiResponse> | undefined;

  // ---------- /api/documents (P0 dedupe) ----------
  private async _doFetchDocs(force: boolean): Promise<IDocument[]> {
    const res = await fetch(`/api/documents${force ? '?force=1' : ''}`, { credentials: 'same-origin' });
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

  private _getDocs(force = false): Promise<IDocument[]> {
    if (!force && this._docsCache) {
      // eslint-disable-next-line no-console
      console.log('[PERF] client getAllDocuments: cache');
      return Promise.resolve(this._docsCache);
    }
    if (!force && this._docsInflight) {
      // eslint-disable-next-line no-console
      console.log('[PERF] client getAllDocuments: reuse-inflight');
      return this._docsInflight;
    }
    // eslint-disable-next-line no-console
    console.log('[PERF] client getAllDocuments: fetch');
    const t0 = now();
    const p = this._doFetchDocs(force)
      .then((docs) => {
        this._docsCache = docs;
        // eslint-disable-next-line no-console
        console.log(`[PERF] client getAllDocuments: done ${(now() - t0).toFixed(0)}ms (${docs.length} docs)`);
        return docs;
      })
      .finally(() => {
        if (this._docsInflight === p) {
          this._docsInflight = undefined;
        }
      });
    this._docsInflight = p;
    return p;
  }

  // ---------- /api/dashboard (P0 dedupe) ----------
  private async _doFetchDashboard(): Promise<DashboardApiResponse> {
    const res = await fetch('/api/dashboard', { credentials: 'same-origin' });
    let json: DashboardApiResponse;
    try {
      json = (await res.json()) as DashboardApiResponse;
    } catch {
      throw new Error(`/api/dashboard trả về không phải JSON (HTTP ${res.status}).`);
    }
    if (!res.ok || !json.ok) {
      throw new Error(json?.error ?? `/api/dashboard lỗi HTTP ${res.status}.`);
    }
    return json;
  }

  private _getDashboard(force = false): Promise<DashboardApiResponse> {
    if (!force && this._dashCache) {
      // eslint-disable-next-line no-console
      console.log('[PERF] client getDashboard: cache');
      return Promise.resolve(this._dashCache);
    }
    if (!force && this._dashInflight) {
      // eslint-disable-next-line no-console
      console.log('[PERF] client getDashboard: reuse-inflight');
      return this._dashInflight;
    }
    // eslint-disable-next-line no-console
    console.log('[PERF] client getDashboard: fetch');
    const t0 = now();
    const p = this._doFetchDashboard()
      .then((d) => {
        this._dashCache = d;
        // eslint-disable-next-line no-console
        console.log(`[PERF] client getDashboard: done ${(now() - t0).toFixed(0)}ms`);
        return d;
      })
      .finally(() => {
        if (this._dashInflight === p) {
          this._dashInflight = undefined;
        }
      });
    this._dashInflight = p;
    return p;
  }

  // ---------- IDmsService (read) ----------
  public getAllDocuments(): Promise<IDocument[]> {
    return this._getDocs(false);
  }

  public async refreshDocuments(): Promise<IDocument[]> {
    this._docsCache = undefined;
    this._dashCache = undefined;
    const docs = await this._getDocs(true); // force → bỏ qua cache server (?force=1)
    this._dashCache = undefined; // dashboard sẽ refetch khi cần
    return docs;
  }

  // Dashboard aggregates → /api/dashboard (KHÔNG kéo full docs để dựng dashboard).
  public async getKpis(): Promise<IKpiStat[]> {
    return (await this._getDashboard()).kpis ?? [];
  }
  public async getRecentDocuments(): Promise<IDocument[]> {
    return (await this._getDashboard()).recentDocuments ?? [];
  }
  public async getExpiringDocuments(): Promise<IDocument[]> {
    return (await this._getDashboard()).expiringDocuments ?? [];
  }
  public async getUnitStats(): Promise<IUnitStat[]> {
    return (await this._getDashboard()).storageStats ?? [];
  }
  public async getStorageFolders(): Promise<IStorageFolder[]> {
    return (await this._getDashboard()).storageFolders ?? [];
  }

  // Search/list cần full docs (facets) → /api/documents (deduped + cached).
  public async searchDocuments(filter: IDocSearchFilter): Promise<IDocument[]> {
    return deriveSearch(await this._getDocs(false), filter);
  }

  public async getMetadataChoices(): Promise<IMetadataChoices> {
    return FALLBACK_METADATA_CHOICES;
  }

  // ---------- WRITE — disabled ----------
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
