// Azure OpenAI provider — SKELETON (chưa implement). Giai đoạn này KHÔNG gọi Azure/OpenAI,
// KHÔNG thêm package. Implements cùng interface để sau này là drop-in:
//   const provider: MetadataSuggestionProvider = new AzureOpenAIProvider();
//
// KÍCH HOẠT: đặt DMS_AI_PROVIDER=azure + đủ AZURE_OPENAI_* (service tự chọn; nếu lỗi → fallback RuleBased).
// Phase sau (khi bật AI thật) sẽ cần (CHƯA làm bây giờ):
//   - ENV: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION
//   - Gọi chat completions với system prompt sinh metadata theo schema MetadataSuggestion
//   - Parse JSON output → MetadataSuggestion (source: 'AzureOpenAI'), set confidence/reasoning từ model
//   - Timeout + retry (tái dùng pattern lib/dms/pdfProxy.ts), best-effort fallback về RuleBased nếu lỗi
import { MetadataSuggestionProvider, SuggestionInput } from '../provider';
import { MetadataSuggestion } from '../types';

export class AzureOpenAIProvider implements MetadataSuggestionProvider {
  // TODO (Phase sau): Azure OpenAI integration.
  // constructor(private readonly cfg?: { endpoint: string; apiKey: string; deployment: string }) {}

  async suggest(_input: SuggestionInput): Promise<MetadataSuggestion> {
    void _input;
    throw new Error('AzureOpenAIProvider chưa được triển khai (giai đoạn nền tảng dùng RuleBasedProvider).');
  }
}
