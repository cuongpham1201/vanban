import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { AuthError } from '@/lib/auth/token';
import { getCachedDocuments, CachedDocs } from '@/lib/dms/documentsCache';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';
import { IDocument } from '@dms/models/IDocument';

export interface DocsForRequest {
  documents: IDocument[];
  orphanDocs: IDocument[];
  source: 'cache' | 'inflight' | 'graph';
  cached?: CachedDocs;
}

/**
 * Lấy documents (mapped + paired) cho API route, qua cache dùng chung.
 *  - Chưa đăng nhập → AuthError(401).
 *  - Web (Azure AD): dùng token delegated (session.accessToken).
 *  - Teams SSO (#31): KHÔNG có token delegated → app-only READ token. Cache documents là
 *    ORG-WIDE (mọi user đăng nhập đều có quyền Read DMS Library — DMS_PERMISSION_MODEL).
 */
export async function getDocsForRequest(forceRefresh = false): Promise<DocsForRequest> {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new AuthError('Chưa đăng nhập. Vui lòng đăng nhập bằng tài khoản Microsoft.', 401);
  }
  const accessToken = session.accessToken ?? (await getAppOnlyGraphTokenReadOnly());
  const cached = await getCachedDocuments(accessToken, forceRefresh);
  return { documents: cached.documents, orphanDocs: cached.orphanDocs, source: cached.source, cached };
}
