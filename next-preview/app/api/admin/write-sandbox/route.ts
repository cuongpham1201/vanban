import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isDmsWriteEnabled } from '@/lib/dms/writeConfig';
import { assertCanWriteDms, DmsWriteError } from '@/lib/dms/writeGuard';
import { getAppOnlyGraphToken } from '@/lib/graph/appToken';
import { SharePointDmsService } from '@/lib/dms/sharepointDmsService';

export const dynamic = 'force-dynamic';

// GET /api/admin/write-sandbox?soVanBan=...&donViSoHuu=...
// Sandbox DRY-RUN: chứng minh pipeline write (token → app access → folder → duplicate →
// validate) hoạt động, NHƯNG KHÔNG ghi gì (không upload file, không PATCH metadata).
//  - Gate: assertCanWriteDms (flag DMS_WRITE_ENABLED + allowlist DMS_WRITE_ALLOWED_EMAILS).
//  - Fail-soft từng bước để chẩn đoán. Luôn trả wrote: false.
function step<T>(name: string): { name: string; run: (fn: () => Promise<T>) => Promise<unknown> } {
  return {
    name,
    run: async (fn) => {
      try {
        return { ok: true, ...(await fn()) as object };
      } catch (e) {
        const err = e as { message?: string; status?: number };
        return { ok: false, error: err.message ?? String(e), status: err.status };
      }
    },
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const soVanBan = (url.searchParams.get('soVanBan') ?? '').trim();
  const donViSoHuu = (url.searchParams.get('donViSoHuu') ?? '').trim();
  const trichYeu = (url.searchParams.get('trichYeu') ?? '').trim();
  const nhomTaiLieu = (url.searchParams.get('nhomTaiLieu') ?? '').trim();

  const session = await getServerSession(authOptions);
  try {
    assertCanWriteDms(session);
  } catch (e) {
    const err = e as DmsWriteError;
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 403 });
  }

  const steps: Record<string, unknown> = {};

  // 1. Mint app-only token (không trả token).
  let appToken: string | undefined;
  steps.appOnlyToken = await step('appOnlyToken').run(async () => {
    appToken = await getAppOnlyGraphToken();
    return { acquired: true };
  });

  if (appToken) {
    const svc = new SharePointDmsService(appToken);

    // 2+3+4. Verify Application permissions + resolve site/library (READ).
    steps.appAccess = await step('appAccess').run(async () => {
      const info = await svc.verifyAppAccess();
      return { ...info, canReadWithAppToken: true };
    });

    // 5. Resolve folder theo DonViSoHuu (READ, không tạo folder).
    steps.folder = await step('folder').run(async () => {
      const r = await svc.resolveUploadFolder(donViSoHuu);
      return { input: donViSoHuu || '(trống)', ...r };
    });

    // 6. Duplicate-check theo SoVanBan (READ).
    steps.duplicate = await step('duplicate').run(async () => {
      const r = await svc.checkDuplicateBySoVanBan(soVanBan);
      return { input: soVanBan || '(trống)', exists: r.exists, matchCount: r.matches.length, matches: r.matches };
    });

    // 7. Validate + normalize metadata payload (PURE, không ghi).
    steps.metadata = await step('metadata').run(async () => {
      const { metadata, validation } = svc.prepareMetadata(
        { SoVanBan: soVanBan, TrichYeu: trichYeu, NhomTaiLieu: nhomTaiLieu, DonViSoHuu: donViSoHuu },
        { hasEditableSource: false }
      );
      return { normalized: metadata, validation, suggestedFileName: svc.buildFileName(soVanBan) };
    });
  }

  return NextResponse.json({
    ok: true,
    mode: 'sandbox-dry-run',
    wrote: false, // phase này KHÔNG ghi gì (khẳng định)
    writeFlagEnabled: isDmsWriteEnabled(),
    userEmail: session?.user?.email ?? null,
    steps,
    note: 'Dry-run chứng minh pipeline. uploadPdf/patchMetadata vẫn NotImplemented — không có file/metadata nào được ghi.',
  });
}
