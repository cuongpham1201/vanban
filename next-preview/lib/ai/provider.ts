// AI Metadata Suggestion — abstraction provider. UI/API chỉ phụ thuộc interface này,
// nên đổi RuleBased → AzureOpenAI sau này KHÔNG phải sửa UI/API.
import { MetadataSuggestion } from './types';

/** Đầu vào cho gợi ý — tất cả optional (provider tự xử lý phần thiếu). */
export interface SuggestionInput {
  fileName?: string;
  documentTitle?: string;
  textContent?: string;
}

/** Hợp đồng cho mọi provider gợi ý metadata. */
export interface MetadataSuggestionProvider {
  suggest(input: SuggestionInput): Promise<MetadataSuggestion>;
}
