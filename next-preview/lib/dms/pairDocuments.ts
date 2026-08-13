// PORT từ SharePointDmsService._pairDocuments (PDF-first business rule, giữ nguyên):
//   - 1 row = 1 văn bản ban hành (PDF) làm primary.
//   - DOCX/XLSX cùng base name trong cùng folder = bản mềm (editableSource).
//   - DOCX standalone (không có PDF pair) = ẩn khỏi list.
import { IDocument, IEditableSource } from '@dms/models/IDocument';
import { normalizeBaseFileName, isPdfFile, isEditableSourceFile } from '@dms/utils/documentPair';

// Chỉ coi Word là "bản mềm mồ côi" đáng surface (bỏ xlsx/pptx cho gọn phạm vi tìm kiếm).
const ORPHAN_WORD_EXTS = new Set(['.docx', '.doc']);

/**
 * Gom các file Word ĐỨNG MỘT MÌNH (nhóm folder+base KHÔNG có PDF) — chính là những .docx/.doc
 * bị pairDocuments() ẩn đi. Trả về dưới dạng IDocument để Search có thể surface khi user bật
 * "Tìm cả bản Word". KHÔNG trộn vào danh sách PDF chính (giữ nguyên hành vi List/Dashboard).
 * Mỗi nhóm chỉ lấy 1 file Word đại diện (ưu tiên .docx, rồi .doc).
 */
export function collectOrphanWordDocs(docs: IDocument[]): IDocument[] {
  const groups: { [key: string]: IDocument[] } = {};
  for (const d of docs) {
    const base = normalizeBaseFileName(d.fileName ?? '');
    const folderPath = (d.serverRelativeUrl ?? '').split('/').slice(0, -1).join('/');
    const key = `${folderPath}::${base}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(d);
  }

  const orphans: IDocument[] = [];
  for (const key of Object.keys(groups)) {
    const groupDocs = groups[key];
    // Có PDF trong nhóm → KHÔNG mồ côi (đã hiện dưới dạng văn bản PDF chính).
    if (groupDocs.some((d) => isPdfFile(d.fileExt))) {
      continue;
    }
    const word =
      groupDocs.find((d) => (d.fileExt ?? '').toLowerCase() === '.docx') ??
      groupDocs.find((d) => ORPHAN_WORD_EXTS.has((d.fileExt ?? '').toLowerCase()));
    if (word) {
      orphans.push({ ...word, hasPdf: false, hasDocx: true });
    }
  }
  return orphans;
}

export function pairDocuments(docs: IDocument[]): IDocument[] {
  const groups: { [key: string]: IDocument[] } = {};
  for (const d of docs) {
    const base = normalizeBaseFileName(d.fileName ?? '');
    const folderPath = (d.serverRelativeUrl ?? '').split('/').slice(0, -1).join('/');
    const key = `${folderPath}::${base}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(d);
  }

  const result: IDocument[] = [];
  for (const key of Object.keys(groups)) {
    const groupDocs = groups[key];
    let pdf: IDocument | undefined;
    let editable: IDocument | undefined;
    for (const d of groupDocs) {
      if (!pdf && isPdfFile(d.fileExt)) {
        pdf = d;
      }
      if (!editable && isEditableSourceFile(d.fileExt)) {
        editable = d;
      }
      if (pdf && editable) {
        break;
      }
    }
    if (pdf) {
      const fileEditable: IEditableSource | undefined = editable
        ? {
            fileName: editable.fileName ?? '',
            fileExt: editable.fileExt ?? '',
            webUrl: editable.webUrl ?? '',
            serverRelativeUrl: editable.serverRelativeUrl,
            sizeKB: editable.fileSizeKB,
          }
        : undefined;
      const resolvedEditable = fileEditable ?? pdf.editableSource;
      const hasDocx = !!resolvedEditable;
      result.push({
        ...pdf,
        hasPdf: true,
        hasDocx,
        hasPair: hasDocx,
        editableSource: resolvedEditable,
      });
    }
    // Chỉ DOCX (không PDF) → KHÔNG add (ẩn khỏi list).
  }
  return result;
}
