import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';
import { getCachedDocuments } from '@/lib/dms/documentsCache';
import { MockDmsService } from '@dms/services/MockDmsService';
import { IDocument } from '@dms/models/IDocument';

export const dynamic = 'force-dynamic';

const IS_DEV = process.env.NODE_ENV === 'development';

// GET /api/documents/[id] — read-only detail. Tìm trong cache dùng chung (documentsCache).
// Auth-protected (getServerSession). KHÔNG write SharePoint.
// Nhánh dev (NODE_ENV-gated, MockDmsService) chỉ để preview khi dev-login (không có Graph token);
// inert ở production (session thật luôn có accessToken). Không phụ thuộc/đụng các file dev-login.
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  // Next.js đã percent-decode dynamic param → dùng thẳng, KHÔNG decodeURIComponent lại
  // (double-decode sẽ ném URIError với id chứa "%"). Client encode 1 lần khi build URL.
  const id = params.id;
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    let documents: IDocument[];
    let source: string;
    if (IS_DEV && !session.accessToken) {
      documents = await new MockDmsService().getAllDocuments();
      source = 'mock-dev';
    } else if (!session.accessToken) {
      return NextResponse.json({ ok: false, error: 'Không lấy được access token Microsoft Graph.' }, { status: 401 });
    } else {
      const cached = await getCachedDocuments(session.accessToken);
      documents = cached.documents;
      source = cached.source;
    }

    const document = documents.find((d) => d.id === id);
    if (!document) {
      return NextResponse.json({ ok: false, error: `Không tìm thấy văn bản id ${id}.` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, source, document });
  } catch (err) {
    if (err instanceof LibraryResolveError) {
      return NextResponse.json({ ok: false, error: err.message, ...err.detail }, { status: err.status });
    }
    if (err instanceof GraphError) {
      return NextResponse.json(
        { ok: false, error: err.message, graph: { status: err.status, body: err.body } },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
