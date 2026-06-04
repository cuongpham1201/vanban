// Phase 10C — Permission guard server-side cho DMS write (chưa expose UI).
//
// Thứ tự kiểm tra (fail sớm, message rõ):
//   1. Write flag tắt        → 403 "DMS write is disabled"
//   2. Chưa đăng nhập        → 401 "not authenticated"
//   3. Email ngoài domain    → 403 "write not allowed"
//   4. Không thuộc allowlist  → 403 "write not allowed"
//
// Allowlist tạm thời qua env (giai đoạn đầu, trước khi dùng SharePoint group):
//   DMS_WRITE_ALLOWED_EMAILS=a@biahalong.com,b@biahalong.com
// Env trống → KHÔNG ai được write (an toàn mặc định).
import type { Session } from 'next-auth';
import { isDmsWriteEnabled, DMS_WRITE_DISABLED_MSG } from './writeConfig';

export class DmsWriteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DmsWriteError';
    this.status = status;
  }
}

const ALLOWED_DOMAIN = '@' + ((process.env.ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'biahalong.com');

/** Danh sách email được phép write (đọc từ env, lowercased). Rỗng = không ai. */
export function getWriteAllowlist(): string[] {
  return (process.env.DMS_WRITE_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function emailOf(session: Session | null): string {
  return (session?.user?.email ?? '').toLowerCase().trim();
}

/** True nếu email thuộc domain công ty + nằm trong allowlist (và flag bật + có session). */
export function canWriteDms(session: Session | null): boolean {
  if (!isDmsWriteEnabled() || !session) {
    return false;
  }
  const email = emailOf(session);
  if (!email || !email.endsWith(ALLOWED_DOMAIN)) {
    return false;
  }
  return getWriteAllowlist().includes(email);
}

/**
 * Bảo vệ mọi write API tương lai. Ném DmsWriteError với status chuẩn:
 *   403 write disabled · 401 not authenticated · 403 write not allowed.
 * KHÔNG phụ thuộc UI. Gọi ở đầu mỗi route ghi (Phase 10D+).
 */
export function assertCanWriteDms(session: Session | null): void {
  if (!isDmsWriteEnabled()) {
    throw new DmsWriteError(DMS_WRITE_DISABLED_MSG, 403);
  }
  if (!session) {
    throw new DmsWriteError('not authenticated', 401);
  }
  const email = emailOf(session);
  if (!email || !email.endsWith(ALLOWED_DOMAIN)) {
    throw new DmsWriteError('write not allowed', 403);
  }
  if (!getWriteAllowlist().includes(email)) {
    throw new DmsWriteError('write not allowed', 403);
  }
}
