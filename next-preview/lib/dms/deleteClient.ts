// Client helper gọi API xóa văn bản. Dùng chung bởi Search + Detail.
export interface DeleteResult {
  ok: boolean;
  deleted?: string[];
  skipped?: string[];
  warnings?: string[];
  error?: string;
}

export interface BulkItemResult {
  id: string;
  ok: boolean;
  deleted?: string[];
  error?: string;
}

export async function deleteDocument(id: string): Promise<DeleteResult> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  const j = (await res.json().catch(() => ({}))) as DeleteResult;
  if (!res.ok || !j.ok) {
    return { ok: false, error: j?.error ?? `Xóa thất bại (HTTP ${res.status}).` };
  }
  return j;
}

export async function bulkDeleteDocuments(ids: string[]): Promise<{ ok: boolean; results?: BulkItemResult[]; error?: string }> {
  const res = await fetch('/api/documents/bulk-delete', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok: boolean; results?: BulkItemResult[]; error?: string };
  if (!res.ok || !j.ok) {
    return { ok: false, error: j?.error ?? `Xóa hàng loạt thất bại (HTTP ${res.status}).` };
  }
  return j;
}
