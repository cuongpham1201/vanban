// AI Metadata Suggestion — kiểu dữ liệu chung (Azure-ready). Giai đoạn này KHÔNG gọi AI thật.
// Mọi provider (RuleBased hiện tại, AzureOpenAI tương lai) đều trả về MetadataSuggestion.

/** Nguồn sinh gợi ý. */
export type SuggestionSource = 'RuleBased' | 'AzureOpenAI';

/** Kết quả gợi ý metadata cho 1 văn bản. Các field metadata đều OPTIONAL (chỉ gợi ý phần chắc chắn). */
export interface MetadataSuggestion {
  SoVanBan?: string;
  NamBanHanh?: number;
  NgayBanHanh?: string;

  NguoiKy?: string; // AI-7.1: người ký cuối văn bản

  NhomTaiLieu?: string;
  LoaiVanBanPhapLy?: string;
  LoaiTaiLieu?: string;
  ChuDeNghiepVu?: string;

  DonViPhatHanh?: string;
  DonViSoHuu?: string;
  CapLuuTru?: string; // AI-7.1: cấp lưu trữ (chỉ thuộc danh sách cố định)

  TrangThai?: string;
  MucDoBaoMat?: string;

  TrichYeu?: string;

  /** 0–100. Quy ước: mạnh=100, vừa=80, yếu=60, không chắc=40. */
  confidence: number;

  /** Diễn giải vì sao ra gợi ý (để UI/audit hiển thị). */
  reasoning: string[];

  source: SuggestionSource;
}
