import { NextResponse } from 'next/server';
import { getGraphAccessToken, AuthError } from '@/lib/auth/token';
import { resolveSiteId, resolveListId } from '@/lib/sharepoint/resolve';
import { graphFetch, GraphError } from '@/lib/graph/client';
import { mapSharePointItemToDocument, GraphListItem } from '@/lib/dms/mapSharePointItemToDocument';
import { pairDocuments } from '@/lib/dms/pairDocuments';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 200;
const SAFETY_MAX = 2000; // giới hạn an toàn ban đầu

interface ItemsResponse {
  value: GraphListItem[];
  '@odata.nextLink'?: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const accessToken = await getGraphAccessToken();
    const site = await resolveSiteId(accessToken);
    const list = await resolveListId(accessToken);

    // Lấy fields (metadata) + driveItem (file info, webUrl, author/dates).
    const first =
      `/sites/${site.id}/lists/${list.id}/items` +
      `?$expand=fields,driveItem&$top=${PAGE_SIZE}`;

    const rawItems: GraphListItem[] = [];
    let nextUrl: string | undefined = first;
    let truncated = false;

    while (nextUrl) {
      const page: ItemsResponse = await graphFetch<ItemsResponse>(nextUrl, { accessToken });
      if (page.value && page.value.length) {
        rawItems.push(...page.value);
      }
      if (rawItems.length >= SAFETY_MAX) {
        truncated = true;
        break;
      }
      nextUrl = page['@odata.nextLink'];
    }

    // Chỉ giữ FILE (loại folder): item phải có driveItem.file.
    const fileItems = rawItems.filter((it) => it.driveItem && it.driveItem.file && !it.driveItem.folder);

    // Map -> IDocument, rồi áp PDF-first pairing (giống SharePointDmsService).
    const mapped = fileItems.map(mapSharePointItemToDocument);
    const documents = pairDocuments(mapped);

    return NextResponse.json({
      ok: true,
      count: documents.length,
      rawItemCount: rawItems.length,
      fileItemCount: fileItems.length,
      truncated,
      documents,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
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
