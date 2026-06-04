// Phase 10C — Write Infrastructure Foundation: feature flag cho DMS write.
//
// Mặc định TẮT. Production nếu KHÔNG set env → write disabled.
// CHỈ đọc ở server (process.env) — không expose ra client (không dùng NEXT_PUBLIC_).
//
// Bật write: đặt env  DMS_WRITE_ENABLED=true  (sandbox trước, production sau khi rollout).

export const DMS_WRITE_DISABLED_MSG = 'DMS write is disabled';

/** Chỉ true khi env DMS_WRITE_ENABLED === 'true' (so khớp tường minh, mặc định false). */
export function isDmsWriteEnabled(): boolean {
  return (process.env.DMS_WRITE_ENABLED ?? '').trim().toLowerCase() === 'true';
}
