// AI-3/AI-4 — Thống kê độ chính xác AI từ audit records (lib/ai/auditStore). Thuần tính toán, KHÔNG I/O.
import { SuggestionAuditRecord, AuditMetadataFields, ACCEPTANCE_KEY_FIELDS } from './auditStore';

/** Chuẩn hóa giá trị field để so sánh (trim; số → string). */
function norm(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

export interface AiStats {
  total: number;
  azureOpenAICount: number;
  ruleBasedCount: number;
  // Số record ĐÃ có feedback (publish):
  withFeedback: number;
  accepted: number;      // accepted === true
  modified: number;      // accepted === false
  pending: number;       // chưa có feedback (accepted === undefined)
  acceptanceRate: number; // % = accepted / (accepted + modified), làm tròn 1 chữ số; 0 nếu chưa có feedback
  bySource: {
    AzureOpenAI: number;
    RuleBased: number;
  };
}

/** Tính thống kê từ danh sách audit record. */
export function computeStats(records: SuggestionAuditRecord[]): AiStats {
  let azureOpenAICount = 0;
  let ruleBasedCount = 0;
  let accepted = 0;
  let modified = 0;
  let pending = 0;

  for (const r of records) {
    if (r.source === 'AzureOpenAI') azureOpenAICount++;
    else ruleBasedCount++;

    if (r.accepted === true) accepted++;
    else if (r.accepted === false) modified++;
    else pending++;
  }

  const withFeedback = accepted + modified;
  const acceptanceRate = withFeedback > 0 ? Math.round((accepted / withFeedback) * 1000) / 10 : 0;

  return {
    total: records.length,
    azureOpenAICount,
    ruleBasedCount,
    withFeedback,
    accepted,
    modified,
    pending,
    acceptanceRate,
    bySource: { AzureOpenAI: azureOpenAICount, RuleBased: ruleBasedCount },
  };
}

// ── AI-4: phân tích field bị user sửa nhiều nhất ──────────────────────────────
export interface FieldAnalysisRow {
  field: keyof AuditMetadataFields;
  modifiedCount: number;   // số record (đã có feedback) mà AI != metadata cuối ở field này
  comparedCount: number;   // tổng record đã có feedback (mẫu số)
  modifyRate: number;      // % bị sửa = modifiedCount / comparedCount (1 chữ số)
}

/**
 * Với 4 field chính, đếm số lần user SỬA so với gợi ý AI (chỉ tính record đã có finalMetadata).
 * Trả ranking giảm dần theo modifiedCount → field nào AI sai/khó nhất.
 */
export function computeFieldAnalysis(records: SuggestionAuditRecord[]): FieldAnalysisRow[] {
  const compared = records.filter((r) => r.finalMetadata && r.accepted !== undefined);
  const comparedCount = compared.length;
  const rows: FieldAnalysisRow[] = ACCEPTANCE_KEY_FIELDS.map((field) => {
    let modifiedCount = 0;
    for (const r of compared) {
      if (norm(r.aiSuggestion[field]) !== norm(r.finalMetadata?.[field])) modifiedCount++;
    }
    const modifyRate = comparedCount > 0 ? Math.round((modifiedCount / comparedCount) * 1000) / 10 : 0;
    return { field, modifiedCount, comparedCount, modifyRate };
  });
  return rows.sort((a, b) => b.modifiedCount - a.modifiedCount);
}
