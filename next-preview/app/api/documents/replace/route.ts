import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';
import { GraphError } from '@/lib/graph/client';
import { LibraryResolveError, resolveSiteId, resolveListId } from '@/lib/sharepoint/resolve';
import { graphFetch } from '@/lib/graph/client';
import { invalidateDocumentsCache } from '@/lib/dms/documentsCache';
import { notifyDocumentReplaced } from '@/lib/dms/notifications/events';

export const dynamic = 'force-dynamic';

// Field metadata được phép KẾ THỪA (inheritMetadata) — chỉ điền khi bản mới còn trống (non-destructive).
const INHERIT_FIELDS = ['NhomTaiLieu', 'LoaiVanBanPhapLy', 'LoaiTaiLieu', 'ChuDeNghiepVu', 'DonViPhatHanh', 'DonViSoHuu', 'Tags'];

interface ReplaceBody {
  oldId?: unknown;
  newId?: unknown;
  markOldExpired?: unknown;
  inheritMetadata?: unknown;
}

// POST /api/documents/replace — ghi quan hệ thay thế (Phase Write, #25).
//   New.VanBanThayThe = Old.SoVanBan (text — Graph PATCH an toàn, đã probe).
//   Old.TrangThai = "Hết hiệu lực" + NgayHetHieuLuc = hôm nay (nếu markOldExpired).
//   inheritMetadata: điền field còn trống ở bản mới từ bản cũ (không ghi đè).
//   KHÔNG ghi VanBanLienQuan (đang bị dùng cho danh sách file nguồn ở production → tránh clobber).
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch {
    return NextResponse.json({ ok: false, error: 'Không có quyền ghi DMS.' }, { status: 403 });
  }
  const actor = (session?.user?.email as string | undefined) ?? 'unknown';

  let body: ReplaceBody;
  try {
    body = (await req.json()) as ReplaceBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  const oldId = String(body.oldId ?? '').trim();
  const newId = String(body.newId ?? '').trim();
  const markOldExpired = body.markOldExpired !== false; // mặc định true
  const inheritMetadata = body.inheritMetadata === true;
  if (!/^\d+$/.test(oldId) || !/^\d+$/.test(newId)) {
    return NextResponse.json({ ok: false, error: 'oldId/newId phải là list item id dạng số.' }, { status: 400 });
  }
  if (oldId === newId) {
    return NextResponse.json({ ok: false, error: 'oldId và newId không được trùng.' }, { status: 422 });
  }

  try {
    const token = await getAppOnlyGraphToken();
    const site = await resolveSiteId(token);
    const list = await resolveListId(token);
    const svc = new SharePointDmsService(token);

    const readFields = async (id: string): Promise<Record<string, unknown>> => {
      const r = await graphFetch<{ fields?: Record<string, unknown> }>(
        `/sites/${site.id}/lists/${list.id}/items/${id}?$expand=fields`, { accessToken: token });
      return r.fields ?? {};
    };
    const oldF = await readFields(oldId);
    const newF = await readFields(newId);
    const oldSo = String(oldF.SoVanBan ?? '').trim();
    const newSo = String(newF.SoVanBan ?? '').trim();
    if (!oldSo) {
      return NextResponse.json({ ok: false, error: `Văn bản cũ (id ${oldId}) không có Số văn bản.` }, { status: 422 });
    }

    const warnings: string[] = [];

    // 1) Bản mới: forward link + (tùy chọn) kế thừa metadata field còn trống.
    const newPatch: Record<string, string> = { VanBanThayThe: oldSo };
    if (inheritMetadata) {
      for (const f of INHERIT_FIELDS) {
        const cur = String(newF[f] ?? '').trim();
        const from = String(oldF[f] ?? '').trim();
        if (!cur && from) newPatch[f] = from;
      }
    }
    const newRes = await svc.updateMetadata(newId, newPatch);

    // 2) Bản cũ: đánh dấu Hết hiệu lực (nếu yêu cầu). KHÔNG đụng VanBanLienQuan.
    const oldChanged: string[] = [];
    if (markOldExpired) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (service coerce → ...T00:00:00Z)
      const oldRes = await svc.updateMetadata(oldId, { TrangThai: 'Hết hiệu lực', NgayHetHieuLuc: today });
      oldChanged.push(...Object.keys(oldRes.fields ?? {}).filter((k) => k === 'TrangThai' || k === 'NgayHetHieuLuc'));
      if (oldRes.skipped.length) warnings.push(`Bản cũ bỏ qua: ${oldRes.skipped.join(', ')}`);
    }
    if (newRes.skipped.length) warnings.push(`Bản mới bỏ qua: ${newRes.skipped.join(', ')}`);
    warnings.push('Reverse-link (VanBanLienQuan) không ghi — cột đang dùng cho danh sách file nguồn; cần field V3 riêng.');

    invalidateDocumentsCache('replace');
    // FIX A: thay thế đã xong → notif FIRE-AND-FORGET (KHÔNG await) để response trả ngay; fan-out nền.
    void notifyDocumentReplaced({
      actorEmail: actor,
      documentId: newId,
      documentNumber: newSo,
      documentTitle: String(newF.TrichYeu ?? '').trim() || undefined,
      donViSoanThao: String(newF.DonViPhatHanh ?? '').trim() || undefined,
      ngayBanHanh: String(newF.NgayBanHanh ?? '').trim() || undefined,
      trangThai: String(newF.TrangThai ?? '').trim() || undefined,
      oldDocumentNumber: oldSo,
      newDocumentNumber: newSo,
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[replace][notify] failed', e instanceof Error ? e.message : String(e));
    });
    // eslint-disable-next-line no-console
    console.log('[dms-write][replace]', JSON.stringify({
      actor, oldId, newId, oldSo, newSo, markOldExpired, inheritMetadata,
      newFieldsChanged: Object.keys(newPatch), oldFieldsChanged: oldChanged, ts: new Date().toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      old: { id: oldId, soVanBan: oldSo, expired: markOldExpired },
      new: { id: newId, soVanBan: newSo, vanBanThayThe: oldSo, inheritedFields: Object.keys(newPatch).filter((k) => k !== 'VanBanThayThe') },
      warnings,
    });
  } catch (e) {
    if (e instanceof DmsWriteError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof LibraryResolveError) return NextResponse.json({ ok: false, error: e.message, ...e.detail }, { status: e.status });
    if (e instanceof GraphError) {
      const status = e.status >= 400 && e.status < 600 ? e.status : 502;
      return NextResponse.json({ ok: false, error: `Ghi thay thế thất bại (Graph ${e.status}).` }, { status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
