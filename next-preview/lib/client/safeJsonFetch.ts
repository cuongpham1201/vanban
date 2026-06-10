// Safe JSON fetch (client) — KHÔNG bao giờ ném "Unexpected token '<'".
// Đọc res.text() trước, thử JSON.parse; nếu body là HTML/không-JSON (vd proxy trả trang lỗi 5xx)
// → trả parseError sạch tiếng Việt thay vì để JSON.parse ném lỗi thô ra UI.

export interface SafeJsonResult<T> {
  /** res.ok (HTTP 2xx). */
  httpOk: boolean;
  status: number;
  /** JSON đã parse, hoặc null nếu body rỗng/không phải JSON. */
  data: T | null;
  /** Thông điệp lỗi sạch khi mất kết nối hoặc body không phải JSON. undefined nếu parse JSON OK. */
  parseError?: string;
}

export async function safeJsonFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeJsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'same-origin', ...init });
  } catch (e) {
    return {
      httpOk: false,
      status: 0,
      data: null,
      parseError: `Không kết nối được máy chủ. (${e instanceof Error ? e.message : String(e)})`,
    };
  }

  const text = await res.text().catch(() => '');
  if (!text) {
    // Body rỗng: 204 hợp lệ → không lỗi; còn lại coi như không có dữ liệu.
    return { httpOk: res.ok, status: res.status, data: null, parseError: res.ok ? undefined : `Máy chủ trả lỗi HTTP ${res.status}. Kiểm tra PM2 log.` };
  }

  try {
    const data = JSON.parse(text) as T;
    return { httpOk: res.ok, status: res.status, data };
  } catch {
    // Body không phải JSON (thường là trang HTML "<!DOCTYPE…" do proxy chèn khi 5xx).
    return {
      httpOk: false,
      status: res.status,
      data: null,
      parseError: `Máy chủ trả lỗi HTTP ${res.status}. Kiểm tra PM2 log.`,
    };
  }
}
