// AI-3 — Suggestion Audit Store (SERVER-ONLY). Lưu lại MỌI suggestion AI + feedback (accepted/sửa)
// vào 1 file JSON local trong dev: <cwd>/data/ai-audit.json. KHÔNG DB, KHÔNG SharePoint.
// Mục đích: nền tảng theo dõi độ chính xác AI theo thời gian + continuous improvement sau này.
// BEST-EFFORT: lỗi I/O KHÔNG throw ra ngoài luồng gọi (không làm hỏng /api/ai/metadata-suggest).
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/** 6 field metadata cốt lõi mà AI gợi ý (subset của MetadataSuggestion). */
export interface AuditMetadataFields {
  SoVanBan?: string;
  LoaiVanBanPhapLy?: string;
  LoaiTaiLieu?: string;
  ChuDeNghiepVu?: string;
  TrichYeu?: string;
  NamBanHanh?: number;
}

export interface SuggestionAuditRecord {
  id: string;
  createdAt: string;
  userEmail: string;
  source: 'AzureOpenAI' | 'RuleBased';
  fileName: string;
  aiSuggestion: AuditMetadataFields;
  finalMetadata?: AuditMetadataFields;
  confidence?: number;
  accepted?: boolean;
  // Thời điểm nhận feedback (publish) — để biết record đã có phản hồi hay chưa.
  feedbackAt?: string;
}

// File lưu local (theo cwd của tiến trình Next = thư mục app next-preview).
const AUDIT_FILE = path.join(process.cwd(), 'data', 'ai-audit.json');

// 4 field CHÍNH dùng để tính accepted (so AI vs metadata cuối khi publish).
export const ACCEPTANCE_KEY_FIELDS: (keyof AuditMetadataFields)[] = [
  'LoaiVanBanPhapLy',
  'LoaiTaiLieu',
  'ChuDeNghiepVu',
  'TrichYeu',
];

// ── Ghi tuần tự (mutex in-process) tránh race read-modify-write ───────────────
let _lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = _lock.then(() => fn());
  _lock = result.catch(() => undefined);
  return result;
}

/** Đọc toàn bộ record. File thiếu/hỏng → [] (không throw). */
export async function readAllAudits(): Promise<SuggestionAuditRecord[]> {
  try {
    const raw = await fs.readFile(AUDIT_FILE, 'utf8');
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as SuggestionAuditRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(records: SuggestionAuditRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(AUDIT_FILE), { recursive: true });
  await fs.writeFile(AUDIT_FILE, JSON.stringify(records, null, 2), 'utf8');
}

/** Chuẩn hóa giá trị field để so sánh accepted (trim; số → string). */
function norm(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/** Lọc về đúng 6 field audit (bỏ field thừa từ MetadataSuggestion). */
export function pickAuditFields(src: Record<string, unknown>): AuditMetadataFields {
  const out: AuditMetadataFields = {};
  if (typeof src.SoVanBan === 'string') out.SoVanBan = src.SoVanBan;
  if (typeof src.LoaiVanBanPhapLy === 'string') out.LoaiVanBanPhapLy = src.LoaiVanBanPhapLy;
  if (typeof src.LoaiTaiLieu === 'string') out.LoaiTaiLieu = src.LoaiTaiLieu;
  if (typeof src.ChuDeNghiepVu === 'string') out.ChuDeNghiepVu = src.ChuDeNghiepVu;
  if (typeof src.TrichYeu === 'string') out.TrichYeu = src.TrichYeu;
  if (typeof src.NamBanHanh === 'number') out.NamBanHanh = src.NamBanHanh;
  return out;
}

export interface AppendSuggestionInput {
  userEmail: string;
  source: 'AzureOpenAI' | 'RuleBased';
  fileName: string;
  confidence?: number;
  aiSuggestion: AuditMetadataFields;
}

/** Ghi 1 suggestion mới (chưa có feedback). Trả record đã tạo (có id) để client tham chiếu khi publish. */
export async function appendSuggestion(input: AppendSuggestionInput): Promise<SuggestionAuditRecord> {
  const record: SuggestionAuditRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    userEmail: input.userEmail,
    source: input.source,
    fileName: input.fileName,
    aiSuggestion: input.aiSuggestion,
    confidence: input.confidence,
  };
  await withLock(async () => {
    const all = await readAllAudits();
    all.push(record);
    await writeAll(all);
  });
  return record;
}

/** So 4 field chính giữa AI suggestion và metadata cuối → accepted? */
export function computeAccepted(ai: AuditMetadataFields, final: AuditMetadataFields): boolean {
  return ACCEPTANCE_KEY_FIELDS.every((k) => norm(ai[k]) === norm(final[k]));
}

/**
 * Feedback loop (khi user publish): so AI suggestion vs metadata cuối → set accepted + lưu finalMetadata.
 * Trả record sau cập nhật, hoặc null nếu không tìm thấy id. BEST-EFFORT (không throw).
 */
export async function recordFeedback(id: string, finalMetadata: AuditMetadataFields): Promise<SuggestionAuditRecord | null> {
  return withLock(async () => {
    const all = await readAllAudits();
    const idx = all.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const rec = all[idx];
    // finalMetadata đã được caller (route /api/ai/feedback) lọc qua pickAuditFields → dùng trực tiếp.
    rec.finalMetadata = finalMetadata;
    rec.accepted = computeAccepted(rec.aiSuggestion, rec.finalMetadata);
    rec.feedbackAt = new Date().toISOString();
    all[idx] = rec;
    await writeAll(all);
    return rec;
  });
}
