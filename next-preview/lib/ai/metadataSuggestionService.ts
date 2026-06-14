// AI Metadata Suggestion service — điểm vào DUY NHẤT cho UI/API.
// MẶC ĐỊNH: RuleBasedProvider (an toàn, không gọi mạng).
// AZURE: chỉ kích hoạt khi ENV bật RÕ RÀNG (DMS_AI_PROVIDER=azure + đủ AZURE_OPENAI_*).
//        Nếu Azure lỗi/chưa triển khai → FALLBACK RuleBased (không bao giờ làm hỏng luồng).
import { MetadataSuggestionProvider, SuggestionInput } from './provider';
import { MetadataSuggestion, SuggestionSource } from './types';
import { RuleBasedProvider } from './providers/ruleBasedProvider';
import { AzureOpenAIProvider } from './providers/azureOpenAIProvider';

/** Cấu hình Azure đọc từ ENV (không in giá trị ra ngoài). */
function azureConfig(): { enabled: boolean; endpoint: string; apiKey: string; deployment: string } {
  return {
    enabled: (process.env.DMS_AI_PROVIDER ?? '').trim().toLowerCase() === 'azure',
    endpoint: (process.env.AZURE_OPENAI_ENDPOINT ?? '').trim(),
    apiKey: (process.env.AZURE_OPENAI_API_KEY ?? '').trim(),
    deployment: (process.env.AZURE_OPENAI_DEPLOYMENT ?? '').trim(),
  };
}

/** Azure chỉ "active" khi bật cờ + có đủ endpoint/key/deployment. */
export function isAzureProviderActive(): boolean {
  const c = azureConfig();
  return c.enabled && !!c.endpoint && !!c.apiKey && !!c.deployment;
}

const ruleProvider = new RuleBasedProvider();
let azureProvider: AzureOpenAIProvider | null = null;

function getProvider(): MetadataSuggestionProvider {
  if (isAzureProviderActive()) {
    azureProvider ??= new AzureOpenAIProvider();
    return azureProvider;
  }
  return ruleProvider;
}

/** Tên provider dự kiến dùng (cho audit/diagnostic). */
export function getActiveProviderName(): SuggestionSource {
  return isAzureProviderActive() ? 'AzureOpenAI' : 'RuleBased';
}

/**
 * Gợi ý metadata. KHÔNG ghi dữ liệu, KHÔNG side-effect.
 * Azure bật mà lỗi/chưa implement → tự fallback RuleBased (an toàn).
 */
export async function suggestMetadata(input: SuggestionInput): Promise<MetadataSuggestion> {
  const provider = getProvider();
  try {
    return await provider.suggest(input);
  } catch (e) {
    if (provider !== ruleProvider) {
      // eslint-disable-next-line no-console
      console.warn('[ai] azure provider lỗi → fallback rule-based:', e instanceof Error ? e.message : String(e));
      return ruleProvider.suggest(input);
    }
    throw e;
  }
}
