import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { randomUUID } from 'crypto';
import { authOptions } from '@/lib/auth/options';
import { suggestMetadata, getActiveProviderName } from '@/lib/ai/metadataSuggestionService';
import { MetadataSuggestion } from '@/lib/ai/types';
import { SuggestionInput } from '@/lib/ai/provider';
import { buildSuggestionAudit, suggestedFieldKeys } from '@/lib/ai/audit';
import { extractDocumentText, ExtractResult } from '@/lib/ai/extract';
import { appendSuggestion, pickAuditFields } from '@/lib/ai/auditStore';

export const dynamic = 'force-dynamic';

// Chỉ tài khoản đúng domain công ty mới được gọi (defense-in-depth, khớp middleware/writeGuard).
const ALLOWED_DOMAIN = '@' + ((process.env.ALLOWED_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'biahalong.com');

// Rate limit CƠ BẢN: fixed-window theo user (in-memory, theo tiến trình). Mặc định 30 req / 60s.
const RL_WINDOW_MS = 60_000;
const RL_MAX = Number(process.env.DMS_AI_RATE_LIMIT_PER_MIN) > 0 ? Number(process.env.DMS_AI_RATE_LIMIT_PER_MIN) : 30;
const _g = globalThis as unknown as { __aiSuggestRL?: Map<string, { count: number; resetAt: number }> };
_g.__aiSuggestRL ??= new Map();
const RL: Map<string, { count: number; resetAt: number }> = _g.__aiSuggestRL;

/** Trả {ok, retryAfter} — chặn nếu vượt ngưỡng trong cửa sổ. */
function rateLimit(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const e = RL.get(key);
  if (!e || now >= e.resetAt) {
    RL.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (e.count >= RL_MAX) {
    return { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  }
  e.count++;
  return { ok: true, retryAfter: 0 };
}

// POST /api/ai/metadata-suggest — gợi ý metadata (giai đoạn nền tảng: RuleBased, KHÔNG gọi AI thật).
// READ-ONLY/compute: KHÔNG ghi SharePoint, KHÔNG đổi schema/auth. Yêu cầu đăng nhập (như các route khác).
//
// Body: { fileName?: string, title?: string, textContent?: string }
// Resp: { success: true, suggestion: MetadataSuggestion } | { success: false, error: string }
interface SuggestResponse {
  success: boolean;
  suggestion?: MetadataSuggestion;
  // AI-3: id audit record để client tham chiếu khi publish (gọi /api/ai/feedback). undefined nếu ghi audit lỗi.
  auditId?: string;
  // AI-7: trạng thái trích text (để UI/log biết pdf-scan cần OCR, .doc cần LibreOffice, ...).
  extract?: { kind: ExtractResult['kind']; ok: boolean; charCount: number; reason?: string };
  error?: string;
}

const MAX_TEXT = 20000; // chặn payload quá lớn

// Validation thủ công (zod chưa có trong deps — tránh thêm package ở giai đoạn nền tảng).
const INVALID = Symbol('invalid');
/** undefined = không có; INVALID = sai kiểu; string = hợp lệ. */
function asStr(v: unknown): string | undefined | typeof INVALID {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return INVALID;
  return v;
}

function parseInput(body: unknown): { value?: SuggestionInput; error?: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Body phải là JSON object.' };
  }
  const b = body as Record<string, unknown>;
  const fileName = asStr(b.fileName);
  const title = asStr(b.title);
  const textContent = asStr(b.textContent);
  if (fileName === INVALID) return { error: "Trường 'fileName' phải là chuỗi." };
  if (title === INVALID) return { error: "Trường 'title' phải là chuỗi." };
  if (textContent === INVALID) return { error: "Trường 'textContent' phải là chuỗi." };

  const value: SuggestionInput = {
    fileName: fileName?.slice(0, 400),
    documentTitle: title?.slice(0, 1000),
    textContent: textContent?.slice(0, MAX_TEXT),
  };
  if (!value.fileName && !value.documentTitle && !value.textContent) {
    return { error: 'Cần ít nhất 1 trong: fileName, title, textContent.' };
  }
  return { value };
}

export async function POST(req: Request): Promise<NextResponse<SuggestResponse>> {
  // 1) Auth.
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email ?? '').toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  // 2) Domain guard.
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return NextResponse.json({ success: false, error: 'Tài khoản ngoài tổ chức.' }, { status: 403 });
  }
  // 3) Rate limit cơ bản theo user.
  const rl = rateLimit(email);
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: `Quá nhiều yêu cầu, thử lại sau ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  // Hỗ trợ 2 luồng: JSON (fileName/title/textContent) HOẶC multipart (file=docx + fileName + title).
  const contentType = req.headers.get('content-type') ?? '';
  let input: SuggestionInput;
  let textChars = 0;
  let extract: ExtractResult | undefined; // AI-7: trạng thái trích text (kind/ok/charCount/reason)

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ success: false, error: 'Body không phải multipart hợp lệ.' }, { status: 400 });
    }
    const file = form.get('file');
    const fileName = ((form.get('fileName') as string | null) ?? (file instanceof File ? file.name : '')).trim();
    const title = ((form.get('title') as string | null) ?? '').trim();
    let textContent = '';
    if (file instanceof File && file.size > 0) {
      // AI-7: router trích text (.docx/.doc qua LibreOffice/.pdf text-layer; pdf-scan → cần OCR sau).
      // BEST-EFFORT: lỗi/không hỗ trợ → text rỗng, AI vẫn fallback filename/title.
      const buf = Buffer.from(await file.arrayBuffer());
      extract = await extractDocumentText({ fileName: file.name, mimeType: file.type, buffer: buf });
      textContent = extract.text;
      textChars = extract.charCount;
    }
    input = {
      fileName: fileName.slice(0, 400) || undefined,
      documentTitle: title.slice(0, 1000) || undefined,
      textContent: textContent || undefined,
    };
    if (!input.fileName && !input.documentTitle && !input.textContent) {
      return NextResponse.json({ success: false, error: 'Cần file/fileName/title.' }, { status: 422 });
    }
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
    }
    const parsed = parseInput(body);
    if (parsed.error || !parsed.value) {
      return NextResponse.json({ success: false, error: parsed.error ?? 'Input không hợp lệ.' }, { status: 422 });
    }
    input = parsed.value;
    textChars = input.textContent?.length ?? 0;
  }

  try {
    const suggestion = await suggestMetadata(input);
    // Audit STRUCTURE (chưa lưu DB/SharePoint) — log để quan sát + sẵn sàng cho list audit sau.
    const audit = buildSuggestionAudit({ requestId: randomUUID(), timestamp: new Date().toISOString(), suggestion });
    // eslint-disable-next-line no-console
    console.log('[ai-metadata-suggest]', JSON.stringify({
      requestId: audit.requestId,
      by: email,
      provider: getActiveProviderName(),
      source: suggestion.source,
      confidence: suggestion.confidence,
      textChars, // CHỈ số ký tự, KHÔNG log nội dung
      extractKind: extract?.kind, // AI-7: docx/doc/pdf-text/pdf-scan/...
      extractReason: extract?.reason,
      suggestedFields: suggestedFieldKeys(suggestion),
    }));
    // AI-3: ghi audit record (BEST-EFFORT — lỗi I/O KHÔNG làm hỏng response gợi ý).
    let auditId: string | undefined;
    try {
      const rec = await appendSuggestion({
        userEmail: email,
        source: suggestion.source === 'AzureOpenAI' ? 'AzureOpenAI' : 'RuleBased',
        fileName: input.fileName ?? '',
        confidence: suggestion.confidence,
        aiSuggestion: pickAuditFields(suggestion as unknown as Record<string, unknown>),
      });
      auditId = rec.id;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-audit] append suggestion failed', e instanceof Error ? e.message : String(e));
    }
    return NextResponse.json({
      success: true,
      suggestion,
      auditId,
      ...(extract ? { extract: { kind: extract.kind, ok: extract.ok, charCount: extract.charCount, reason: extract.reason } } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[ai-metadata-suggest] error', JSON.stringify({ by: email, error: msg }));
    return NextResponse.json({ success: false, error: 'Không tạo được gợi ý metadata.' }, { status: 500 });
  }
}
