/**
 * Helper: PDF-first document logic.
 *
 * Business rule:
 *   - PDF = bản ban hành chính thức (primary)
 *   - DOCX/XLSX/PPTX = bản mềm editable (secondary, không hiển thị độc lập)
 *   - Cùng base filename + khác extension trong cùng folder = 1 document pair
 *
 * Naming convention (theo spec):
 *   - normalizeBaseFileName(name)  → loại extension, trim, lowercase
 *   - isPdfFile(ext)               → ext === '.pdf'
 *   - isEditableSourceFile(ext)    → .docx | .doc | .xlsx | .xls | .pptx | .ppt
 *   - pairPdfWithDocx(items)       → group + return PDF rows với editableSource attached
 */

const PRIMARY_EXTS: string[] = ['.pdf'];
const EDITABLE_EXTS: string[] = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];

/**
 * Chuẩn hóa base filename:
 * - Bỏ extension cuối cùng
 * - Trim whitespace
 * - Lowercase
 * - Bỏ multiple spaces
 * Dùng để key group documents.
 */
export function normalizeBaseFileName(fileName: string): string {
  if (!fileName) { return ''; }
  let stem: string = fileName;
  const dotIdx: number = stem.lastIndexOf('.');
  if (dotIdx >= 0) {
    stem = stem.substring(0, dotIdx);
  }
  return stem.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Alias backward-compatible với code cũ. */
export function getBaseName(fileName: string): string {
  if (!fileName) { return ''; }
  const dotIdx: number = fileName.lastIndexOf('.');
  return dotIdx >= 0 ? fileName.substring(0, dotIdx) : fileName;
}

/** True nếu là PDF — văn bản ban hành chính thức. */
export function isPdfFile(ext: string | undefined): boolean {
  if (!ext) { return false; }
  return PRIMARY_EXTS.indexOf(ext.toLowerCase()) >= 0;
}

/** Alias backward-compat: isPdfFile() = isPrimaryDocument() */
export function isPrimaryDocument(ext: string | undefined): boolean {
  return isPdfFile(ext);
}

/** True nếu là bản mềm editable (docx/xlsx/pptx/...). */
export function isEditableSourceFile(ext: string | undefined): boolean {
  if (!ext) { return false; }
  return EDITABLE_EXTS.indexOf(ext.toLowerCase()) >= 0;
}

/** Alias backward-compat. */
export function isEditableSource(ext: string | undefined): boolean {
  return isEditableSourceFile(ext);
}

/**
 * Get the editable source extensions list (cho consumers cần dropdown / validation).
 */
export function getEditableSourceExts(): string[] {
  return EDITABLE_EXTS.slice();  // copy để consumer không mutate
}
