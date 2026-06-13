// A7 — Helper retry/timeout CHỈ dùng cho 2 route proxy PDF (/api/documents/[id]/file,
// /api/files/pdf-preview). KHÔNG đổi graphFetch toàn hệ thống.
//  - Timeout mỗi lần fetch: 15s (AbortController).
//  - Retry tối đa 3 lần, backoff 500ms → 1000ms → 2000ms.
//  - CHỈ retry lỗi TẠM THỜI: network/timeout (fetch failed, ECONN*, socket, abort), HTTP 429, HTTP 5xx.
//  - KHÔNG retry lỗi XÁC ĐỊNH: 400/401/403/404/415…
//  - KHÔNG log full downloadUrl (chứa token tạm) — chỉ log host.
import { GraphError } from '@/lib/graph/client';

export const PDF_PROXY_TIMEOUT_MS = 15000;
const BACKOFF_MS = [500, 1000, 2000]; // 3 lần retry

/** Lỗi proxy PDF đã phân loại → route map thẳng sang HTTP + message thân thiện. */
export class PdfProxyError extends Error {
  phase: string;
  httpStatus: number;
  userMessage: string;
  constructor(phase: string, httpStatus: number, userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = 'PdfProxyError';
    this.phase = phase;
    this.httpStatus = httpStatus;
    this.userMessage = userMessage;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

const NET_MSG = 'Lỗi mạng tạm thời khi tải PDF. Vui lòng thử lại.';
const UPSTREAM_MSG = 'SharePoint/Graph tạm thời không phản hồi. Vui lòng thử lại.';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid-url)';
  }
}

/** Lỗi tầng kết nối (undici): fetch failed / ECONN* / socket / timeout(abort). */
export function isNetworkError(err: unknown): boolean {
  if (!err) {
    return false;
  }
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e.name === 'AbortError') {
    return true;
  }
  const msg = `${e.message ?? ''} ${e.cause?.message ?? ''} ${e.cause?.code ?? ''}`.toLowerCase();
  return /fetch failed|network|socket|econn|etimedout|eai_again|und_err|terminated|aborted/.test(msg);
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

interface RetryMeta {
  documentId: string;
  phase: 'driveItem' | 'stream' | string;
  downloadUrlHost?: string;
}

function logAttempt(meta: RetryMeta, attempt: number, status: number | null, err?: unknown): void {
  const e = err as { name?: string; message?: string; cause?: unknown } | undefined;
  // eslint-disable-next-line no-console
  console.warn('[pdf-proxy]', {
    documentId: meta.documentId,
    phase: meta.phase,
    attempt,
    status,
    downloadUrlHost: meta.downloadUrlHost,
    errorName: e?.name,
    errorMessage: e?.message,
    cause: e?.cause ? String((e.cause as { message?: string })?.message ?? e.cause) : undefined,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Bọc 1 lời gọi Graph (vd graphFetch driveItem) với retry cho lỗi tạm thời.
 * GraphError 4xx (khác 429) → ném NGAY (không retry). Hết retry → PdfProxyError.
 */
export async function graphCallWithRetry<T>(fn: () => Promise<T>, meta: RetryMeta): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err instanceof GraphError ? err.status : null;
      logAttempt(meta, attempt, status, err);
      const transientHttp = err instanceof GraphError && isTransientStatus(err.status);
      const net = !(err instanceof GraphError) && isNetworkError(err);
      if (!transientHttp && !net) {
        throw err; // lỗi xác định (404/415/401/403…) hoặc lỗi lạ → không retry
      }
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
    }
  }
  const net = !(lastErr instanceof GraphError) && isNetworkError(lastErr);
  throw new PdfProxyError(meta.phase, net ? 504 : 503, net ? NET_MSG : UPSTREAM_MSG, lastErr);
}

/**
 * Fetch nội dung (stream PDF) với timeout + retry. Trả Response:
 *  - res.ok → trả ngay.
 *  - 4xx xác định → trả Response cho caller tự map (vd 404).
 *  - 429/5xx hoặc network/timeout → retry; hết retry → ném PdfProxyError.
 */
export async function fetchPdfWithRetry(url: string, meta: RetryMeta): Promise<Response> {
  const m: RetryMeta = { ...meta, downloadUrlHost: hostOf(url) };
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PDF_PROXY_TIMEOUT_MS);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        return res;
      }
      logAttempt(m, attempt, res.status);
      if (isTransientStatus(res.status)) {
        if (attempt < BACKOFF_MS.length) {
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        throw new PdfProxyError(m.phase, 503, UPSTREAM_MSG);
      }
      return res; // 4xx xác định → caller map
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof PdfProxyError) {
        throw err;
      }
      lastErr = err;
      logAttempt(m, attempt, null, err);
      if (isNetworkError(err) && attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      if (isNetworkError(err)) {
        throw new PdfProxyError(m.phase, 504, NET_MSG, err);
      }
      throw err; // lỗi lạ → caller xử lý
    }
  }
  throw new PdfProxyError(m.phase, 504, NET_MSG, lastErr);
}
