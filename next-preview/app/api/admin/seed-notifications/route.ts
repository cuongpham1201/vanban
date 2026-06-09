import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { isWriteAllowlisted } from '@/lib/dms/writeGuard';
import { createNotification } from '@/lib/dms/notifications/notificationService';

export const dynamic = 'force-dynamic';

// POST /api/admin/seed-notifications — tạo 3 thông báo mẫu cho user hiện tại (verify bell UI).
// Chỉ ở development HOẶC admin (allowlist).
export async function POST(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Chưa đăng nhập.' }, { status: 401 });
  }
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev && !isWriteAllowlisted(session)) {
    return NextResponse.json({ ok: false, error: 'Chỉ quản trị viên.' }, { status: 403 });
  }

  const ts = Date.now();
  const samples = [
    {
      userEmail: email, type: 'NEW_DOCUMENT' as const, severity: 'success' as const,
      title: 'Văn bản mới đã được tải lên', message: '295.2026.QĐ-HCNS — Điều chỉnh chức danh',
      documentId: '123', documentNumber: '295.2026.QĐ-HCNS', documentTitle: 'Điều chỉnh chức danh',
      url: '/documents/123', eventKey: `SEED:NEW_DOCUMENT:${ts}`,
    },
    {
      userEmail: email, type: 'DOCUMENT_REPLACED' as const, severity: 'success' as const,
      title: 'Văn bản đã được thay thế', message: '088.2021.QĐ-HCNS → 295.2026.QĐ-HCNS',
      documentId: '123', documentNumber: '295.2026.QĐ-HCNS', url: '/documents/123',
      eventKey: `SEED:DOCUMENT_REPLACED:${ts}`,
    },
    {
      userEmail: email, type: 'SYSTEM' as const, severity: 'info' as const,
      title: 'Thông báo hệ thống', message: 'Chào mừng đến với BHL DMS.',
      url: '/dashboard', eventKey: `SEED:SYSTEM:${ts}`,
    },
  ];

  try {
    const created = [];
    for (const s of samples) {
      const n = await createNotification(s);
      created.push(n.id);
    }
    return NextResponse.json({ ok: true, created: created.length, ids: created });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
