// AI-2B — Azure OpenAI provider (chat completions, JSON strict). Gọi bằng fetch REST — KHÔNG thêm SDK.
// CHỈ chạy khi service chọn (DMS_AI_PROVIDER=azure + đủ AZURE_OPENAI_*). Lỗi → THROW để service fallback RuleBased.
// KHÔNG log full text. KHÔNG auto-ghi metadata (route chỉ prefill).
//
// ENV: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION
import { MetadataSuggestionProvider, SuggestionInput } from '../provider';
import { MetadataSuggestion } from '../types';

const PHAPLY = ['Quyết định', 'Thông báo', 'Công văn', 'Tờ trình', 'Biên bản', 'Nghị quyết', 'Giấy ủy quyền'];
const LOAITL = ['Quy trình', 'Quy định', 'Quy chế', 'Hướng dẫn', 'Chính sách', 'Biểu mẫu', 'Tiêu chuẩn'];

const SYSTEM_PROMPT = [
  'Bạn là trợ lý phân loại văn bản hành chính tiếng Việt của hệ thống DMS.',
  'Từ TÊN FILE + TIÊU ĐỀ + NỘI DUNG trích (có thể bị cắt), hãy suy ra metadata.',
  'CHỈ trả về JSON đúng schema, KHÔNG giải thích, KHÔNG markdown.',
  'Trường nào không chắc → để null. KHÔNG bịa số văn bản/ngày.',
  `LoaiVanBanPhapLy chỉ thuộc: ${PHAPLY.join(', ')}.`,
  `LoaiTaiLieu chỉ thuộc: ${LOAITL.join(', ')}.`,
  'NgayBanHanh định dạng YYYY-MM-DD. confidence là số 0-100. reasoning là mảng câu ngắn, KHÔNG chứa nội dung nhạy cảm.',
  'Schema: {SoVanBan,NamBanHanh,NgayBanHanh,NhomTaiLieu,LoaiVanBanPhapLy,LoaiTaiLieu,ChuDeNghiepVu,DonViPhatHanh,DonViSoHuu,TrichYeu,confidence,reasoning}.',
].join(' ');

interface AzureCfg {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}
function cfg(): AzureCfg {
  return {
    endpoint: (process.env.AZURE_OPENAI_ENDPOINT ?? '').trim().replace(/\/+$/, ''),
    apiKey: (process.env.AZURE_OPENAI_API_KEY ?? '').trim(),
    deployment: (process.env.AZURE_OPENAI_DEPLOYMENT ?? '').trim(),
    apiVersion: (process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview').trim(),
  };
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s : undefined;
}
function inSet(v: unknown, set: string[]): string | undefined {
  const s = str(v);
  return s && set.includes(s) ? s : undefined;
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function fetchJsonWithRetry(url: string, init: RequestInit, timeoutMs = 20000, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      // 429/5xx → retry; 4xx khác → trả luôn (caller throw).
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error('azure fetch failed');
}

export class AzureOpenAIProvider implements MetadataSuggestionProvider {
  async suggest(input: SuggestionInput): Promise<MetadataSuggestion> {
    const c = cfg();
    if (!c.endpoint || !c.apiKey || !c.deployment) {
      throw new Error('AzureOpenAI chưa cấu hình đủ (endpoint/apiKey/deployment).');
    }
    const url = `${c.endpoint}/openai/deployments/${encodeURIComponent(c.deployment)}/chat/completions?api-version=${encodeURIComponent(c.apiVersion)}`;
    const userPayload = {
      fileName: input.fileName ?? '',
      title: input.documentTitle ?? '',
      textContent: input.textContent ?? '',
    };
    const res = await fetchJsonWithRetry(url, {
      method: 'POST',
      headers: { 'api-key': c.apiKey, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        temperature: 0,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      throw new Error(`AzureOpenAI HTTP ${res.status}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AzureOpenAI trả về rỗng.');
    }
    const j = JSON.parse(content) as Record<string, unknown>; // throw nếu không phải JSON → service fallback

    const reasoning = Array.isArray(j.reasoning)
      ? (j.reasoning as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 8)
      : [];
    const conf = num(j.confidence);
    const suggestion: MetadataSuggestion = {
      SoVanBan: str(j.SoVanBan),
      NamBanHanh: num(j.NamBanHanh),
      NgayBanHanh: str(j.NgayBanHanh),
      NhomTaiLieu: str(j.NhomTaiLieu),
      LoaiVanBanPhapLy: inSet(j.LoaiVanBanPhapLy, PHAPLY),
      LoaiTaiLieu: inSet(j.LoaiTaiLieu, LOAITL),
      ChuDeNghiepVu: str(j.ChuDeNghiepVu),
      DonViPhatHanh: str(j.DonViPhatHanh),
      DonViSoHuu: str(j.DonViSoHuu),
      TrichYeu: str(j.TrichYeu),
      confidence: conf === undefined ? 70 : Math.max(0, Math.min(100, Math.round(conf))),
      reasoning: reasoning.length ? reasoning : ['Azure OpenAI suy luận từ nội dung'],
      source: 'AzureOpenAI',
    };
    return suggestion;
  }
}
