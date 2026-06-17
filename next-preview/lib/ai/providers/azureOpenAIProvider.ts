// AI-2B — Azure OpenAI provider (chat completions, JSON strict). Gọi bằng fetch REST — KHÔNG thêm SDK.
// CHỈ chạy khi service chọn (DMS_AI_PROVIDER=azure + đủ AZURE_OPENAI_*). Lỗi → THROW để service fallback RuleBased.
// KHÔNG log full text. KHÔNG auto-ghi metadata (route chỉ prefill).
//
// ENV: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION
import { MetadataSuggestionProvider, SuggestionInput } from '../provider';
import { MetadataSuggestion } from '../types';

const PHAPLY = ['Quyết định', 'Thông báo', 'Công văn', 'Tờ trình', 'Biên bản', 'Nghị quyết', 'Giấy ủy quyền'];
const LOAITL = ['Quy trình', 'Quy định', 'Quy chế', 'Hướng dẫn', 'Chính sách', 'Biểu mẫu', 'Tiêu chuẩn'];
// AI-7.1: CapLuuTru CHỈ được chọn đúng 1 giá trị trong danh sách cố định (KHÔNG tự tạo).
const CAPLUUTRU = [
  '[00] Văn Bản Điều Hành Chung', '[01] Tổng Giám Đốc', '[02] Giám Đốc Kinh Doanh',
  '[03] Giám Đốc Tài Chính và Quản Trị', '[04] Giám Đốc Vận Hành và Chuỗi Cung Ứng',
  '[05] Giám Đốc Sản Xuất - Kỹ Thuật', '[06.01] Phó Giám Đốc Thiết Bị', '[06.02] Phó Giám Đốc Sản Xuất - Kỹ Thuật',
  '[07] Ban Pháp Chế - Tuân Thủ', '[08] Ban Tài Chính - Kiểm Soát Nội Bộ', '[09] Ban S-H-E',
  '[10] Phòng Kỹ Thuật, Công Nghệ và Cải Tiến Sản Xuất', '[11] Phòng Vận Hành Kinh Doanh', '[12] Phòng Marketing',
  '[13] Phòng Kinh Doanh Bia Hơi', '[14] Phòng Kế Toán', '[15] Phòng Kế Hoạch - Vật Tư',
  '[16] Phòng Hành Chính - Nhân Sự', '[17] Phòng Kiểm Soát Chất Lượng - KCS', '[18] Phòng Cơ Điện',
  '[19] Kênh Phân Phối', '[20] Kênh Khách Hàng Tổ Chức', '[22] Trung Tâm Điều Hành',
  '[24] Phân Xưởng Sản Xuất Đông Mai', '[25] Phân Xưởng Cơ Điện - Động Lực Đông Mai',
  '[26] Phân Xưởng Sản Xuất Hạ Long', '[27] Phân Xưởng Cơ Điện - Động Lực Hạ Long',
  '[28] Văn Bản Đến', '[29] Văn Bản Đi', '[99] Archive',
];

const SYSTEM_PROMPT = [
  'Bạn là trợ lý phân loại văn bản hành chính tiếng Việt của hệ thống DMS.',
  'Từ TÊN FILE + TIÊU ĐỀ + NỘI DUNG trích (có thể bị cắt), hãy suy ra metadata.',
  'CHỈ trả về JSON đúng schema, KHÔNG giải thích, KHÔNG markdown.',
  'Trường nào không chắc → để null. KHÔNG bịa số văn bản/ngày.',
  `LoaiVanBanPhapLy chỉ thuộc: ${PHAPLY.join(', ')}.`,
  `LoaiTaiLieu chỉ thuộc: ${LOAITL.join(', ')}.`,
  'NgayBanHanh định dạng YYYY-MM-DD. confidence là số 0-100. reasoning là mảng câu ngắn, KHÔNG chứa nội dung nhạy cảm.',
  // AI-7.1: quy tắc trích metadata theo chuẩn BHL.
  'SoVanBan: CHỈ lấy PHẦN SỐ. Vd "591/2026/QĐ-HCNS" → SoVanBan="591"; "01/2026/HD-HCNS" → "01". TUYỆT ĐỐI KHÔNG ghép năm/loại/đơn vị/ký hiệu (đó là các field riêng).',
  'TrichYeu: mô tả NỘI DUNG VIỆC của văn bản (vd "Điều chuyển Nguyễn Thành Đoàn").',
  'ChuDeNghiepVu: NHÓM chủ đề NGẮN (vd "Nhân sự"), KHÔNG phải trích yếu dài.',
  'NguoiKy: tên NGƯỜI KÝ ở cuối văn bản (dưới chức danh TỔNG GIÁM ĐỐC/GIÁM ĐỐC/PHÓ GIÁM ĐỐC/TRƯỞNG PHÒNG...). Vd "TỔNG GIÁM ĐỐC\\nDoãn Trường Giang" → "Doãn Trường Giang". KHÔNG chắc → null.',
  'DonViPhatHanh: TÊN ĐẦY ĐỦ phòng/ban, suy từ ký hiệu/nơi nhận/chữ ký/phần lưu. Vd QĐ-HCNS → "Phòng Hành Chính - Nhân Sự"; TB-KCS → "Phòng Kiểm Soát Chất Lượng - KCS".',
  'DonViSoHuu: thường BẰNG DonViPhatHanh.',
  `CapLuuTru: CHỈ chọn ĐÚNG 1 giá trị NGUYÊN VĂN trong danh sách (KHÔNG tự tạo, KHÔNG trả mã/viết tắt): ${CAPLUUTRU.join(' | ')}. Map vd HCNS→"[16] Phòng Hành Chính - Nhân Sự", KCS→"[17] Phòng Kiểm Soát Chất Lượng - KCS", TTĐH→"[22] Trung Tâm Điều Hành". Nếu đã xác định được DonViPhatHanh/DonViSoHuu thì BẮT BUỘC thử map sang CapLuuTru trước khi trả null. Không xác định được → null.`,
  'NhomTaiLieu: văn bản nhân sự → "Tổ chức – Nhân sự".',
  'ƯU TIÊN NỘI DUNG văn bản hơn tên file; nếu nội dung và tên file MÂU THUẪN → theo NỘI DUNG.',
  'KHÔNG đoán bừa: thiếu dữ liệu thì để null, null tốt hơn dữ liệu sai.',
  'Schema: {SoVanBan,NamBanHanh,NgayBanHanh,NguoiKy,NhomTaiLieu,LoaiVanBanPhapLy,LoaiTaiLieu,ChuDeNghiepVu,DonViPhatHanh,DonViSoHuu,CapLuuTru,TrichYeu,confidence,reasoning}.',
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
      NguoiKy: str(j.NguoiKy),
      NhomTaiLieu: str(j.NhomTaiLieu),
      LoaiVanBanPhapLy: inSet(j.LoaiVanBanPhapLy, PHAPLY),
      LoaiTaiLieu: inSet(j.LoaiTaiLieu, LOAITL),
      ChuDeNghiepVu: str(j.ChuDeNghiepVu),
      DonViPhatHanh: str(j.DonViPhatHanh),
      DonViSoHuu: str(j.DonViSoHuu),
      CapLuuTru: inSet(j.CapLuuTru, CAPLUUTRU), // CHỈ nhận giá trị trong danh sách cố định
      TrichYeu: str(j.TrichYeu),
      confidence: conf === undefined ? 70 : Math.max(0, Math.min(100, Math.round(conf))),
      reasoning: reasoning.length ? reasoning : ['Azure OpenAI suy luận từ nội dung'],
      source: 'AzureOpenAI',
    };
    return suggestion;
  }
}
