// AI-2A — Trích xuất text từ DOCX (server-side, mammoth). CHỈ .docx, giới hạn size + độ dài.
// KHÔNG log nội dung text. KHÔNG lưu text lâu dài (chỉ dùng trong request rồi bỏ).
import mammoth from 'mammoth';

function maxBytes(): number {
  const mb = Number(process.env.DMS_AI_DOCX_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}
function maxChars(): number {
  const n = Number(process.env.DMS_AI_TEXT_MAX_CHARS);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}

/** Đúng đuôi .docx (OOXML zip). .doc nhị phân / xlsx / pptx → false. */
export function isDocx(fileName: string): boolean {
  return (fileName ?? '').toLowerCase().endsWith('.docx');
}

export interface DocxExtractResult {
  text: string;
  chars: number;
  truncated: boolean;
  skipped?: 'not-docx' | 'too-large' | 'extract-error' | 'empty';
}

/**
 * Trích text thô từ buffer DOCX. KHÔNG ném — luôn trả kết quả (text rỗng nếu skip/lỗi) để route không vỡ.
 */
export async function extractDocxText(buffer: ArrayBuffer, fileName: string): Promise<DocxExtractResult> {
  if (!isDocx(fileName)) {
    return { text: '', chars: 0, truncated: false, skipped: 'not-docx' };
  }
  if (buffer.byteLength > maxBytes()) {
    return { text: '', chars: 0, truncated: false, skipped: 'too-large' };
  }
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    let text = (value ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) {
      return { text: '', chars: 0, truncated: false, skipped: 'empty' };
    }
    const max = maxChars();
    const truncated = text.length > max;
    if (truncated) {
      text = text.slice(0, max);
    }
    return { text, chars: text.length, truncated };
  } catch (e) {
    // KHÔNG log nội dung; chỉ message lỗi.
    // eslint-disable-next-line no-console
    console.warn('[ai-docx] extract failed:', e instanceof Error ? e.message : String(e));
    return { text: '', chars: 0, truncated: false, skipped: 'extract-error' };
  }
}
