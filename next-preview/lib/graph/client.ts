const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class GraphError extends Error {
  status: number;
  statusText: string;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`Graph ${status} ${statusText} — ${body}`);
    this.name = 'GraphError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export interface GraphFetchOptions extends RequestInit {
  /** Access token Microsoft Graph (delegated). Bắt buộc. */
  accessToken: string;
}

/**
 * Gọi Microsoft Graph.
 *  - `pathOrUrl` là relative path ("/sites/...") → prefix https://graph.microsoft.com/v1.0
 *  - hoặc full URL (vd từ "@odata.nextLink") → gọi trực tiếp.
 * Ném GraphError với status/statusText/body rõ ràng khi lỗi.
 */
export async function graphFetch<T = unknown>(
  pathOrUrl: string,
  options: GraphFetchOptions
): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(headers ?? {}),
    },
    // API route chạy server-side; không cache để luôn lấy dữ liệu mới.
    cache: 'no-store',
  });

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '<no body>';
    }
    // eslint-disable-next-line no-console
    console.error(`[graph] ${rest.method ?? 'GET'} ${url} -> ${res.status} ${res.statusText}\n${body}`);
    throw new GraphError(res.status, res.statusText, body);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  return (await res.json()) as T;
}
