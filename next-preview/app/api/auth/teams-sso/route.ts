// #31 — POST /api/auth/teams-sso : verify Teams SSO token (diagnostic). KHÔNG tạo session ở đây —
// client gọi tiếp signIn('teams-sso', { token }) để NextAuth tạo cookie an toàn (OBO trong authorize).
import { NextResponse } from 'next/server';
import { verifyTeamsSsoToken } from '@/lib/teams/teamsSsoVerify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  let body: { teamsSsoToken?: string } | null = null;
  try {
    body = (await req.json()) as { teamsSsoToken?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Body không phải JSON hợp lệ' }, { status: 400 });
  }
  const token = body?.teamsSsoToken?.trim();
  if (!token) return NextResponse.json({ ok: false, error: 'Thiếu teamsSsoToken' }, { status: 400 });

  const result = await verifyTeamsSsoToken(token);
  if (!result.ok) {
    console.warn('[api/auth/teams-sso] verify failed:', result.error); // KHÔNG log token
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: result.user });
}

export function GET(): NextResponse {
  return NextResponse.json({
    endpoint: '/api/auth/teams-sso',
    method: 'POST',
    purpose: 'Verify Microsoft Teams SSO JWT (diagnostic).',
    note: "Tạo session: client gọi signIn('teams-sso', { token }).",
  });
}
