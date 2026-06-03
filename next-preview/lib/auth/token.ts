import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Lấy access token Microsoft Graph từ session (server-side, dùng trong API route).
 * Ném AuthError(401) nếu chưa đăng nhập hoặc token refresh lỗi.
 */
export async function getGraphAccessToken(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new AuthError('Chưa đăng nhập. Vui lòng đăng nhập bằng tài khoản Microsoft.', 401);
  }
  if (session.error === 'RefreshAccessTokenError') {
    throw new AuthError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  }
  if (!session.accessToken) {
    throw new AuthError('Không lấy được access token Microsoft Graph từ phiên đăng nhập.', 401);
  }
  return session.accessToken;
}
