// AI-7 (Phase 1) — Router trích text tài liệu cho AI metadata. Định tuyến theo loại file:
//   .docx → mammoth | .doc → LibreOffice→mammoth | .pdf → pdfjs (text-layer) / pdf-scan | khác → unsupported
// Giữ giới hạn DMS_AI_TEXT_MAX_CHARS, DMS_AI_DOCX_MAX_MB. KHÔNG ném — luôn trả kết quả.
import { extractDocxText } from './docxExtractor';
import { extractDocText } from './docExtractor';
import { extractPdfText } from './pdfExtractor';

export type ExtractKind = 'docx' | 'doc' | 'pdf-text' | 'pdf-scan' | 'unsupported' | 'error';

export interface ExtractResult {
  ok: boolean;
  kind: ExtractKind;
  text: string;
  charCount: number;
  reason?: string;
}

function maxChars(): number {
  const n = Number(process.env.DMS_AI_TEXT_MAX_CHARS);
  return Number.isFinite(n) && n > 0 ? n : 8000;
}
function maxBytes(): number {
  const mb = Number(process.env.DMS_AI_DOCX_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

function extOf(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec((fileName ?? '').trim().toLowerCase());
  return m ? m[1] : '';
}

export async function extractDocumentText(input: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<ExtractResult> {
  const { fileName, mimeType, buffer } = input;
  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, kind: 'error', text: '', charCount: 0, reason: 'empty-buffer' };
  }
  if (buffer.byteLength > maxBytes()) {
    return { ok: false, kind: 'error', text: '', charCount: 0, reason: 'too-large' };
  }

  const ext = extOf(fileName);
  const mt = (mimeType ?? '').toLowerCase();
  const isPdf = ext === 'pdf' || mt.includes('application/pdf');
  const isDocx = ext === 'docx' || mt.includes('officedocument.wordprocessingml');
  const isDoc = ext === 'doc' || mt === 'application/msword';
  const max = maxChars();

  if (isDocx) {
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const ex = await extractDocxText(ab, fileName.toLowerCase().endsWith('.docx') ? fileName : 'x.docx');
    return { ok: ex.chars > 0, kind: 'docx', text: ex.text, charCount: ex.chars, reason: ex.skipped };
  }
  if (isDoc) {
    const ex = await extractDocText(buffer, max);
    return { ok: ex.ok, kind: 'doc', text: ex.text, charCount: ex.charCount, reason: ex.reason };
  }
  if (isPdf) {
    const ex = await extractPdfText(buffer, max);
    // kind 'pdf-text' | 'pdf-scan' | 'error' đã do pdfExtractor quyết định.
    return { ok: ex.ok, kind: ex.kind, text: ex.text, charCount: ex.charCount, reason: ex.reason };
  }
  return { ok: false, kind: 'unsupported', text: '', charCount: 0, reason: `unsupported-ext:${ext || mt || '?'}` };
}
