import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { getAppOnlyGraphTokenReadOnly } from '@/lib/graph/appToken';

export const dynamic = 'force-dynamic';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// GET /api/me/photo — proxy ảnh đại diện M365 của user hiện tại (KHÔNG lộ token ra client).
//   - Web Azure AD (có session.accessToken) → /me/photo/$value (delegated).
//   - Teams/khác (không có token delegated) → /users/{email}/photo/$value (app-only, cần User.Read.All).
//   - Không có ảnh / Graph 404 / lỗi → trả 404 (client fallback initials).
export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return new Response(null, { status: 401 });
  }
  try {
    let accessToken: string;
    let path: string;
    if (session?.accessToken) {
      accessToken = session.accessToken;
      path = '/me/photo/$value';
    } else {
      accessToken = await getAppOnlyGraphTokenReadOnly();
      path = `/users/${encodeURIComponent(email)}/photo/$value`;
    }
    const res = await fetch(`${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return new Response(null, { status: 404 });
    }
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) {
      return new Response(null, { status: 404 });
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
