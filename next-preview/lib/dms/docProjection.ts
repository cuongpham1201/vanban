// Lite projection cho list/search — CẮT payload bằng cách chỉ giữ field mà view list/search/picker cần.
// Giữ ĐỦ field để toSearchDoc (search + replace), FACET_DEFS, scoreDocument, sortDocuments chạy đúng.
// LOẠI các field nặng chỉ dùng ở Detail: serverRelativeUrl, folderUrl, fileName/ext/size,
// hasDocx/hasPdf, vanBanLienQuan, author/editor.
// KHÔNG đổi nghiệp vụ — chỉ chọn field.
import { IDocument } from '@dms/models/IDocument';

// Field bổ sung (gắn runtime ngoài IDocument core) mà sort dùng làm fallback ngày.
type DocExtra = IDocument & { created?: string; modified?: string };

/** Tập field trả về ở chế độ ?fields=lite. Là superset của mọi field mà list/search/picker đọc. */
export type LiteDoc = Pick<
  IDocument,
  | 'id' | 'soVanBan' | 'trichYeu' | 'fileKind'
  | 'nhomTaiLieu' | 'loaiVanBan' | 'loaiVanBanKey' | 'loaiVanBanPhapLy' | 'loaiTaiLieu' | 'chuDeNghiepVu'
  | 'donViPhatHanh' | 'donViSoanThao' | 'donViCode' | 'donViSoHuu'
  | 'nguoiKy' | 'ngayBanHanh' | 'ngayHetHieuLuc' | 'namBanHanh'
  | 'trangThai' | 'mucDoBaoMat' | 'metadataConfidence' | 'nguonMetadata'
  | 'tags' | 'vanBanThayThe' | 'webUrl' | 'editableSource' | 'hasPair'
> & { created?: string; modified?: string };

export function toLiteDoc(d: IDocument): LiteDoc {
  const x = d as DocExtra;
  return {
    id: d.id,
    soVanBan: d.soVanBan,
    trichYeu: d.trichYeu,
    fileKind: d.fileKind,
    nhomTaiLieu: d.nhomTaiLieu,
    loaiVanBan: d.loaiVanBan,
    loaiVanBanKey: d.loaiVanBanKey,
    loaiVanBanPhapLy: d.loaiVanBanPhapLy,
    loaiTaiLieu: d.loaiTaiLieu,
    chuDeNghiepVu: d.chuDeNghiepVu,
    donViPhatHanh: d.donViPhatHanh,
    donViSoanThao: d.donViSoanThao,
    donViCode: d.donViCode,
    donViSoHuu: d.donViSoHuu,
    nguoiKy: d.nguoiKy,
    ngayBanHanh: d.ngayBanHanh,
    ngayHetHieuLuc: d.ngayHetHieuLuc,
    namBanHanh: d.namBanHanh,
    trangThai: d.trangThai,
    mucDoBaoMat: d.mucDoBaoMat,
    metadataConfidence: d.metadataConfidence,
    nguonMetadata: d.nguonMetadata,
    tags: d.tags,
    vanBanThayThe: d.vanBanThayThe,
    webUrl: d.webUrl,
    editableSource: d.editableSource,
    hasPair: d.hasPair,
    created: x.created,
    modified: x.modified,
  };
}
