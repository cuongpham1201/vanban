// Helper sắp xếp văn bản DÙNG CHUNG cho Dashboard ("Văn bản mới nhất") và Search (sort
// "Ngày ban hành mới nhất") — đảm bảo thứ tự đồng bộ giữa 2 nơi.
import { IDocument } from '@dms/models/IDocument';

/** Số đứng đầu trong SoVanBan để so sánh số tự nhiên (vd "295.2026.QĐ-HCNS" -> 295). NaN nếu không có. */
function leadingNumber(soVanBan?: string): number {
  const m = /\d+/.exec(soVanBan ?? '');
  return m ? Number(m[0]) : NaN;
}

/** Khóa ngày ban hành (ISO yyyy-mm-dd); fallback NamBanHanh; '' nếu không có. */
function issuedKey(d: IDocument): string {
  return (d.ngayBanHanh || (d.namBanHanh ? `${d.namBanHanh}-00-00` : '')).toString();
}

/**
 * Thứ tự chuẩn DMS (KHÔNG mutate input):
 *   1. NgayBanHanh giảm dần.
 *   2. Cùng ngày → SoVanBan giảm dần theo số tự nhiên (nếu parse được), rồi so chuỗi numeric.
 *   3. Fallback id ổn định.
 */
export function sortDocumentsByIssuedDateThenNumber(docs: IDocument[]): IDocument[] {
  return [...docs].sort((a, b) => {
    const byDate = issuedKey(b).localeCompare(issuedKey(a));
    if (byDate !== 0) {
      return byDate;
    }
    const na = leadingNumber(a.soVanBan);
    const nb = leadingNumber(b.soVanBan);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
      return nb - na; // số văn bản lớn (mới) trước
    }
    const bySo = (b.soVanBan ?? '').localeCompare(a.soVanBan ?? '', 'vi', { numeric: true });
    if (bySo !== 0) {
      return bySo;
    }
    return (b.id ?? '').localeCompare(a.id ?? '');
  });
}
