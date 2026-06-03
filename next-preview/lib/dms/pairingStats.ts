// Diagnostic (read-only) cho Phase 3 — Mapping Audit.
// Phân tích vì sao fileItemCount > documents: đếm theo extension + nhóm pairing.
// KHÔNG đổi business logic; chỉ tính thống kê từ danh sách đã map.
import { IDocument } from '@dms/models/IDocument';
import { normalizeBaseFileName, isPdfFile, isEditableSourceFile } from '@dms/utils/documentPair';

export interface PairingStats {
  mappedFiles: number;
  byExt: { [ext: string]: number };
  groups: number;
  groupsWithPdf: number; // = số documents xuất ra
  groupsWithoutPdf: number; // nhóm bị ẩn (DOCX/khác standalone)
  filesInDroppedGroups: number; // số file bị ẩn vì không có PDF cùng nhóm
  pdfFiles: number;
  editableFiles: number;
  otherFiles: number;
  missingKeyField: {
    soVanBan: number;
    nhomTaiLieu: number;
    donViSoHuu: number;
    ngayBanHanh: number;
  };
}

export function analyzePairing(mapped: IDocument[]): PairingStats {
  const byExt: { [ext: string]: number } = {};
  let pdfFiles = 0;
  let editableFiles = 0;
  let otherFiles = 0;

  const groups = new Map<string, IDocument[]>();
  for (const d of mapped) {
    const ext = (d.fileExt ?? '').toLowerCase() || '(none)';
    byExt[ext] = (byExt[ext] ?? 0) + 1;
    if (isPdfFile(d.fileExt)) {
      pdfFiles++;
    } else if (isEditableSourceFile(d.fileExt)) {
      editableFiles++;
    } else {
      otherFiles++;
    }
    const base = normalizeBaseFileName(d.fileName ?? '');
    const folder = (d.serverRelativeUrl ?? '').split('/').slice(0, -1).join('/');
    const key = `${folder}::${base}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(d);
  }

  let groupsWithPdf = 0;
  let groupsWithoutPdf = 0;
  let filesInDroppedGroups = 0;
  for (const g of groups.values()) {
    const hasPdf = g.some((d) => isPdfFile(d.fileExt));
    if (hasPdf) {
      groupsWithPdf++;
    } else {
      groupsWithoutPdf++;
      filesInDroppedGroups += g.length;
    }
  }

  const missingKeyField = { soVanBan: 0, nhomTaiLieu: 0, donViSoHuu: 0, ngayBanHanh: 0 };
  for (const d of mapped) {
    if (!d.soVanBan) missingKeyField.soVanBan++;
    if (!d.nhomTaiLieu) missingKeyField.nhomTaiLieu++;
    if (!d.donViSoHuu) missingKeyField.donViSoHuu++;
    if (!d.ngayBanHanh) missingKeyField.ngayBanHanh++;
  }

  return {
    mappedFiles: mapped.length,
    byExt,
    groups: groups.size,
    groupsWithPdf,
    groupsWithoutPdf,
    filesInDroppedGroups,
    pdfFiles,
    editableFiles,
    otherFiles,
    missingKeyField,
  };
}
