// AI Suggestion audit — STRUCTURE ONLY. Giai đoạn này CHƯA lưu SharePoint/DB.
// Dùng để chuẩn hóa dữ liệu audit (so sánh field gợi ý vs field user chấp nhận/ghi đè) cho phase sau.
import { MetadataSuggestion, SuggestionSource } from './types';

export interface SuggestionAudit {
  requestId: string;
  provider: SuggestionSource;
  confidence: number;
  /** Các field model gợi ý (có giá trị). */
  suggestedFields: string[];
  /** Field user GIỮ NGUYÊN theo gợi ý (chấp nhận). */
  acceptedFields: string[];
  /** Field user SỬA khác gợi ý (ghi đè). */
  overriddenFields: string[];
  timestamp: string; // ISO
}

/** Field metadata có giá trị trong 1 suggestion (bỏ confidence/reasoning/source). */
export function suggestedFieldKeys(s: MetadataSuggestion): string[] {
  const META_KEYS: (keyof MetadataSuggestion)[] = [
    'SoVanBan', 'NamBanHanh', 'NgayBanHanh', 'NhomTaiLieu', 'LoaiVanBanPhapLy', 'LoaiTaiLieu',
    'ChuDeNghiepVu', 'DonViPhatHanh', 'DonViSoHuu', 'TrangThai', 'MucDoBaoMat', 'TrichYeu',
  ];
  return META_KEYS.filter((k) => {
    const v = s[k];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
}

/**
 * Dựng audit (PURE — không lưu). Caller truyền requestId + timestamp + giá trị cuối user chấp nhận
 * (finalValues) để tính accepted/overridden so với gợi ý.
 */
export function buildSuggestionAudit(args: {
  requestId: string;
  timestamp: string;
  suggestion: MetadataSuggestion;
  finalValues?: Record<string, unknown>;
}): SuggestionAudit {
  const suggested = suggestedFieldKeys(args.suggestion);
  const accepted: string[] = [];
  const overridden: string[] = [];
  if (args.finalValues) {
    const sg = args.suggestion as unknown as Record<string, unknown>;
    for (const k of suggested) {
      const sv = String(sg[k] ?? '').trim();
      const fv = String(args.finalValues[k] ?? '').trim();
      if (fv === sv) {
        accepted.push(k);
      } else {
        overridden.push(k);
      }
    }
  }
  return {
    requestId: args.requestId,
    provider: args.suggestion.source,
    confidence: args.suggestion.confidence,
    suggestedFields: suggested,
    acceptedFields: accepted,
    overriddenFields: overridden,
    timestamp: args.timestamp,
  };
}
