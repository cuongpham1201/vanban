// Rule-based metadata suggestion provider (AI-1, nâng cấp). Parse từ TÊN FILE/tiêu đề:
//   - SoVanBan (nhiều định dạng), LoaiVanBanPhapLy (mã), Ngày/Năm, LoaiTaiLieu (cụm), TrichYeu, ChuDeNghiepVu.
// KHÔNG gọi AI/mạng. Deterministic, không side-effect.
import { MetadataSuggestionProvider, SuggestionInput } from '../provider';
import { MetadataSuggestion } from '../types';
import { removeVietnameseDiacritics } from '@/lib/dms/fileNaming';

// Mã loại VB pháp lý (alt cho regex). ORDER: mã dài/đặc thù trước (TTr trước TT, GUQ trước UQ, QĐ trước QD).
const CODES = ['TTr', 'GUQ', 'QĐ', 'QD', 'TB', 'CV', 'BB', 'NQ', 'TT', 'UQ'];
const CODE_ALT = CODES.join('|');
const CODE_LABEL: Record<string, string> = {
  TTr: 'Tờ trình', TT: 'Tờ trình', GUQ: 'Giấy ủy quyền', UQ: 'Giấy ủy quyền',
  QĐ: 'Quyết định', QD: 'Quyết định', TB: 'Thông báo', CV: 'Công văn', BB: 'Biên bản', NQ: 'Nghị quyết',
};

// LoaiTaiLieu: ascii(không dấu) → nhãn. (match cả khi tên file bỏ dấu.)
const LOAI_TL: { a: string; label: string }[] = [
  { a: 'quy trinh', label: 'Quy trình' },
  { a: 'quy dinh', label: 'Quy định' },
  { a: 'quy che', label: 'Quy chế' },
  { a: 'huong dan', label: 'Hướng dẫn' },
  { a: 'chinh sach', label: 'Chính sách' },
  { a: 'bieu mau', label: 'Biểu mẫu' },
  { a: 'tieu chuan', label: 'Tiêu chuẩn' },
];

function ascii(s: string): string {
  return removeVietnameseDiacritics(s ?? '').toLowerCase();
}
function stripExt(name: string): string {
  return (name ?? '').replace(/\.[^.]+$/, '');
}

/** Mã loại VB như 1 token. */
function matchCode(raw: string): { code: string; label: string } | null {
  for (const code of CODES) {
    const re = new RegExp(`(?<![\\p{L}])${code}(?![\\p{L}])`, 'u');
    if (re.test(raw)) {
      return { code, label: CODE_LABEL[code] };
    }
  }
  return null;
}

/** Số văn bản — thử nhiều định dạng, trả chuỗi đã khớp (giữ nguyên). */
function parseSoVanBan(raw: string): string | undefined {
  const pats = [
    new RegExp(`(\\d{1,4}\\.\\d{4}\\.(?:${CODE_ALT})(?:-[\\p{L}]+)?)`, 'iu'), // 295.2026.QĐ-HCNS
    new RegExp(`((?:${CODE_ALT})-?\\d{2,4}\\/\\d{1,4})`, 'iu'),               // QĐ-2024/142
    new RegExp(`(\\d{1,4}\\/(?:${CODE_ALT})(?:-[\\p{L}]+)?)`, 'iu'),          // 142/QĐ-BHL
    new RegExp(`((?:${CODE_ALT})[-./ ]?\\d{1,4}\\/\\d{2,4})`, 'iu'),          // QĐ-142/2024
  ];
  for (const re of pats) {
    const m = re.exec(raw);
    if (m) {
      return m[1].trim();
    }
  }
  return undefined;
}

const DATE_RE = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/]((?:19|20)\d{2})\b/; // dd.mm.yyyy
const DATE_ISO_RE = /\b((?:19|20)\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/; // yyyy-mm-dd
function parseDate(raw: string): string | undefined {
  let m = DATE_RE.exec(raw);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = DATE_ISO_RE.exec(raw);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return undefined;
}
function parseYear(raw: string): number | undefined {
  const m = /(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/.exec(raw);
  return m ? Number(m[1]) : undefined;
}

/** LoaiTaiLieu: cụm xuất hiện sớm nhất trong tên file/tiêu đề. */
function parseLoaiTaiLieu(a: string): { a: string; label: string } | null {
  let best: { a: string; label: string } | null = null;
  let bestIdx = Infinity;
  for (const it of LOAI_TL) {
    const idx = a.indexOf(it.a);
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      best = it;
    }
  }
  return best;
}

/** TrichYeu từ tên file: bỏ số VB / ngày / mã, gộp separator. */
function deriveTrichYeu(raw: string, soVanBan?: string): string | undefined {
  let s = raw;
  if (soVanBan) {
    s = s.split(soVanBan).join(' ');
  }
  s = s.replace(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/g, ' ')
       .replace(/\b(?:19|20)\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, ' ')
       .replace(new RegExp(`(?<![\\p{L}])(?:${CODE_ALT})(?![\\p{L}])`, 'giu'), ' ')
       .replace(/[_]+/g, ' ')
       .replace(/\s*[-/.]\s*/g, ' ')
       .replace(/\s+/g, ' ')
       .replace(/^[^\p{L}]+/u, '')
       .trim();
  return s.length >= 3 ? s : undefined;
}

/** ChuDeNghiepVu = phần sau "Ban hành <loại tài liệu>" (hoặc sau "<loại tài liệu>"). */
function deriveChuDe(trichYeu: string | undefined, loaiAscii: string | undefined): string | undefined {
  if (!trichYeu || !loaiAscii) {
    return undefined;
  }
  const a = ascii(trichYeu);
  let cut = -1;
  const bh = a.indexOf('ban hanh ' + loaiAscii);
  if (bh >= 0) {
    cut = bh + ('ban hanh ' + loaiAscii).length;
  } else {
    const p = a.indexOf(loaiAscii);
    if (p >= 0) {
      cut = p + loaiAscii.length;
    }
  }
  if (cut < 0) {
    return undefined;
  }
  const chude = trichYeu.slice(cut).replace(/^[^\p{L}]+/u, '').trim();
  return chude.length >= 2 ? chude : undefined;
}

export class RuleBasedProvider implements MetadataSuggestionProvider {
  async suggest(input: SuggestionInput): Promise<MetadataSuggestion> {
    const raw = stripExt((input.fileName ?? '').trim());
    const title = (input.documentTitle ?? '').trim();
    const a = ascii(`${raw} ${title}`);

    const s: MetadataSuggestion = { confidence: 40, reasoning: [], source: 'RuleBased' };
    const r = s.reasoning;

    // 1) Số văn bản.
    const soVanBan = parseSoVanBan(raw);
    if (soVanBan) {
      s.SoVanBan = soVanBan;
      r.push(`Số văn bản: "${soVanBan}"`);
    }
    // 2) Loại VB pháp lý.
    const phaply = matchCode(raw);
    if (phaply) {
      s.LoaiVanBanPhapLy = phaply.label;
      r.push(`Mã "${phaply.code}" → ${phaply.label}`);
    }
    // 3) Ngày / năm ban hành.
    const iso = parseDate(raw);
    if (iso) {
      s.NgayBanHanh = iso;
      s.NamBanHanh = Number(iso.slice(0, 4));
      r.push(`Ngày ban hành ${iso}`);
    } else {
      const y = parseYear(raw);
      if (y) {
        s.NamBanHanh = y;
        r.push(`Năm ${y}`);
      }
    }
    // 4) Loại tài liệu.
    const loai = parseLoaiTaiLieu(a);
    if (loai) {
      s.LoaiTaiLieu = loai.label;
      r.push(`Loại tài liệu: ${loai.label}`);
    }
    // 5) Trích yếu (ưu tiên tiêu đề; nếu không thì suy từ tên file).
    const trichYeu = title || deriveTrichYeu(raw, soVanBan);
    if (trichYeu) {
      s.TrichYeu = trichYeu;
      r.push(title ? 'Trích yếu lấy từ tiêu đề' : 'Trích yếu suy từ tên file');
    }
    // 6) Chủ đề nghiệp vụ = phần sau "Ban hành <loại tài liệu>".
    const chude = deriveChuDe(trichYeu, loai?.a);
    if (chude) {
      s.ChuDeNghiepVu = chude;
      r.push(`Chủ đề nghiệp vụ: ${chude}`);
    }

    // 7) Confidence.
    const hasDateOnly = !soVanBan && !phaply && !loai && (!!iso || s.NamBanHanh !== undefined);
    if (soVanBan && phaply && trichYeu && loai) {
      s.confidence = 88;
    } else if (phaply && soVanBan && loai) {
      s.confidence = 82;
    } else if (phaply && (soVanBan || loai)) {
      s.confidence = 78;
    } else if (phaply) {
      s.confidence = 72;
    } else if (soVanBan || loai) {
      s.confidence = 60;
    } else if (hasDateOnly) {
      s.confidence = 60; // chỉ có ngày/năm → tối đa 60
    } else {
      s.confidence = 40;
      r.push('Không đủ tín hiệu rõ ràng');
    }
    return s;
  }
}
