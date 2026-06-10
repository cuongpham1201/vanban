// Template renderer — thay placeholder {{field}} bằng giá trị ngữ cảnh.
// THUẦN (pure) — KHÔNG side-effect, dùng được cả client (live preview) lẫn server.
//
// Quy tắc:
//   - {{field}} → context[field] nếu có giá trị (sau trim); thiếu/rỗng → "—".
//   - Placeholder không hợp lệ → "—" (không để lộ token thô).
//   - Trim 2 đầu kết quả (giữ nguyên xuống dòng bên trong cho detail nhiều dòng).
//   - opts.html=true → escape giá trị thay vào (chống injection khi render vào HTML email).
//     Phần text tĩnh của template KHÔNG được chứa HTML (đã chặn ở validate) nên không escape.

import { NotificationTemplateContext } from './templateConstants';

const MISSING = '—';
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderOptions {
  /** Escape giá trị thay vào để an toàn khi nhúng HTML (email). */
  html?: boolean;
}

/**
 * Render 1 chuỗi template với ngữ cảnh.
 * @example renderNotificationTemplate('{{soVanBan}} - {{trichYeu}}', ctx)
 */
export function renderNotificationTemplate(
  template: string,
  context: NotificationTemplateContext,
  opts: RenderOptions = {}
): string {
  if (!template) return '';
  const out = template.replace(PLACEHOLDER_RE, (_m, rawKey: string) => {
    const key = rawKey as keyof NotificationTemplateContext;
    const raw = context[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return MISSING;
    return opts.html ? escapeHtml(value) : value;
  });
  return out.trim();
}

/** Trích danh sách field placeholder dùng trong 1 hoặc nhiều template (để hiển thị "Fields used"). */
export function extractTemplateFields(...templates: string[]): string[] {
  const set = new Set<string>();
  for (const t of templates) {
    if (!t) continue;
    let m: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(t)) !== null) {
      set.add(m[1]);
    }
  }
  return [...set];
}
