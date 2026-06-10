// Helper chuẩn hóa lỗi cho admin/notification API.
// MỤC ĐÍCH: KHÔNG bao giờ trả 5xx cho lỗi nghiệp vụ/Graph/provision — vì reverse proxy
// production (nginx) hay thay body 5xx bằng trang HTML lỗi → client res.json() gặp "<!DOCTYPE"
// → "Unexpected token '<'". Trả JSON với status ≤ 499 để body luôn đến client nguyên vẹn.
//
// Quy tắc status: chỉ giữ 4xx (400–499) khi truyền rõ (auth/validation); mọi trường hợp khác
// (5xx, không set) → ép về 200 + { ok:false, error, detail? }. Luôn log [admin-api][route].

import { NextResponse } from 'next/server';

export interface FailOptions {
  status?: number;
  detail?: string;
  cause?: unknown;
  extra?: Record<string, unknown>;
}

export function failJson(route: string, message: string, opts: FailOptions = {}): NextResponse {
  const status = opts.status && opts.status >= 400 && opts.status < 500 ? opts.status : 200;
  // eslint-disable-next-line no-console
  console.error(
    `[admin-api][${route}] error`,
    JSON.stringify({
      message,
      status,
      detail: opts.detail,
      cause: opts.cause instanceof Error ? opts.cause.message : opts.cause !== undefined ? String(opts.cause) : undefined,
    })
  );
  return NextResponse.json(
    { ok: false, error: message, ...(opts.detail ? { detail: opts.detail } : {}), ...(opts.extra ?? {}) },
    { status }
  );
}

/** Nhận diện lỗi Graph thiếu quyền (permission/consent) để hiển thị thông điệp sạch. */
export function isPermissionError(text: string | undefined): boolean {
  if (!text) return false;
  return /\b403\b|permission|consent|FullControl|Manage\.All|accessdenied|unauthorized/i.test(text);
}
