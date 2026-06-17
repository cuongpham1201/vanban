// AI-7 (Phase 1) — Trích text PDF có text-layer (pdfjs-dist legacy, server-side). KHÔNG OCR.
// PDF scan (ảnh, không text-layer) → text quá ít → trả kind='pdf-scan' để tầng trên biết cần OCR sau.
// KHÔNG ném — luôn trả kết quả (route không vỡ).

export interface PdfExtractResult {
  kind: 'pdf-text' | 'pdf-scan' | 'error';
  ok: boolean;
  text: string;
  charCount: number;
  reason?: string;
}

// Dưới ngưỡng này coi là PDF scan (không có text-layer thực sự).
const SCAN_MIN_CHARS = 50;

export async function extractPdfText(buffer: Buffer, maxChars: number): Promise<PdfExtractResult> {
  try {
    // webpackIgnore → Next KHÔNG bundle pdfjs (tránh kéo global DOM); Node resolve runtime từ node_modules.
    const mod = (await import(/* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.js')) as Record<string, unknown>;
    const pdfjs = (typeof mod.getDocument === 'function' ? mod : (mod.default as Record<string, unknown>)) as {
      getDocument: (opts: unknown) => {
        promise: Promise<{
          numPages: number;
          getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }>;
          destroy?: () => Promise<void>;
        }>;
      };
    };
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true }).promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      text += tc.items.map((it) => (typeof it.str === 'string' ? it.str : '')).join(' ') + '\n';
      if (text.length > maxChars) break;
    }
    await doc.destroy?.();
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (text.length < SCAN_MIN_CHARS) {
      // Quá ít text → PDF là bản scan (ảnh). Chưa OCR ở phase này.
      return { kind: 'pdf-scan', ok: false, text: '', charCount: text.length, reason: 'pdf-scan-needs-ocr' };
    }
    const truncated = text.length > maxChars;
    const out = truncated ? text.slice(0, maxChars) : text;
    return { kind: 'pdf-text', ok: true, text: out, charCount: out.length };
  } catch (e) {
    return { kind: 'error', ok: false, text: '', charCount: 0, reason: `pdf-extract-error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
