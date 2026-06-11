import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';
import { getCachedDocuments, invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError } from '@/lib/sharepoint/resolve';

export const dynamic = 'force-dynamic';

const SEP = '; ';

function splitRefs(s?: string): string[] {
  return (s ?? '').split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
}
function join(list: string[]): string {
  // Dedupe (không phân biệt hoa/thường), giữ thứ tự xuất hiện đầu tiên.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = x.toLowerCase();
    if (x && !seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out.join(SEP);
}

async function currentRelated(token: string, id: string): Promise<string[]> {
  const cached = await getCachedDocuments(token);
  const doc = cached.documents.find((d) => d.id === id);
  return splitRefs(doc?.vanBanLienQuan);
}

function badId(id: string): NextResponse | null {
  return /^\d+$/.test(id) ? null : NextResponse.json({ ok: false, error: 'id không hợp lệ.' }, { status: 400 });
}

// GET — danh sách SoVanBan liên quan hiện tại.
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  const id = (params.id ?? '').trim();
  const bad = badId(id);
  if (bad) {
    return bad;
  }
  try {
    const token = await getGraphAccessToken();
    return NextResponse.json({ ok: true, related: await currentRelated(token, id) });
  } catch (e) {
    return mapErr(e);
  }
}

// POST {soVanBan} — thêm 1 văn bản liên quan.
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return mutate(req, params.id, 'add');
}

// DELETE ?soVanBan= — gỡ 1 văn bản liên quan.
export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return mutate(req, params.id, 'remove');
}

async function mutate(req: Request, rawId: string, op: 'add' | 'remove'): Promise<NextResponse> {
  const id = (rawId ?? '').trim();
  const bad = badId(id);
  if (bad) {
    return bad;
  }
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }

  let soVanBan = '';
  if (op === 'add') {
    try {
      const body = (await req.json()) as { soVanBan?: string };
      soVanBan = (body.soVanBan ?? '').trim();
    } catch {
      return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
    }
  } else {
    soVanBan = (new URL(req.url).searchParams.get('soVanBan') ?? '').trim();
  }
  if (!soVanBan) {
    return NextResponse.json({ ok: false, error: 'Thiếu soVanBan.' }, { status: 422 });
  }

  try {
    const appToken = await getAppOnlyGraphToken();
    const existing = await currentRelated(appToken, id);
    let next: string[];
    if (op === 'add') {
      if (existing.some((x) => x.toLowerCase() === soVanBan.toLowerCase())) {
        return NextResponse.json({ ok: true, related: existing, unchanged: true });
      }
      next = [...existing, soVanBan];
    } else {
      next = existing.filter((x) => x.toLowerCase() !== soVanBan.toLowerCase());
    }
    const svc = new SharePointDmsService(appToken);
    await svc.setRelated(id, join(next));
    invalidateDocumentsCache('relations');
    return NextResponse.json({ ok: true, related: next });
  } catch (e) {
    return mapErr(e);
  }
}

function mapErr(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (e instanceof DmsWriteError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (e instanceof LibraryResolveError) {
    return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
  }
  if (e instanceof GraphError) {
    const status = e.status >= 400 && e.status < 600 ? e.status : 502;
    return NextResponse.json({ ok: false, error: `Cập nhật liên quan thất bại (Graph ${e.status}).` }, { status });
  }
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
}
