// Document Detail — view model, mở rộng từ SearchDoc (Phase 2) + vài field cho trang chi tiết.
import { IDocument } from '@dms/models/IDocument';
import { toSearchDoc, SearchDoc, splitTags } from '@/components/search/searchTypes';

export interface DetailDoc extends SearchDoc {
  namBanHanh: string;
  editableSourceUrl: string; // EditableSourceUrl (từ editableSource.webUrl)
  editableSourceName: string;
  primaryPdfUrl: string; // PrimaryPdfUrl — IDocument không có field riêng → dùng webUrl của chính PDF
  vanBanLienQuan: string; // text (V2)
  fileName: string;
  folderUrl: string;
  relatedList: string[]; // tách từ vanBanLienQuan (phân tách bởi ; , hoặc xuống dòng)
}

function splitRefs(s?: string): string[] {
  return (s ?? '')
    .split(/[;,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function toDetailDoc(d: IDocument): DetailDoc {
  const base = toSearchDoc(d);
  return {
    ...base,
    namBanHanh: d.namBanHanh ? String(d.namBanHanh) : '—',
    editableSourceUrl: d.editableSource?.webUrl ?? '',
    editableSourceName: d.editableSource?.fileName ?? '',
    primaryPdfUrl: d.webUrl ?? '',
    vanBanLienQuan: d.vanBanLienQuan ?? '',
    fileName: d.fileName ?? '',
    folderUrl: d.folderUrl ?? '',
    relatedList: splitRefs(d.vanBanLienQuan),
  };
}

export { splitTags };
