// Phase 10D.3 — Idempotency tối thiểu (in-memory, TTL) chống double-submit/F5/retry.
// Key = userEmail + idempotencyKey. KHÔNG cần DB; reset khi restart tiến trình (chấp nhận được).

interface Entry {
  state: 'pending' | 'done';
  value?: unknown;
  exp: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 phút
const store = new Map<string, Entry>();

function k(email: string, key: string): string {
  return `${email.toLowerCase().trim()}::${key.trim()}`;
}

function sweep(): void {
  const now = Date.now();
  for (const [key, e] of store) {
    if (e.exp < now) {
      store.delete(key);
    }
  }
}

export type IdemLookup =
  | { state: 'new' }
  | { state: 'pending' }
  | { state: 'done'; value: unknown };

/** Tra cứu + đánh dấu 'pending' nếu là request mới (atomic trong 1 tiến trình). */
export function idemBegin(email: string, key: string): IdemLookup {
  sweep();
  const id = k(email, key);
  const existing = store.get(id);
  if (existing) {
    return existing.state === 'done' ? { state: 'done', value: existing.value } : { state: 'pending' };
  }
  store.set(id, { state: 'pending', exp: Date.now() + TTL_MS });
  return { state: 'new' };
}

/** Lưu kết quả thành công để replay (F5/retry trả lại kết quả cũ). */
export function idemComplete(email: string, key: string, value: unknown): void {
  store.set(k(email, key), { state: 'done', value, exp: Date.now() + TTL_MS });
}

/** Bỏ đánh dấu khi xử lý lỗi (cho phép thử lại). */
export function idemRelease(email: string, key: string): void {
  store.delete(k(email, key));
}
