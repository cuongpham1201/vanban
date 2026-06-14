// Rule-based metadata suggestion provider — dùng quy tắc Metadata V2 hiện có (prefix loại VB,
// cụm "Ban hành ...", năm/ngày). KHÔNG gọi AI. Deterministic, không side-effect.
import { MetadataSuggestionProvider, SuggestionInput } from '../provider';
import { MetadataSuggestion } from '../types';

// Mã loại VB pháp lý → nhãn. ORDER quan trọng: mã dài/đặc thù test TRƯỚC (TTr trước TT, GUQ trước UQ).
const PHAPLY_CODES: { code: string; label: string }[] = [
  { code: 'TTr', label: 'Tờ trình' },
  { code: 'GUQ', label: 'Giấy ủy quyền' },
  { code: 'QĐ', label: 'Quyết định' },
  { code: 'QD', label: 'Quyết định' },
  { code: 'TB', label: 'Thông báo' },
  { code: 'CV', label: 'Công văn' },
  { code: 'BB', label: 'Biên bản' },
  { code: 'NQ', label: 'Nghị quyết' },
  { code: 'TT', label: 'Tờ trình' },
  { code: 'UQ', label: 'Giấy ủy quyền' },
];

// Cụm "Ban hành ..." → LoaiTaiLieu.
const LOAITAILIEU_PHRASES: { phrase: string; label: string }[] = [
  { phrase: 'ban hành quy trình', label: 'Quy trình' },
  { phrase: 'ban hành quy định', label: 'Quy định' },
  { phrase: 'ban hành quy chế', label: 'Quy chế' },
  { phrase: 'ban hành hướng dẫn', label: 'Hướng dẫn' },
  { phrase: 'ban hành chính sách', label: 'Chính sách' },
  { phrase: 'ban hành biểu mẫu', label: 'Biểu mẫu' },
];

/** Tìm mã loại VB như 1 TOKEN (không phải letter bao quanh) để tránh khớp nhầm trong từ khác. */
function matchPhapLyCode(haystack: string): { code: string; label: string } | null {
  for (const { code, label } of PHAPLY_CODES) {
    // (?<![letter]) CODE (?![letter]) — \p{L} gồm cả Đ.
    const re = new RegExp(`(?<![\\p{L}])${code}(?![\\p{L}])`, 'u');
    if (re.test(haystack)) {
      return { code, label };
    }
  }
  return null;
}

/** Trích ngày dd-mm-yyyy / dd.mm.yyyy / dd/mm/yyyy hoặc yyyy-mm-dd → ISO yyyy-mm-dd. */
function extractIsoDate(s: string): string | undefined {
  let m = /(\d{1,2})[-./](\d{1,2})[-./]((?:19|20)\d{2})/.exec(s);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  m = /((?:19|20)\d{2})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
  if (m) {
    const mm = m[2].padStart(2, '0');
    const dd = m[3].padStart(2, '0');
    return `${m[1]}-${mm}-${dd}`;
  }
  return undefined;
}

/** Năm ban hành 19xx/20xx đầu tiên trong chuỗi. */
function extractYear(s: string): number | undefined {
  const m = /(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/.exec(s);
  return m ? Number(m[1]) : undefined;
}

export class RuleBasedProvider implements MetadataSuggestionProvider {
  async suggest(input: SuggestionInput): Promise<MetadataSuggestion> {
    const fileName = (input.fileName ?? '').trim();
    const title = (input.documentTitle ?? '').trim();
    const text = (input.textContent ?? '').trim();
    // Haystack giữ dấu (để khớp cụm tiếng Việt) + bản lowercase cho khớp cụm "ban hành ...".
    const haystack = [fileName, title, text].filter(Boolean).join(' ');
    const lower = haystack.toLowerCase();

    const suggestion: MetadataSuggestion = { confidence: 40, reasoning: [], source: 'RuleBased' };
    const reasoning = suggestion.reasoning;
    let signals = 0;

    // 1) LoaiVanBanPhapLy theo prefix mã.
    const phaply = matchPhapLyCode(haystack);
    if (phaply) {
      suggestion.LoaiVanBanPhapLy = phaply.label;
      reasoning.push(`Phát hiện mã "${phaply.code}"`);
      reasoning.push(`Map → ${phaply.label}`);
      signals += 2; // tín hiệu mạnh
    }

    // 2) LoaiTaiLieu theo cụm "Ban hành ...".
    for (const { phrase, label } of LOAITAILIEU_PHRASES) {
      if (lower.includes(phrase)) {
        suggestion.LoaiTaiLieu = label;
        reasoning.push(`Phát hiện cụm "${phrase}" → ${label}`);
        signals += 1;
        break;
      }
    }

    // 3) Ngày + năm ban hành.
    const iso = extractIsoDate(haystack);
    if (iso) {
      suggestion.NgayBanHanh = iso;
      suggestion.NamBanHanh = Number(iso.slice(0, 4));
      reasoning.push(`Trích ngày ban hành ${iso}`);
      signals += 1;
    } else {
      const year = extractYear(haystack);
      if (year) {
        suggestion.NamBanHanh = year;
        reasoning.push(`Trích năm ${year}`);
        signals += 1;
      }
    }

    // 4) Trích yếu: ưu tiên tiêu đề người dùng cung cấp.
    if (title) {
      suggestion.TrichYeu = title;
      reasoning.push('Dùng tiêu đề làm gợi ý trích yếu');
    }

    // Confidence: mạnh=100 (có prefix loại VB + có năm/ngày), vừa=80 (có prefix), yếu=60 (1 tín hiệu phụ), 40 (không gì).
    if (phaply && (suggestion.NamBanHanh || suggestion.NgayBanHanh)) {
      suggestion.confidence = 100;
    } else if (phaply) {
      suggestion.confidence = 80;
    } else if (signals >= 1) {
      suggestion.confidence = 60;
    } else {
      suggestion.confidence = 40;
      reasoning.push('Không phát hiện tín hiệu rõ ràng từ tên file/tiêu đề');
    }

    return suggestion;
  }
}
